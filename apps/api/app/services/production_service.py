from __future__ import annotations

import base64
import csv
import io
import json
import re
import time
import zipfile
from datetime import UTC, datetime, timedelta
from typing import Any
from xml.etree import ElementTree

import httpx
from fastapi import Request

from app.core.config import settings
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import decrypt_secret, generate_token_urlsafe, now_utc
from app.domains.rbac import TeamRole, role_value
from app.models.ai_review import AiReviewJob
from app.models.export import ExportJob
from app.models.notification import Notification
from app.models.platform import PlatformSetting
from app.models.production import AnnotationTemplate, Dataset, Question, Submission, Task, TaskClaimBundle, TemplateVersion
from app.models.resource import AiProviderConfig
from app.models.team import TeamMember
from app.models.user import User, UserProfile
from app.services.csv_utils import escape_csv_formula
from app.services.file_storage import delete_storage_file
from app.services.audit_service import write_audit_log
from app.services.membership_service import assert_active_task_capacity, assert_dataset_storage_capacity
from app.services.notification_dispatcher import notify_task_publish_requested, notify_task_published, notify_task_status_changed
from app.services import resource_service
from app.services.resource_service import run_provider_text_generation

PREVIEW_LIMIT = 8
QUESTION_IMPORT_MAX_BYTES = 50 * 1024 * 1024
SYSTEM_DATASET_CONTEXT_FIELDS = {"media", "attachments", "derived_context", "_bindings"}
REGISTERED_TEMPLATE_COMPONENT_TYPES = {
    "ShowItem",
    "TextInput",
    "TextArea",
    "SingleSelect",
    "MultiSelect",
    "TagSelect",
    "Scale",
    "Ranking",
    "RichEditor",
    "FileUpload",
    "ImageUpload",
    "ImageMaskAnnotation",
    "AudioUpload",
    "VideoUpload",
    "JsonEditor",
    "LLMComponent",
    "GroupContainer",
}
NON_ANSWER_TEMPLATE_COMPONENT_TYPES = {"ShowItem", "LLMComponent", "GroupContainer"}
CURRENT_TEMPLATE_SCHEMA_VERSION = "1.1"
SUPPORTED_TEMPLATE_SCHEMA_VERSIONS = {"1.0", "1.1"}
NON_DRAFT_DATASET_REFERENCE_STATUSES = {"pending_review", "published", "paused", "finished"}
AI_REVIEW_SETUP_GENERATION_TIMEOUT_SECONDS = 60.0
TASK_PUBLISH_SWITCH_KEY = "task_publish"


def assert_production_switch_enabled(db: MongoDatabase, switch_key: str) -> None:
    setting = db.find_one(PlatformSetting, {"key": switch_key})
    if not setting:
        return
    value = setting.value if isinstance(setting.value, dict) else {}
    if value.get("enabled") is False:
        raise AppError(ErrorCode.BUSINESS_RULE, "生产开关未启用", {"switch_key": switch_key})


def generate_ai_review_input_prompt(db: MongoDatabase, *, team_id: str, operator_id: str, payload: dict, request: Request) -> dict:
    prompt = "\n".join(
        [
            "你是 MarkUp 数据平台的 AI 预审字段语义分析 Agent。",
            "请根据任务发布配置，为 AI 预审生成「Input 字段说明」。",
            "安全要求：输入中只包含任务配置元信息、数据集字段元信息、模板组件结构，以及发布端提供的少量截断预览样本；不包含附件原文、Labeler 答案、账号身份信息或 API Key。",
            "请输出可编辑的中文 Markdown 文本。必须结合预览样本里的实际内容主题、样本形态、文字/图片/音频/JSON 等内容线索进行分析，但不要逐字复制长样例、不要编造不存在的数据。",
            "",
            "输出格式必须严格参考以下结构，保留这些段落标题；不要输出额外的开场说明：",
            "任务模板上下文：{模板名称或未选择模板}",
            "数据集上下文：{数据集名称或未选择数据集}，共 {row_count} 行。",
            "",
            "数据集变量语义推断：",
            "- {字段名}: 说明字段含义、字段类型、字段备注、样例内容呈现出的真实语义主题、在审核中的作用；可以概括样例内容类型，不要逐字输出长样例值。",
            "",
            "数据集样例内容分析：",
            "- 概括最多 3 条从 sample_rows 推断出的实际内容特征，例如图片/文本/问题/标签/选项/业务场景/异常值；必须说明这些内容特征会如何影响 AI 预审判断。",
            "",
            "标注端展示字段语义：",
            "- {展示项标题}: Labeler 可见展示项，绑定数据字段 {字段名或未映射}；说明它如何作为审核上下文。",
            "",
            "待审核 JSON 答案字段语义：",
            "- {答案项标题}: Labeler 提交 JSON 字段 {field}，题型 {type}，说明该答案字段期望表达的业务结果。",
            "",
            "如果某一部分没有内容，请输出 '- 暂无...'，不要省略段落。",
            "",
            ai_generation_context_text(payload),
        ]
    )
    generated = run_provider_text_generation(
        db,
        team_id=team_id,
        provider_id=payload["provider_id"],
        model=payload.get("model"),
        prompt=prompt,
        operation_type="ai_review_input_generate",
        operator_id=operator_id,
        request=request,
    )
    write_audit_log(
        db,
        entity_type="ai_review_config",
        entity_id=payload["provider_id"],
        action="ai_review_input_generated",
        operator_id=operator_id,
        team_id=team_id,
        changes={"provider_id": payload["provider_id"], "model": generated.get("model")},
        request=request,
    )
    db.commit()
    return {"input_prompt": clean_ai_review_input_prompt(generated["content"]), **{key: generated.get(key) for key in ("provider_id", "model", "request_id", "latency_ms", "tokens", "cost")}}


def generate_ai_review_matrix(db: MongoDatabase, *, team_id: str, operator_id: str, payload: dict, request: Request) -> dict:
    dimensions = [str(item).strip() for item in payload.get("dimensions") or [] if str(item).strip()]
    if not dimensions:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "请至少选择一个审核维度")
    prompt = "\n".join(
        [
            "你是 MarkUp 数据平台的 AI 预审评分矩阵设计 Agent。",
            "请根据任务上下文，为发布任务的 AI 预审生成审核评分矩阵。",
            "安全要求：输入中只包含任务配置元信息、数据集字段元信息、模板组件结构，以及发布端提供的少量截断预览样本；不包含附件原文、Labeler 答案、账号身份信息或 API Key。",
            "必须只返回合法 JSON，不要 Markdown、不要代码块、不要解释性前后缀。",
            "",
            "输出格式固定为：",
            '{"items":[{"dimension":"维度名","definition":"定义","scoring_standard":"评分标准","deduction_rule":"扣分规则","reject_condition":"打回条件","manual_condition":"人工复核条件"}]}',
            "",
            "要求：",
            "1. items 数量必须与维度列表一致，dimension 必须逐项使用输入维度名。",
            "2. 所有字段必须是中文非空字符串，结合任务说明、字段元信息、模板结构和 sample_rows 里的实际样本内容生成，不能只按字段名泛泛推断，也不能返回通用占位话术。",
            "3. scoring_standard 使用 0-100 分体系，明确优秀、可接受、低质量、不可接受边界。",
            "4. reject_condition 只描述明显不能采纳的自动打回条件；manual_condition 描述边界样本或需要 Reviewer 判断的情况。",
            "5. 每个维度的内容格式需要参考旧版矩阵：定义是一句话；评分标准说明 100/80/60 等边界；扣分规则写明扣分范围；打回条件和人工复核条件各写一句可执行规则。",
            "6. reject_condition 和 manual_condition 必须体现样例内容中的真实对象、文本主题、图片/音频/JSON 等内容形态或选项语义，避免只写“与题目不符”等空泛条件。",
            "",
            f"维度列表：{json.dumps(dimensions, ensure_ascii=False)}",
            ai_generation_context_text(payload),
        ]
    )
    generated = run_provider_text_generation(
        db,
        team_id=team_id,
        provider_id=payload["provider_id"],
        model=payload.get("model"),
        prompt=prompt,
        operation_type="ai_review_matrix_generate",
        operator_id=operator_id,
        request=request,
    )
    rows = parse_ai_review_matrix(generated["content"], dimensions)
    write_audit_log(
        db,
        entity_type="ai_review_config",
        entity_id=payload["provider_id"],
        action="ai_review_matrix_generated",
        operator_id=operator_id,
        team_id=team_id,
        changes={"provider_id": payload["provider_id"], "model": generated.get("model"), "dimensions": dimensions},
        request=request,
    )
    db.commit()
    return {"items": rows, **{key: generated.get(key) for key in ("provider_id", "model", "request_id", "latency_ms", "tokens", "cost")}}


def evaluate_task_difficulty(db: MongoDatabase, *, team_id: str, operator_id: str, payload: dict, request: Request) -> dict:
    missing = task_difficulty_missing_fields(payload)
    if missing:
        return {
            "difficulty": None,
            "label": None,
            "confidence": None,
            "reason": f"填写完{ '、'.join(missing) }后可查看任务难度。",
            "signals": [],
            "missing_fields": missing,
            "prompt": "",
            "fallback": False,
        }
    dataset = db.get(Dataset, payload.get("dataset_id") or "")
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    template = db.get(AnnotationTemplate, payload.get("template_id") or "")
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    prompt = build_task_difficulty_prompt(dataset, template, payload)
    require_medium = bool(payload.get("required_certs"))
    provider = require_platform_default_provider(db)
    generated = run_provider_text_generation(
        db,
        team_id=team_id,
        provider_id=provider.id,
        model=None,
        prompt=prompt,
        operation_type="task_difficulty_evaluate",
        operator_id=operator_id,
        request=request,
        source_id=payload.get("template_id") or "draft",
        charge_ai_resource=False,
    )
    parsed = parse_task_difficulty_result(generated.get("content") or "", require_medium=require_medium)
    write_audit_log(
        db,
        entity_type="task_difficulty",
        entity_id=payload.get("template_id") or "draft",
        action="task_difficulty_evaluated",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "dataset_id": payload.get("dataset_id"),
            "template_id": payload.get("template_id"),
            "difficulty": parsed["difficulty"],
            "provider_id": generated.get("provider_id"),
            "model": generated.get("model"),
            "fallback": False,
        },
        request=request,
    )
    db.commit()
    return {
        **parsed,
        "label": {"easy": "简单", "medium": "中等", "hard": "困难"}.get(parsed["difficulty"], parsed["difficulty"]),
        "missing_fields": [],
        "prompt": prompt,
        "fallback": False,
        "provider_id": generated.get("provider_id"),
        "model": generated.get("model"),
        "request_id": generated.get("request_id"),
        "latency_ms": generated.get("latency_ms"),
        "tokens": generated.get("tokens"),
        "cost": generated.get("cost"),
    }


def require_platform_default_provider(db: MongoDatabase) -> AiProviderConfig:
    provider = db.find_one(AiProviderConfig, {"scope": "platform", "is_platform_default": True, "status": "enabled"})
    if not provider:
        raise AppError(ErrorCode.BUSINESS_RULE, "平台默认 AI Provider 未配置或未启用，请先由系统管理员配置平台 Provider")
    return provider


def run_platform_provider_messages_generation(
    db: MongoDatabase,
    *,
    team_id: str,
    messages: list[dict],
    operation_type: str,
    operator_id: str,
    request: Request | None,
    task_id: str | None = None,
    source_id: str | None = None,
    max_tokens: int | None = None,
    provider_id: str | None = None,
    model: str | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    charge_ai_resource: bool = True,
) -> dict:
    provider = db.get(AiProviderConfig, provider_id) if provider_id else require_platform_default_provider(db)
    if not provider or provider.status != "enabled":
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 AI Provider 未启用")
    return resource_service.run_provider_messages_generation(
        db,
        team_id=team_id,
        provider_id=provider.id,
        model=model,
        messages=messages,
        operation_type=operation_type,
        operator_id=operator_id,
        request=request,
        task_id=task_id,
        source_id=source_id,
        structured_output_schema=structured_output_schema,
        charge_ai_resource=charge_ai_resource,
        max_tokens=max_tokens,
    )


def platform_provider_messages_request(provider: AiProviderConfig, api_key: str | None, model_id: str, messages: list[dict], *, max_tokens: int | None = None, structured_output_schema: dict[str, Any] | None = None, native_structured_output: bool = True) -> tuple[str, dict[str, str], dict]:
    provider_kind = resource_service._provider_kind(provider)
    api_base = resource_service._provider_api_base(provider)
    runtime = resource_service._provider_runtime(provider)
    temperature = float(runtime.get("temperature", 0))
    output_tokens = int(max_tokens or runtime.get("max_output_tokens") or 4096)
    if not api_base:
        raise AppError(ErrorCode.BUSINESS_RULE, "平台 AI Provider 缺少 API Base")
    if resource_service._provider_requires_api_key(provider) and not api_key:
        raise AppError(ErrorCode.BUSINESS_RULE, f"{provider_kind} 需要配置 API Key")
    structured_output_mode = str(runtime.get("structured_output_mode") or "").strip().lower()
    prompt_schema_required = False
    if structured_output_schema and provider_kind == "Gemini" and native_structured_output:
        generation_config: dict[str, Any] = {"temperature": temperature, "maxOutputTokens": output_tokens, "responseMimeType": "application/json"}
        return (
            f"{api_base}/models/{model_id}:generateContent?key={api_key}",
            {"content-type": "application/json"},
            {"contents": [gemini_content_from_message(message) for message in messages], "generationConfig": generation_config},
        )
    if provider_kind == "Gemini":
        return (
            f"{api_base}/models/{model_id}:generateContent?key={api_key}",
            {"content-type": "application/json"},
            {"contents": [gemini_content_from_message(message) for message in messages], "generationConfig": {"temperature": temperature, "maxOutputTokens": output_tokens}},
        )
    if structured_output_schema and provider_kind == "Anthropic":
        messages = messages_with_structured_output_schema(messages, structured_output_schema)
    if provider_kind == "Anthropic":
        return (
            f"{api_base}/messages",
            resource_service._provider_headers(provider, api_key),
            {"model": model_id, "max_tokens": output_tokens, "temperature": temperature, "messages": [anthropic_message_from_message(message) for message in messages]},
        )
    if structured_output_schema and not native_structured_output:
        prompt_schema_required = True
    if structured_output_schema and native_structured_output and structured_output_mode not in {"json_schema", "json_object"} and provider_kind not in {"OpenAI", "Azure OpenAI", "OpenAI Compatible", "DeepSeek", "OpenRouter"}:
        prompt_schema_required = True
    if structured_output_schema and native_structured_output and (
        structured_output_mode == "json_object"
        or (not structured_output_mode and provider_kind in {"OpenAI Compatible", "DeepSeek", "OpenRouter"})
    ):
        prompt_schema_required = True
    if prompt_schema_required:
        messages = messages_with_structured_output_schema(messages, structured_output_schema)
    api_version = str(runtime.get("api_version") or "2024-02-15-preview")
    url = f"{api_base}/chat/completions?api-version={api_version}" if provider_kind == "Azure OpenAI" else resource_service.urljoin(f"{api_base}/", "chat/completions")
    text_only_messages = bool(structured_output_schema and not native_structured_output)
    payload = {"model": model_id, "messages": [openai_compatible_message_from_message(message, text_only=text_only_messages) for message in messages], "temperature": temperature, "max_tokens": output_tokens}
    if structured_output_schema and native_structured_output and (
        structured_output_mode == "json_schema"
        or (not structured_output_mode and provider_kind in {"OpenAI", "Azure OpenAI"})
    ):
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "labeling_ai_assist_result",
                "schema": structured_output_schema,
                "strict": True,
            },
        }
    elif structured_output_schema and native_structured_output and (
        structured_output_mode == "json_object"
        or (not structured_output_mode and provider_kind in {"OpenAI Compatible", "DeepSeek", "OpenRouter"})
    ):
        payload["response_format"] = {"type": "json_object"}
    return (
        url,
        resource_service._provider_headers(provider, api_key),
        payload,
    )


def should_retry_without_native_response_format(request_body: dict, structured_output_schema: dict[str, Any] | None) -> bool:
    return bool(structured_output_schema and isinstance(request_body, dict) and request_body.get("response_format"))


def messages_with_structured_output_schema(messages: list[dict], schema: dict[str, Any]) -> list[dict]:
    schema_text = "\nStructured output JSON schema:\n" + json.dumps(schema, ensure_ascii=False)
    cloned = [dict(message) for message in messages]
    for index in range(len(cloned) - 1, -1, -1):
        if str(cloned[index].get("role") or "user") != "user":
            continue
        content = cloned[index].get("content")
        if isinstance(content, list):
            cloned[index]["content"] = [*content, {"type": "text", "text": schema_text}]
        else:
            cloned[index]["content"] = f"{content or ''}{schema_text}"
        return cloned
    return [*cloned, {"role": "user", "content": schema_text}]


def openai_compatible_message_from_message(message: dict, *, text_only: bool = False) -> dict:
    content = message.get("content")
    if not isinstance(content, list):
        return message
    if text_only:
        return {"role": str(message.get("role") or "user"), "content": openai_compatible_text_content_from_message(message)}
    parts: list[dict] = []
    for part in message_parts(message):
        part_type = str(part.get("type") or "")
        if part_type == "text":
            parts.append({"type": "text", "text": str(part.get("text") or "")})
            continue
        if part_type == "image_url":
            url = media_part_url(part)
            if url:
                parts.append({"type": "image_url", "image_url": {"url": url}})
            continue
        if part_type == "audio_url":
            url = media_part_url(part)
            label = str(part.get("label") or "音频")
            if url.startswith("data:audio") and ";base64," in url:
                mime_type = media_part_mime_type(part)
                audio_format = audio_format_from_mime_type(mime_type)
                _, data = url.split(";base64,", 1)
                parts.append({"type": "input_audio", "input_audio": {"data": data, "format": audio_format}})
            elif url:
                parts.append({"type": "text", "text": f"音频媒体（{label}）URL：{url}。请在支持外部音频读取时分析其内容；如果无法读取，请说明限制。"})
            continue
        if part_type == "video_url":
            url = media_part_url(part)
            label = str(part.get("label") or "视频")
            if url:
                parts.append({"type": "text", "text": f"视频媒体（{label}）URL：{url}。请分析画面、声音和时序；如果当前 Provider 不支持 video_url，请说明限制。"})
    return {"role": str(message.get("role") or "user"), "content": parts}


def openai_compatible_text_content_from_message(message: dict) -> str:
    lines: list[str] = []
    for part in message_parts(message):
        part_type = str(part.get("type") or "")
        label = str(part.get("label") or "").strip()
        if part_type == "text":
            text = str(part.get("text") or "").strip()
            if text:
                lines.append(text)
            continue
        if part_type in {"image_url", "audio_url", "video_url"}:
            url = media_part_url(part)
            if url:
                prefix = "Image" if part_type == "image_url" else ("Audio" if part_type == "audio_url" else "Video")
                suffix = f" ({label})" if label else ""
                lines.append(f"{prefix} media URL{suffix}: {url}")
    return "\n".join(lines)


def gemini_content_from_message(message: dict) -> dict:
    parts: list[dict] = []
    for part in message_parts(message):
        if part.get("type") == "text":
            parts.append({"text": str(part.get("text") or "")})
        elif part.get("type") in {"image_url", "audio_url", "video_url"}:
            url = media_part_url(part)
            mime_type = media_part_mime_type(part)
            if url.startswith("data:") and ";base64," in url:
                header, data = url.split(";base64,", 1)
                parts.append({"inline_data": {"mime_type": header.removeprefix("data:"), "data": data}})
            elif url:
                parts.append({"file_data": {"mime_type": mime_type, "file_uri": url}})
    return {"role": "user", "parts": parts}


def anthropic_message_from_message(message: dict) -> dict:
    content: list[dict] = []
    for part in message_parts(message):
        if part.get("type") == "text":
            content.append({"type": "text", "text": str(part.get("text") or "")})
        elif part.get("type") == "image_url":
            url = str((part.get("image_url") or {}).get("url") or "")
            if url.startswith("data:") and ";base64," in url:
                header, data = url.split(";base64,", 1)
                content.append({"type": "image", "source": {"type": "base64", "media_type": header.removeprefix("data:"), "data": data}})
            elif url:
                content.append({"type": "text", "text": f"图片 URL：{url}"})
        elif part.get("type") in {"audio_url", "video_url"}:
            media_type = "音频" if part.get("type") == "audio_url" else "视频"
            label = str(part.get("label") or media_type)
            url = media_part_url(part)
            if url:
                content.append({"type": "text", "text": f"{media_type}媒体（{label}）URL：{url}。如果当前模型无法直接读取，请在结果中说明限制。"})
    return {"role": str(message.get("role") or "user"), "content": content}


def message_parts(message: dict) -> list[dict]:
    content = message.get("content")
    if isinstance(content, list):
        return [part for part in content if isinstance(part, dict)]
    return [{"type": "text", "text": str(content or "")}]


def media_part_url(part: dict) -> str:
    part_type = str(part.get("type") or "")
    if part_type == "image_url":
        return str((part.get("image_url") or {}).get("url") or "")
    if part_type == "audio_url":
        return str((part.get("audio_url") or {}).get("url") or "")
    if part_type == "video_url":
        return str((part.get("video_url") or {}).get("url") or "")
    return ""


def media_part_mime_type(part: dict) -> str:
    url = media_part_url(part)
    if url.startswith("data:") and ";base64," in url:
        return url.split(";", 1)[0].removeprefix("data:")
    part_type = str(part.get("type") or "")
    if part_type == "image_url":
        return "image/*"
    if part_type == "audio_url":
        return "audio/*"
    if part_type == "video_url":
        return "video/*"
    return "application/octet-stream"


def audio_format_from_mime_type(mime_type: str) -> str:
    lowered = mime_type.lower()
    if "wav" in lowered:
        return "wav"
    if "mpeg" in lowered or "mp3" in lowered:
        return "mp3"
    if "ogg" in lowered:
        return "ogg"
    if "flac" in lowered:
        return "flac"
    if "aac" in lowered:
        return "aac"
    return "mp3"


def task_difficulty_missing_fields(payload: dict) -> list[str]:
    missing: list[str] = []
    if not str(payload.get("dataset_id") or "").strip():
        missing.append("数据集")
    if not str(payload.get("template_id") or "").strip():
        missing.append("模板")
    if "required_certs" not in payload:
        missing.append("资质要求")
    return missing


