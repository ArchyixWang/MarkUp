from __future__ import annotations

import hashlib
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from fastapi import Request

from app.core.config import settings
from app.core.database import MongoDatabase
from app.core.errors import AppError
from app.core.security import decrypt_secret
from app.models.resource import AiCallLog, AiProviderConfig
from app.schemas.platform_agent import PlatformAgentChatRequest
from app.services.platform_service import resolve_agent_embedding_config
from app.services import resource_service


PUBLIC_HELP_CONTENT_PATH = "apps/web/src/pages/help/helpContent.json"

MAX_CONTEXT_CHARS = 5200
_RATE_LIMIT_WINDOW: dict[str, list[float]] = {}


@dataclass
class AgentSource:
    title: str
    path: str
    excerpt: str


@dataclass
class RetrievedContext:
    sources: list[AgentSource]
    summary: str
    used_vector_index: bool = False


def is_rate_limited(client_key: str) -> bool:
    limit = max(1, int(settings.platform_agent_rate_limit_per_minute or 20))
    now = time.time()
    window_start = now - 60
    hits = [item for item in _RATE_LIMIT_WINDOW.get(client_key, []) if item >= window_start]
    if len(hits) >= limit:
        _RATE_LIMIT_WINDOW[client_key] = hits
        return True
    hits.append(now)
    _RATE_LIMIT_WINDOW[client_key] = hits
    return False


def platform_agent_events(db: MongoDatabase, payload: PlatformAgentChatRequest, request: Request) -> Iterable[str]:
    yield _sse("meta", {"conversation_id": payload.conversation_id, "phase": "accepted"})
    retrieval_error = None
    try:
        retrieved = retrieve_platform_context(db, payload.message)
    except Exception as exc:  # noqa: BLE001 - retrieval must not break the public agent.
        retrieval_error = _exception_message(exc)
        retrieved = _retrieve_with_summary(payload.message, top_k=5)
    provider = _platform_default_provider(db)
    meta = {
        "conversation_id": payload.conversation_id,
        "sources": [_source_payload(item) for item in retrieved.sources],
        "retrieval": "chroma" if retrieved.used_vector_index else "summary",
    }
    if retrieval_error:
        meta["retrieval_error"] = retrieval_error[:300]

    if not provider:
        yield _sse("meta", {**meta, "fallback": "rag_summary"})
        yield _sse("delta", {"content": _fallback_answer(payload.message, retrieved)})
        yield _sse("sources", {"items": meta["sources"]})
        yield _sse("done", {"fallback": "rag_summary"})
        return

    prompt = _build_prompt(payload, retrieved)
    try:
        done_payload: dict | None = None
        for event in _stream_public_provider_generation(db, provider, prompt, request):
            if event["type"] == "meta":
                yield _sse("meta", {
                    **meta,
                    "provider_id": provider.id,
                    "model": event.get("model"),
                    "request_id": event.get("request_id"),
                })
                continue
            if event["type"] == "delta":
                yield _sse("delta", {"content": event["content"]})
                continue
            if event["type"] == "done":
                done_payload = event
    except Exception as exc:  # noqa: BLE001 - public agent must degrade gracefully.
        yield _sse("meta", {**meta, "fallback": "rag_summary", "error": str(exc)[:300]})
        yield _sse("delta", {"content": _fallback_answer(payload.message, retrieved)})
        yield _sse("sources", {"items": meta["sources"]})
        yield _sse("done", {"fallback": "rag_summary"})
        return

    if not done_payload or not done_payload.get("content"):
        yield _sse("meta", {**meta, "fallback": "rag_summary", "error": "empty_provider_response"})
        yield _sse("delta", {"content": _fallback_answer(payload.message, retrieved)})
        yield _sse("sources", {"items": meta["sources"]})
        yield _sse("done", {"fallback": "rag_summary"})
        return

    yield _sse("sources", {"items": meta["sources"]})
    yield _sse("done", {
        "request_id": done_payload.get("request_id"),
        "tokens": done_payload.get("tokens"),
        "cost": done_payload.get("cost"),
        "latency_ms": done_payload.get("latency_ms"),
    })


