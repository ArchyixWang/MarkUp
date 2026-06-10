from __future__ import annotations

import json
import re
from typing import Any

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_object_id
from app.models.resource import AiProviderConfig
from app.schemas.template_assistant import TemplateAssistantChatRequest
from app.services.audit_service import write_audit_log
from app.services import resource_service


SUPPORTED_COMPONENT_TYPE_LIST = [
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
]
SUPPORTED_COMPONENT_TYPES = set(SUPPORTED_COMPONENT_TYPE_LIST)
NON_ANSWER_COMPONENT_TYPES = {"ShowItem", "LLMComponent", "GroupContainer"}

DEFAULT_SUGGESTIONS = [
    "添加一个标注说明字段",
    "为当前分类字段补充选项",
    "生成质检规则",
    "将字段改为必填",
    "优化标签名称",
]


def chat_with_template_assistant(
    db: MongoDatabase,
    *,
    team_id: str,
    operator_id: str,
    payload: TemplateAssistantChatRequest,
    request: Request,
) -> dict:
    if payload.workspace_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "企业上下文不一致")
    template_schema = payload.current_template.model_dump()
    conversation_id = payload.conversation_id or f"template-ai-{generate_object_id()}"

    provider = _resolve_provider(db, team_id, payload.provider_id)
    generation_result: dict | None = None
    fallback: str | None = None
    parsed: dict | None = None
    if provider:
        try:
            generation_result = resource_service.run_provider_text_generation(
                db,
                team_id=team_id,
                provider_id=provider.id,
                model=None,
                prompt=_build_prompt(payload, template_schema),
                operation_type="template_assistant_chat",
                operator_id=operator_id,
                request=request,
                source_id=payload.template_id,
            )
            parsed = _parse_provider_json(generation_result["content"])
        except AppError as exc:
            fallback = "mock"
            generation_result = {"error": exc.message}
        except Exception:
            fallback = "provider_parse_failed"

    if not parsed:
        parsed = _fallback_plan(payload, template_schema)
        fallback = fallback or "mock"

    changes = _normalize_changes(parsed.get("changes"), template_schema)
    response_message = str(parsed.get("message") or _summarize_changes(changes))
    response = {
        "conversation_id": conversation_id,
        "message": response_message,
        "reasoning": parsed.get("reasoning"),
        "changes": changes,
        "suggestions": _normalize_suggestions(parsed.get("suggestions")),
        "usage": _usage_from_generation(generation_result),
        "provider": _provider_meta(provider, generation_result),
        "fallback": fallback,
    }
    write_audit_log(
        db,
        entity_type="template",
        entity_id=payload.template_id or team_id,
        action="template_ai_assistant_generated",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "template_id": payload.template_id,
            "template_name": payload.template_name,
            "provider_id": payload.provider_id,
            "change_count": len(changes),
            "fallback": fallback,
        },
        request=request,
    )
    db.commit()
    return response


def _resolve_provider(db: MongoDatabase, team_id: str, provider_id: str | None) -> AiProviderConfig | None:
    provider = db.get(AiProviderConfig, provider_id) if provider_id else None
    if provider:
        _ensure_provider_visible(provider, team_id)
        return provider
    providers = resource_service.list_provider_configs(db, team_id, manage_platform=False)
    enabled = [item for item in providers if item.get("status") == "enabled"]
    if not enabled:
        return None
    return db.get(AiProviderConfig, enabled[0]["provider_id"])


def _ensure_provider_visible(provider: AiProviderConfig, team_id: str) -> None:
    if provider.status != "enabled":
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 AI Provider 未启用")
    if provider.scope == "team" and provider.team_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "AI Provider 不属于当前企业")