def build_task_difficulty_prompt(dataset: Dataset, template: AnnotationTemplate, payload: dict) -> str:
    schema = effective_template_schema(template)
    components = template_components(schema)
    answer_components = [item for item in components if item.get("type") not in NON_ANSWER_TEMPLATE_COMPONENT_TYPES]
    upload_count = len([item for item in answer_components if item.get("type") in {"FileUpload", "ImageUpload", "AudioUpload", "VideoUpload"}])
    choice_count = len([item for item in answer_components if item.get("type") in {"SingleSelect", "MultiSelect", "TagSelect", "Scale", "Ranking"}])
    text_count = len([item for item in answer_components if item.get("type") in {"TextInput", "TextArea", "RichEditor", "JsonEditor"}])
    llm_count = len([item for item in components if item.get("type") == "LLMComponent"])
    required_count = len([item for item in answer_components if item.get("required")])
    option_total = sum(len(item.get("options") or []) for item in answer_components if isinstance(item.get("options"), list))
    dataset_context = {
        "name": dataset.name,
        "description": dataset.description,
        "row_count": dataset.row_count,
        "column_count": len(dataset.columns),
        "column_types": {str(column.get("data_type") or "text"): sum(1 for current in dataset.columns if current.get("data_type") == column.get("data_type")) for column in dataset.columns},
        "columns": [
            {
                "name": column.get("name"),
                "data_type": column.get("data_type"),
                "comment": column.get("comment"),
                "use_in_mapping": column.get("use_in_mapping", True),
            }
            for column in dataset.columns[:40]
        ],
    }
    template_context = {
        "name": template.name,
        "description": template.description,
        "tab_count": len(schema.get("tabs", [])),
        "component_count": len(components),
        "answer_component_count": len(answer_components),
        "required_answer_count": required_count,
        "choice_component_count": choice_count,
        "text_component_count": text_count,
        "upload_component_count": upload_count,
        "llm_component_count": llm_count,
        "option_total": option_total,
        "component_types": sorted({str(item.get("type") or "") for item in components if item.get("type")}),
        "answer_fields": [
            {
                "type": item.get("type"),
                "label": item.get("label"),
                "field": item.get("field"),
                "required": bool(item.get("required")),
                "option_count": len(item.get("options") or []) if isinstance(item.get("options"), list) else 0,
                "config_keys": sorted((item.get("config") or {}).keys()) if isinstance(item.get("config"), dict) else [],
            }
            for item in answer_components[:60]
        ],
    }
    qualification_context = {
        "required_certs": [str(item).strip() for item in payload.get("required_certs") or [] if str(item).strip()],
        "qualification_rules": compact_ai_generation_payload(payload.get("qualification_rules") if isinstance(payload.get("qualification_rules"), dict) else {}),
        "has_required_qualification": bool(payload.get("required_certs")),
    }
    return "\n".join(
        [
            "你是 MarkUp 数据标注平台的平台级任务难度评估 Agent。",
            "请根据任务的数据集信息量、模板复杂程度、是否需要资质领域三类因素，快速评估发布任务难度。",
            "安全要求：输入只包含字段元信息、模板结构和资质要求，不包含真实数据行、附件、API Key 或用户敏感信息。",
            "",
            "必须只返回合法 JSON，不要 Markdown、不要代码块、不要解释性前后缀。JSON 格式固定为：",
            '{"difficulty":"easy|medium|hard","confidence":0.0,"reason":"一句中文理由，说明主要依据","signals":["关键判断依据1","关键判断依据2"]}',
            "",
            "判定规则：",
            "1. easy：数据字段少且语义明确、模板题型少、交互简单、无需资质领域，普通 Labeler 可快速完成。",
            "2. medium：数据字段或样本量中等、模板包含多题型/必填/多选/上传/较多选项，或需要一定业务判断。",
            "3. hard：数据字段多或多模态、模板组件复杂、有上传/JSON/联动/LLM/大量必填项，或需要强专业判断。",
            "4. 如果存在任意 required_certs 或领域资质要求，difficulty 不能为 easy，最低必须是 medium。",
            "5. 不要因为数据行数大就直接判 hard；行数影响任务量，难度主要看单条信息量、模板复杂度和专业门槛。",
            "6. reason 控制在 80 个中文字符内，signals 最多 4 条。",
            "",
            f"数据集上下文：{json.dumps(dataset_context, ensure_ascii=False)}",
            f"模板上下文：{json.dumps(template_context, ensure_ascii=False)}",
            f"资质上下文：{json.dumps(qualification_context, ensure_ascii=False)}",
        ]
    )


def call_platform_difficulty_model(prompt: str, *, request: Request, max_tokens: int = 420) -> dict:
    return call_platform_difficulty_model_messages(
        [{"role": "user", "content": prompt}],
        request=request,
        max_tokens=max_tokens,
    )


def call_platform_difficulty_model_messages(messages: list[dict], *, request: Request, max_tokens: int = 420) -> dict:
    if not settings.difficulty_ai_api_key:
        return {"fallback": True, "error": "未配置 DIFFICULTY_AI_API_KEY", "request_id": getattr(request.state, "request_id", None), "latency_ms": 0}
    url = f"{settings.difficulty_ai_api_base.rstrip('/')}/chat/completions"
    started_at = datetime.now(UTC)
    request_id = getattr(request.state, "request_id", None)
    try:
        difficulty_timeout = min(60.0, max(1.0, float(settings.difficulty_ai_timeout_seconds or 60)))
        with httpx.Client(timeout=difficulty_timeout) as client:
            response = client.post(
                url,
                headers={"authorization": f"Bearer {settings.difficulty_ai_api_key}", "content-type": "application/json"},
                json={
                    "model": settings.difficulty_ai_model,
                    "messages": messages,
                    "temperature": float(settings.difficulty_ai_temperature or 0),
                    "max_tokens": max_tokens,
                },
            )
        latency_ms = max(1, round((datetime.now(UTC) - started_at).total_seconds() * 1000))
        request_id = response.headers.get("x-request-id") or request_id
        if response.status_code >= 400:
            return {"fallback": True, "error": f"难度评估模型返回 {response.status_code}", "request_id": request_id, "latency_ms": latency_ms}
        data = response.json()
        choices = data.get("choices") if isinstance(data.get("choices"), list) else []
        message = choices[0].get("message", {}) if choices and isinstance(choices[0], dict) else {}
        content = str(message.get("content") or "").strip()
        return {"content": content, "fallback": False, "request_id": request_id, "latency_ms": latency_ms}
    except Exception as exc:
        latency_ms = max(1, round((datetime.now(UTC) - started_at).total_seconds() * 1000))
        return {"fallback": True, "error": str(exc)[:300], "request_id": request_id, "latency_ms": latency_ms}


def parse_task_difficulty_result(content: str, *, require_medium: bool) -> dict:
    try:
        parsed = json.loads(strip_json_fence(content))
    except json.JSONDecodeError:
        parsed = {}
    difficulty = str(parsed.get("difficulty") or "").strip().lower()
    if difficulty not in {"easy", "medium", "hard"}:
        difficulty = "medium"
    if require_medium and difficulty == "easy":
        difficulty = "medium"
    confidence = parsed.get("confidence")
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.6
    signals = parsed.get("signals") if isinstance(parsed.get("signals"), list) else []
    return {
        "difficulty": difficulty,
        "confidence": confidence,
        "reason": str(parsed.get("reason") or "已根据数据集、模板和资质要求完成难度评估。")[:200],
        "signals": [str(item)[:120] for item in signals[:4]],
    }


def fallback_task_difficulty(dataset: Dataset, template: AnnotationTemplate, payload: dict, *, reason: str) -> dict:
    schema = effective_template_schema(template)
    components = template_components(schema)
    answer_components = [item for item in components if item.get("type") not in NON_ANSWER_TEMPLATE_COMPONENT_TYPES]
    score = 0
    score += min(3, len(dataset.columns) // 5)
    score += min(3, len(answer_components) // 4)
    score += 2 if any(item.get("type") in {"FileUpload", "ImageUpload", "AudioUpload", "VideoUpload", "JsonEditor"} for item in answer_components) or any(item.get("type") == "LLMComponent" for item in components) else 0
    score += 2 if payload.get("required_certs") else 0
    difficulty = "hard" if score >= 6 else "medium" if score >= 3 or payload.get("required_certs") else "easy"
    return {
        "difficulty": difficulty,
        "confidence": 0.45,
        "reason": f"模型暂不可用，已按规则兜底评估：{reason}",
        "signals": ["按字段数量、答案组件数量、复杂组件和资质要求进行兜底判定"],
    }


def ai_generation_context_text(payload: dict) -> str:
    safe_context = {
        "context": compact_ai_generation_payload(payload.get("context") if isinstance(payload.get("context"), dict) else {}),
        "dataset": compact_ai_generation_payload(payload.get("dataset") if isinstance(payload.get("dataset"), dict) else {}),
        "template": compact_ai_generation_payload(payload.get("template") if isinstance(payload.get("template"), dict) else {}),
        "input_prompt": str(payload.get("input_prompt") or "")[:10000],
    }
    return f"任务安全上下文：{json.dumps(safe_context, ensure_ascii=False, indent=2)}"


def clean_ai_review_input_prompt(content: str) -> str:
    lines = content.strip().splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines and lines[0].strip() == "以下内容为 AI 字段语义说明，可由发布者编辑确认。":
        lines.pop(0)
        while lines and not lines[0].strip():
            lines.pop(0)
    return "\n".join(lines).strip()


def compact_ai_generation_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): compact_ai_generation_payload(child) for key, child in list(value.items())[:100]}
    if isinstance(value, list):
        return [compact_ai_generation_payload(item) for item in value[:100]]
    if isinstance(value, str):
        return value[:1000]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:1000]


def parse_ai_review_matrix(content: str, dimensions: list[str]) -> list[dict]:
    text = strip_json_fence(content)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的评分矩阵不是合法 JSON", {"raw": text[:1000]}) from exc
    items = parsed.get("items") if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的评分矩阵缺少 items 数组")
    by_dimension = {str(item.get("dimension") or "").strip(): item for item in items if isinstance(item, dict)}
    rows: list[dict] = []
    required_fields = ["definition", "scoring_standard", "deduction_rule", "reject_condition", "manual_condition"]
    for dimension in dimensions:
        item = by_dimension.get(dimension)
        if not item:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的评分矩阵缺少维度", {"dimension": dimension})
        row = {"key": dimension, "dimension": dimension}
        for field_name in required_fields:
            value = str(item.get(field_name) or "").strip()
            if not value:
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI 返回的评分矩阵字段不完整", {"dimension": dimension, "field": field_name})
            row[field_name] = value
        rows.append(row)
    return rows


def strip_json_fence(content: str) -> str:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def parse_dataset_file(filename: str, content: bytes) -> tuple[str, list[dict[str, Any]]]:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix == "csv":
        return "csv", parse_csv(content)
    if suffix == "json":
        return "json", parse_json(content)
    if suffix == "jsonl":
        return "jsonl", parse_jsonl(content)
    if suffix == "xlsx":
        return "xlsx", parse_xlsx(content)
    raise AppError(ErrorCode.VALIDATION_FORMAT, "仅支持 CSV、Excel(.xlsx)、JSON、JSONL 数据集文件")


def parse_csv(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")
    return [dict(row) for row in csv.DictReader(io.StringIO(text))]


def parse_json(content: bytes) -> list[dict[str, Any]]:
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "JSON 文件格式错误", {"row_errors": [{"row": exc.lineno, "error": exc.msg}]}) from exc
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        payload = payload["items"]
    if not isinstance(payload, list):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "JSON 数据集必须是数组，或包含 items 数组", {"row_errors": [{"row": None, "error": "JSON 根节点必须是数组或包含 items 数组"}]})
    rows = []
    row_errors = []
    for index, row in enumerate(payload, start=1):
        if isinstance(row, dict):
            rows.append(row)
        else:
            row_errors.append({"row": index, "error": "每一行必须是对象"})
    if row_errors:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "JSON 数据行格式错误", {"row_errors": row_errors})
    return rows


def parse_jsonl(content: bytes) -> list[dict[str, Any]]:
    rows = []
    row_errors = []
    for index, line in enumerate(content.decode("utf-8-sig").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            row_errors.append({"row": index, "error": exc.msg})
            continue
        if isinstance(payload, dict):
            rows.append(payload)
        else:
            row_errors.append({"row": index, "error": "每一行必须是对象"})
    if row_errors:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "JSONL 数据行格式错误", {"row_errors": row_errors})
    return rows


def parse_xlsx(content: bytes) -> list[dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        shared_strings = read_shared_strings(archive)
        worksheet_name = first_worksheet_name(archive)
        root = ElementTree.fromstring(archive.read(worksheet_name))
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    table_rows: list[list[Any]] = []
    for row in root.findall(".//x:sheetData/x:row", ns):
        values = []
        expected_index = 0
        for cell in row.findall("x:c", ns):
            cell_ref = cell.attrib.get("r", "")
            column_index = xlsx_column_index(cell_ref)
            while expected_index < column_index:
                values.append("")
                expected_index += 1
            values.append(read_xlsx_cell(cell, shared_strings, ns))
            expected_index += 1
        table_rows.append(values)
    if not table_rows:
        return []
    headers = [str(value).strip() or f"column_{index + 1}" for index, value in enumerate(table_rows[0])]
    return [dict(zip(headers, row + [""] * (len(headers) - len(row)))) for row in table_rows[1:]]


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings = []
    for item in root.findall("x:si", ns):
        strings.append("".join(text.text or "" for text in item.findall(".//x:t", ns)))
    return strings


def first_worksheet_name(archive: zipfile.ZipFile) -> str:
    names = sorted(name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
    if not names:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "Excel 文件中没有可读取的工作表")
    return names[0]


def xlsx_column_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha()).upper()
    total = 0
    for char in letters:
        total = total * 26 + (ord(char) - ord("A") + 1)
    return max(total - 1, 0)


def read_xlsx_cell(cell: ElementTree.Element, shared_strings: list[str], ns: dict[str, str]) -> Any:
    value = cell.find("x:v", ns)
    inline = cell.find(".//x:t", ns)
    if inline is not None:
        return inline.text or ""
    if value is None:
        return ""
    raw = value.text or ""
    if cell.attrib.get("t") == "s":
        index = int(raw) if raw.isdigit() else -1
        return shared_strings[index] if 0 <= index < len(shared_strings) else ""
    return raw


def ensure_row(row: Any) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "数据集每一行必须是对象")
    return row


def create_dataset(
    db: MongoDatabase,
    *,
    team_id: str,
    owner_id: str,
    name: str,
    description: str | None,
    filename: str,
    content: bytes,
    media_assets: list[dict],
    request: Request,
) -> dict:
    source_format, rows = parse_dataset_file(filename, content)
    if not rows:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "数据集至少需要一行数据")
    reject_inline_base64_payload(rows, location="dataset")
    reject_inline_base64_payload(media_assets, location="media_assets")
    rows, media_schema, context_schema, processing_summary = normalize_multimodal_dataset_rows(rows, media_assets)
    incoming_bytes = dataset_storage_bytes(rows, media_assets)
    assert_dataset_storage_capacity(db, team_id, incoming_bytes=incoming_bytes)
    dataset = Dataset(
        team_id=team_id,
        owner_id=owner_id,
        updated_by=owner_id,
        name=name,
        description=description,
        source_format=source_format,
        columns=infer_columns(rows),
        rows=rows,
        preview_rows=dataset_preview_rows(rows),
        media_assets=media_assets,
        media_schema=media_schema,
        context_schema=context_schema,
        processing_summary=processing_summary,
        row_count=len(rows),
        storage_bytes=incoming_bytes,
    )
    db.add(dataset)
    write_audit_log(db, entity_type="dataset", entity_id=dataset.id, action="dataset_imported", operator_id=owner_id, team_id=team_id, changes={"row_count": len(rows)}, request=request)
    db.commit()
    return dataset_payload(dataset, include_rows=True, db=db)


def normalize_multimodal_dataset_rows(rows: list[dict[str, Any]], media_assets: list[dict]) -> tuple[list[dict[str, Any]], list[dict], list[dict], dict]:
    normalized_rows: list[dict[str, Any]] = []
    media_schema_by_key: dict[str, dict] = {}
    context_schema_by_key: dict[str, dict] = {}
    media_asset_lookup = build_media_asset_lookup(media_assets)
    matched_media_asset_ids: set[int] = set()
    bound_media = 0
    for index, raw_row in enumerate(rows):
        row = dict(raw_row)
        media_refs: list[dict] = []
        if is_manifest_row(row):
            data = (
                dict(row.get("data"))
                if isinstance(row.get("data"), dict)
                else {key: value for key, value in row.items() if key not in {"media", "attachments", "derived_context"}}
            )
            data.setdefault("external_id", row.get("external_id") or row.get("id") or f"row-{index + 1}")
            media_refs = normalize_media_refs(
                row.get("media"),
                row_index=index,
                media_schema_by_key=media_schema_by_key,
                media_asset_lookup=media_asset_lookup,
                matched_media_asset_ids=matched_media_asset_ids,
            )
            attachments = normalize_attachments(row.get("attachments"))
            derived_context = normalize_derived_context(row.get("derived_context"), context_schema_by_key)
            row = {
                **data,
                "row_id": str(row.get("row_id") or row.get("external_id") or row.get("id") or f"row-{index + 1}"),
                "external_id": row.get("external_id") or row.get("id"),
            }
            if media_refs:
                row["media"] = media_refs
            if attachments:
                row["attachments"] = attachments
            if derived_context:
                row["derived_context"] = derived_context
        else:
            row.setdefault("row_id", str(row.get("row_id") or row.get("id") or row.get("external_id") or f"row-{index + 1}"))
            media_refs = infer_row_media_refs(
                row,
                row_index=index,
                media_schema_by_key=media_schema_by_key,
                media_asset_lookup=media_asset_lookup,
                matched_media_asset_ids=matched_media_asset_ids,
            )
            if media_refs:
                row["media"] = media_refs
            attachments = normalize_attachments(row.get("attachments"))
            if attachments:
                row["attachments"] = attachments
            derived_context = normalize_derived_context(row.get("derived_context"), context_schema_by_key)
            if derived_context:
                row["derived_context"] = derived_context
        bound_media += len(media_refs)
        normalized_rows.append(row)
    unbound_media_assets = [asset for asset in media_assets or [] if isinstance(asset, dict) and id(asset) not in matched_media_asset_ids]
    if isinstance(media_assets, list):
        media_assets[:] = unbound_media_assets
    unbound_media = len(unbound_media_assets)
    processing_summary = {
        "media_count": bound_media + unbound_media,
        "bound_media_count": bound_media,
        "unbound_media_count": unbound_media,
        "pending_count": 0,
        "failed_count": 0,
    }
    return normalized_rows, list(media_schema_by_key.values()), list(context_schema_by_key.values()), processing_summary


def is_manifest_row(row: dict[str, Any]) -> bool:
    return isinstance(row.get("media"), list) or isinstance(row.get("data"), dict) or isinstance(row.get("derived_context"), dict)


def build_media_asset_lookup(media_assets: list[dict] | None) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for asset in media_assets or []:
        if not isinstance(asset, dict):
            continue
        for value in (asset.get("id"), asset.get("file_id"), asset.get("filename"), asset.get("name"), asset.get("url"), asset.get("path")):
            if not isinstance(value, str) or not value.strip():
                continue
            register_media_asset_lookup_key(lookup, value, asset)
    return lookup


def register_media_asset_lookup_key(lookup: dict[str, dict], value: str, asset: dict) -> None:
    normalized = value.strip()
    if not normalized:
        return
    lookup.setdefault(normalized, asset)
    lookup.setdefault(normalized.lower(), asset)
    for basename in media_lookup_basenames(normalized):
        lookup.setdefault(basename, asset)
        lookup.setdefault(basename.lower(), asset)


def resolve_uploaded_media_asset(value: str, media_asset_lookup: dict[str, dict]) -> dict | None:
    key = value.strip()
    if not key:
        return None
    candidates = [key, key.lower()]
    for basename in media_lookup_basenames(key):
        candidates.extend([basename, basename.lower()])
    for candidate in candidates:
        matched = media_asset_lookup.get(candidate)
        if matched:
            return matched
    return None


def media_lookup_basenames(value: str) -> list[str]:
    normalized = value.strip()
    if not normalized:
        return []
    basenames = {
        normalized.rsplit("/", 1)[-1],
        normalized.rsplit("\\", 1)[-1],
        normalized.replace("\\", "/").rsplit("/", 1)[-1],
    }
    return [basename for basename in basenames if basename]


def normalize_media_refs(
    raw_media: Any,
    *,
    row_index: int,
    media_schema_by_key: dict[str, dict],
    media_asset_lookup: dict[str, dict] | None = None,
    matched_media_asset_ids: set[int] | None = None,
) -> list[dict]:
    if not isinstance(raw_media, list):
        return []
    refs: list[dict] = []
    for media_index, item in enumerate(raw_media):
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or item.get("src") or item.get("href") or item.get("path") or item.get("file_id") or "").strip()
        if not url:
            continue
        matched_asset = resolve_uploaded_media_asset(url, media_asset_lookup or {})
        if matched_asset and matched_media_asset_ids is not None:
            matched_media_asset_ids.add(id(matched_asset))
        resolved_url = str(matched_asset.get("url") or url) if matched_asset else url
        media_type = str(item.get("type") or (matched_asset.get("type") if matched_asset else None) or infer_media_type(resolved_url)).lower()
        role = str(item.get("role") or ("primary" if media_index == 0 else "context"))
        field = str(item.get("field") or f"{media_type}_{media_index + 1}")
        source = str(item.get("source") or (matched_asset.get("source") if matched_asset else None) or ("uploaded_file" if matched_asset or item.get("file_id") else "external_url"))
        ref = {
            "id": str(item.get("id") or (matched_asset.get("id") if matched_asset else None) or f"row{row_index + 1}_media{media_index + 1}"),
            "type": media_type,
            "role": role,
            "field": field,
            "source": source,
            "url": (matched_asset.get("url") if matched_asset else None) or item.get("url") or resolved_url,
            "file_id": item.get("file_id") or (matched_asset.get("file_id") if matched_asset else None),
            "name": item.get("name") or item.get("filename") or (matched_asset.get("name") or matched_asset.get("filename") if matched_asset else None) or resolved_url.rsplit("/", 1)[-1],
            "filename": item.get("filename") or (matched_asset.get("filename") if matched_asset else None),
            "mime_type": item.get("mime_type") or item.get("content_type") or (matched_asset.get("mime_type") or matched_asset.get("content_type") if matched_asset else None),
            "size": item.get("size") or (matched_asset.get("size") if matched_asset else None),
            "duration_ms": item.get("duration_ms") or (matched_asset.get("duration_ms") if matched_asset else None),
            "width": item.get("width") or (matched_asset.get("width") if matched_asset else None),
            "height": item.get("height") or (matched_asset.get("height") if matched_asset else None),
            "status": item.get("status") or (matched_asset.get("status") if matched_asset else None) or "ready",
        }
        refs.append({key: value for key, value in ref.items() if value not in (None, "")})
        media_schema_by_key.setdefault(f"{media_type}:{role}:{field}", {"type": media_type, "role": role, "field": field, "source": source})
    return refs