def retrieve_platform_context(db: MongoDatabase, query: str, top_k: int = 5) -> RetrievedContext:
    vector_context = _retrieve_with_chroma(query, top_k=top_k, embedding_config=resolve_agent_embedding_config(db))
    if vector_context.sources:
        return vector_context
    return _retrieve_with_summary(query, top_k=top_k)


def reset_rate_limits_for_tests() -> None:
    _RATE_LIMIT_WINDOW.clear()


def platform_agent_status(db: MongoDatabase) -> dict:
    provider = db.find_one(
        AiProviderConfig,
        {"scope": "platform", "is_platform_default": True},
    )
    provider_status = getattr(provider, "status", None) if provider else "missing"
    provider_configured = bool(
        provider
        and provider_status == "enabled"
        and (
            getattr(provider, "api_key_configured", False)
            or bool(getattr(provider, "encrypted_api_key", None))
        )
    )
    embedding_config = resolve_agent_embedding_config(db)
    dependency_errors = _chroma_dependency_errors()
    chroma_ready = bool(embedding_config["api_key_configured"] and not dependency_errors)
    return {
        "enabled": bool(settings.platform_agent_enabled),
        "provider_configured": provider_configured,
        "provider_status": provider_status,
        "rag_mode": "chroma" if chroma_ready else "summary",
        "rag_status": "chroma_ready" if chroma_ready else ("missing_embedding" if not embedding_config["api_key_configured"] else "missing_dependencies"),
        "rag_dependency_errors": dependency_errors,
        "embedding_configured": embedding_config["api_key_configured"],
        "embedding_model": embedding_config["model"],
    }


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _rag_dir() -> Path:
    configured = Path(settings.platform_agent_rag_dir)
    return configured if configured.is_absolute() else _repo_root() / configured