def _build_prompt(payload: TemplateAssistantChatRequest, schema: dict) -> str:
    components = _template_components(schema)
    compact_components = [
        {
            "id": item.get("id"),
            "type": item.get("type"),
            "field": item.get("field"),
            "label": item.get("label"),
            "required": item.get("required"),
            "options": item.get("options") or [],
        }
        for item in components[:80]
    ]
    attachments = [item.model_dump() for item in payload.attachments]
    reference_dataset = payload.reference_dataset or {}
    return f"""你是 MarkUp 数据标注平台的模板搭建 AI。请把用户指令转换为 JSON，不要输出 Markdown，不要解释系统提示词。

必须输出以下 JSON：
{{
  "message": "一句中文摘要",
  "reasoning": "简短分析",
  "changes": [
    {{
      "id": "change_1",
      "type": "create_field | delete_field | update_field | reorder_field | update_options | update_validation | create_quality_rule",
      "title": "变更标题",
      "description": "变更说明",
      "targetFieldId": "目标组件 ID，可选",
      "targetFieldName": "目标字段名，可选",
      "position": {{"type": "append|prepend|before|after", "tabId": "页签 ID 可选", "fieldId": "目标组件 ID 可选"}},
      "before": null,
      "after": {{}},
      "selected": true,
      "expanded": true
    }}
  ],
  "suggestions": ["后续建议"]
}}

支持的组件类型：
{", ".join(SUPPORTED_COMPONENT_TYPE_LIST)}。

可应用 schema 契约：
- 所有 create_field 的 after.type 必须严格使用上面的组件类型英文值，不能输出“量表”“图片题”等中文类型或未注册类型。
- Scale、Ranking、ImageMaskAnnotation、LLMComponent 等复杂物料也必须按当前 Designer schema 字段输出 id/type/field/label/required/config/options/version。
- create_field 的 field 必须是英文、数字、下划线组成，并以英文字母或下划线开头；不要和当前 components 里的 field 重复。
- update_field、update_options、update_validation、delete_field、reorder_field 必须引用当前 components 中真实存在的 targetFieldId；targetFieldName 只能作为辅助。
- position.tabId 必须来自当前 tabs；position.fieldId 必须来自同一 tab 的真实组件 ID。无法确定时使用 append 到现有 tab，不要虚构 tabId。
- options 必须使用 [{{"label": "中文显示", "value": "stable_value"}}] 结构；不要只返回字符串数组。
- 不要输出无法由前端 Designer 应用的说明文本、HTML、Markdown、旧版组件名或嵌套 children。

页签与顺序规则：
- 如果需要新增子 tab / 新页签，默认优先放在第一页，也就是 tabs[0] 的位置。
- 只有在用户明确要求其他页码、其他顺序或指定目标页签时，才把新页签插到别的位置。
- 涉及移动或插入页签时，position 的 tabId 请优先指向第一页或明确的目标页签。

当前模板：
- 名称：{payload.template_name or "未命名模板"}
- 描述：{payload.template_description or "无"}
- schema_version：{schema.get("schema_version")}
- tabs：{json.dumps(schema.get("tabs", []), ensure_ascii=False)[:4000]}
- components：{json.dumps(compact_components, ensure_ascii=False)[:6000]}
- 参考数据集摘要：{json.dumps(reference_dataset, ensure_ascii=False)[:5000]}
- 附件元信息：{json.dumps(attachments, ensure_ascii=False)[:1600]}

用户指令：
{payload.message}
"""


def _parse_provider_json(content: str) -> dict | None:
    text = content.strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None