def infer_row_media_refs(
    row: dict[str, Any],
    *,
    row_index: int,
    media_schema_by_key: dict[str, dict],
    media_asset_lookup: dict[str, dict] | None = None,
    matched_media_asset_ids: set[int] | None = None,
) -> list[dict]:
    refs: list[dict] = []
    seen_row_media_keys: set[str] = set()
    for key, value in row.items():
        urls = media_urls_from_dataset_value(value)
        for url in urls:
            matched_asset = resolve_uploaded_media_asset(url, media_asset_lookup or {})
            if matched_asset and matched_media_asset_ids is not None:
                matched_media_asset_ids.add(id(matched_asset))
            resolved_url = str(matched_asset.get("url") or url) if matched_asset else url
            dedupe_key = str((matched_asset or {}).get("file_id") or (matched_asset or {}).get("id") or resolved_url).strip().lower()
            if dedupe_key and dedupe_key in seen_row_media_keys:
                continue
            if dedupe_key:
                seen_row_media_keys.add(dedupe_key)
            media_type = str(matched_asset.get("type") or infer_media_type(resolved_url)) if matched_asset else infer_media_type(resolved_url)
            if media_type not in {"image", "audio", "video"}:
                continue
            role = "primary" if not any(ref.get("role") == "primary" and ref.get("type") == media_type for ref in refs) else "context"
            source = matched_asset.get("source") or "uploaded_file" if matched_asset else "external_url"
            refs.append({
                "id": f"row{row_index + 1}_{key}_{len(refs) + 1}",
                "type": media_type,
                "role": role,
                "field": str(key),
                "source": source,
                "url": resolved_url,
                "name": (matched_asset.get("name") or matched_asset.get("filename") if matched_asset else None) or resolved_url.rsplit("/", 1)[-1] or str(key),
                "filename": matched_asset.get("filename") if matched_asset else None,
                "mime_type": matched_asset.get("mime_type") if matched_asset else None,
                "size": matched_asset.get("size") if matched_asset else None,
                "status": (matched_asset.get("status") if matched_asset else None) or "ready",
            })
            media_schema_by_key.setdefault(f"{media_type}:{role}:{key}", {"type": media_type, "role": role, "field": str(key), "source": source})
    return refs


def media_urls_from_dataset_value(value: Any) -> list[str]:
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, dict):
        urls = []
        for key in ("url", "src", "href", "data_url", "preview_url", "path"):
            current = value.get(key)
            if isinstance(current, str) and current.strip():
                urls.append(current.strip())
        return urls
    if isinstance(value, list):
        urls: list[str] = []
        for item in value:
            urls.extend(media_urls_from_dataset_value(item))
        return urls
    return []


def normalize_attachments(raw_attachments: Any) -> list[dict]:
    if not isinstance(raw_attachments, list):
        return []
    return [dict(item) for item in raw_attachments if isinstance(item, dict)]


def normalize_derived_context(raw_context: Any, context_schema_by_key: dict[str, dict]) -> dict:
    if not isinstance(raw_context, dict):
        return {}
    context = {}
    for key, value in raw_context.items():
        context[str(key)] = value
        context_schema_by_key.setdefault(str(key), {"key": str(key), "data_type": "text" if isinstance(value, str) else "json"})
    return context


def reject_inline_base64_payload(value: Any, *, location: str) -> None:
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("data:") and ";base64," in text:
            raise AppError(
                ErrorCode.VALIDATION_FORMAT,
                "数据集和多模态素材不能直接保存 base64 内容，请使用文件上传或外部 URL",
                {"location": location},
            )
        return
    if isinstance(value, dict):
        for item in value.values():
            reject_inline_base64_payload(item, location=location)
        return
    if isinstance(value, list):
        for item in value:
            reject_inline_base64_payload(item, location=location)


def infer_media_type(filename: str, content_type: str | None = None) -> str:
    lowered = filename.lower().split("?", 1)[0]
    if lowered.startswith("data:image"):
        return "image"
    if lowered.startswith("data:audio"):
        return "audio"
    if lowered.startswith("data:video"):
        return "video"
    if content_type and content_type.startswith("image/"):
        return "image"
    if content_type and content_type.startswith("audio/"):
        return "audio"
    if content_type and content_type.startswith("video/"):
        return "video"
    if lowered.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
        return "image"
    if lowered.endswith((".mp3", ".wav", ".m4a", ".ogg")):
        return "audio"
    if lowered.endswith((".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".3gp")):
        return "video"
    return "file"


def dataset_preview_rows(rows: list[dict[str, Any]], limit: int = PREVIEW_LIMIT) -> list[dict[str, Any]]:
    return [compact_dataset_preview_value(row) for row in rows[:limit]]


def compact_dataset_preview_value(value: Any) -> Any:
    if isinstance(value, dict):
        compact: dict[str, Any] = {}
        for key, item in value.items():
            if key == "url" and isinstance(item, str) and item.startswith("data:"):
                compact["inline_data_url"] = True
                continue
            compact[key] = compact_dataset_preview_value(item)
        return compact
    if isinstance(value, list):
        return [compact_dataset_preview_value(item) for item in value]
    if isinstance(value, str) and value.startswith("data:"):
        return summarize_inline_data_url(value)
    return value


def summarize_inline_data_url(value: str) -> str:
    header = value.split(",", 1)[0]
    return f"{header};base64,<inline>"


def infer_columns(rows: list[dict[str, Any]]) -> list[dict]:
    ordered_names: list[str] = []
    for row in rows:
        for key in row.keys():
            if key in {"row_id", "external_id"} or key in SYSTEM_DATASET_CONTEXT_FIELDS:
                continue
            if key not in ordered_names:
                ordered_names.append(key)
    return [
        {
            "name": name,
            "data_type": infer_type([row.get(name) for row in rows[:20]]),
            "samples": [row.get(name) for row in rows[:3]],
            "comment": "",
            "use_in_mapping": name not in {"attachments", "_bindings"},
        }
        for name in ordered_names
    ]


def infer_type(values: list[Any]) -> str:
    filtered = [value for value in values if value not in (None, "")]
    if not filtered:
        return "empty"
    if any(isinstance(value, list) and any(isinstance(item, dict) and item.get("type") in {"image", "audio", "video"} for item in value) for value in filtered):
        return "media_list"
    text_values = [str(value).lower() for value in filtered]
    if any(infer_media_type(value) == "image" or value.startswith("data:image") for value in text_values):
        return "image"
    if any(infer_media_type(value) == "audio" or value.startswith("data:audio") for value in text_values):
        return "audio"
    if any(infer_media_type(value) == "video" or value.startswith("data:video") for value in text_values):
        return "video"
    if any(isinstance(value, (dict, list)) for value in filtered):
        return "json"
    if all(str(value).replace(".", "", 1).isdigit() for value in filtered):
        return "number"
    return "text"


def list_datasets(db: MongoDatabase, team_id: str) -> dict:
    items = [dataset_payload(item, db=db) for item in db.find(Dataset, {"team_id": team_id}, sort=[("created_at", -1)])]
    return {"items": items, "pagination": pagination(len(items))}


def get_dataset(db: MongoDatabase, team_id: str, dataset_id: str, *, include_rows: bool = True) -> dict:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    return dataset_payload(dataset, include_rows=include_rows, db=db)


def dataset_download(db: MongoDatabase, team_id: str, dataset_id: str, format_: str | None = None) -> tuple[str, str, bytes]:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    output_format = (format_ or dataset.source_format or "json").lower()
    if output_format == "xlsx":
        output_format = "csv"
    if output_format == "json":
        body = json.dumps(dataset.rows, ensure_ascii=False, indent=2).encode("utf-8")
        return f"{safe_filename(dataset.name)}.json", "application/json; charset=utf-8", body
    if output_format == "jsonl":
        body = "\n".join(json.dumps(row, ensure_ascii=False) for row in dataset.rows).encode("utf-8")
        return f"{safe_filename(dataset.name)}.jsonl", "application/x-ndjson; charset=utf-8", body
    if output_format == "csv":
        columns = [column["name"] for column in dataset.columns]
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in dataset.rows:
            writer.writerow(escape_csv_formula_row(row))
        return f"{safe_filename(dataset.name)}.csv", "text/csv; charset=utf-8", buffer.getvalue().encode("utf-8-sig")
    raise AppError(ErrorCode.VALIDATION_FORMAT, "下载格式仅支持 json、jsonl、csv")


def safe_filename(name: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in name.strip())
    return cleaned or "dataset"


def update_dataset(db: MongoDatabase, *, team_id: str, dataset_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    if payload.get("name") is not None:
        dataset.name = payload["name"]
    if "description" in payload:
        dataset.description = payload["description"]
    if payload.get("columns") is not None:
        updates = {column["name"]: column for column in payload["columns"]}
        for column in dataset.columns:
            update = updates.get(column["name"])
            if not update:
                continue
            if update.get("comment") is not None:
                column["comment"] = update["comment"]
            if update.get("use_in_mapping") is not None:
                column["use_in_mapping"] = update["use_in_mapping"]
    derived_columns = payload.get("derived_columns")
    if derived_columns:
        ensure_dataset_not_referenced_by_non_draft_task(db, team_id=team_id, dataset_id=dataset_id, operation="derived_columns")
        previous_storage_bytes = max(0, int(dataset.storage_bytes or 0)) if getattr(dataset, "storage_bytes", 0) else dataset_storage_bytes(dataset.rows, dataset.media_assets)
        add_derived_columns(dataset, derived_columns)
        reject_inline_base64_payload(dataset.rows, location="derived_columns")
        next_storage_bytes = dataset_storage_bytes(dataset.rows, dataset.media_assets)
        storage_growth_bytes = next_storage_bytes - previous_storage_bytes
        if storage_growth_bytes > 0:
            assert_dataset_storage_capacity(db, team_id, incoming_bytes=storage_growth_bytes)
        dataset.storage_bytes = next_storage_bytes
    dataset.updated_by = operator_id
    dataset.updated_at = now_utc().replace(tzinfo=None)
    db.save(dataset)
    write_audit_log(db, entity_type="dataset", entity_id=dataset.id, action="dataset_updated", operator_id=operator_id, team_id=team_id, changes=payload, request=request)
    db.commit()
    return dataset_payload(dataset, include_rows=True, db=db)


def update_dataset_table(db: MongoDatabase, *, team_id: str, dataset_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    ensure_dataset_not_referenced_by_non_draft_task(db, team_id=team_id, dataset_id=dataset_id, operation="table_edit")
    rows = [ensure_row(row) for row in payload.get("rows", [])]
    if not rows:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "数据集至少需要保留一行数据")
    reject_inline_base64_payload(rows, location="dataset_table")
    requested_columns = payload.get("columns") or []
    column_names = [str(column.get("name") or "").strip() for column in requested_columns if isinstance(column, dict)]
    if not column_names:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "至少需要保留一列数据")
    if len(set(column_names)) != len(column_names):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "数据列名称不能重复")

    previous_storage_bytes = max(0, int(dataset.storage_bytes or 0)) if getattr(dataset, "storage_bytes", 0) else dataset_storage_bytes(dataset.rows, dataset.media_assets)
    normalized_rows, media_schema, context_schema, processing_summary = normalize_multimodal_dataset_rows(rows, dataset.media_assets)
    inferred_by_name = {column["name"]: column for column in infer_columns(normalized_rows)}
    existing_by_name = {column["name"]: column for column in dataset.columns}
    next_columns: list[dict] = []
    for raw_column, name in zip(requested_columns, column_names, strict=False):
        inferred = inferred_by_name.get(name, {"name": name, "data_type": "empty", "samples": [], "comment": "", "use_in_mapping": True})
        existing = existing_by_name.get(name, {})
        next_columns.append({
            **inferred,
            "data_type": raw_column.get("data_type") or inferred.get("data_type") or "text",
            "comment": raw_column.get("comment") if raw_column.get("comment") is not None else existing.get("comment", inferred.get("comment", "")),
            "use_in_mapping": raw_column.get("use_in_mapping") if raw_column.get("use_in_mapping") is not None else existing.get("use_in_mapping", inferred.get("use_in_mapping", True)),
        })
    for inferred in inferred_by_name.values():
        if inferred["name"] not in column_names:
            next_columns.append(inferred)

    next_storage_bytes = dataset_storage_bytes(normalized_rows, dataset.media_assets)
    storage_growth_bytes = next_storage_bytes - previous_storage_bytes
    if storage_growth_bytes > 0:
        assert_dataset_storage_capacity(db, team_id, incoming_bytes=storage_growth_bytes)
    dataset.rows = normalized_rows
    dataset.preview_rows = dataset_preview_rows(normalized_rows)
    dataset.columns = next_columns
    dataset.media_schema = media_schema
    dataset.context_schema = context_schema
    dataset.processing_summary = processing_summary
    dataset.row_count = len(normalized_rows)
    dataset.storage_bytes = next_storage_bytes
    dataset.updated_by = operator_id
    dataset.updated_at = now_utc().replace(tzinfo=None)
    db.save(dataset)
    write_audit_log(db, entity_type="dataset", entity_id=dataset.id, action="dataset_table_updated", operator_id=operator_id, team_id=team_id, changes={"row_count": dataset.row_count, "column_count": len(dataset.columns)}, request=request)
    db.commit()
    return dataset_payload(dataset, include_rows=True, db=db)


def bind_dataset_media_asset(db: MongoDatabase, *, team_id: str, dataset_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    ensure_dataset_not_referenced_by_non_draft_task(db, team_id=team_id, dataset_id=dataset_id, operation="media_asset_bind")
    rows = [dict(row) for row in dataset.rows]
    if not rows:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "数据集至少需要一行数据")
    asset_index = int(payload.get("asset_index") or 0)
    row_index = int(payload.get("row_index") or 0)
    if asset_index < 0 or asset_index >= len(dataset.media_assets or []):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "请选择有效的未绑定素材")
    if row_index < 0 or row_index >= len(rows):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "请选择有效的目标数据行")

    media_assets = [dict(asset) for asset in dataset.media_assets]
    asset = media_assets.pop(asset_index)
    media_type = str(payload.get("media_type") or asset.get("type") or infer_media_type(str(asset.get("url") or asset.get("filename") or asset.get("name") or asset.get("file_id") or ""))).lower()
    role = str(payload.get("role") or "context")
    field = str(payload.get("field") or asset.get("field") or asset.get("filename") or asset.get("name") or f"{media_type}_asset").strip()
    media_ref = {
        "id": str(asset.get("id") or asset.get("file_id") or f"asset{asset_index + 1}_row{row_index + 1}"),
        "type": media_type,
        "role": role,
        "field": field,
        "source": asset.get("source") or ("uploaded_file" if asset.get("filename") or asset.get("file_id") else "external_url"),
        "url": asset.get("url") or asset.get("src") or asset.get("href") or asset.get("path") or asset.get("file_id"),
        "file_id": asset.get("file_id"),
        "name": asset.get("name") or asset.get("filename") or str(asset.get("url") or asset.get("file_id") or field).rsplit("/", 1)[-1],
        "filename": asset.get("filename"),
        "mime_type": asset.get("mime_type") or asset.get("content_type"),
        "size": asset.get("size"),
        "duration_ms": asset.get("duration_ms"),
        "width": asset.get("width"),
        "height": asset.get("height"),
        "status": asset.get("status") or "ready",
    }
    media_ref = {key: value for key, value in media_ref.items() if value not in (None, "")}
    if not (media_ref.get("url") or media_ref.get("file_id")):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "素材缺少可绑定的 URL 或文件引用")

    row_media = list(rows[row_index].get("media") if isinstance(rows[row_index].get("media"), list) else [])
    marker = json.dumps(media_ref, sort_keys=True, ensure_ascii=False)
    existing = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in row_media if isinstance(item, dict)}
    if marker not in existing:
        row_media.append(media_ref)
    rows[row_index]["media"] = row_media

    rows, media_schema, context_schema, processing_summary = normalize_multimodal_dataset_rows(rows, media_assets)
    dataset.rows = rows
    dataset.preview_rows = dataset_preview_rows(rows)
    dataset.media_assets = media_assets
    dataset.columns = merge_dataset_columns(dataset.columns, infer_columns(rows))
    dataset.media_schema = media_schema
    dataset.context_schema = context_schema
    dataset.processing_summary = processing_summary
    dataset.row_count = len(rows)
    dataset.storage_bytes = dataset_storage_bytes(rows, dataset.media_assets)
    dataset.updated_by = operator_id
    dataset.updated_at = now_utc().replace(tzinfo=None)
    db.save(dataset)
    write_audit_log(
        db,
        entity_type="dataset",
        entity_id=dataset.id,
        action="dataset_media_asset_bound",
        operator_id=operator_id,
        team_id=team_id,
        changes={"asset_index": asset_index, "row_index": row_index, "role": role, "field": field, "media_type": media_type},
        request=request,
    )
    db.commit()
    return dataset_payload(dataset, include_rows=True, db=db)


def merge_dataset_upload(
    db: MongoDatabase,
    *,
    team_id: str,
    dataset_id: str,
    operator_id: str,
    filename: str,
    content: bytes,
    primary_key: str,
    media_assets: list[dict],
    request: Request,
) -> dict:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    ensure_dataset_not_referenced_by_non_draft_task(db, team_id=team_id, dataset_id=dataset_id, operation="patch_upload")
    key = primary_key.strip()
    if not key:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "请选择用于对齐合并的主值字段")
    if key not in {column.get("name") for column in dataset.columns}:
        raise AppError(ErrorCode.VALIDATION_FORMAT, f"当前数据集不存在主值字段 {key}")

    _, incoming_rows = parse_dataset_file(filename, content)
    if not incoming_rows:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "补上传数据至少需要一行")
    reject_inline_base64_payload(incoming_rows, location="patch_upload")
    reject_inline_base64_payload(media_assets, location="media_assets")
    incoming_rows, _, _, _ = normalize_multimodal_dataset_rows(incoming_rows, media_assets)
    if any(key not in row or row.get(key) in (None, "") for row in incoming_rows):
        raise AppError(ErrorCode.VALIDATION_FORMAT, f"补上传数据每一行都必须包含主值字段 {key}")

    previous_storage_bytes = max(0, int(dataset.storage_bytes or 0)) if getattr(dataset, "storage_bytes", 0) else dataset_storage_bytes(dataset.rows, dataset.media_assets)
    rows = [dict(row) for row in dataset.rows]
    index_by_key = {str(row.get(key)): index for index, row in enumerate(rows) if row.get(key) not in (None, "")}
    matched = 0
    appended = 0
    for incoming in incoming_rows:
        lookup = str(incoming.get(key))
        if lookup in index_by_key:
            rows[index_by_key[lookup]] = deep_merge_dataset_row(rows[index_by_key[lookup]], incoming)
            matched += 1
        else:
            rows.append(incoming)
            index_by_key[lookup] = len(rows) - 1
            appended += 1

    dataset.media_assets = [*(dataset.media_assets or []), *media_assets]
    rows, media_schema, context_schema, processing_summary = normalize_multimodal_dataset_rows(rows, dataset.media_assets)
    next_storage_bytes = dataset_storage_bytes(rows, dataset.media_assets)
    storage_growth_bytes = next_storage_bytes - previous_storage_bytes
    if storage_growth_bytes > 0:
        assert_dataset_storage_capacity(db, team_id, incoming_bytes=storage_growth_bytes)
    dataset.rows = rows
    dataset.preview_rows = dataset_preview_rows(rows)
    dataset.columns = merge_dataset_columns(dataset.columns, infer_columns(rows))
    dataset.media_schema = media_schema
    dataset.context_schema = context_schema
    dataset.processing_summary = processing_summary
    dataset.row_count = len(rows)
    dataset.storage_bytes = next_storage_bytes
    dataset.updated_by = operator_id
    dataset.updated_at = now_utc().replace(tzinfo=None)
    db.save(dataset)
    summary = {"primary_key": key, "incoming_rows": len(incoming_rows), "matched_rows": matched, "appended_rows": appended}
    write_audit_log(db, entity_type="dataset", entity_id=dataset.id, action="dataset_patch_uploaded", operator_id=operator_id, team_id=team_id, changes=summary, request=request)
    db.commit()
    payload = dataset_payload(dataset, include_rows=True, db=db)
    payload["merge_summary"] = summary
    return payload


def deep_merge_dataset_row(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in incoming.items():
        if key == "media" and isinstance(value, list):
            existing = merged.get("media") if isinstance(merged.get("media"), list) else []
            seen = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in existing if isinstance(item, dict)}
            next_media = list(existing)
            for item in value:
                if not isinstance(item, dict):
                    continue
                marker = json.dumps(item, sort_keys=True, ensure_ascii=False)
                if marker not in seen:
                    next_media.append(item)
                    seen.add(marker)
            merged["media"] = next_media
        elif key == "attachments" and isinstance(value, list):
            merged["attachments"] = [*(merged.get("attachments") if isinstance(merged.get("attachments"), list) else []), *value]
        elif key == "derived_context" and isinstance(value, dict):
            merged["derived_context"] = {**(merged.get("derived_context") if isinstance(merged.get("derived_context"), dict) else {}), **value}
        else:
            merged[key] = value
    return merged


def merge_dataset_columns(existing_columns: list[dict], inferred_columns: list[dict]) -> list[dict]:
    existing_by_name = {column["name"]: column for column in existing_columns if column.get("name")}
    merged: list[dict] = []
    for inferred in inferred_columns:
        existing = existing_by_name.get(inferred["name"], {})
        merged.append({
            **inferred,
            "comment": existing.get("comment", inferred.get("comment", "")),
            "use_in_mapping": existing.get("use_in_mapping", inferred.get("use_in_mapping", True)),
            **({"derived": existing.get("derived")} if existing.get("derived") else {}),
            **({"source_column": existing.get("source_column")} if existing.get("source_column") else {}),
            **({"expression": existing.get("expression")} if existing.get("expression") else {}),
        })
    return merged