def _load_public_documents() -> list[tuple[str, str, str]]:
    root = _repo_root()
    content_path = root / PUBLIC_HELP_CONTENT_PATH
    if not content_path.is_file():
        return []
    try:
        payload = json.loads(content_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    items: list[tuple[str, str, str]] = []
    modules = payload.get("modules") or []
    if modules:
        for module in modules:
            module_id = str(module.get("id") or "").strip()
            if module_id == "faq":
                continue
            title = str(module.get("title") or module_id or "帮助文档").strip()
            content = _help_module_text(module)
            if module_id and content:
                items.append((f"/help#{module_id}", title, content))
    else:
        for section in payload.get("sections") or []:
            section_id = str(section.get("id") or "").strip()
            title = str(section.get("title") or section_id or "帮助文档").strip()
            content = _help_section_text(section)
            if section_id and content:
                items.append((f"/help#{section_id}", title, content))

    faqs = payload.get("faqs") or []
    if faqs:
        faq_lines = ["常见问题"]
        for faq in faqs:
            question = str(faq.get("q") or "").strip()
            answer = str(faq.get("a") or "").strip()
            tags = _string_values(faq.get("tags"))
            status = _help_status_text(faq.get("status"))
            audiences = _string_values(faq.get("audiences"))
            suffix = []
            if status:
                suffix.append(f"状态：{status}")
            if tags:
                suffix.append("标签：" + "、".join(tags))
            if audiences:
                suffix.append("适用角色：" + "、".join(audiences))
            if question or answer:
                faq_lines.append("；".join([f"{question}: {answer}".strip(": "), *suffix]))
        items.append(("/help#faq", "常见问题", "\n".join(faq_lines)))
    return items


def _help_module_text(module: dict) -> str:
    lines = [str(module.get("title") or "").strip()]
    status = _help_status_text(module.get("status"))
    if status:
        lines.append(f"状态：{status}")
    summary = str(module.get("summary") or "").strip()
    if summary:
        lines.append(summary)
    tags = _string_values(module.get("tags"))
    if tags:
        lines.append("标签：" + "、".join(tags))
    audiences = _string_values(module.get("audiences"))
    if audiences:
        lines.append("适用角色：" + "、".join(audiences))
    for entry in module.get("entries") or []:
        lines.extend(_help_entry_lines(entry))
    return "\n".join(line for line in lines if line)


def _help_entry_lines(entry: dict) -> list[str]:
    lines: list[str] = []
    title = str(entry.get("title") or "").strip()
    if title:
        lines.append(title)
    status = _help_status_text(entry.get("status"))
    if status:
        lines.append(f"状态：{status}")
    for paragraph in entry.get("body") or []:
        lines.append(str(paragraph).strip())
    keywords = _string_values(entry.get("search_keywords"))
    if keywords:
        lines.append("关键词：" + "、".join(keywords))
    for item in entry.get("items") or []:
        label = str(item.get("label") or "").strip()
        text = str(item.get("text") or "").strip()
        item_status = _help_status_text(item.get("status"))
        item_line = f"{label}: {text}" if label else text
        if item_status and item_line:
            item_line = f"{item_line}（{item_status}）"
        lines.append(item_line)
    return lines


def _help_section_text(section: dict) -> str:
    lines = [str(section.get("title") or "").strip()]
    status = _help_status_text(section.get("status"))
    if status:
        lines.append(f"状态：{status}")
    summary = str(section.get("summary") or "").strip()
    if summary:
        lines.append(summary)
    tags = _string_values(section.get("tags"))
    if tags:
        lines.append("标签：" + "、".join(tags))
    audiences = _string_values(section.get("audiences"))
    if audiences:
        lines.append("适用角色：" + "、".join(audiences))
    for paragraph in section.get("paragraphs") or []:
        lines.append(str(paragraph).strip())
    for card in section.get("cards") or []:
        title = str(card.get("title") or "").strip()
        if title:
            lines.append(title)
        card_status = _help_status_text(card.get("status"))
        if card_status:
            lines.append(f"状态：{card_status}")
        for paragraph in card.get("paragraphs") or []:
            lines.append(str(paragraph).strip())
        for item in card.get("items") or []:
            label = str(item.get("label") or "").strip()
            text = str(item.get("text") or "").strip()
            item_status = _help_status_text(item.get("status"))
            item_line = f"{label}: {text}" if label else text
            if item_status and item_line:
                item_line = f"{item_line}（{item_status}）"
            lines.append(item_line)
    for step in section.get("steps") or []:
        label = str(step.get("label") or step.get("title") or "").strip()
        text = str(step.get("text") or step.get("description") or "").strip()
        lines.append(f"{label}: {text}" if label else text)
    for link in section.get("related_links") or []:
        label = str(link.get("label") or link.get("title") or "").strip()
        href = str(link.get("href") or link.get("path") or "").strip()
        if label or href:
            lines.append(f"相关入口：{label} {href}".strip())
    for paragraph in section.get("afterParagraphs") or []:
        lines.append(str(paragraph).strip())
    return "\n".join(line for line in lines if line)


def _string_values(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _help_status_text(status: object) -> str:
    if status == "available":
        return "可用"
    if status == "planned":
        return "建设中"
    return str(status).strip() if status else ""


def _documents_hash(items: list[tuple[str, str, str]]) -> str:
    digest = hashlib.sha256()
    for path, title, content in items:
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(title.encode("utf-8"))
        digest.update(b"\0")
        digest.update(content.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()


def _retrieve_with_chroma(query: str, top_k: int, embedding_config: dict) -> RetrievedContext:
    if not embedding_config.get("api_key"):
        return RetrievedContext([], "", used_vector_index=False)
    if _chroma_dependency_errors():
        return RetrievedContext([], "", used_vector_index=False)
    from langchain_community.vectorstores import Chroma
    from langchain_core.documents import Document
    from langchain_openai import OpenAIEmbeddings
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except ImportError:
        from langchain.text_splitter import RecursiveCharacterTextSplitter

    raw_docs = _load_public_documents()
    if not raw_docs:
        return RetrievedContext([], "", used_vector_index=False)

    rag_dir = _rag_dir()
    rag_dir.mkdir(parents=True, exist_ok=True)
    persist_dir = rag_dir / "chroma"
    hash_path = rag_dir / "sources.sha256"
    next_hash = _documents_hash(raw_docs)
    embeddings = OpenAIEmbeddings(
        model=embedding_config["model"],
        api_key=embedding_config["api_key"],
        base_url=embedding_config.get("api_base"),
        tiktoken_enabled=False,
        check_embedding_ctx_length=False,
    )
    collection_name = "markup_platform_agent"

    rebuild = not hash_path.exists() or hash_path.read_text(encoding="utf-8").strip() != next_hash
    if rebuild:
        shutil.rmtree(persist_dir, ignore_errors=True)
        splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)
        documents: list[Document] = []
        for path, title, content in raw_docs:
            for index, chunk in enumerate(splitter.split_text(content)):
                documents.append(Document(page_content=chunk, metadata={"path": path, "title": title, "chunk": index}))
        store = Chroma.from_documents(
            documents,
            embedding=embeddings,
            collection_name=collection_name,
            persist_directory=str(persist_dir),
        )
        hash_path.write_text(next_hash, encoding="utf-8")
    else:
        store = Chroma(
            collection_name=collection_name,
            embedding_function=embeddings,
            persist_directory=str(persist_dir),
        )

    docs = store.similarity_search(query, k=top_k)
    sources = [
        AgentSource(
            title=str(item.metadata.get("title") or _source_title(str(item.metadata.get("path") or ""))),
            path=str(item.metadata.get("path") or ""),
            excerpt=_clean_excerpt(item.page_content),
        )
        for item in docs
    ]
    return RetrievedContext(sources, _summary_from_sources(sources), used_vector_index=bool(sources))


def _retrieve_with_summary(query: str, top_k: int) -> RetrievedContext:
    chunks: list[AgentSource] = []
    terms = [item for item in query.lower().replace("？", " ").replace("?", " ").split() if item]
    for path, title, content in _load_public_documents():
        for index, chunk in enumerate(_simple_chunks(content)):
            lower = chunk.lower()
            score = sum(lower.count(term) for term in terms) if terms else 0
            if not score and any(char in lower for char in query.lower()[:12]):
                score = 1
            if score:
                chunks.append(AgentSource(title, path, _clean_excerpt(chunk)))
    if not chunks:
        chunks = [AgentSource(title, path, _clean_excerpt(content)) for path, title, content in _load_public_documents()[:top_k]]
    sources = chunks[:top_k]
    return RetrievedContext(sources, _summary_from_sources(sources), used_vector_index=False)


def _simple_chunks(content: str, size: int = 900) -> list[str]:
    clean = "\n".join(line.strip() for line in content.splitlines() if line.strip())
    return [clean[index:index + size] for index in range(0, len(clean), size)] or [clean]


def _source_title(path: str) -> str:
    name = Path(path).stem.replace("_", " ").replace("-", " ").strip()
    return name or path


def _clean_excerpt(content: str, limit: int = 420) -> str:
    clean = " ".join(content.replace("\r", "\n").split())
    return clean[:limit].strip()


def _summary_from_sources(sources: list[AgentSource]) -> str:
    return "\n".join(f"- {item.title}: {item.excerpt}" for item in sources)[:MAX_CONTEXT_CHARS]


def _chroma_dependency_errors() -> list[str]:
    missing: list[str] = []
    modules = {
        "langchain_community.vectorstores": "langchain-community",
        "langchain_core.documents": "langchain-core",
        "langchain_openai": "langchain-openai",
        "chromadb": "chromadb",
    }
    for module_name, package_name in modules.items():
        try:
            __import__(module_name)
        except Exception as exc:  # noqa: BLE001 - status should report dependency health.
            missing.append(f"{package_name}: {exc.__class__.__name__}: {str(exc)[:160]}")
    try:
        __import__("langchain_text_splitters")
    except Exception:
        try:
            __import__("langchain.text_splitter")
        except Exception as exc:  # noqa: BLE001
            missing.append(f"langchain-text-splitters: {exc.__class__.__name__}: {str(exc)[:160]}")
    return missing


def _fallback_answer(question: str, retrieved: RetrievedContext) -> str:
    if retrieved.summary:
        return f"我暂时无法调用平台默认模型，先根据公开文档给你整理相关信息：\n{retrieved.summary}"
    return f"我暂时无法调用平台默认模型，也没有检索到与「{question}」直接相关的公开文档。"


def _build_prompt(payload: PlatformAgentChatRequest, retrieved: RetrievedContext) -> str:
    history = "\n".join(
        f"{item.role}: {item.content}"
        for item in payload.history[-6:]
        if item.content.strip()
    )
    return f"""你是 MarkUp 数据标注平台的问答 Agent。请只基于给定公开文档上下文回答平台使用问题。
要求：
1. 用中文回答，简洁、准确、可操作。
2. 如果上下文不足，说明无法从公开文档确认，不要编造。
3. 如涉及登录后的企业数据、余额、任务详情，提醒用户进入对应工作台查看。

公开文档上下文：
{retrieved.summary or "无相关文档上下文"}

最近对话：
{history or "无"}

用户问题：
{payload.message}
"""


def _platform_default_provider(db: MongoDatabase) -> AiProviderConfig | None:
    return db.find_one(
        AiProviderConfig,
        {"scope": "platform", "is_platform_default": True, "status": "enabled"},
    )


def _stream_public_provider_generation(db: MongoDatabase, provider: AiProviderConfig, prompt: str, request: Request) -> Iterable[dict]:
    api_key = decrypt_secret(getattr(provider, "encrypted_api_key", None))
    model_id = resource_service._provider_model_id(provider)
    started_at = time.perf_counter()
    request_id = getattr(request.state, "request_id", None)
    content = ""
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    try:
        for event in resource_service.iter_provider_generation_stream(
            provider,
            api_key=api_key,
            model_id=model_id,
            prompt=prompt,
        ):
            if event["type"] == "meta":
                request_id = event.get("request_id") or request_id
                yield {"type": "meta", "request_id": request_id, "model": model_id}
                continue
            if event["type"] == "delta":
                content += str(event["content"])
                yield event
                continue
            if event["type"] == "done":
                request_id = event.get("request_id") or request_id
                prompt_tokens = int(event.get("prompt_tokens") or 0)
                completion_tokens = int(event.get("completion_tokens") or 0)
                total_tokens = int(event.get("total_tokens") or 0)
    except Exception as exc:
        _record_platform_agent_failure(db, provider=provider, model_id=model_id, started_at=started_at, request_id=request_id, error=_exception_message(exc))
        raise

    if not content.strip():
        error = "AI Provider returned empty content"
        _record_platform_agent_failure(db, provider=provider, model_id=model_id, started_at=started_at, request_id=request_id, error=error)
        raise RuntimeError(error)

    latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
    cost = resource_service._estimate_provider_cost(resource_service._provider_pricing(provider), prompt_tokens, completion_tokens)
    db.add(
        AiCallLog(
            team_id="",
            user_id=None,
            provider_id=provider.id,
            route_name=resource_service._provider_route_name(provider),
            operation_type="platform_agent_chat",
            provider=resource_service._provider_kind(provider),
            model=model_id,
            tokens=total_tokens,
            cost=cost,
            latency_ms=latency_ms,
            status="success",
            request_id=request_id,
        )
    )
    db.commit()
    yield {
        "type": "done",
        "content": content,
        "request_id": request_id,
        "latency_ms": latency_ms,
        "tokens": total_tokens,
        "cost": cost,
    }


def _exception_message(exc: Exception) -> str:
    if isinstance(exc, AppError):
        detail = exc.detail
        if detail is None:
            return exc.message[:1000]
        if isinstance(detail, str):
            detail_text = detail
        else:
            try:
                detail_text = json.dumps(detail, ensure_ascii=False)
            except TypeError:
                detail_text = str(detail)
        return f"{exc.message}: {detail_text}"[:1000]
    return (str(exc) or exc.__class__.__name__)[:1000]


def _record_platform_agent_failure(
    db: MongoDatabase,
    *,
    provider: AiProviderConfig,
    model_id: str,
    started_at: float,
    request_id: str | None,
    error: str,
) -> None:
    latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
    db.add(
        AiCallLog(
            team_id="",
            user_id=None,
            provider_id=provider.id,
            route_name=resource_service._provider_route_name(provider),
            operation_type="platform_agent_chat",
            provider=resource_service._provider_kind(provider),
            model=model_id,
            latency_ms=latency_ms,
            status="failed",
            error=error[:1000],
            request_id=request_id,
        )
    )
    db.commit()


def _source_payload(source: AgentSource) -> dict:
    return {"title": source.title, "path": source.path, "excerpt": source.excerpt}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