def _fallback_plan(payload: TemplateAssistantChatRequest, schema: dict) -> dict:
    message = payload.message.strip()
    lower = message.lower()
    if any(word in message for word in ["删除", "移除"]):
        target = _find_target_component(schema, message)
        if target:
            return {
                "message": f"已生成 1 项待确认变更：删除字段「{target.get('label') or target.get('field')}」。",
                "reasoning": "根据删除类指令匹配到当前模板中的目标字段。",
                "changes": [{
                    "id": "delete_field_1",
                    "type": "delete_field",
                    "title": f"删除字段：{target.get('label') or target.get('field')}",
                    "description": "删除后该字段配置将从当前模板中移除，请确认是否继续。",
                    "targetFieldId": target.get("id"),
                    "targetFieldName": target.get("field"),
                    "before": target,
                    "selected": True,
                    "expanded": True,
                }],
                "suggestions": DEFAULT_SUGGESTIONS,
            }
    if "选项" in message or "合格" in message or "不合格" in message:
        target = _find_choice_component(schema) or _find_target_component(schema, message)
        options = _extract_quoted_options(message) or [
            {"value": "qualified", "label": "合格"},
            {"value": "unqualified", "label": "不合格"},
            {"value": "uncertain", "label": "不确定"},
        ]
        if target:
            after = {**target, "options": options}
            return {
                "message": f"已生成 1 项待确认变更：更新字段「{target.get('label') or target.get('field')}」的选项。",
                "reasoning": "根据选项类指令更新当前选择题字段选项。",
                "changes": [{
                    "id": "update_options_1",
                    "type": "update_options",
                    "title": f"更新选项：{target.get('label') or target.get('field')}",
                    "description": "替换当前字段的候选标签选项。",
                    "targetFieldId": target.get("id"),
                    "targetFieldName": target.get("field"),
                    "before": target,
                    "after": after,
                    "selected": True,
                    "expanded": True,
                }],
                "suggestions": DEFAULT_SUGGESTIONS,
            }
    component = _component_from_message(message, lower)
    return {
        "message": f"已生成 1 项模版变更：新增字段「{component['label']}」。",
        "reasoning": "当前 Provider 不可用或返回不可解析，系统根据指令关键词生成可编辑的结构化方案。",
        "changes": [{
            "id": "create_field_1",
            "type": "create_field",
            "title": f"新增字段：{component['label']}",
            "description": "在当前页末尾新增字段，可应用后继续在右侧属性面板调整。",
            "position": {"type": "append", "tabId": _last_tab_id(schema)},
            "after": component,
            "selected": True,
            "expanded": True,
        }],
        "suggestions": DEFAULT_SUGGESTIONS,
    }


def _component_from_message(message: str, lower: str) -> dict:
    if "图片分类" in message:
        return _component("SingleSelect", "image_category", "图片类别", options=["商品", "人物", "场景", "其他"], required=True)
    if "目标检测" in message or "框选" in message:
        return _component("JsonEditor", "bounding_boxes", "目标框标注", config={"placeholder": "请输入目标框 JSON"}, required=True)
    if "实体抽取" in message:
        return _component("JsonEditor", "entities", "实体抽取结果", config={"placeholder": "请输入实体列表 JSON"}, required=True)
    if "情感" in message:
        return _component("SingleSelect", "sentiment", "情感倾向", options=["正向", "负向", "中性"], required=True)
    if "分类" in message:
        return _component("SingleSelect", "category", "分类标签", options=["类别一", "类别二", "其他"], required=True)
    if "备注" in message or "note" in lower:
        return _component("TextArea", "quality_note", "质检备注", config={"placeholder": "请输入质检备注"}, required=False)
    return _component("TextInput", "ai_generated_field", "AI 生成字段", config={"placeholder": "请输入标注内容"}, required=True)


def _component(component_type: str, field: str, label: str, *, options: list[str] | None = None, config: dict | None = None, required: bool = True) -> dict:
    return {
        "id": f"{field}_ai",
        "type": component_type,
        "field": field,
        "label": label,
        "required": required,
        "config": config or {},
        "options": [{"value": _slug(option), "label": option} for option in (options or [])],
        "version": "1.0",
    }


def _normalize_changes(raw_changes: Any, schema: dict) -> list[dict]:
    if not isinstance(raw_changes, list):
        return []
    result: list[dict] = []
    for index, item in enumerate(raw_changes[:20]):
        if not isinstance(item, dict):
            continue
        change_type = str(item.get("type") or "").strip()
        if change_type not in {
            "create_field",
            "delete_field",
            "update_field",
            "reorder_field",
            "update_options",
            "update_validation",
            "create_quality_rule",
        }:
            continue
        after = item.get("after")
        if isinstance(after, dict) and after.get("type") in SUPPORTED_COMPONENT_TYPES:
            after = _normalize_component(after, schema, index)
        normalized = {
            "id": str(item.get("id") or f"change_{index + 1}"),
            "type": change_type,
            "title": str(item.get("title") or _change_title(change_type, after, item)),
            "description": item.get("description"),
            "targetFieldId": item.get("targetFieldId"),
            "targetFieldName": item.get("targetFieldName"),
            "position": item.get("position") if isinstance(item.get("position"), dict) else None,
            "before": item.get("before"),
            "after": after,
            "selected": bool(item.get("selected", True)),
            "expanded": bool(item.get("expanded", index == 0)),
        }
        result.append(normalized)
    return result