def add_derived_columns(dataset: Dataset, derived_columns: list[dict]) -> None:
    existing_names = {column["name"] for column in dataset.columns}
    for derived in derived_columns:
        name = derived["name"]
        if name in existing_names:
            raise AppError(ErrorCode.STATE_CONFLICT, f"数据列 {name} 已存在")
        source_column = derived.get("source_column")
        if source_column and source_column not in existing_names:
            raise AppError(ErrorCode.VALIDATION_FORMAT, f"来源列 {source_column} 不存在")
        for row in dataset.rows:
            row[name] = derive_row_value(row, source_column, derived.get("default_value"), derived.get("expression"))
        for row in dataset.preview_rows:
            row[name] = derive_row_value(row, source_column, derived.get("default_value"), derived.get("expression"))
        samples = [row.get(name) for row in dataset.rows[:3]]
        derived_column = {
            "name": name,
            "data_type": derived.get("data_type") or infer_type(samples),
            "samples": samples,
            "comment": derived.get("comment") or "",
            "use_in_mapping": derived.get("use_in_mapping", True),
            "derived": True,
            "source_column": source_column,
            "expression": derived.get("expression") or "",
        }
        insert_at = next((index for index, column in enumerate(dataset.columns) if column.get("name") in {"media", "attachments", "derived_context"}), len(dataset.columns))
        dataset.columns.insert(insert_at, derived_column)
        existing_names.add(name)


def derive_row_value(row: dict, source_column: str | None, default_value: str | None, expression: str | None) -> Any:
    source_value = row.get(source_column) if source_column else None
    if expression:
        return render_column_expression(expression, row, source_value)
    if default_value not in (None, ""):
        return default_value
    return source_value if source_column else ""


def render_column_expression(expression: str, row: dict, source_value: Any) -> str:
    rendered = str(expression).replace("{value}", "" if source_value is None else str(source_value))
    for key, value in row.items():
        rendered = rendered.replace("{" + str(key) + "}", "" if value is None else str(value))
    return rendered


def delete_dataset(db: MongoDatabase, *, team_id: str, dataset_id: str, operator_id: str, request: Request) -> None:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    ensure_dataset_not_referenced_by_non_draft_task(db, team_id=team_id, dataset_id=dataset_id, operation="delete")
    db.delete_one(Dataset, {"_id": dataset_id})
    write_audit_log(db, entity_type="dataset", entity_id=dataset_id, action="dataset_deleted", operator_id=operator_id, team_id=team_id, changes={"team_id": team_id}, request=request)
    db.commit()


def ensure_dataset_not_referenced_by_non_draft_task(db: MongoDatabase, *, team_id: str, dataset_id: str, operation: str) -> None:
    referenced_task = db.find_one(
        Task,
        {
            "team_id": team_id,
            "dataset_id": dataset_id,
            "status": {"$in": sorted(NON_DRAFT_DATASET_REFERENCE_STATUSES)},
        },
    )
    if referenced_task:
        raise AppError(
            ErrorCode.STATE_CONFLICT,
            "Dataset is referenced by a non-draft task and cannot be modified",
            {"task_id": referenced_task.id, "task_status": referenced_task.status, "operation": operation},
        )


def dataset_payload(dataset: Dataset, *, include_rows: bool = False, db: MongoDatabase | None = None) -> dict:
    preview_rows = dataset_preview_rows(dataset.rows) if include_rows else dataset.preview_rows
    updated_by = getattr(dataset, "updated_by", None) or dataset.owner_id
    payload = {
        "dataset_id": dataset.id,
        "team_id": dataset.team_id,
        "owner_id": dataset.owner_id,
        "owner_name": user_display_name(db, dataset.owner_id) if db else None,
        "updated_by": updated_by,
        "updated_by_name": user_display_name(db, updated_by) if db else None,
        "name": dataset.name,
        "description": dataset.description,
        "source_format": dataset.source_format,
        "columns": dataset.columns,
        "preview_rows": preview_rows,
        "media_assets": dataset.media_assets,
        "media_schema": getattr(dataset, "media_schema", []) or [],
        "context_schema": getattr(dataset, "context_schema", []) or [],
        "processing_summary": getattr(dataset, "processing_summary", {}) or {},
        "row_count": dataset.row_count,
        "storage_bytes": getattr(dataset, "storage_bytes", 0),
        "status": dataset.status,
        "created_at": dataset.created_at.isoformat() if dataset.created_at else None,
        "updated_at": dataset.updated_at.isoformat() if dataset.updated_at else None,
    }
    if include_rows:
        payload["rows"] = dataset.rows
    return payload


def dataset_storage_bytes(rows: list[dict[str, Any]], media_assets: list[dict] | None = None) -> int:
    return len(json.dumps(rows or [], ensure_ascii=False).encode("utf-8"))


def list_templates(db: MongoDatabase, team_id: str) -> dict:
    items = [template_payload(item, include_schema=True, db=db) for item in db.find(AnnotationTemplate, {"team_id": team_id, "status": {"$ne": "archived"}}, sort=[("updated_at", -1)])]
    return {"items": items, "pagination": pagination(len(items))}


def create_template(db: MongoDatabase, *, team_id: str, owner_id: str, name: str, description: str | None, schema: dict, auto_saved: bool = False, request: Request) -> dict:
    schema = normalize_template_schema(schema)
    template = AnnotationTemplate(
        team_id=team_id,
        owner_id=owner_id,
        name=name,
        description=description,
        schema=schema,
        auto_saved=bool(auto_saved),
    )
    db.add(template)
    db.add(TemplateVersion(template_id=template.id, team_id=team_id, version=1, schema=schema, is_published=False))
    write_audit_log(
        db,
        entity_type="template",
        entity_id=template.id,
        action="template_auto_saved" if template.auto_saved else "template_created",
        operator_id=owner_id,
        team_id=team_id,
        changes={"name": name, "auto_saved": template.auto_saved},
        request=request,
    )
    db.commit()
    return template_payload(template, include_schema=True, db=db)


def update_template(db: MongoDatabase, *, team_id: str, template_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    if template.status == "archived":
        raise AppError(ErrorCode.STATE_CONFLICT, "归档模板不能修改")
    if template.status == "published":
        template.latest_version += 1
        template.status = "draft"
        template.auto_saved = False
    if payload.get("name") is not None:
        template.name = payload["name"]
    if "description" in payload:
        template.description = payload["description"]
    if payload.get("auto_saved") is not None:
        template.auto_saved = bool(payload["auto_saved"])
    if payload.get("schema") is not None:
        template.schema = normalize_template_schema(payload["schema"])
    template.updated_at = now_utc().replace(tzinfo=None)
    db.save(template)
    version = db.find_one(TemplateVersion, {"template_id": template.id, "version": template.latest_version})
    if version:
        version.schema = template.schema
        version.is_published = False
        db.save(version)
    else:
        db.add(TemplateVersion(template_id=template.id, team_id=team_id, version=template.latest_version, schema=template.schema, is_published=False))
    write_audit_log(
        db,
        entity_type="template",
        entity_id=template.id,
        action="template_auto_saved" if template.auto_saved else "template_updated",
        operator_id=operator_id,
        team_id=team_id,
        changes={"version": template.latest_version, "auto_saved": template.auto_saved},
        request=request,
    )
    db.commit()
    return template_payload(template, include_schema=True, db=db)


def get_template(db: MongoDatabase, team_id: str, template_id: str) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    return template_payload(template, include_schema=True, db=db)


def publish_template(db: MongoDatabase, *, team_id: str, template_id: str, operator_id: str, request: Request) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    if template.status == "archived":
        raise AppError(ErrorCode.STATE_CONFLICT, "归档模板不能发布")
    readiness = get_template_readiness(db, team_id, template_id)
    if not readiness["ready"]:
        raise AppError(ErrorCode.BUSINESS_RULE, "模板发布检查未通过", detail=readiness)
    template.status = "published"
    template.auto_saved = False
    template.updated_at = now_utc().replace(tzinfo=None)
    db.save(template)
    version = db.find_one(TemplateVersion, {"template_id": template_id, "version": template.latest_version})
    if version:
        version.is_published = True
        db.save(version)
    write_audit_log(db, entity_type="template", entity_id=template.id, action="template_published", operator_id=operator_id, team_id=team_id, changes={"version": template.latest_version}, request=request)
    db.commit()
    return template_payload(template, include_schema=True, db=db)


def get_template_readiness(db: MongoDatabase, team_id: str, template_id: str) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    schema = effective_template_schema(template, db)
    tabs = schema.get("tabs") if isinstance(schema.get("tabs"), list) else []
    components = template_components(schema)
    checks: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    schema_version = str(schema.get("schema_version") or "")
    checks.append(readiness_item("schema_version", "Schema 版本", schema_version in SUPPORTED_TEMPLATE_SCHEMA_VERSIONS, f"当前版本 {schema_version}", f"不支持的 Schema 版本：{schema_version or '空'}"))
    checks.append(readiness_item("tabs", "页签结构", bool(tabs), "已配置页签", "模板至少需要一个页签"))
    answer_fields = [item for item in components if item.get("type") not in NON_ANSWER_TEMPLATE_COMPONENT_TYPES]
    if answer_fields:
        checks.append(readiness_item("answer_fields", "可提交字段", True, f"已配置 {len(answer_fields)} 个可提交字段", "模板需要可提交字段"))
    else:
        checks.append(readiness_item("answer_fields", "可提交字段", True, "当前模板仅包含展示项", "模板需要可提交字段"))
        warnings.append({"key": "answer_fields", "label": "可提交字段", "message": "当前模板没有答案字段，只能作为展示型模板使用"})

    duplicate_fields = sorted({field for field in [str(item.get("field") or "") for item in components] if field and sum(1 for current in components if current.get("field") == field) > 1})
    checks.append(readiness_item("field_unique", "字段 key 唯一", not duplicate_fields, "字段 key 无重复", f"字段 key 重复：{', '.join(duplicate_fields)}"))

    invalid_types = sorted({str(item.get("type") or "") for item in components if item.get("type") not in REGISTERED_TEMPLATE_COMPONENT_TYPES})
    checks.append(readiness_item("component_types", "组件类型", not invalid_types, "组件类型均已注册", f"存在未注册组件类型：{', '.join(invalid_types)}"))

    validation_errors = template_validation_errors(schema, components)
    checks.append(readiness_item("validation_rules", "校验规则", not validation_errors, "校验规则合法", "；".join(validation_errors)))

    linkage_errors = template_linkage_errors(schema, components)
    checks.append(readiness_item("linkage_rules", "联动规则", not linkage_errors, "联动规则合法", "；".join(linkage_errors)))

    llm_errors = template_llm_errors(db, team_id, schema, components)
    checks.append(readiness_item("llm_config", "LLM 配置", not llm_errors, "LLM 配置合法", "；".join(llm_errors)))

    blockers = [item for item in checks if item["status"] == "block"]
    return {
        "template_id": template.id,
        "ready": not blockers,
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
        "summary": {
            "tab_count": len(tabs),
            "component_count": len(components),
            "show_item_count": len([item for item in components if item.get("type") == "ShowItem"]),
            "answer_field_count": len(answer_fields),
            "llm_count": len([item for item in components if item.get("type") == "LLMComponent"]),
        },
    }


def copy_template(db: MongoDatabase, *, team_id: str, template_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    source = db.get(AnnotationTemplate, template_id)
    if not source or source.team_id != team_id or source.status == "archived":
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    source_schema = effective_template_schema(source, db)
    copied = AnnotationTemplate(
        team_id=team_id,
        owner_id=operator_id,
        name=payload.get("name") or f"{source.name} 副本",
        description=payload.get("description") if "description" in payload else source.description,
        schema=source_schema,
        latest_version=1,
        status="draft",
    )
    db.add(copied)
    db.add(TemplateVersion(template_id=copied.id, team_id=team_id, version=1, schema=source_schema, is_published=False))
    write_audit_log(
        db,
        entity_type="template",
        entity_id=copied.id,
        action="template_copied",
        operator_id=operator_id,
        team_id=team_id,
        changes={"source_template_id": source.id, "name": copied.name},
        request=request,
    )
    db.commit()
    return template_payload(copied, include_schema=True, db=db)


def archive_template(db: MongoDatabase, *, team_id: str, template_id: str, operator_id: str, request: Request) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    if template.status == "archived":
        return template_payload(template, include_schema=True, db=db)
    template.status = "archived"
    template.archived_at = now_utc().replace(tzinfo=None)
    template.updated_at = now_utc().replace(tzinfo=None)
    db.save(template)
    write_audit_log(db, entity_type="template", entity_id=template.id, action="template_archived", operator_id=operator_id, team_id=team_id, changes={"version": template.latest_version}, request=request)
    db.commit()
    return template_payload(template, include_schema=True, db=db)


def delete_template(db: MongoDatabase, *, team_id: str, template_id: str, operator_id: str, request: Request) -> None:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    referenced_task = db.find_one(Task, {"team_id": team_id, "template_id": template_id})
    if referenced_task:
        raise AppError(ErrorCode.STATE_CONFLICT, "模板已被任务引用，不能删除")
    db.delete_many(TemplateVersion, {"template_id": template_id})
    db.delete_one(AnnotationTemplate, {"_id": template_id})
    write_audit_log(db, entity_type="template", entity_id=template_id, action="template_deleted", operator_id=operator_id, team_id=team_id, changes={"name": template.name}, request=request)
    db.commit()


def list_template_versions(db: MongoDatabase, team_id: str, template_id: str) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    versions = db.find(TemplateVersion, {"template_id": template_id}, sort=[("version", -1)])
    return {
        "versions": [
            {
                "version_id": version.id,
                "version": version.version,
                "is_published": version.is_published,
                "schema": normalize_template_schema(version.schema),
                "component_stats": template_schema_stats(normalize_template_schema(version.schema)),
                "reference_stats": template_reference_stats(db, team_id, template_id, version.version),
                "created_at": version.created_at.isoformat() if version.created_at else None,
            }
            for version in versions
        ]
    }


def get_template_version_diff(db: MongoDatabase, team_id: str, template_id: str, from_version: int, to_version: int) -> dict:
    template = db.get(AnnotationTemplate, template_id)
    if not template or template.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
    source = db.find_one(TemplateVersion, {"template_id": template_id, "version": from_version})
    target = db.find_one(TemplateVersion, {"template_id": template_id, "version": to_version})
    if not source or not target:
        raise AppError(ErrorCode.NOT_FOUND, "模板版本不存在")
    return {
        "template_id": template_id,
        "from_version": from_version,
        "to_version": to_version,
        "summary": compare_template_versions(normalize_template_schema(source.schema), normalize_template_schema(target.schema)),
    }


def validate_template_answers(schema: dict, answers: dict[str, Any], content: dict[str, Any] | None = None) -> dict:
    schema = normalize_template_schema(schema)
    all_components = template_components(schema)
    validation_rules = template_validation_rules(schema)
    hidden_component_ids = hidden_template_component_ids(schema, answers, content or {}, all_components)
    components = [
        component
        for component in all_components
        if component.get("type") not in NON_ANSWER_TEMPLATE_COMPONENT_TYPES and str(component.get("id") or "") not in hidden_component_ids and str(component.get("field") or "") not in hidden_component_ids
    ]
    field_errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    for component in components:
        field = str(component.get("field") or "")
        value = answers.get(field)
        field_errors.extend(validate_template_component_answer(component, value, validation_rules.get(field, [])))
    show_items = [component for component in all_components if component.get("type") == "ShowItem" and str(component.get("id") or "") not in hidden_component_ids and str(component.get("field") or "") not in hidden_component_ids]
    preview_content = content or {}
    for component in show_items:
        content_field = str((component.get("config") or {}).get("content_field") or component.get("id") or component.get("field") or "")
        if content_field and content_field not in preview_content and component.get("field") not in preview_content and component.get("id") not in preview_content:
            warnings.append({"component_id": component.get("id"), "field": component.get("field"), "message": "ShowItem 未绑定到预览数据"})
    return {
        "valid": not field_errors,
        "field_errors": field_errors,
        "warnings": warnings,
        "summary": {
            "answer_field_count": len(components),
            "error_count": len(field_errors),
            "warning_count": len(warnings),
            "hidden_component_count": len(hidden_component_ids),
            "schema_version": schema.get("schema_version"),
            "rule_count": sum(len(rules) for rules in validation_rules.values()),
        },
    }


def normalize_template_schema(schema: Any) -> dict:
    if not isinstance(schema, dict):
        return {
            "schema_version": CURRENT_TEMPLATE_SCHEMA_VERSION,
            "tabs": [],
            "components": [],
            "validation_rules": {},
            "linkage_rules": [],
            "llm_config": {},
            "compatibility": {"normalized_from": "invalid"},
        }
    original_version = str(schema.get("schema_version") or "1.0")
    version_supported = original_version in SUPPORTED_TEMPLATE_SCHEMA_VERSIONS
    normalized = {
        **schema,
        "schema_version": CURRENT_TEMPLATE_SCHEMA_VERSION if version_supported else original_version,
        "tabs": schema.get("tabs") if isinstance(schema.get("tabs"), list) else [],
        "components": schema.get("components") if isinstance(schema.get("components"), list) else [],
        "validation_rules": normalize_template_validation_rules(schema.get("validation_rules")),
        "linkage_rules": normalize_template_linkage_rules(schema.get("linkage_rules")),
        "llm_config": schema.get("llm_config") if isinstance(schema.get("llm_config"), dict) else {},
    }
    if not version_supported:
        compatibility = normalized.get("compatibility") if isinstance(normalized.get("compatibility"), dict) else {}
        normalized["compatibility"] = {
            **compatibility,
            "normalized_from": original_version,
            "normalized_to": None,
            "strategy": "unsupported_schema_version",
        }
    elif original_version != CURRENT_TEMPLATE_SCHEMA_VERSION:
        compatibility = normalized.get("compatibility") if isinstance(normalized.get("compatibility"), dict) else {}
        normalized["compatibility"] = {
            **compatibility,
            "normalized_from": original_version,
            "normalized_to": CURRENT_TEMPLATE_SCHEMA_VERSION,
            "strategy": "backward_compatible_runtime",
        }
    return normalized


def normalize_template_validation_rules(raw_rules: Any) -> dict[str, list[dict[str, Any]]]:
    normalized: dict[str, list[dict[str, Any]]] = {}
    if isinstance(raw_rules, dict):
        for field, rules in raw_rules.items():
            if isinstance(rules, list):
                normalized[str(field)] = [rule for rule in rules if isinstance(rule, dict)]
            elif isinstance(rules, dict):
                normalized[str(field)] = [rules]
    elif isinstance(raw_rules, list):
        for rule in raw_rules:
            if not isinstance(rule, dict):
                continue
            field = str(rule.get("field") or rule.get("target_field") or "")
            if field:
                normalized.setdefault(field, []).append(rule)
    return normalized


def normalize_template_linkage_rules(raw_rules: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_rules, list):
        return []
    return [rule for rule in raw_rules if isinstance(rule, dict)]


def template_validation_rules(schema: dict) -> dict[str, list[dict[str, Any]]]:
    return normalize_template_validation_rules(schema.get("validation_rules"))


def hidden_template_component_ids(schema: dict, answers: dict[str, Any], content: dict[str, Any], components: list[dict] | None = None) -> set[str]:
    schema = normalize_template_schema(schema)
    component_list = components if components is not None else template_components(schema)
    component_by_id = {str(component.get("id")): component for component in component_list if component.get("id")}
    component_by_field = {str(component.get("field")): component for component in component_list if component.get("field")}
    rules_by_target: dict[str, list[dict[str, Any]]] = {}
    for raw_rule in schema.get("linkage_rules", []):
        if not isinstance(raw_rule, dict):
            continue
        target_key = linkage_rule_target_key(raw_rule)
        target_component = component_by_id.get(target_key) or component_by_field.get(target_key)
        if not target_component:
            continue
        target_id = str(target_component.get("id") or target_component.get("field") or target_key)
        rules_by_target.setdefault(target_id, []).append(raw_rule)

    hidden: set[str] = set()
    for target_id, rules in rules_by_target.items():
        has_show_rule = any(str(rule.get("action") or rule.get("effect") or "show") == "show" for rule in rules)
        visible = not has_show_rule
        for rule in rules:
            matched = linkage_rule_matches(rule, answers, content, component_by_id, component_by_field)
            action = str(rule.get("action") or rule.get("effect") or "show")
            if action == "show" and matched:
                visible = True
            if action == "hide" and matched:
                visible = False
        if not visible:
            hidden.add(target_id)
            target_component = component_by_id.get(target_id)
            if target_component and target_component.get("field"):
                hidden.add(str(target_component.get("field")))
    return hidden


def linkage_rule_target_key(rule: dict[str, Any]) -> str:
    return str(rule.get("target_component_id") or rule.get("target_component") or rule.get("target_id") or rule.get("target_field") or rule.get("target") or rule.get("then_field") or "")


def linkage_rule_matches(rule: dict[str, Any], answers: dict[str, Any], content: dict[str, Any], component_by_id: dict[str, dict], component_by_field: dict[str, dict]) -> bool:
    conditions = rule.get("conditions")
    if isinstance(conditions, list) and conditions:
        mode = str(rule.get("condition_mode") or rule.get("logic") or "all")
        results = [linkage_rule_matches(condition, answers, content, component_by_id, component_by_field) for condition in conditions if isinstance(condition, dict)]
        return any(results) if mode in {"any", "or"} else all(results)
    source_key = str(rule.get("source_field") or rule.get("source_component_id") or rule.get("field") or rule.get("when_field") or "")
    source_component = component_by_id.get(source_key) or component_by_field.get(source_key)
    source_field = str((source_component or {}).get("field") or source_key)
    source_value = answers.get(source_field)
    if source_value is None:
        source_value = content.get(source_field, content.get(source_key))
    operator = str(rule.get("operator") or rule.get("condition") or "equals")
    expected = rule.get("value")
    if operator in {"equals", "eq", "is"}:
        return normalize_linkage_value(expected) in linkage_value_candidates(source_value, source_component)
    if operator in {"not_equals", "neq", "not"}:
        return normalize_linkage_value(expected) not in linkage_value_candidates(source_value, source_component)
    if operator == "contains":
        if isinstance(source_value, list):
            return normalize_linkage_value(expected) in linkage_value_candidates(source_value, source_component)
        return str(expected or "") in str(source_value or "")
    if operator == "not_contains":
        if isinstance(source_value, list):
            return normalize_linkage_value(expected) not in linkage_value_candidates(source_value, source_component)
        return str(expected or "") not in str(source_value or "")
    if operator in {"not_empty", "filled"}:
        return not is_empty_answer(source_value)
    if operator in {"empty", "is_empty"}:
        return is_empty_answer(source_value)
    return False


def normalize_linkage_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def linkage_value_candidates(value: Any, source_component: dict | None = None) -> set[str]:
    values = value if isinstance(value, list) else [value]
    candidates = {normalize_linkage_value(item) for item in values}
    options = source_component.get("options") if isinstance(source_component, dict) else None
    if not isinstance(options, list):
        return candidates
    for item in values:
        normalized = normalize_linkage_value(item)
        for option in options:
            if not isinstance(option, dict):
                continue
            option_value = normalize_linkage_value(option.get("value"))
            option_label = normalize_linkage_value(option.get("label"))
            if normalized in {option_value, option_label}:
                candidates.add(option_value)
                candidates.add(option_label)
                break
    return candidates


def validate_template_component_answer(component: dict, value: Any, field_rules: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    field = str(component.get("field") or "")
    label = component.get("label") or field or component.get("id") or "未命名字段"
    config = component.get("config") if isinstance(component.get("config"), dict) else {}
    rules = field_rules or []
    errors: list[dict[str, Any]] = []
    required_by_rule = any(str(rule.get("type") or rule.get("rule") or "") == "required" and rule.get("enabled", True) is not False for rule in rules)
    if (component.get("required") or required_by_rule) and is_empty_answer(value):
        errors.append(runtime_field_error(component, "required", f"{label} 为必填项"))
        return errors
    if is_empty_answer(value):
        return errors
    text_value = "" if value is None else str(value)
    if component.get("type") in {"TextInput", "TextArea", "RichEditor"}:
        min_length = integer_config(config, "min_length")
        max_length = integer_config(config, "max_length")
        if min_length is not None and len(text_value) < min_length:
            errors.append(runtime_field_error(component, "min_length", f"{label} 至少需要 {min_length} 个字符"))
        if max_length is not None and len(text_value) > max_length:
            errors.append(runtime_field_error(component, "max_length", f"{label} 不能超过 {max_length} 个字符"))
        pattern = config.get("pattern") or config.get("regex")
        if pattern and not re.fullmatch(str(pattern), text_value):
            errors.append(runtime_field_error(component, "pattern", f"{label} 格式不符合正则规则"))
        custom_error = validate_custom_text_rule(component, text_value, config)
        if custom_error:
            errors.append(custom_error)
    if component.get("type") in {"MultiSelect", "TagSelect"}:
        selected_count = len(value) if isinstance(value, list) else 0
        min_selected = integer_config(config, "min_selected", "min_choices")
        max_selected = integer_config(config, "max_selected", "max_choices")
        if min_selected is not None and selected_count < min_selected:
            errors.append(runtime_field_error(component, "min_selected", f"{label} 至少选择 {min_selected} 项"))
        if max_selected is not None and selected_count > max_selected:
            errors.append(runtime_field_error(component, "max_selected", f"{label} 最多选择 {max_selected} 项"))
    if component.get("type") == "SingleSelect":
        valid_values = {str(option.get("value")) for option in component.get("options", []) if isinstance(option, dict)}
        if valid_values and str(value) not in valid_values:
            errors.append(runtime_field_error(component, "option", f"{label} 不是有效选项"))
    if component.get("type") == "JsonEditor":
        try:
            if isinstance(value, str):
                json.loads(value)
        except json.JSONDecodeError as exc:
            errors.append(runtime_field_error(component, "json", f"{label} 不是合法 JSON：{exc.msg}"))
    if component.get("type") == "ImageMaskAnnotation":
        if not isinstance(value, dict):
            errors.append(runtime_field_error(component, "mask", f"{label} 需要提交图片 mask 标注结果"))
        elif component.get("required") and (not isinstance(value.get("annotations"), list) or len(value.get("annotations") or []) == 0):
            errors.append(runtime_field_error(component, "mask", f"{label} 至少需要一个标注结果"))
    errors.extend(validate_runtime_rules(component, value, rules))
    return errors


def validate_runtime_rules(component: dict, value: Any, rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    label = component.get("label") or component.get("field") or "未命名字段"
    text_value = "" if value is None else str(value)
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("enabled", True) is False:
            continue
        rule_type = str(rule.get("type") or rule.get("rule") or "")
        if not rule_type or rule_type == "required":
            continue
        message = str(rule.get("message") or "")
        if rule_type in {"min_length", "max_length"}:
            limit = integer_config(rule, "value", "limit", "length")
            if limit is None:
                continue
            if rule_type == "min_length" and len(text_value) < limit:
                errors.append(runtime_field_error(component, rule_type, message or f"{label} 至少需要 {limit} 个字符"))
            if rule_type == "max_length" and len(text_value) > limit:
                errors.append(runtime_field_error(component, rule_type, message or f"{label} 不能超过 {limit} 个字符"))
        elif rule_type in {"pattern", "regex"}:
            pattern = str(rule.get("value") or rule.get("pattern") or "")
            if pattern and not re.fullmatch(pattern, text_value):
                errors.append(runtime_field_error(component, "pattern", message or f"{label} 格式不符合正则规则"))
        elif rule_type in {"min_selected", "max_selected"}:
            limit = integer_config(rule, "value", "limit", "count")
            if limit is None:
                continue
            selected_count = len(value) if isinstance(value, list) else 0
            if rule_type == "min_selected" and selected_count < limit:
                errors.append(runtime_field_error(component, rule_type, message or f"{label} 至少选择 {limit} 项"))
            if rule_type == "max_selected" and selected_count > limit:
                errors.append(runtime_field_error(component, rule_type, message or f"{label} 最多选择 {limit} 项"))
        elif rule_type == "custom_text":
            operator = str(rule.get("operator") or "")
            expected = str(rule.get("value") or "")
            if not validate_text_operator(text_value, operator, expected):
                errors.append(runtime_field_error(component, "custom_text", message or default_custom_text_message(label, operator, expected)))
    return errors


def validate_custom_text_rule(component: dict, text_value: str, config: dict) -> dict[str, Any] | None:
    rule = config.get("custom_validation")
    if not isinstance(rule, dict):
        return None
    operator = str(rule.get("operator") or "")
    expected = str(rule.get("value") or "")
    if not operator or expected == "":
        return None
    label = component.get("label") or component.get("field") or "未命名字段"
    default_messages = {
        "contains": f"{label} 必须包含「{expected}」",
        "not_contains": f"{label} 不能包含「{expected}」",
        "starts_with": f"{label} 必须以「{expected}」开头",
        "ends_with": f"{label} 必须以「{expected}」结尾",
    }
    matched = validate_text_operator(text_value, operator, expected)
    if operator not in default_messages:
        return None
    if matched:
        return None
    return runtime_field_error(component, "custom_validation", str(rule.get("message") or default_messages[operator]))


def validate_text_operator(text_value: str, operator: str, expected: str) -> bool:
    if operator == "contains":
        return expected in text_value
    if operator == "not_contains":
        return expected not in text_value
    if operator == "starts_with":
        return text_value.startswith(expected)
    if operator == "ends_with":
        return text_value.endswith(expected)
    return True


def default_custom_text_message(label: str, operator: str, expected: str) -> str:
    messages = {
        "contains": f"{label} 必须包含「{expected}」",
        "not_contains": f"{label} 不能包含「{expected}」",
        "starts_with": f"{label} 必须以「{expected}」开头",
        "ends_with": f"{label} 必须以「{expected}」结尾",
    }
    return messages.get(operator, f"{label} 不符合自定义校验规则")


def runtime_field_error(component: dict, rule: str, message: str) -> dict[str, Any]:
    return {"component_id": component.get("id"), "field": component.get("field"), "label": component.get("label"), "rule": rule, "message": message}


def integer_config(config: dict, *keys: str) -> int | None:
    for key in keys:
        value = config.get(key)
        if value in (None, ""):
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    return None


def is_empty_answer(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def template_payload(template: AnnotationTemplate, *, include_schema: bool = False, db: MongoDatabase | None = None) -> dict:
    schema = effective_template_schema(template, db)
    payload = {
        "template_id": template.id,
        "team_id": template.team_id,
        "owner_id": template.owner_id,
        "owner_name": user_display_name(db, template.owner_id) if db else None,
        "name": template.name,
        "description": template.description,
        "latest_version": template.latest_version,
        "status": template.status,
        "auto_saved": getattr(template, "auto_saved", False),
        "show_item_count": len(show_item_components(schema)),
        "tab_count": len(schema.get("tabs", [])),
        "reference_stats": template_reference_stats(db, template.team_id, template.id, None) if db else {"task_count": 0, "active_task_count": 0},
        "archived_at": template.archived_at.isoformat() if template.archived_at else None,
        "created_at": template.created_at.isoformat() if template.created_at else None,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
    }
    if include_schema:
        payload["schema"] = schema
    return payload


def effective_template_schema(template: AnnotationTemplate, db: MongoDatabase | None = None) -> dict:
    if has_template_tabs(template.schema):
        return normalize_template_schema(template.schema)
    if db:
        version = db.find_one(TemplateVersion, {"template_id": template.id, "version": template.latest_version})
        if version and has_template_tabs(version.schema):
            return normalize_template_schema(version.schema)
        latest_version = db.find_one(TemplateVersion, {"template_id": template.id}, sort=[("version", -1)])
        if latest_version and has_template_tabs(latest_version.schema):
            return normalize_template_schema(latest_version.schema)
    return normalize_template_schema(template.schema if isinstance(template.schema, dict) else {})


def has_template_tabs(schema: Any) -> bool:
    return isinstance(schema, dict) and isinstance(schema.get("tabs"), list) and bool(schema["tabs"])


def show_item_components(schema: dict) -> list[dict]:
    components = []
    for tab in schema.get("tabs", []):
        components.extend(item for item in tab.get("components", []) if item.get("type") == "ShowItem")
    components.extend(item for item in schema.get("components", []) if item.get("type") == "ShowItem")
    return components


def template_schema_stats(schema: dict) -> dict:
    components = template_components(schema)
    return {
        "tab_count": len(schema.get("tabs", [])),
        "component_count": len(components),
        "show_item_count": len([item for item in components if item.get("type") == "ShowItem"]),
        "answer_field_count": len([item for item in components if item.get("type") not in NON_ANSWER_TEMPLATE_COMPONENT_TYPES]),
        "llm_count": len([item for item in components if item.get("type") == "LLMComponent"]),
    }


def template_reference_stats(db: MongoDatabase, team_id: str, template_id: str, version: int | None) -> dict:
    query: dict[str, Any] = {"team_id": team_id, "template_id": template_id}
    if version is not None:
        query["template_version_id"] = f"{template_id}:v{version}"
    tasks = db.find(Task, query)
    active_statuses = {"published", "paused"}
    return {
        "task_count": len(tasks),
        "active_task_count": len([task for task in tasks if task.status in active_statuses]),
    }


def compare_template_versions(source_schema: dict, target_schema: dict) -> dict:
    source_components = {str(item.get("id")): item for item in template_components(source_schema) if item.get("id")}
    target_components = {str(item.get("id")): item for item in template_components(target_schema) if item.get("id")}
    added_ids = sorted(set(target_components) - set(source_components))
    removed_ids = sorted(set(source_components) - set(target_components))
    shared_ids = sorted(set(source_components) & set(target_components))
    modified = []
    field_changes = []
    high_risk_changes = []
    for component_id in shared_ids:
        source = source_components[component_id]
        target = target_components[component_id]
        if source != target:
            modified.append(component_diff_summary(component_id, source, target))
        if source.get("field") != target.get("field"):
            field_changes.append({"component_id": component_id, "from": source.get("field"), "to": target.get("field")})
        if source.get("type") == "ShowItem" or target.get("type") == "ShowItem" or source.get("type") != target.get("type"):
            high_risk_changes.append({"component_id": component_id, "from": source.get("type"), "to": target.get("type")})
    return {
        "added_components": [component_digest(target_components[item]) for item in added_ids],
        "removed_components": [component_digest(source_components[item]) for item in removed_ids],
        "modified_components": modified,
        "field_changes": field_changes,
        "validation_changed": source_schema.get("validation_rules", {}) != target_schema.get("validation_rules", {}),
        "linkage_changed": source_schema.get("linkage_rules", []) != target_schema.get("linkage_rules", []),
        "high_risk_changes": high_risk_changes,
    }


def component_digest(component: dict) -> dict:
    return {"id": component.get("id"), "type": component.get("type"), "field": component.get("field"), "label": component.get("label")}


def component_diff_summary(component_id: str, source: dict, target: dict) -> dict:
    changed_fields = []
    for key in ("type", "field", "label", "required", "config", "options"):
        if source.get(key) != target.get(key):
            changed_fields.append(key)
    return {"component_id": component_id, "label": target.get("label") or source.get("label"), "changed_fields": changed_fields}


def create_task(db: MongoDatabase, *, team_id: str, owner_id: str, payload: dict, request: Request) -> dict:
    is_auto_saved = bool(payload.get("auto_saved"))
    template = db.get(AnnotationTemplate, payload.get("template_id") or "") if payload.get("template_id") else None
    dataset = db.get(Dataset, payload.get("dataset_id") or "") if payload.get("dataset_id") else None
    published_version = None
    if payload.get("template_id"):
        if not template or template.team_id != team_id:
            raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
        published_version = get_latest_published_template_version(db, template.id)
        if not published_version:
            raise AppError(ErrorCode.STATE_CONFLICT, "发布任务前必须先发布模板")
    if payload.get("dataset_id"):
        if not dataset or dataset.team_id != team_id:
            raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    if dataset:
        validate_task_mappings(dataset, payload.get("column_mapping", {}), payload.get("mapping_config", {}), payload.get("component_bindings", {}))
    assignment_payload = normalize_task_assignment_payload(
        db,
        team_id=team_id,
        assignment=payload.get("assignment", {}),
        distribution=payload["distribution"],
    )
    quota = payload.get("quota") or (len(dataset.rows) if dataset else 0)
    claim_config = normalize_claim_config(payload.get("claim_config", {}) or {}, payload.get("ai_config", {}) or {})
    deadline = None if claim_config.get("deadline_mode") == "long_term" else payload.get("deadline")
    task = Task(
        team_id=team_id,
        owner_id=owner_id,
        title=payload["title"],
        description=payload["description"],
        rich_content=payload.get("rich_content"),
        tags=payload.get("tags", []),
        auto_saved=is_auto_saved,
        status="draft",
        category=payload.get("category", "multimodal"),
        difficulty=payload.get("difficulty") or "medium",
        deadline=deadline,
        quota=quota,
        distribution=payload["distribution"],
        reward_rule=payload["reward_rule"],
        reviewer_ids=payload.get("reviewer_ids", []),
        review_config=payload.get("review_config", {}),
        ai_config=payload.get("ai_config", {}),
        qualification_rules=payload.get("qualification_rules", {}),
        required_certs=payload.get("required_certs", []),
        agreement_config=payload.get("agreement_config", {}),
        claim_config=claim_config,
        template_id=template.id if template else "",
        template_version_id=f"{template.id}:v{published_version.version}" if template and published_version else None,
        dataset_id=dataset.id if dataset else "",
        column_mapping=payload.get("column_mapping", {}),
        mapping_config=payload.get("mapping_config", {}),
        component_bindings=payload.get("component_bindings", {}),
        assignment=build_assignment(assignment_payload, payload["distribution"]),
        stats={"total": dataset.row_count if dataset else 0, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    db.add(task)
    if dataset and template:
        for index, row in enumerate(dataset.rows):
            db.add(Question(team_id=team_id, task_id=task.id, dataset_id=dataset.id, row_index=index, content=materialize_question_content(row, task.column_mapping, task.mapping_config, dataset, task.component_bindings)))
    write_audit_log(db, entity_type="task", entity_id=task.id, action="task_auto_saved" if is_auto_saved else "task_created", operator_id=owner_id, team_id=team_id, changes={"dataset_id": task.dataset_id, "template_id": task.template_id}, request=request)
    db.commit()
    return task_payload(task, db=db)


def publish_task(db: MongoDatabase, *, team_id: str, task_id: str, operator_id: str, operator_role: str | None, request: Request) -> dict:
    task = db.get(Task, task_id)
    if not task or task.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    if task.status != "draft":
        raise AppError(ErrorCode.STATE_CONFLICT, "只有草稿任务可以发布")
    if not task.template_id or not task.dataset_id:
        raise AppError(ErrorCode.STATE_CONFLICT, "发布任务必须绑定模板和数据集")
    questions = db.find(Question, task_question_query(task))
    if not task.template_id or not questions:
        raise AppError(ErrorCode.STATE_CONFLICT, "发布任务必须绑定模板和题目")
    readiness = get_task_readiness(db, team_id, task.id)
    if not readiness["ready"]:
        raise AppError(ErrorCode.BUSINESS_RULE, "任务发布检查未通过", detail=readiness)
    assert_production_switch_enabled(db, TASK_PUBLISH_SWITCH_KEY)
    assert_active_task_capacity(db, team_id, add_count=1)
    resource_service.ensure_team_points_available_for_task_reserve(db, team_id=team_id, task=task)
    can_publish_directly = operator_role in {"team_admin", "admin"}
    task.status = "published" if can_publish_directly else "pending_review"
    task.auto_saved = False
    task.published_at = now_utc().replace(tzinfo=None) if can_publish_directly else None
    task.updated_at = now_utc().replace(tzinfo=None)
    db.save(task)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="task_published" if can_publish_directly else "task_submitted_for_review",
        operator_id=operator_id,
        team_id=team_id,
        changes={"status": task.status},
        request=request,
    )
    if can_publish_directly:
        notify_task_published(db, task=task, actor_id=operator_id, request=request)
    else:
        notify_task_publish_requested(db, task=task, actor_id=operator_id, request=request)
    db.commit()
    return task_payload(task, db=db)


def list_tasks(db: MongoDatabase, team_id: str, filters: dict[str, str | None] | None = None) -> dict:
    filters = filters or {}
    query: dict[str, Any] = {"team_id": team_id}
    if filters.get("status") and filters["status"] != "all":
        query["status"] = filters["status"]
    tasks = db.find(Task, query, sort=[("updated_at", -1)])
    keyword = (filters.get("keyword") or "").strip().lower()
    owner_id = (filters.get("owner_id") or "").strip()
    reviewer_id = (filters.get("reviewer_id") or "").strip()
    tag = (filters.get("tag") or "").strip()
    category = (filters.get("category") or "").strip()
    difficulty = (filters.get("difficulty") or "").strip()
    if keyword:
        tasks = [task for task in tasks if keyword in task.title.lower() or keyword in task.description.lower() or any(keyword in item.lower() for item in task.tags)]
    if owner_id:
        tasks = [task for task in tasks if task.owner_id == owner_id]
    if reviewer_id:
        tasks = [task for task in tasks if reviewer_id in task.reviewer_ids]
    if tag:
        tasks = [task for task in tasks if tag in task.tags]
    if category:
        tasks = [task for task in tasks if task.category == category]
    if difficulty:
        tasks = [task for task in tasks if task.difficulty == difficulty]
    tasks = sorted(tasks, key=lambda task: (not bool(getattr(task, "auto_saved", False)), -(task.updated_at.timestamp() if task.updated_at else 0)))
    items = [task_payload(task, db=db) for task in tasks]
    return {"items": items, "pagination": pagination(len(items))}


def export_tasks(db: MongoDatabase, team_id: str, filters: dict[str, str | None] | None = None, format_: str | None = None) -> tuple[str, str, bytes]:
    export_format = (format_ or "csv").lower()
    rows = [flatten_task_for_export(item) for item in list_tasks(db, team_id, filters)["items"]]
    filename_base = "markup-task-list"
    if export_format == "json":
        return f"{filename_base}.json", "application/json; charset=utf-8", json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8")
    if export_format == "csv":
        buffer = io.StringIO()
        columns = task_export_columns(rows)
        writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(escape_csv_formula_row(row))
        return f"{filename_base}.csv", "text/csv; charset=utf-8", buffer.getvalue().encode("utf-8-sig")
    raise AppError(ErrorCode.VALIDATION_FORMAT, "任务清单导出格式仅支持 csv、json")


def get_task(db: MongoDatabase, team_id: str, task_id: str) -> dict:
    task = get_task_model(db, team_id, task_id)
    return task_payload(task, db=db)


def update_task(db: MongoDatabase, *, team_id: str, task_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    task = get_task_model(db, team_id, task_id)
    nullable_fields = {"rich_content", "deadline"}
    changes = {key: value for key, value in payload.items() if value is not None or key in nullable_fields}
    if not changes:
        return task_payload(task, db=db)
    if task.status not in {"draft", "paused"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "只有草稿或已暂停任务可以修改；收集中任务请先暂停发放")
    if task.status == "paused":
        blocked = sorted(set(changes) - {"description", "rich_content", "tags"})
        if blocked:
            raise AppError(ErrorCode.STATE_CONFLICT, "已暂停任务仅允许修改描述、富文本说明和标签", {"fields": blocked})
    if task.status == "draft":
        validate_task_update_refs(db, team_id, task, changes)
    if "claim_config" in changes:
        changes["claim_config"] = normalize_claim_config(changes.get("claim_config") or {}, changes.get("ai_config") or getattr(task, "ai_config", {}) or {})
    if (changes.get("claim_config") or {}).get("deadline_mode") == "long_term":
        changes["deadline"] = None
    next_distribution = changes.get("distribution", task.distribution)
    if "assignment" in changes:
        changes["assignment"] = normalize_task_assignment_payload(
            db,
            team_id=team_id,
            assignment=changes.get("assignment") or {},
            distribution=next_distribution,
        )
    elif "distribution" in changes:
        changes["assignment"] = normalize_task_assignment_payload(
            db,
            team_id=team_id,
            assignment=task.assignment or {},
            distribution=next_distribution,
        )
    should_rebuild_questions = task.status == "draft" and bool(changes.get("dataset_id", task.dataset_id)) and any(key in changes for key in ("dataset_id", "column_mapping", "mapping_config", "component_bindings"))
    for field_name, value in changes.items():
        if field_name == "assignment":
            task.assignment = build_assignment(value or {}, changes.get("distribution", task.distribution))
            continue
        setattr(task, field_name, value)
    if should_rebuild_questions:
        rebuild_task_questions(db, task)
    task.updated_at = now_utc().replace(tzinfo=None)
    db.save(task)
    write_audit_log(db, entity_type="task", entity_id=task.id, action="task_updated", operator_id=operator_id, team_id=team_id, changes=changes, request=request)
    db.commit()
    return task_payload(task, db=db)


def change_task_status(db: MongoDatabase, *, team_id: str, task_id: str, action: str, operator_id: str, operator_role: str | None = None, request: Request) -> dict:
    task = get_task_model(db, team_id, task_id)
    if action == "approve" and operator_role not in {"team_admin", "admin"}:
        raise AppError(ErrorCode.PERMISSION_DENIED, "只有管理员可以审核发布任务")
    transitions = {
        ("pending_review", "approve"): "published",
        ("published", "pause"): "paused",
        ("paused", "resume"): "published",
        ("published", "finish"): "finished",
        ("paused", "finish"): "finished",
    }
    next_status = transitions.get((task.status, action))
    if not next_status:
        raise AppError(ErrorCode.STATE_CONFLICT, "当前任务状态不支持该操作", {"status": task.status, "action": action})
    if action == "approve":
        readiness = get_task_readiness(db, team_id, task.id)
        if not readiness["ready"]:
            raise AppError(ErrorCode.BUSINESS_RULE, "任务发布检查未通过", detail=readiness)
    if action == "approve":
        assert_production_switch_enabled(db, TASK_PUBLISH_SWITCH_KEY)
    if action in {"approve", "resume"}:
        assert_active_task_capacity(db, team_id, add_count=0)
    if action == "approve":
        resource_service.ensure_team_points_available_for_task_reserve(db, team_id=team_id, task=task)
    if action == "finish":
        ensure_task_can_finish(db, task)
    previous_status = task.status
    task.status = next_status
    if next_status == "published" and not task.published_at:
        task.published_at = now_utc().replace(tzinfo=None)
    task.updated_at = now_utc().replace(tzinfo=None)
    db.save(task)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action=f"task_{action}d" if action != "finish" else "task_finished",
        operator_id=operator_id,
        team_id=team_id,
        changes={"from": previous_status, "to": next_status},
        request=request,
    )
    if action == "approve":
        notify_task_published(db, task=task, actor_id=operator_id, request=request)
    if action in {"pause", "finish"}:
        notify_task_status_changed(db, task=task, previous_status=previous_status, action=action, actor_id=operator_id, request=request)
    db.commit()
    return task_payload(task, db=db)


def task_status_counts(db: MongoDatabase, task: Task) -> dict[str, int]:
    status_counts: dict[str, int] = {}
    for question in db.find(Question, task_question_query(task)):
        status_counts[question.status] = status_counts.get(question.status, 0) + 1
    return status_counts


def ensure_task_can_finish(db: MongoDatabase, task: Task) -> None:
    status_counts = task_status_counts(db, task)
    blocking_count = status_counts.get("claimed", 0) + status_counts.get("submitted", 0) + status_counts.get("rejected", 0)
    if blocking_count <= 0:
        return
    raise AppError(
        ErrorCode.STATE_CONFLICT,
        "Task still has claimed, submitted, or rejected questions and cannot be finished",
        {
            "blocking": blocking_count,
            "claimed": status_counts.get("claimed", 0),
            "submitted": status_counts.get("submitted", 0),
            "rejected": status_counts.get("rejected", 0),
            "approved": status_counts.get("approved", 0),
            "pending": status_counts.get("pending", 0),
        },
    )


def transfer_task_owner(db: MongoDatabase, *, team_id: str, task_id: str, target_owner_id: str, reason: str | None, operator_id: str, request: Request) -> dict:
    task = get_task_model(db, team_id, task_id)
    if task.owner_id == target_owner_id:
        raise AppError(ErrorCode.BUSINESS_RULE, "转交目标不能是当前负责人")
    target_member = db.find_one(TeamMember, {"team_id": team_id, "user_id": target_owner_id, "status": "active"})
    if not target_member:
        raise AppError(ErrorCode.NOT_FOUND, "目标成员不存在或不在当前企业")
    if target_member.team_role not in {"team_admin", "owner"}:
        raise AppError(ErrorCode.PERMISSION_DENIED, "任务负责人只能转交给企业管理员或任务发布者")
    previous_owner_id = task.owner_id
    task.owner_id = target_owner_id
    task.updated_at = now_utc().replace(tzinfo=None)
    db.save(task)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="task_owner_transferred",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "from_owner_id": previous_owner_id,
            "to_owner_id": target_owner_id,
            "reason": reason,
        },
        request=request,
    )
    db.commit()
    return task_payload(task, db=db)


def update_task_internal_labelers(
    db: MongoDatabase,
    *,
    team_id: str,
    task_id: str,
    target_labeler_ids: list[str] | None,
    target_labeler_allocations: list[dict[str, Any]] | None,
    operator_id: str,
    request: Request,
) -> dict:
    task = get_task_model(db, team_id, task_id)
    if task.distribution != "quota_grab":
        raise AppError(ErrorCode.STATE_CONFLICT, "只有企业内流转任务可以指定企业 Labeler")
    if task.status == "finished":
        raise AppError(ErrorCode.STATE_CONFLICT, "已结束任务不能修改企业内 Labeler 分配")
    previous_ids = internal_labeler_ids_from_assignment(task.assignment or {})
    previous_allocations = internal_labeler_allocations_from_assignment(task.assignment or {})
    normalized_assignment = normalize_task_assignment_payload(
        db,
        team_id=team_id,
        assignment={
            "target_labeler_ids": target_labeler_ids or [],
            "target_labeler_allocations": target_labeler_allocations or [],
        },
        distribution=task.distribution,
    )
    normalized_ids = internal_labeler_ids_from_assignment(normalized_assignment)
    normalized_allocations = internal_labeler_allocations_from_assignment(normalized_assignment)
    task.assignment = build_assignment(normalized_assignment, task.distribution)
    task.updated_at = now_utc().replace(tzinfo=None)
    db.save(task)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="task_internal_labelers_updated",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "target_labeler_ids": {"from": previous_ids, "to": normalized_ids},
            "target_labeler_allocations": {"from": previous_allocations, "to": normalized_allocations},
        },
        request=request,
    )
    db.commit()
    return task_payload(task, db=db)


def request_task_assistance(
    db: MongoDatabase,
    *,
    team_id: str,
    task_id: str,
    target_reviewer_id: str,
    submission_ids: list[str] | None,
    reason: str | None,
    operator_id: str,
    operator_role: str | None,
    operator_permissions: list[str] | None,
    request: Request,
) -> dict:
    task = get_task_model(db, team_id, task_id)
    if task.status not in {"published", "paused"}:
        raise AppError(ErrorCode.STATE_CONFLICT, "只有收集中或已暂停的任务可以请求协助")
    operator_can_manage = "task:manage" in set(operator_permissions or [])
    operator_member = db.find_one(TeamMember, {"team_id": team_id, "user_id": operator_id, "status": "active"})
    operator_can_review_task = (
        role_value(operator_role) == TeamRole.REVIEWER.value
        and operator_member is not None
        and task.id in set(operator_member.assigned_review_tasks or [])
    )
    if operator_id in set(task.reviewer_ids or []) and role_value(operator_role) == TeamRole.REVIEWER.value:
        operator_can_review_task = True
    if not operator_can_manage and not operator_can_review_task:
        raise AppError(ErrorCode.PERMISSION_DENIED, "只有任务管理者或当前任务 Reviewer 可以请求协助")
    target_member = db.find_one(TeamMember, {"team_id": team_id, "user_id": target_reviewer_id, "status": "active"})
    if not target_member:
        raise AppError(ErrorCode.NOT_FOUND, "目标 Reviewer 不存在")
    if role_value(target_member.team_role) != TeamRole.REVIEWER.value:
        raise AppError(ErrorCode.BUSINESS_RULE, "只能请求团队内 Reviewer 协助")

    requested_submission_ids = [item for item in dict.fromkeys(submission_ids or []) if item]
    if requested_submission_ids:
        invalid_submission_ids = []
        for submission_id in requested_submission_ids:
            submission = db.get(Submission, submission_id)
            if not submission or submission.team_id != team_id or submission.task_id != task.id:
                invalid_submission_ids.append(submission_id)
        if invalid_submission_ids:
            raise AppError(ErrorCode.NOT_FOUND, "存在不属于当前任务的提交，不能请求协助")

    previous_assigned = list(target_member.assigned_review_tasks or [])
    if task.id in previous_assigned:
        return {
            "task_id": task.id,
            "task_title": task.title,
            "target_reviewer_id": target_reviewer_id,
            "submission_ids": requested_submission_ids,
            "reason": reason,
            "assigned_review_tasks": previous_assigned,
            "already_assigned": True,
        }

    target_member.assigned_review_tasks = [*previous_assigned, task.id]
    db.save(target_member)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="task_assistance_requested",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "task_id": task.id,
            "target_reviewer_id": target_reviewer_id,
            "submission_ids": requested_submission_ids,
            "reason": reason,
            "assigned_review_tasks": {"from": previous_assigned, "to": target_member.assigned_review_tasks},
        },
        request=request,
    )
    db.commit()
    return {
        "task_id": task.id,
        "task_title": task.title,
        "target_reviewer_id": target_reviewer_id,
        "submission_ids": requested_submission_ids,
        "reason": reason,
        "assigned_review_tasks": target_member.assigned_review_tasks,
        "already_assigned": False,
    }