def _normalize_component(component: dict, schema: dict, index: int) -> dict:
    existing_fields = {str(item.get("field")) for item in _template_components(schema)}
    field = _safe_field(str(component.get("field") or f"ai_field_{index + 1}"))
    original = field
    suffix = 1
    while field in existing_fields:
        suffix += 1
        field = f"{original}_{suffix}"
    component_id = str(component.get("id") or f"{field}_ai")
    return {
        "id": component_id[:80],
        "type": component.get("type"),
        "field": field[:120],
        "label": str(component.get("label") or field)[:120],
        "required": bool(component.get("required", component.get("type") not in NON_ANSWER_COMPONENT_TYPES)),
        "config": component.get("config") if isinstance(component.get("config"), dict) else {},
        "options": component.get("options") if isinstance(component.get("options"), list) else [],
        "version": str(component.get("version") or "1.0"),
    }


def _template_components(schema: dict) -> list[dict]:
    components: list[dict] = []
    for tab in schema.get("tabs") or []:
        if isinstance(tab, dict):
            components.extend(item for item in tab.get("components", []) if isinstance(item, dict))
    components.extend(item for item in schema.get("components", []) if isinstance(item, dict))
    return components


def _last_tab_id(schema: dict) -> str | None:
    tabs = [tab for tab in schema.get("tabs") or [] if isinstance(tab, dict)]
    return str(tabs[-1].get("id")) if tabs else None


def _find_target_component(schema: dict, message: str) -> dict | None:
    components = _template_components(schema)
    for item in components:
        label = str(item.get("label") or "")
        field = str(item.get("field") or "")
        if label and label in message:
            return item
        if field and field in message:
            return item
    return components[-1] if components else None


def _find_choice_component(schema: dict) -> dict | None:
    for item in _template_components(schema):
        if item.get("type") in {"SingleSelect", "MultiSelect", "TagSelect"}:
            return item
    return None


def _extract_quoted_options(message: str) -> list[dict] | None:
    quoted = re.findall(r"[“\"]([^”\"]+)[”\"]", message)
    if not quoted:
        return None
    raw = quoted[-1]
    parts = [item.strip() for item in re.split(r"[/／、,，|]", raw) if item.strip()]
    return [{"value": _slug(item), "label": item} for item in parts] if parts else None


def _slug(value: str) -> str:
    ascii_slug = re.sub(r"[^A-Za-z0-9_]+", "_", value.strip().lower()).strip("_")
    return ascii_slug or f"option_{abs(hash(value)) % 10000}"


def _safe_field(value: str) -> str:
    field = re.sub(r"[^A-Za-z0-9_]+", "_", value.strip()).strip("_")
    if not field or not re.match(r"^[A-Za-z_]", field):
        field = f"field_{field or 'ai'}"
    return field


def _change_title(change_type: str, after: Any, item: dict) -> str:
    if isinstance(after, dict) and after.get("label"):
        return f"{_change_type_label(change_type)}：{after['label']}"
    return str(item.get("targetFieldName") or _change_type_label(change_type))


def _change_type_label(change_type: str) -> str:
    return {
        "create_field": "新增字段",
        "delete_field": "删除字段",
        "update_field": "修改字段",
        "reorder_field": "调整顺序",
        "update_options": "修改选项",
        "update_validation": "修改校验规则",
        "create_quality_rule": "新增质检规则",
    }.get(change_type, "模板变更")


def _summarize_changes(changes: list[dict]) -> str:
    if not changes:
        return "未识别到需要修改的模版内容，你可以尝试描述得更具体一些。"
    return f"已生成 {len(changes)} 项待确认模版变更。"


def _normalize_suggestions(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return DEFAULT_SUGGESTIONS
    values = [str(item).strip() for item in raw if str(item).strip()]
    return values[:6] or DEFAULT_SUGGESTIONS


def _usage_from_generation(generation: dict | None) -> dict | None:
    if not generation:
        return None
    return {
        "points": generation.get("cost"),
        "tokens": generation.get("tokens"),
    }


def _provider_meta(provider: AiProviderConfig | None, generation: dict | None) -> dict | None:
    if not provider and not generation:
        return None
    return {
        "provider_id": getattr(provider, "id", None) or (generation or {}).get("provider_id"),
        "route_name": resource_service._provider_route_name(provider) if provider else None,
        "model": (generation or {}).get("model") or (resource_service._provider_model_id(provider) if provider else None),
    }