def copy_task(db: MongoDatabase, *, team_id: str, task_id: str, operator_id: str, title: str | None, request: Request) -> dict:
    source = get_task_model(db, team_id, task_id)
    source_questions = db.find(Question, task_question_query(source), sort=[("row_index", 1)])
    copied = Task(
        team_id=team_id,
        owner_id=operator_id,
        title=title or copy_name(source.title),
        description=source.description,
        rich_content=source.rich_content,
        tags=list(source.tags or []),
        status="draft",
        category=source.category,
        difficulty=source.difficulty,
        deadline=source.deadline,
        quota=source.quota,
        distribution=source.distribution,
        reward_rule=dict(source.reward_rule or {}),
        reviewer_ids=list(source.reviewer_ids or []),
        review_config=dict(getattr(source, "review_config", {}) or {}),
        ai_config=dict(source.ai_config or {}),
        qualification_rules=dict(source.qualification_rules or {}),
        required_certs=list(source.required_certs or []),
        agreement_config=dict(getattr(source, "agreement_config", {}) or {}),
        claim_config=dict(getattr(source, "claim_config", {}) or {}),
        template_id=source.template_id,
        template_version_id=source.template_version_id,
        dataset_id=source.dataset_id,
        column_mapping=dict(source.column_mapping or {}),
        mapping_config=dict(getattr(source, "mapping_config", {}) or {}),
        component_bindings=dict(getattr(source, "component_bindings", {}) or {}),
        assignment=build_assignment(source.assignment or {}, source.distribution),
        stats={"total": len(source_questions), "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0},
    )
    copied.quota = copied.quota or len(source_questions)
    db.add(copied)
    for index, question in enumerate(source_questions):
        db.add(Question(team_id=team_id, task_id=copied.id, dataset_id=question.dataset_id, row_index=index, content=dict(question.content or {})))
    write_audit_log(
        db,
        entity_type="task",
        entity_id=copied.id,
        action="task_copied",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "source_task_id": source.id,
            "source_title": source.title,
            "question_count": len(source_questions),
        },
        request=request,
    )
    db.commit()
    return task_payload(copied, db=db)


def delete_task(db: MongoDatabase, *, team_id: str, task_id: str, operator_id: str, request: Request) -> None:
    task = get_task_model(db, team_id, task_id)
    eligibility = task_delete_eligibility(db, task)
    if not eligibility["deletable"]:
        raise AppError(ErrorCode.STATE_CONFLICT, eligibility["reason"], eligibility)
    deletion_summary = cascade_delete_task_domain(db, task)
    db.delete_one(Task, {"_id": task.id})
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="task_deleted",
        operator_id=operator_id,
        team_id=team_id,
        changes={"title": task.title, "mode": eligibility["mode"], **deletion_summary},
        request=request,
    )
    db.commit()


def task_delete_eligibility(db: MongoDatabase, task: Task) -> dict:
    counts = task_delete_counts(db, task)
    blockers: dict[str, int] = {}
    if task.status == "draft":
        return {
            "deletable": True,
            "mode": "draft",
            "reason": None,
            "counts": counts,
            "blockers": blockers,
        }
    if task.status != "finished":
        blockers["task_status"] = 1
        return {
            "deletable": False,
            "mode": None,
            "reason": "只有草稿或已结束且无未结清数据的任务可以删除",
            "counts": counts,
            "blockers": blockers,
        }
    for key in ("claimed_questions", "submitted_questions", "rejected_questions", "draft_submissions", "submitted_submissions", "rejected_submissions"):
        if counts[key] > 0:
            blockers[key] = counts[key]
    if blockers:
        return {
            "deletable": False,
            "mode": None,
            "reason": "任务仍有未验收、待审核或打回待处理的数据，不能删除",
            "counts": counts,
            "blockers": blockers,
        }
    return {
        "deletable": True,
        "mode": "finished_cascade",
        "reason": None,
        "counts": counts,
        "blockers": blockers,
    }


def task_delete_counts(db: MongoDatabase, task: Task) -> dict:
    questions = db.find(Question, task_question_query(task))
    submissions = db.find(Submission, {"team_id": task.team_id, "task_id": task.id})
    bundles = db.find(TaskClaimBundle, {"team_id": task.team_id, "task_id": task.id})
    ai_review_jobs = db.find(AiReviewJob, {"team_id": task.team_id, "task_id": task.id})
    export_jobs = db.find(ExportJob, {"team_id": task.team_id, "task_id": task.id})
    notifications = task_related_notifications(db, task)
    question_counts = status_counts([question.status for question in questions])
    submission_counts = status_counts([submission.status for submission in submissions])
    return {
        "questions": len(questions),
        "pending_questions": question_counts.get("pending", 0),
        "claimed_questions": question_counts.get("claimed", 0),
        "submitted_questions": question_counts.get("submitted", 0),
        "approved_questions": question_counts.get("approved", 0),
        "rejected_questions": question_counts.get("rejected", 0),
        "closed_questions": question_counts.get("closed", 0),
        "submissions": len(submissions),
        "draft_submissions": submission_counts.get("draft", 0),
        "submitted_submissions": submission_counts.get("submitted", 0),
        "approved_submissions": submission_counts.get("approved", 0),
        "rejected_submissions": submission_counts.get("rejected", 0),
        "abandoned_submissions": submission_counts.get("abandoned", 0),
        "claim_bundles": len(bundles),
        "ai_review_jobs": len(ai_review_jobs),
        "export_jobs": len(export_jobs),
        "notifications": len(notifications),
    }


def status_counts(statuses: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for status in statuses:
        counts[status] = counts.get(status, 0) + 1
    return counts


def task_related_notifications(db: MongoDatabase, task: Task) -> list[Notification]:
    notifications = db.find(Notification, {"team_id": task.team_id})
    return [
        notification
        for notification in notifications
        if (notification.related_entity_type == "task" and notification.related_entity_id == task.id)
        or (notification.metadata or {}).get("task_id") == task.id
    ]


def cascade_delete_task_domain(db: MongoDatabase, task: Task) -> dict:
    export_jobs = db.find(ExportJob, {"team_id": task.team_id, "task_id": task.id})
    deleted_export_files = 0
    for job in export_jobs:
        if job.storage == "filesystem" and job.path:
            try:
                if delete_storage_file(job.path):
                    deleted_export_files += 1
            except AppError:
                pass
    notifications = task_related_notifications(db, task)
    counts = {
        "questions_deleted": db.collection(Question.collection_name).count_documents(task_question_query(task)),
        "submissions_deleted": db.collection(Submission.collection_name).count_documents({"team_id": task.team_id, "task_id": task.id}),
        "claim_bundles_deleted": db.collection(TaskClaimBundle.collection_name).count_documents({"team_id": task.team_id, "task_id": task.id}),
        "ai_review_jobs_deleted": db.collection(AiReviewJob.collection_name).count_documents({"team_id": task.team_id, "task_id": task.id}),
        "export_jobs_deleted": len(export_jobs),
        "export_files_deleted": deleted_export_files,
        "notifications_deleted": len(notifications),
    }
    db.collection(Question.collection_name).delete_many(task_question_query(task))
    db.collection(Submission.collection_name).delete_many({"team_id": task.team_id, "task_id": task.id})
    db.collection(TaskClaimBundle.collection_name).delete_many({"team_id": task.team_id, "task_id": task.id})
    db.collection(AiReviewJob.collection_name).delete_many({"team_id": task.team_id, "task_id": task.id})
    db.collection(ExportJob.collection_name).delete_many({"team_id": task.team_id, "task_id": task.id})
    if notifications:
        db.collection(Notification.collection_name).delete_many({"_id": {"$in": [notification.id for notification in notifications]}})
    return counts


def get_task_stats(db: MongoDatabase, team_id: str, task_id: str) -> dict:
    task = get_task_model(db, team_id, task_id)
    questions = db.find(Question, task_question_query(task))
    question_status_counts: dict[str, int] = {}
    for question in questions:
        question_status_counts[question.status] = question_status_counts.get(question.status, 0) + 1
    return {
        "task_id": task.id,
        "status": task.status,
        "quota": task.quota,
        "stats": task.stats,
        "question_count": len(questions),
        "question_status_counts": question_status_counts,
    }


def get_task_readiness(db: MongoDatabase, team_id: str, task_id: str) -> dict:
    task = get_task_model(db, team_id, task_id)
    questions = db.find(Question, task_question_query(task))
    template = db.get(AnnotationTemplate, task.template_id) if task.template_id else None
    dataset = db.get(Dataset, task.dataset_id) if task.dataset_id else None
    bound_version = get_task_bound_template_version(db, task)
    template_schema = bound_version.schema if bound_version else template.schema if template else {}
    has_published_template_version = bool(bound_version and bound_version.team_id == team_id and bound_version.is_published)
    has_valid_dataset = bool(dataset and dataset.team_id == team_id)
    show_items = show_item_components(template_schema)
    mapped_count = sum(1 for item in show_items if task.column_mapping.get(item.get("id")) or (getattr(task, "mapping_config", {}) or {}).get(item.get("id")))
    invalid_mapping_columns = task_mapping_invalid_columns(dataset, task.column_mapping, getattr(task, "mapping_config", {}) or {}, getattr(task, "component_bindings", {}) or {}) if has_valid_dataset else []
    ai_ready, ai_pass_message, ai_block_message = task_ai_readiness(db, team_id, task)
    checks = [
        readiness_item("basic", "基础信息", bool(task.title and task.description), "标题和描述已填写", "请补充任务标题和描述"),
        readiness_item(
            "template",
            "模板",
            has_published_template_version,
            "已绑定已发布模板版本",
            "请选择已发布模板",
        ),
        readiness_item("dataset", "数据集", has_valid_dataset, "已绑定当前企业数据集", "请选择当前企业的数据集"),
        readiness_item("questions", "题目", bool(questions), f"已生成 {len(questions)} 道题目", "任务至少需要 1 道题目"),
        readiness_item(
            "mapping",
            "列映射",
            mapped_count == len(show_items) and not invalid_mapping_columns,
            f"ShowItem 映射 {mapped_count}/{len(show_items)}",
            "列映射失效："
            + ("、".join(invalid_mapping_columns) if invalid_mapping_columns else f"仍有 ShowItem 未映射（{mapped_count}/{len(show_items)}）"),
        ),
        readiness_item(
            "ai",
            "AI 预审",
            ai_ready,
            ai_pass_message,
            ai_block_message,
        ),
        readiness_item("distribution", "分发", task.distribution != "assigned_link" or bool(task.assignment.get("expire_at")), "分发配置可用", "指派链接需要有效期"),
    ]
    blockers = [item for item in checks if item["status"] == "block"]
    warnings = []
    if not task.reviewer_ids:
        warnings.append({"key": "reviewer", "label": "审核员", "message": "未指定默认 Reviewer，发布后团队内所有 Reviewer 可处理审核任务"})
    if not task.deadline:
        warnings.append({"key": "deadline", "label": "截止时间", "message": "尚未设置截止时间"})
    return {
        "task_id": task.id,
        "ready": not blockers,
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
        "summary": {
            "question_count": len(questions),
            "show_item_count": len(show_items),
            "mapped_show_item_count": mapped_count,
            "reviewer_count": len(task.reviewer_ids),
            "ai_enabled": bool(task.ai_config.get("enabled")),
        },
    }


def task_ai_readiness(db: MongoDatabase, team_id: str, task: Task) -> tuple[bool, str, str]:
    ai_config = task.ai_config or {}
    if not ai_config.get("enabled"):
        return True, "AI 预审未启用", "AI 预审开启时必须选择可用 Provider/模型，生成字段说明和评分矩阵并确认"
    provider_id = ai_config.get("provider_id")
    provider = db.get(AiProviderConfig, provider_id) if provider_id else None
    provider_ready = bool(provider and provider.status == "enabled" and (not provider.team_id or provider.team_id == team_id))
    config_ready = (
        provider_ready
        and bool(ai_config.get("model"))
        and bool(ai_config.get("input_prompt") or ai_config.get("prompt"))
        and bool(ai_config.get("input_confirmed", True))
        and bool(ai_config.get("review_matrix"))
        and bool(ai_config.get("matrix_confirmed"))
    )
    if config_ready:
        return True, "AI Provider、模型、字段说明和评分矩阵已确认", "AI 预审开启时必须选择可用 Provider/模型，生成字段说明和评分矩阵并确认"
    if not provider:
        return False, "AI Provider、模型、字段说明和评分矩阵已确认", "AI 预审 Provider 不存在或已失效"
    if provider.status != "enabled":
        return False, "AI Provider、模型、字段说明和评分矩阵已确认", "AI 预审 Provider 未启用"
    if provider.team_id and provider.team_id != team_id:
        return False, "AI Provider、模型、字段说明和评分矩阵已确认", "AI 预审 Provider 不属于当前企业"
    return False, "AI Provider、模型、字段说明和评分矩阵已确认", "AI 预审开启时必须选择可用 Provider/模型，生成字段说明和评分矩阵并确认"


def get_task_bound_template_version(db: MongoDatabase, task: Task) -> TemplateVersion | None:
    if not task.template_id or not task.template_version_id:
        return None
    prefix = f"{task.template_id}:v"
    if not task.template_version_id.startswith(prefix):
        return None
    raw_version = task.template_version_id.removeprefix(prefix)
    if not raw_version.isdigit():
        return None
    version = db.find_one(TemplateVersion, {"template_id": task.template_id, "version": int(raw_version)})
    if version:
        version.schema = normalize_template_schema(version.schema)
    return version


def get_latest_published_template_version(db: MongoDatabase, template_id: str) -> TemplateVersion | None:
    versions = db.find(TemplateVersion, {"template_id": template_id, "is_published": True}, sort=[("version", -1)])
    return versions[0] if versions else None


def readiness_item(key: str, label: str, passed: bool, pass_message: str, block_message: str) -> dict:
    return {
        "key": key,
        "label": label,
        "status": "pass" if passed else "block",
        "message": pass_message if passed else block_message,
    }


def template_components(schema: dict) -> list[dict]:
    components: list[dict] = []
    for tab in schema.get("tabs", []):
        if isinstance(tab, dict):
            components.extend(item for item in tab.get("components", []) if isinstance(item, dict))
    components.extend(item for item in schema.get("components", []) if isinstance(item, dict))
    return components


def template_validation_errors(schema: dict, components: list[dict]) -> list[str]:
    errors: list[str] = []
    for component in components:
        label = component.get("label") or component.get("field") or component.get("id") or "未命名组件"
        config = component.get("config") if isinstance(component.get("config"), dict) else {}
        min_length = config.get("min_length")
        max_length = config.get("max_length")
        if min_length not in (None, "") and max_length not in (None, ""):
            try:
                if int(min_length) > int(max_length):
                    errors.append(f"{label} 最小长度不能大于最大长度")
            except (TypeError, ValueError):
                errors.append(f"{label} 长度规则必须是数字")
        pattern = config.get("regex") or config.get("pattern")
        if pattern:
            try:
                re.compile(str(pattern))
            except re.error:
                errors.append(f"{label} 正则表达式不合法")
        custom_validation = config.get("custom_validation")
        if isinstance(custom_validation, dict):
            operator = str(custom_validation.get("operator") or "")
            expected = custom_validation.get("value")
            if operator and operator not in {"contains", "not_contains", "starts_with", "ends_with"}:
                errors.append(f"{label} 自定义校验操作符不支持：{operator}")
            if operator and expected in (None, ""):
                errors.append(f"{label} 自定义校验值不能为空")
        min_choices = config.get("min_choices")
        max_choices = config.get("max_choices")
        if min_choices not in (None, "") and max_choices not in (None, ""):
            try:
                if int(min_choices) > int(max_choices):
                    errors.append(f"{label} 最少选择数不能大于最多选择数")
            except (TypeError, ValueError):
                errors.append(f"{label} 选择数量规则必须是数字")
    fields = {str(item.get("field")) for item in components if item.get("field")}
    supported_rules = {"required", "min_length", "max_length", "pattern", "regex", "min_selected", "max_selected", "custom_text"}
    for field, rules in template_validation_rules(schema).items():
        if field not in fields:
            errors.append(f"校验规则依赖字段不存在：{field}")
        for index, rule in enumerate(rules, start=1):
            rule_type = str(rule.get("type") or rule.get("rule") or "")
            if not rule_type:
                errors.append(f"{field} 第 {index} 条校验规则缺少 type")
                continue
            if rule_type not in supported_rules:
                errors.append(f"{field} 第 {index} 条校验规则不支持：{rule_type}")
            if rule_type in {"min_length", "max_length", "min_selected", "max_selected"} and integer_config(rule, "value", "limit", "length", "count") is None:
                errors.append(f"{field} 第 {index} 条校验规则需要数字阈值")
            if rule_type in {"pattern", "regex"}:
                pattern = str(rule.get("value") or rule.get("pattern") or "")
                try:
                    re.compile(pattern)
                except re.error:
                    errors.append(f"{field} 第 {index} 条正则校验不合法")
            if rule_type == "custom_text":
                operator = str(rule.get("operator") or "")
                if operator not in {"contains", "not_contains", "starts_with", "ends_with"}:
                    errors.append(f"{field} 第 {index} 条自定义文本操作符不支持：{operator or '空'}")
    return errors


def template_linkage_errors(schema: dict, components: list[dict]) -> list[str]:
    fields = {str(item.get("field")) for item in components if item.get("field")}
    ids = {str(item.get("id")) for item in components if item.get("id")}
    errors: list[str] = []
    for index, rule in enumerate(schema.get("linkage_rules", []), start=1):
        if not isinstance(rule, dict):
            errors.append(f"联动规则 {index} 格式不合法")
            continue
        conditions = rule.get("conditions")
        condition_items = [item for item in conditions if isinstance(item, dict)] if isinstance(conditions, list) and conditions else [rule]
        target_field = linkage_rule_target_key(rule)
        action = str(rule.get("action") or rule.get("effect") or "show")
        for condition_index, condition in enumerate(condition_items, start=1):
            source_field = condition.get("source_field") or condition.get("source_component_id") or condition.get("field") or condition.get("when_field")
            operator = str(condition.get("operator") or condition.get("condition") or "equals")
            suffix = f" 条件 {condition_index}" if len(condition_items) > 1 else ""
            if source_field and str(source_field) not in fields and str(source_field) not in ids:
                errors.append(f"联动规则 {index}{suffix} 依赖字段不存在：{source_field}")
            if operator not in {"equals", "eq", "is", "not_equals", "neq", "not", "contains", "not_contains", "not_empty", "filled", "empty", "is_empty"}:
                errors.append(f"联动规则 {index}{suffix} 条件操作符不支持：{operator}")
        if target_field and str(target_field) not in fields and str(target_field) not in ids:
            errors.append(f"联动规则 {index} 目标字段不存在：{target_field}")
        if action not in {"show", "hide"}:
            errors.append(f"联动规则 {index} 动作不支持：{action}")
        mode = str(rule.get("condition_mode") or rule.get("logic") or "all")
        if mode not in {"all", "any", "and", "or"}:
            errors.append(f"联动规则 {index} 条件组合方式不支持：{mode}")
    return errors


def template_llm_provider_id(component: dict) -> str:
    config = component.get("config") if isinstance(component.get("config"), dict) else {}
    candidates = [
        config.get("provider_id"),
        config.get("ai_provider_id"),
        config.get("providerId"),
    ]
    llm_config = config.get("llm_config") if isinstance(config.get("llm_config"), dict) else {}
    candidates.extend([
        llm_config.get("provider_id"),
        llm_config.get("ai_provider_id"),
        llm_config.get("providerId"),
    ])
    for candidate in candidates:
        value = str(candidate or "").strip()
        if value:
            return value
    return ""


def template_llm_provider_available(db: MongoDatabase, team_id: str, provider_id: str) -> bool:
    provider = db.get(AiProviderConfig, provider_id)
    if not provider or provider.status != "enabled":
        return False
    if provider.scope == "team":
        return provider.team_id == team_id
    return provider.scope == "platform" and bool(provider.api_key_configured or getattr(provider, "encrypted_api_key", None))


def template_llm_errors(db: MongoDatabase, team_id: str, schema: dict, components: list[dict]) -> list[str]:
    errors: list[str] = []
    llm_config = schema.get("llm_config") if isinstance(schema.get("llm_config"), dict) else {}
    if llm_config.get("enabled") and not (llm_config.get("prompt") or llm_config.get("prompt_template")):
        errors.append("全局 LLM 启用时必须填写 Prompt")
    llm_components = [item for item in components if item.get("type") == "LLMComponent"]
    for index, component in enumerate(llm_components, start=1):
        label = str(component.get("label") or component.get("field") or component.get("id") or f"LLM 组件 {index}").strip()
        provider_id = template_llm_provider_id(component)
        if not provider_id:
            errors.append(f"{label} 必须选择 AI Provider")
            continue
        if not template_llm_provider_available(db, team_id, provider_id):
            errors.append(f"{label} 选择的 AI Provider 不存在、未启用或不可用于当前企业")
    return errors


def list_task_questions(
    db: MongoDatabase,
    team_id: str,
    task_id: str,
    *,
    status: str | None = None,
    assigned_to: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    task = get_task_model(db, team_id, task_id)
    query: dict[str, Any] = task_question_query(task)
    if status and status != "all":
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    questions = db.find(Question, query, sort=[("row_index", 1)])
    safe_page_size = min(max(page_size, 1), 100)
    safe_page = max(page, 1)
    start = (safe_page - 1) * safe_page_size
    sliced = questions[start : start + safe_page_size]
    return {
        "items": [question_payload(question, db=db) for question in sliced],
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total": len(questions),
            "total_pages": max((len(questions) + safe_page_size - 1) // safe_page_size, 1),
        },
    }


def get_task_question(db: MongoDatabase, team_id: str, task_id: str, question_id: str) -> dict:
    task = get_task_model(db, team_id, task_id)
    question = db.get(Question, question_id)
    if not question or question.team_id != team_id or question.task_id != task.id:
        raise AppError(ErrorCode.NOT_FOUND, "题目不存在")
    return question_payload(question, include_content=True, db=db)


def batch_create_task_questions(db: MongoDatabase, *, team_id: str, task_id: str, items: list[dict[str, Any]], operator_id: str, request: Request) -> dict:
    task = get_task_model(db, team_id, task_id)
    ensure_draft_question_mutation(task)
    contents = [normalize_question_content(item, index + 1) for index, item in enumerate(items)]
    created = append_task_questions(db, task, contents, dataset_id="")
    sync_task_question_stats(db, task)
    write_audit_log(db, entity_type="task", entity_id=task.id, action="questions_batch_created", operator_id=operator_id, team_id=team_id, changes={"count": len(created)}, request=request)
    db.commit()
    return {"items": [question_payload(question, db=db) for question in created], "created_count": len(created)}


def import_task_questions(
    db: MongoDatabase,
    *,
    team_id: str,
    task_id: str,
    filename: str,
    content: bytes,
    column_mapping: dict[str, str] | None,
    replace_existing: bool,
    operator_id: str,
    request: Request,
) -> dict:
    task = get_task_model(db, team_id, task_id)
    ensure_draft_question_mutation(task)
    if len(content) > QUESTION_IMPORT_MAX_BYTES:
        raise AppError(ErrorCode.VALIDATION_RANGE, "题目导入文件不能超过 50MB")
    source_format, rows = parse_question_import_file(filename, content)
    if not rows:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "题目导入文件至少需要一行数据")
    mapped_rows = [apply_question_import_mapping(row, column_mapping) for row in rows]
    contents = normalize_imported_question_contents(mapped_rows)
    if replace_existing:
        db.collection(Question.collection_name).delete_many(task_question_query(task))
    created = append_task_questions(db, task, contents, dataset_id="")
    sync_task_question_stats(db, task)
    write_audit_log(
        db,
        entity_type="task",
        entity_id=task.id,
        action="questions_imported",
        operator_id=operator_id,
        team_id=team_id,
        changes={"count": len(created), "source_format": source_format, "replace_existing": replace_existing},
        request=request,
    )
    db.commit()
    return {"items": [question_payload(question, db=db) for question in created[:100]], "created_count": len(created), "source_format": source_format, "replaced": replace_existing}


def parse_question_import_file(filename: str, content: bytes) -> tuple[str, list[dict[str, Any]]]:
    try:
        return parse_dataset_file(filename, content)
    except AppError as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if "row_errors" in detail:
            raise
        row_errors = detail.get("row_errors") if isinstance(detail.get("row_errors"), list) else [{"row": detail.get("row"), "error": exc.message}]
        raise AppError(exc.code, exc.message, {"row_errors": normalize_row_errors(row_errors, exc.message)}) from exc
    except (UnicodeDecodeError, json.JSONDecodeError, zipfile.BadZipFile, ElementTree.ParseError, csv.Error) as exc:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "题目导入文件解析失败", {"row_errors": [{"row": None, "error": str(exc)}]}) from exc


def normalize_row_errors(row_errors: list[Any], fallback: str) -> list[dict[str, Any]]:
    normalized = []
    for item in row_errors:
        if isinstance(item, dict):
            normalized.append({"row": item.get("row"), "error": item.get("error") or item.get("message") or fallback})
        else:
            normalized.append({"row": None, "error": str(item) or fallback})
    return normalized or [{"row": None, "error": fallback}]


def normalize_imported_question_contents(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    contents = []
    row_errors = []
    for index, row in enumerate(rows, start=1):
        try:
            contents.append(normalize_question_content(row, index))
        except AppError as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            row_errors.append({"row": detail.get("row") or index, "error": exc.message})
    if row_errors:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "题目导入数据行格式错误", {"row_errors": row_errors})
    return contents


def update_task_question(db: MongoDatabase, *, team_id: str, task_id: str, question_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    task = get_task_model(db, team_id, task_id)
    ensure_draft_question_mutation(task)
    question = get_question_model(db, team_id, task.id, question_id)
    if payload.get("status") is not None and payload["status"] != "pending":
        raise AppError(ErrorCode.STATE_CONFLICT, "草稿题目不能写入领取、提交或审核状态")
    if payload.get("assigned_to"):
        raise AppError(ErrorCode.STATE_CONFLICT, "草稿题目不能预置领取人")
    changes: dict[str, Any] = {}
    if "content" in payload and payload["content"] is not None:
        normalized_content = normalize_question_content({"content": payload["content"]}, 1)
        changes["content"] = normalized_content
        question.content = normalized_content
    if "status" in payload and payload["status"] is not None:
        changes["status"] = {"from": question.status, "to": payload["status"]}
        question.status = payload["status"]
    if "assigned_to" in payload:
        changes["assigned_to"] = {"from": question.assigned_to, "to": payload.get("assigned_to")}
        question.assigned_to = payload.get("assigned_to")
    if not changes:
        return question_payload(question, db=db)
    question.updated_at = now_utc().replace(tzinfo=None)
    db.save(question)
    sync_task_question_stats(db, task)
    write_audit_log(db, entity_type="question", entity_id=question.id, action="question_updated", operator_id=operator_id, team_id=team_id, changes=changes, request=request)
    db.commit()
    return question_payload(question, db=db)


def delete_task_question(db: MongoDatabase, *, team_id: str, task_id: str, question_id: str, operator_id: str, request: Request) -> None:
    task = get_task_model(db, team_id, task_id)
    ensure_draft_question_mutation(task)
    question = get_question_model(db, team_id, task.id, question_id)
    db.delete_one(Question, {"_id": question.id})
    normalize_question_order(db, task)
    sync_task_question_stats(db, task)
    write_audit_log(db, entity_type="question", entity_id=question.id, action="question_deleted", operator_id=operator_id, team_id=team_id, changes={"row_index": question.row_index}, request=request)
    db.commit()


def batch_delete_task_questions(db: MongoDatabase, *, team_id: str, task_id: str, question_ids: list[str], operator_id: str, request: Request) -> dict:
    task = get_task_model(db, team_id, task_id)
    ensure_draft_question_mutation(task)
    existing = db.find(Question, task_question_query(task))
    existing_ids = {question.id for question in existing}
    missing = [question_id for question_id in question_ids if question_id not in existing_ids]
    if missing:
        raise AppError(ErrorCode.NOT_FOUND, "部分题目不存在", {"question_ids": missing})
    db.collection(Question.collection_name).delete_many(task_question_query(task, {"_id": {"$in": question_ids}}))
    normalize_question_order(db, task)
    sync_task_question_stats(db, task)
    write_audit_log(db, entity_type="task", entity_id=task.id, action="questions_batch_deleted", operator_id=operator_id, team_id=team_id, changes={"count": len(question_ids)}, request=request)
    db.commit()
    return {"deleted_count": len(question_ids)}


def export_task_questions(db: MongoDatabase, team_id: str, task_id: str, format_: str | None = None) -> tuple[str, str, bytes]:
    task = get_task_model(db, team_id, task_id)
    export_format = (format_ or "jsonl").lower()
    questions = db.find(Question, task_question_query(task), sort=[("row_index", 1)])
    payload = [question_payload(question, db=db) for question in questions]
    filename_base = f"{safe_filename(task.title) or 'task'}-questions"
    if export_format == "json":
        return f"{filename_base}.json", "application/json; charset=utf-8", json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    if export_format == "jsonl":
        body = "\n".join(json.dumps(item["content"], ensure_ascii=False) for item in payload)
        return f"{filename_base}.jsonl", "application/x-ndjson; charset=utf-8", body.encode("utf-8")
    if export_format == "csv":
        return f"{filename_base}.csv", "text/csv; charset=utf-8", questions_csv(payload)
    if export_format in {"excel", "xlsx"}:
        return f"{filename_base}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", questions_xlsx(payload)
    raise AppError(ErrorCode.VALIDATION_FORMAT, "题目导出格式仅支持 json、jsonl、csv、excel")


def questions_csv(questions: list[dict[str, Any]]) -> bytes:
    rows = [flatten_question_for_export(question) for question in questions]
    columns = ordered_export_columns(rows)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(escape_csv_formula_row(row))
    return buffer.getvalue().encode("utf-8-sig")


def questions_xlsx(questions: list[dict[str, Any]]) -> bytes:
    rows = [flatten_question_for_export(question) for question in questions]
    columns = ordered_export_columns(rows)
    table_rows = [columns] + [[row.get(column, "") for column in columns] for row in rows]
    sheet_rows = []
    for row_index, row in enumerate(table_rows, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            cell_ref = f"{xlsx_column_name(column_index)}{row_index}"
            text = escape_xml("" if value is None else str(escape_csv_formula(value)))
            cells.append(f'<c r="{cell_ref}" t="inlineStr"><is><t>{text}</t></is></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    worksheet = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
    workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="questions" sheetId="1" r:id="rId1"/></sheets></workbook>'
    rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    workbook_rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
    content_types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
    return buffer.getvalue()


def flatten_question_for_export(question: dict[str, Any]) -> dict[str, Any]:
    row = {
        "question_id": question["question_id"],
        "row_index": question["row_index"],
        "status": question["status"],
        "assigned_to": question.get("assigned_to") or "",
        "created_at": question.get("created_at") or "",
        "updated_at": question.get("updated_at") or "",
    }
    for key, value in (question.get("content") or {}).items():
        row[f"content.{key}"] = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
    return row


def ordered_export_columns(rows: list[dict[str, Any]]) -> list[str]:
    columns = ["question_id", "row_index", "status", "assigned_to", "created_at", "updated_at"]
    for row in rows:
        for key in row.keys():
            if key not in columns:
                columns.append(key)
    return columns


def escape_csv_formula_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: escape_csv_formula(value) for key, value in row.items()}


def flatten_task_for_export(task: dict[str, Any]) -> dict[str, Any]:
    stats = task.get("stats") or {}
    reward_rule = task.get("reward_rule") or {}
    return {
        "task_id": task.get("task_id", ""),
        "title": task.get("title", ""),
        "status": task.get("status", ""),
        "category": task.get("category", ""),
        "difficulty": task.get("difficulty", ""),
        "owner_id": task.get("owner_id", ""),
        "template_id": task.get("template_id", ""),
        "template_version_id": task.get("template_version_id", ""),
        "dataset_id": task.get("dataset_id", ""),
        "question_total": stats.get("total", task.get("quota", 0)),
        "claimed": stats.get("claimed", 0),
        "submitted": stats.get("submitted", 0),
        "approved": stats.get("approved", 0),
        "rejected": stats.get("rejected", 0),
        "reviewer_ids": ",".join(task.get("reviewer_ids") or []),
        "ai_enabled": bool((task.get("ai_config") or {}).get("enabled")),
        "distribution": task.get("distribution", ""),
        "reward_mode": reward_rule.get("mode", ""),
        "points_per_item": reward_rule.get("points_per_item", ""),
        "total_points": reward_rule.get("total_points", ""),
        "deadline": task.get("deadline") or "",
        "tags": ",".join(task.get("tags") or []),
        "created_at": task.get("created_at") or "",
        "updated_at": task.get("updated_at") or "",
    }


def task_export_columns(rows: list[dict[str, Any]]) -> list[str]:
    return [
        "task_id",
        "title",
        "status",
        "category",
        "difficulty",
        "owner_id",
        "template_id",
        "template_version_id",
        "dataset_id",
        "question_total",
        "claimed",
        "submitted",
        "approved",
        "rejected",
        "reviewer_ids",
        "ai_enabled",
        "distribution",
        "reward_mode",
        "points_per_item",
        "total_points",
        "deadline",
        "tags",
        "created_at",
        "updated_at",
    ]


def xlsx_column_name(index: int) -> str:
    name = ""
    current = index
    while current:
        current, remainder = divmod(current - 1, 26)
        name = chr(65 + remainder) + name
    return name or "A"


def escape_xml(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def get_task_model(db: MongoDatabase, team_id: str, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if not task or task.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "任务不存在")
    return task


def get_question_model(db: MongoDatabase, team_id: str, task_id: str, question_id: str) -> Question:
    question = db.get(Question, question_id)
    if not question or question.team_id != team_id or question.task_id != task_id:
        raise AppError(ErrorCode.NOT_FOUND, "题目不存在")
    return question


def task_question_query(task: Task, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    query: dict[str, Any] = {"team_id": task.team_id, "task_id": task.id}
    if extra:
        query.update(extra)
    return query


def ensure_draft_question_mutation(task: Task) -> None:
    if task.status != "draft":
        raise AppError(ErrorCode.STATE_CONFLICT, "只有草稿任务可以修改题目，已发布任务不能破坏领取和提交关系")


def normalize_question_content(item: dict[str, Any], row_number: int) -> dict[str, Any]:
    content = item.get("content") if isinstance(item.get("content"), dict) else item
    if not isinstance(content, dict) or not content:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "题目内容必须是非空对象", {"row": row_number})
    return content


def apply_question_import_mapping(row: dict[str, Any], column_mapping: dict[str, str] | None) -> dict[str, Any]:
    if not column_mapping:
        return dict(row)
    return {target: row.get(source) for target, source in column_mapping.items()}


def append_task_questions(db: MongoDatabase, task: Task, contents: list[dict[str, Any]], *, dataset_id: str) -> list[Question]:
    existing = db.find(Question, task_question_query(task), sort=[("row_index", -1)])
    start_index = existing[0].row_index + 1 if existing else 0
    created: list[Question] = []
    for offset, content in enumerate(contents):
        question = Question(team_id=task.team_id, task_id=task.id, dataset_id=dataset_id, row_index=start_index + offset, content=content)
        db.add(question)
        created.append(question)
    return created


def normalize_question_order(db: MongoDatabase, task: Task) -> None:
    for index, question in enumerate(db.find(Question, task_question_query(task), sort=[("row_index", 1)])):
        if question.row_index != index:
            question.row_index = index
            question.updated_at = now_utc().replace(tzinfo=None)
            db.save(question)


def sync_task_question_stats(db: MongoDatabase, task: Task) -> None:
    questions = db.find(Question, task_question_query(task))
    status_counts: dict[str, int] = {}
    for question in questions:
        status_counts[question.status] = status_counts.get(question.status, 0) + 1
    task.stats = {
        **(task.stats or {}),
        "total": len(questions),
        "claimed": status_counts.get("claimed", 0),
        "submitted": status_counts.get("submitted", 0),
        "approved": status_counts.get("approved", 0),
        "rejected": status_counts.get("rejected", 0),
        "pending": status_counts.get("pending", 0),
    }
    if task.status == "draft":
        task.quota = len(questions)
    task.updated_at = now_utc().replace(tzinfo=None)
    db.save(task)


def validate_task_update_refs(db: MongoDatabase, team_id: str, task: Task, changes: dict) -> None:
    template_id = changes.get("template_id", task.template_id)
    dataset_id = changes.get("dataset_id", task.dataset_id)
    column_mapping = changes.get("column_mapping", task.column_mapping)
    mapping_config = changes.get("mapping_config", getattr(task, "mapping_config", {}) or {})
    component_bindings = changes.get("component_bindings", getattr(task, "component_bindings", {}) or {})
    if template_id:
        template = db.get(AnnotationTemplate, template_id)
        if not template or template.team_id != team_id:
            raise AppError(ErrorCode.NOT_FOUND, "模板不存在")
        published_version = get_latest_published_template_version(db, template.id)
        if not published_version:
            raise AppError(ErrorCode.STATE_CONFLICT, "发布任务前必须先发布模板")
        if changes.get("template_id"):
            task.template_version_id = f"{template.id}:v{published_version.version}"
    if dataset_id:
        dataset = db.get(Dataset, dataset_id)
        if not dataset or dataset.team_id != team_id:
            raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
        validate_task_mappings(dataset, column_mapping or {}, mapping_config or {}, component_bindings or {})


def rebuild_task_questions(db: MongoDatabase, task: Task) -> None:
    if not task.dataset_id:
        return
    dataset = db.get(Dataset, task.dataset_id)
    if not dataset:
        raise AppError(ErrorCode.NOT_FOUND, "数据集不存在")
    db.collection(Question.collection_name).delete_many(task_question_query(task))
    for index, row in enumerate(dataset.rows):
        db.add(Question(team_id=task.team_id, task_id=task.id, dataset_id=dataset.id, row_index=index, content=materialize_question_content(row, task.column_mapping, getattr(task, "mapping_config", {}) or {}, dataset, getattr(task, "component_bindings", {}) or {})))
    task.quota = task.quota or dataset.row_count
    task.stats = {"total": dataset.row_count, "claimed": 0, "submitted": 0, "approved": 0, "rejected": 0}


def question_payload(question: Question, *, include_content: bool = True, db: MongoDatabase | None = None) -> dict:
    return {
        "question_id": question.id,
        "team_id": question.team_id,
        "task_id": question.task_id,
        "dataset_id": question.dataset_id,
        "row_index": question.row_index,
        "content": question.content if include_content else {},
        "status": question.status,
        "assigned_to": question.assigned_to,
        "assigned_to_name": user_display_name(db, question.assigned_to) if db and question.assigned_to else None,
        "claim_due_at": question.claim_due_at.isoformat() if question.claim_due_at else None,
        "created_at": question.created_at.isoformat() if question.created_at else None,
        "updated_at": question.updated_at.isoformat() if question.updated_at else None,
    }


def get_assigned_task(db: MongoDatabase, code: str, user_id: str) -> dict:
    task = db.find_one(Task, {"assignment.code": code})
    if not task or not task.assignment.get("enabled") or task.status != "published":
        raise AppError(ErrorCode.NOT_FOUND, "指派链接不存在")
    expire_at = task.assignment.get("expire_at")
    if expire_at:
        expires = datetime.fromisoformat(str(expire_at).replace("Z", "+00:00"))
        if expires < now_utc().astimezone(UTC):
            raise AppError(ErrorCode.STATE_CONFLICT, "指派链接已过期")
    payload = task_payload(task, db=db)
    payload["assigned_to_user_id"] = user_id
    payload["login_required"] = True
    return payload


def normalize_claim_config(claim_config: dict, ai_config: dict | None = None) -> dict:
    normalized = dict(claim_config or {})
    ai_config = ai_config or {}
    raw_percent = normalized.get("labeling_ai_assist_percent")
    if raw_percent is None:
        raw_percent = ai_config.get("labeler_assist_ratio")
    try:
        percent = int(raw_percent if raw_percent is not None else 5)
    except (TypeError, ValueError):
        percent = 5
    normalized["labeling_ai_assist_percent"] = max(0, min(percent, 100))
    return normalized


def internal_labeler_ids_from_assignment(assignment: dict | None) -> list[str]:
    raw_ids = (assignment or {}).get("target_labeler_ids")
    if not isinstance(raw_ids, list):
        return []
    return [str(item) for item in raw_ids if str(item).strip()]


def internal_labeler_allocations_from_assignment(assignment: dict | None) -> list[dict[str, int | None | str]]:
    raw_allocations = (assignment or {}).get("target_labeler_allocations")
    if not isinstance(raw_allocations, list):
        return []
    normalized: list[dict[str, int | None | str]] = []
    for item in raw_allocations:
        if not isinstance(item, dict):
            continue
        labeler_id = str(item.get("labeler_id") or "").strip()
        if not labeler_id:
            continue
        quota = item.get("quota")
        normalized.append({"labeler_id": labeler_id, "quota": int(quota) if quota is not None else None})
    return normalized


def normalize_task_assignment_payload(db: MongoDatabase, *, team_id: str, assignment: dict | None, distribution: str) -> dict:
    normalized = dict(assignment or {})
    if distribution == "quota_grab":
        target_labeler_ids = normalize_internal_labeler_ids(db, team_id, normalized.get("target_labeler_ids") or [])
        normalized["target_labeler_ids"] = target_labeler_ids
        normalized["target_labeler_allocations"] = normalize_internal_labeler_allocations(
            target_labeler_ids,
            normalized.get("target_labeler_allocations") or [],
        )
        normalized["enabled"] = False
    else:
        normalized["target_labeler_ids"] = []
        normalized["target_labeler_allocations"] = []
    return normalized


def normalize_internal_labeler_ids(db: MongoDatabase, team_id: str, raw_ids: list[Any]) -> list[str]:
    deduped = [str(item).strip() for item in dict.fromkeys(raw_ids) if str(item).strip()]
    if not deduped:
        return []
    valid_members = db.find(TeamMember, {"team_id": team_id, "user_id": {"$in": deduped}, "status": "active"})
    valid_ids = {
        member.user_id
        for member in valid_members
        if role_value(member.team_role) == TeamRole.LABELER.value and not member.is_system_member
    }
    invalid_ids = [user_id for user_id in deduped if user_id not in valid_ids]
    if invalid_ids:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "企业内流转只能指定当前企业 active Labeler", {"target_labeler_ids": invalid_ids})
    return deduped


def normalize_internal_labeler_allocations(target_labeler_ids: list[str], raw_allocations: list[Any]) -> list[dict[str, int | None | str]]:
    if not target_labeler_ids:
        return []
    selected_ids = set(target_labeler_ids)
    allocation_map: dict[str, int | None] = {}
    for item in raw_allocations:
        if not isinstance(item, dict):
            continue
        labeler_id = str(item.get("labeler_id") or "").strip()
        if not labeler_id:
            continue
        if labeler_id not in selected_ids:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "任务分配比例只能包含已选择的企业 Labeler", {"target_labeler_allocations": [labeler_id]})
        quota = item.get("quota")
        if quota is None:
            allocation_map[labeler_id] = None
            continue
        try:
            normalized_quota = int(quota)
        except (TypeError, ValueError):
            raise AppError(ErrorCode.VALIDATION_FORMAT, "任务分配比例必须是 0-100 的整数")
        if normalized_quota < 0 or normalized_quota > 100:
            raise AppError(ErrorCode.VALIDATION_FORMAT, "任务分配比例必须是 0-100 的整数")
        allocation_map[labeler_id] = normalized_quota
    if len(target_labeler_ids) == 1:
        return [{"labeler_id": target_labeler_ids[0], "quota": allocation_map.get(target_labeler_ids[0], 100) or 100}]
    if not allocation_map:
        even_shares = distribute_percent_evenly(len(target_labeler_ids))
        return [{"labeler_id": labeler_id, "quota": even_shares[index]} for index, labeler_id in enumerate(target_labeler_ids)]
    missing_ids = [labeler_id for labeler_id in target_labeler_ids if labeler_id not in allocation_map or allocation_map[labeler_id] is None]
    if missing_ids:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "多位 Labeler 的任务分配比例必须覆盖每一位已选 Labeler", {"target_labeler_allocations": missing_ids})
    total_quota = sum(int(allocation_map[labeler_id] or 0) for labeler_id in target_labeler_ids)
    if total_quota != 100:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "多位 Labeler 的任务分配比例需要合计 100%", {"target_labeler_allocations_total": total_quota})
    return [{"labeler_id": labeler_id, "quota": int(allocation_map[labeler_id] or 0)} for labeler_id in target_labeler_ids]


def distribute_percent_evenly(count: int) -> list[int]:
    if count <= 0:
        return []
    base = 100 // count
    remainder = 100 % count
    return [base + (1 if index < remainder else 0) for index in range(count)]


def build_assignment(assignment: dict, distribution: str) -> dict:
    target_labeler_ids = internal_labeler_ids_from_assignment(assignment)
    target_labeler_allocations = internal_labeler_allocations_from_assignment(assignment)
    if distribution == "quota_grab":
        return {"enabled": False, "target_labeler_ids": target_labeler_ids, "target_labeler_allocations": target_labeler_allocations}
    if not bool((assignment or {}).get("enabled")) and distribution != "assigned_link":
        return {"enabled": False, "target_labeler_ids": [], "target_labeler_allocations": []}
    raw_code = assignment.get("code") or generate_token_urlsafe(18)
    try:
        expire_hours = int(assignment.get("expire_hours") or 72)
    except (TypeError, ValueError):
        expire_hours = 72
    expire_hours = max(1, min(expire_hours, 720))
    expire_at = assignment.get("expire_at")
    if not expire_at:
        expire_at = (now_utc() + timedelta(hours=expire_hours)).isoformat()
    url = assignment.get("url") or f"/tasks/assigned/{raw_code}"
    return {"enabled": True, "code": raw_code, "url": url, "qr_text": assignment.get("qr_text") or url, "expire_at": expire_at, "expire_hours": expire_hours, "target_labeler_ids": [], "target_labeler_allocations": []}


def task_mapping_invalid_columns(dataset: Dataset, column_mapping: dict[str, str | None], mapping_config: dict[str, Any] | None = None, component_bindings: dict[str, Any] | None = None) -> list[str]:
    allowed_columns = dataset_mapping_column_names(dataset)
    media_schema_fields = dataset_media_binding_fields(dataset)
    media_column_fields = {
        str(column.get("name"))
        for column in dataset.columns
        if (
            isinstance(column, dict)
            and column.get("use_in_mapping") is not False
            and str(column.get("data_type") or "").lower() in {"image", "audio", "video", "media_list"}
        )
    }
    binding_keys = set((mapping_config or {}).keys())
    invalid_mapping = [
        value
        for key, value in (column_mapping or {}).items()
        if value and key not in binding_keys and value not in allowed_columns
    ]
    invalid_binding_fields: list[str] = []
    for binding in (mapping_config or {}).values():
        for item in iter_mapping_bindings(binding):
            source_type = item.get("source_type")
            field = item.get("field") or item.get("column_name")
            if source_type == "column" and field and field not in allowed_columns:
                invalid_binding_fields.append(str(field))
            if source_type == "media" and field and field not in media_schema_fields and field not in media_column_fields:
                invalid_binding_fields.append(str(field))
    for binding in iter_component_bindings(component_bindings):
        source_type = binding.get("source_type")
        field = binding.get("field") or binding.get("column_name")
        if source_type == "column" and field and field not in allowed_columns:
            invalid_binding_fields.append(str(field))
        if source_type == "media" and field and field not in media_schema_fields and field not in media_column_fields:
            invalid_binding_fields.append(str(field))
    return sorted(set(invalid_mapping + invalid_binding_fields))


def validate_task_mappings(dataset: Dataset, column_mapping: dict[str, str | None], mapping_config: dict[str, Any] | None = None, component_bindings: dict[str, Any] | None = None) -> None:
    invalid_columns = task_mapping_invalid_columns(dataset, column_mapping, mapping_config, component_bindings)
    if invalid_columns:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "列映射包含数据集中不存在的字段", {"columns": invalid_columns})


def dataset_mapping_column_names(dataset: Dataset) -> set[str]:
    media_schema_fields = dataset_media_schema_fields(dataset)
    return {
        str(column.get("name"))
        for column in dataset.columns
        if (
            isinstance(column, dict)
            and column.get("name")
            and column.get("use_in_mapping") is not False
            and str(column.get("name")) not in SYSTEM_DATASET_CONTEXT_FIELDS
            and str(column.get("name")) not in media_schema_fields
        )
    }


def dataset_media_schema_fields(dataset: Dataset) -> set[str]:
    return {
        str(item.get("field"))
        for item in getattr(dataset, "media_schema", []) or []
        if (
            isinstance(item, dict)
            and item.get("field")
            and str(item.get("type") or item.get("media_type") or "").lower() in {"image", "audio", "video"}
        )
    }


def dataset_media_binding_fields(dataset: Dataset) -> set[str]:
    disabled_columns = {
        str(column.get("name"))
        for column in dataset.columns
        if isinstance(column, dict) and column.get("name") and column.get("use_in_mapping") is False
    }
    schema_fields = {
        str(item.get("field"))
        for item in getattr(dataset, "media_schema", []) or []
        if isinstance(item, dict) and item.get("field") and str(item.get("field")) not in disabled_columns
    }
    media_columns = {
        str(column.get("name"))
        for column in dataset.columns
        if (
            isinstance(column, dict)
            and column.get("name")
            and column.get("use_in_mapping") is not False
            and str(column.get("data_type") or "").lower() in {"image", "audio", "video", "media_list"}
        )
    }
    return schema_fields | media_columns


def materialize_question_content(row: dict, column_mapping: dict[str, str | None], mapping_config: dict[str, Any] | None = None, dataset: Dataset | None = None, component_bindings: dict[str, Any] | None = None) -> dict:
    allowed_columns = dataset_mapping_column_names(dataset) if dataset is not None else None
    if dataset is None:
        content = dict(row)
    else:
        content = {
            key: value
            for key, value in row.items()
            if key in allowed_columns or key in {"row_id", "external_id"}
        }
    for show_item_id, column_name in column_mapping.items():
        if column_name and (allowed_columns is None or column_name in allowed_columns):
            content[show_item_id] = row.get(column_name)
    bindings = mapping_config or {}
    component_runtime_bindings = iter_component_bindings(component_bindings)
    if bindings or component_runtime_bindings:
        resolved_media = list(row.get("media") if dataset is None and isinstance(row.get("media"), list) else [])
        resolved_attachments = list(row.get("attachments") if dataset is None and isinstance(row.get("attachments"), list) else [])
        derived_context = dict(row.get("derived_context") if dataset is None and isinstance(row.get("derived_context"), dict) else {})
        for show_item_id, binding in bindings.items():
            if not isinstance(binding, dict):
                continue
            display_items = materialize_show_item_display_items(row, binding)
            if display_items:
                content[show_item_id] = display_items
            else:
                resolved = resolve_binding_value(row, binding)
                if resolved is not None:
                    content[show_item_id] = resolved
            for display_binding in iter_mapping_bindings(binding):
                if display_binding.get("source_type") == "media":
                    media_ref = resolve_media_binding(row, display_binding)
                    if media_ref and media_ref not in resolved_media:
                        resolved_media.append(media_ref)
                if display_binding.get("source_type") == "derived_context":
                    key = str(display_binding.get("key") or display_binding.get("field") or "")
                    if key and key in (row.get("derived_context") or {}):
                        derived_context[key] = (row.get("derived_context") or {}).get(key)
        for component_binding in component_runtime_bindings:
            if component_binding.get("source_type") == "media":
                media_ref = resolve_media_binding(row, component_binding)
                if media_ref and media_ref not in resolved_media:
                    resolved_media.append(media_ref)
            if component_binding.get("source_type") == "derived_context":
                key = str(component_binding.get("key") or component_binding.get("field") or "")
                if key and key in (row.get("derived_context") or {}):
                    derived_context[key] = (row.get("derived_context") or {}).get(key)
        content["media"] = resolved_media
        content["attachments"] = resolved_attachments
        content["derived_context"] = derived_context
        if bindings:
            content["_bindings"] = bindings
    return content


def iter_component_bindings(component_bindings: Any) -> list[dict]:
    if not isinstance(component_bindings, dict):
        return []
    bindings: list[dict] = []
    for component_value in component_bindings.values():
        if isinstance(component_value, dict) and isinstance(component_value.get("source_type"), str):
            bindings.append(component_value)
            continue
        if not isinstance(component_value, dict):
            continue
        for binding in component_value.values():
            if isinstance(binding, dict) and isinstance(binding.get("source_type"), str):
                bindings.append(binding)
    return bindings


def iter_mapping_bindings(binding: Any) -> list[dict]:
    if not isinstance(binding, dict):
        return []
    display_fields = binding.get("display_fields")
    if isinstance(display_fields, list):
        children = []
        for item in display_fields:
            if not isinstance(item, dict):
                continue
            child = item.get("binding")
            if isinstance(child, dict):
                children.append(child)
                continue
            source_field = item.get("field") or item.get("column") or item.get("key")
            if source_field:
                children.append({"source_type": "column", "column_name": str(source_field), "field": str(source_field)})
        if children:
            return children
    return [binding]


def materialize_show_item_display_items(row: dict, binding: dict) -> list[dict]:
    display_fields = binding.get("display_fields")
    if not isinstance(display_fields, list) or not display_fields:
        return []
    items: list[dict] = []
    for index, item in enumerate(display_fields):
        if not isinstance(item, dict):
            continue
        child_binding = item.get("binding")
        if not isinstance(child_binding, dict):
            field = item.get("field") or item.get("column") or item.get("key")
            child_binding = {"source_type": "column", "column_name": str(field), "field": str(field)} if field else {}
        if not child_binding:
            continue
        value = resolve_media_binding(row, child_binding) if child_binding.get("source_type") == "media" else resolve_binding_value(row, child_binding)
        if value is None:
            continue
        key = str(item.get("field") or child_binding.get("field") or child_binding.get("column_name") or child_binding.get("key") or f"field_{index + 1}")
        items.append({
            "field": key,
            "label": str(item.get("label") or child_binding.get("column_name") or child_binding.get("field") or child_binding.get("key") or key),
            "binding": child_binding,
            "value": value,
        })
    return items


def resolve_binding_value(row: dict, binding: dict) -> Any:
    source_type = binding.get("source_type")
    if source_type == "column":
        column_name = binding.get("column_name") or binding.get("field")
        return row.get(str(column_name)) if column_name else None
    if source_type == "media":
        media_ref = resolve_media_binding(row, binding)
        if media_ref:
            return media_ref.get("url") or media_ref.get("file_id") or media_ref
        field = binding.get("field")
        return row.get(str(field)) if field else None
    if source_type == "derived_context":
        context = row.get("derived_context") if isinstance(row.get("derived_context"), dict) else {}
        key = binding.get("key") or binding.get("field")
        return context.get(str(key)) if key else None
    if source_type == "attachment":
        attachments = row.get("attachments") if isinstance(row.get("attachments"), list) else []
        key = binding.get("key") or binding.get("field")
        for attachment in attachments:
            if isinstance(attachment, dict) and (not key or attachment.get("name") == key or attachment.get("field") == key):
                return attachment
    return None


def resolve_media_binding(row: dict, binding: dict) -> dict | None:
    media_items = row.get("media") if isinstance(row.get("media"), list) else []
    for item in media_items:
        if not isinstance(item, dict):
            continue
        if binding.get("media_type") and item.get("type") != binding.get("media_type"):
            continue
        if binding.get("role") and item.get("role") != binding.get("role"):
            continue
        if binding.get("field") and item.get("field") != binding.get("field"):
            continue
        return item
    return None


def user_display_name(db: MongoDatabase, user_id: str | None) -> str | None:
    if not user_id:
        return None
    profile = db.find_one(UserProfile, {"user_id": user_id})
    user = db.get(User, user_id)
    return (
        (profile.real_name if profile else None)
        or (profile.display_name if profile else None)
        or (user.username if user else None)
        or (user.email if user else None)
    )


def task_reviewer_payloads(db: MongoDatabase | None, reviewer_ids: list[str]) -> list[dict]:
    reviewers: list[dict] = []
    for reviewer_id in reviewer_ids:
        user = db.get(User, reviewer_id) if db else None
        reviewers.append(
            {
                "user_id": reviewer_id,
                "display_name": (user_display_name(db, reviewer_id) if db else None) or reviewer_id,
                "email": getattr(user, "email", None),
            }
        )
    return reviewers


def task_payload(task: Task, *, db: MongoDatabase | None = None) -> dict:
    ai_config = dict(task.ai_config or {})
    ai_config.setdefault("provider_id", None)
    ai_config.setdefault("input_prompt", None)
    reviewer_payloads = task_reviewer_payloads(db, task.reviewer_ids or [])
    return {
        "task_id": task.id,
        "team_id": task.team_id,
        "owner_id": task.owner_id,
        "owner_name": user_display_name(db, task.owner_id) if db else None,
        "title": task.title,
        "description": task.description,
        "rich_content": task.rich_content,
        "tags": task.tags,
        "status": task.status,
        "auto_saved": task.auto_saved,
        "category": task.category,
        "difficulty": task.difficulty,
        "deadline": task.deadline,
        "quota": task.quota,
        "distribution": task.distribution,
        "reward_rule": task.reward_rule,
        "reviewer_ids": task.reviewer_ids,
        "reviewer_names": [item["display_name"] for item in reviewer_payloads],
        "reviewers": reviewer_payloads,
        "review_config": getattr(task, "review_config", {}) or {},
        "ai_config": ai_config,
        "qualification_rules": task.qualification_rules,
        "required_certs": task.required_certs,
        "agreement_config": getattr(task, "agreement_config", {}) or {},
        "claim_config": getattr(task, "claim_config", {}) or {},
        "template_id": task.template_id,
        "template_version_id": task.template_version_id,
        "dataset_id": task.dataset_id,
        "column_mapping": task.column_mapping,
        "mapping_config": getattr(task, "mapping_config", {}) or {},
        "component_bindings": getattr(task, "component_bindings", {}) or {},
        "assignment": task.assignment,
        "stats": task.stats,
        "delete_eligibility": task_delete_eligibility(db, task) if db else None,
        "published_at": task.published_at.isoformat() if task.published_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def pagination(total: int) -> dict:
    return {"page": 1, "page_size": max(total, 1), "total": total, "total_pages": 1}


def copy_name(name: str) -> str:
    suffix = " 副本"
    if name.endswith(suffix):
        return f"{name} 2"
    return f"{name}{suffix}"[:100]
