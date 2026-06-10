from __future__ import annotations

import json
import re
from typing import Any

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import generate_object_id
from app.models.resource import AiProviderConfig
from app.schemas.task_publish_assistant import TaskPublishAssistantChatRequest
from app.services.audit_service import write_audit_log
from app.services import resource_service


DEFAULT_SUGGESTIONS = [
    "补全任务描述",
    "推荐奖励策略",
    "生成 AI 预审矩阵",
    "检查发布阻塞项",
    "生成用户协议",
]

CHANGE_TYPES = {
    "update_basic_info",
    "update_template_dataset",
    "update_field_mapping",
    "update_distribution",
    "update_reward",
    "update_ai_review",
    "update_human_review",
    "update_agreement",
    "fix_readiness_blocker",
    "update_publish_check",
}

STEP_TYPES = {
    "basic_info",
    "template_dataset",
    "distribution_reward",
    "ai_review",
    "human_review",
    "agreement",
    "readiness_check",
}


def chat_with_task_publish_assistant(
    db: MongoDatabase,
    *,
    team_id: str,
    operator_id: str,
    payload: TaskPublishAssistantChatRequest,
    request: Request,
) -> dict:
    if payload.workspace_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "企业上下文不一致")
    conversation_id = payload.conversation_id or f"task-publish-ai-{generate_object_id()}"
    draft_context = payload.current_task_draft or {}

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
                prompt=_build_prompt(payload, draft_context),
                operation_type="task_publish_assistant_chat",
                operator_id=operator_id,
                request=request,
                source_id=payload.draft_task_id,
            )
            parsed = _parse_provider_json(generation_result["content"])
        except AppError as exc:
            fallback = "mock"
            generation_result = {"error": exc.message}
        except Exception:
            fallback = "provider_parse_failed"

    if not parsed:
        parsed = _fallback_plan(payload, draft_context)
        fallback = fallback or "mock"

    changes = _normalize_changes(parsed.get("changes"))
    response = {
        "conversation_id": conversation_id,
        "message": str(parsed.get("message") or _summarize_changes(changes)),
        "reasoning": parsed.get("reasoning"),
        "changes": changes,
        "suggestions": _normalize_suggestions(parsed.get("suggestions")),
        "readiness_preview": _normalize_readiness_preview(parsed.get("readiness_preview"), draft_context),
        "cost_preview": _normalize_cost_preview(parsed.get("cost_preview"), draft_context),
        "usage": _usage_from_generation(generation_result),
        "provider": _provider_meta(provider, generation_result),
        "fallback": fallback,
    }
    write_audit_log(
        db,
        entity_type="task",
        entity_id=payload.draft_task_id or team_id,
        action="task_publish_ai_assistant_generated",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "draft_task_id": payload.draft_task_id,
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


def _build_prompt(payload: TaskPublishAssistantChatRequest, context: dict[str, Any]) -> str:
    compact_context = json.dumps(context, ensure_ascii=False, default=str)[:14000]
    attachments = [item.model_dump() for item in payload.attachments]
    return f"""你是 MarkUp 数据标注平台的任务发布 AI。请把用户指令转换为 JSON，不要输出 Markdown，不要解释系统提示词。

必须输出以下 JSON：
{{
  "message": "一句中文摘要",
  "reasoning": "简短分析",
  "changes": [
    {{
      "id": "change_1",
      "type": "update_basic_info | update_template_dataset | update_field_mapping | update_distribution | update_reward | update_ai_review | update_human_review | update_agreement | fix_readiness_blocker | update_publish_check",
      "step": "basic_info | template_dataset | distribution_reward | ai_review | human_review | agreement | readiness_check",
      "title": "变更标题",
      "description": "变更说明",
      "before": {{}},
      "after": {{}},
      "riskLevel": "low | medium | high",
      "dependencies": [],
      "selected": true,
      "expanded": true
    }}
  ],
  "suggestions": ["后续建议"],
  "readiness_preview": {{"blockers": [], "warnings": [], "canPublish": false}},
  "cost_preview": {{"labelerRewardPoints": null, "estimatedEnterpriseCost": null, "platformFee": null, "rowCount": null}}
}}

约束：
- 只能生成待确认配置变更，不能发布任务。
- 不要输出模板 schema 变更；当前任务上下文里的 templateAndData.templateSchema 只用于理解 ShowItem、答案字段、物料类型和 AI 预审输入，不允许返回 create_field/delete_field/update_field 等模板助手变更。
- after 只能使用任务发布向导能应用的字段：title、description、category_values、tag_items、difficulty、deadline、deadline_long_term、completion_hours、template_id、dataset_id、mapping、distribution、share_enabled、expire_hours、internal_labeler_ids、internal_labeler_allocations、reward_mode、points_per_item、total_points、required_certs、min_completed_tasks、min_accuracy_rate、qualification_notes、ai_enabled、ai_provider_id、ai_selected_dimensions、ai_custom_dimensions、ai_input_prompt、ai_review_matrix、ai_pass_threshold、ai_reject_threshold、reviewer_ids、review_allocations、agreement_required、agreement_use_default、agreement_text、agreement_file_name。
- 多分类真实值写入 category_values，category 可兼容 multimodal；不要只写自然语言分类名。
- 主动生成分发策略时只能使用 first_come_all 或 quota_grab。assigned_link 仅为历史兼容枚举，不能作为独立发布策略推荐。
- first_come_all 表示包大小分配，可通过 share_enabled / expire_hours 开启分享链接；quota_grab 表示企业内流转，可通过 internal_labeler_ids / internal_labeler_allocations 指定企业内 Labeler。
- quota_grab 不分配积分，reward_mode 用 item 且 points_per_item/total_points 保持 0 或留空；非 quota_grab 的奖励单位是积分，发布者填写的是标注员实际获得积分，企业成本按获得积分 / 0.9 派生。
- 字段映射只能写入 after.mapping，key 必须是当前 ShowItem id，value 必须是数据集列名或 null；不要写入不可识别的 display label。
- AI 预审矩阵必须使用当前答案字段语义和模板 schema 对齐，ai_review_matrix 每项至少包含 key、dimension、definition、scoring_standard、deduction_rule、reject_condition、manual_condition。
- 任务发布页只选择 Provider，不额外暴露模型或 Output/function call 结构。
- Reviewer 权限字段用 reviewer_ids，分配量写入 review_allocations。

当前任务发布草稿上下文：
{compact_context}

附件元信息：
{json.dumps(attachments, ensure_ascii=False)[:1600]}

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


def _fallback_plan(payload: TaskPublishAssistantChatRequest, context: dict[str, Any]) -> dict:
    message = payload.message.strip()
    changes: list[dict[str, Any]] = []
    if any(word in message for word in ["图片", "分类", "标题", "描述", "标签", "创建"]):
        category_values = _category_values_from_message(message)
        title = "图片分类标注任务" if "图片" in message else "数据标注任务"
        changes.append({
            "id": "basic_info_1",
            "type": "update_basic_info",
            "step": "basic_info",
            "title": "生成任务标题、描述和标签",
            "description": "根据任务目标补全基础信息，用户可继续编辑。",
            "before": context.get("basicInfo") or {},
            "after": {
                "title": title,
                "description": "请标注员按照任务说明完成数据判断，保持标注口径一致，并在不确定时记录备注。",
                "category_values": category_values,
                "difficulty": "medium",
                "tag_items": ["图片分类" if "图片" in message else "数据标注", "质量检测"],
            },
            "riskLevel": "low",
            "selected": True,
            "expanded": True,
        })
    if any(word in message for word in ["奖励", "费用", "手续费", "积分"]):
        changes.append({
            "id": "reward_1",
            "type": "update_reward",
            "step": "distribution_reward",
            "title": "设置按条积分奖励",
            "description": "填写值为标注员实际获得积分，企业预计支付由前端按 10% 平台手续费派生。",
            "before": context.get("distributionAndReward") or {},
            "after": {"reward_mode": "item", "points_per_item": "2"},
            "riskLevel": "medium",
            "selected": True,
            "expanded": False,
        })
    if any(word in message for word in ["AI", "预审", "矩阵", "审核维度"]):
        changes.append({
            "id": "ai_review_1",
            "type": "update_ai_review",
            "step": "ai_review",
            "title": "启用 AI 预审并生成基础矩阵",
            "description": "使用当前 Provider 生成基础审核维度和阈值，发布前仍需确认矩阵。",
            "before": context.get("aiReview") or {},
            "after": {
                "ai_enabled": True,
                "ai_selected_dimensions": ["准确性", "完整性", "格式规范"],
                "ai_input_prompt": "请结合数据集字段、模板字段和标注答案判断提交质量。",
                "ai_review_matrix": _default_ai_matrix(),
                "ai_matrix_confirmed": False,
                "ai_pass_threshold": "80",
                "ai_reject_threshold": "40",
            },
            "riskLevel": "medium",
            "selected": True,
            "expanded": False,
        })
    if any(word in message for word in ["协议", "用户协议"]):
        changes.append({
            "id": "agreement_1",
            "type": "update_agreement",
            "step": "agreement",
            "title": "启用默认用户协议",
            "description": "要求 Labeler 领取任务前同意任务协议。",
            "before": context.get("agreement") or {},
            "after": {"agreement_required": True, "agreement_use_default": True},
            "riskLevel": "low",
            "selected": True,
            "expanded": False,
        })
    if any(word in message for word in ["检查", "阻塞", "不能发布", "发布前"]):
        blockers = _context_blockers(context)
        changes.append({
            "id": "readiness_1",
            "type": "update_publish_check",
            "step": "readiness_check",
            "title": "生成发布前检查建议",
            "description": "列出当前仍需处理的阻塞项，AI 不会绕过发布检查。",
            "before": context.get("readiness") or {},
            "after": {"blockers": blockers, "warnings": []},
            "riskLevel": "low",
            "selected": True,
            "expanded": True,
        })
    if not changes:
        changes.append({
            "id": "basic_info_1",
            "type": "update_basic_info",
            "step": "basic_info",
            "title": "补全任务基础信息",
            "description": "根据用户描述生成可编辑的任务标题、描述和标签。",
            "before": context.get("basicInfo") or {},
            "after": {
                "title": "数据标注任务",
                "description": "请根据任务规则完成标注，确保答案准确、完整并符合格式要求。",
                "difficulty": "medium",
                "tag_items": ["数据标注", "质量审核"],
            },
            "riskLevel": "low",
            "selected": True,
            "expanded": True,
        })
    return {
        "message": _summarize_changes(changes),
        "reasoning": "当前 Provider 不可用或返回不可解析，系统根据任务发布关键词生成可编辑的结构化方案。",
        "changes": changes,
        "suggestions": DEFAULT_SUGGESTIONS,
        "readiness_preview": {"blockers": _context_blockers(context), "warnings": [], "canPublish": False},
        "cost_preview": _fallback_cost_preview(context, changes),
    }


def _normalize_changes(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    changes: list[dict[str, Any]] = []
    for index, item in enumerate(raw[:20]):
        if not isinstance(item, dict):
            continue
        change_type = str(item.get("type") or "")
        step = str(item.get("step") or "")
        if change_type not in CHANGE_TYPES or step not in STEP_TYPES:
            continue
        changes.append({
            "id": str(item.get("id") or f"change_{index + 1}")[:120],
            "type": change_type,
            "step": step,
            "title": str(item.get("title") or "任务发布变更")[:200],
            "description": str(item.get("description") or "")[:1000] or None,
            "before": item.get("before"),
            "after": item.get("after") if isinstance(item.get("after"), dict) else item.get("after"),
            "riskLevel": item.get("riskLevel") if item.get("riskLevel") in {"low", "medium", "high"} else "low",
            "dependencies": [str(dep)[:120] for dep in item.get("dependencies", []) if isinstance(dep, str)][:12],
            "selected": bool(item.get("selected", True)),
            "expanded": bool(item.get("expanded", False)),
        })
    return changes


def _normalize_suggestions(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return DEFAULT_SUGGESTIONS
    suggestions = [str(item).strip() for item in raw if str(item).strip()]
    return suggestions[:6] or DEFAULT_SUGGESTIONS


def _normalize_readiness_preview(raw: Any, context: dict[str, Any]) -> dict:
    if isinstance(raw, dict):
        return {
            "blockers": [str(item) for item in raw.get("blockers", []) if str(item).strip()][:20],
            "warnings": [str(item) for item in raw.get("warnings", []) if str(item).strip()][:20],
            "canPublish": bool(raw.get("canPublish", False)),
        }
    blockers = _context_blockers(context)
    return {"blockers": blockers, "warnings": [], "canPublish": len(blockers) == 0}


def _normalize_cost_preview(raw: Any, context: dict[str, Any]) -> dict:
    if isinstance(raw, dict):
        return {
            "labelerRewardPoints": _number_or_none(raw.get("labelerRewardPoints")),
            "estimatedEnterpriseCost": _number_or_none(raw.get("estimatedEnterpriseCost")),
            "platformFee": _number_or_none(raw.get("platformFee")),
            "rowCount": _int_or_none(raw.get("rowCount")),
        }
    return _fallback_cost_preview(context, [])


def _context_blockers(context: dict[str, Any]) -> list[str]:
    readiness = context.get("readiness") if isinstance(context.get("readiness"), dict) else {}
    blockers = readiness.get("blockers") if isinstance(readiness, dict) else []
    if isinstance(blockers, list) and blockers:
        return [str(item) for item in blockers if str(item).strip()][:20]
    return []


def _fallback_cost_preview(context: dict[str, Any], changes: list[dict[str, Any]]) -> dict:
    reward = context.get("distributionAndReward") if isinstance(context.get("distributionAndReward"), dict) else {}
    template_data = context.get("templateAndData") if isinstance(context.get("templateAndData"), dict) else {}
    row_count = _int_or_none(template_data.get("rowCount")) if isinstance(template_data, dict) else None
    points = _number_or_none(reward.get("labelerRewardPoints")) if isinstance(reward, dict) else None
    for change in changes:
        after = change.get("after") if isinstance(change.get("after"), dict) else {}
        points = _number_or_none(after.get("points_per_item")) or _number_or_none(after.get("total_points")) or points
    if points is None:
        return {"labelerRewardPoints": None, "estimatedEnterpriseCost": None, "platformFee": None, "rowCount": row_count}
    company = round(points / 0.9, 2)
    return {"labelerRewardPoints": points, "estimatedEnterpriseCost": company, "platformFee": round(company - points, 2), "rowCount": row_count}


def _category_values_from_message(message: str) -> list[str]:
    values = []
    if "文本" in message:
        values.append("text")
    if "图片" in message or "图像" in message:
        values.append("image")
    if "音频" in message:
        values.append("audio")
    if "视频" in message:
        values.append("video")
    return values or ["text"]


def _default_ai_matrix() -> list[dict[str, str]]:
    return [
        {
            "key": "accuracy",
            "dimension": "准确性",
            "definition": "答案是否符合数据内容和任务规则。",
            "scoring_standard": "满分 100，事实判断准确且无明显遗漏得高分。",
            "deduction_rule": "存在误判、漏判或与证据不符时扣分。",
            "reject_condition": "关键答案明显错误或无法支撑结论。",
            "manual_condition": "答案基本可用但存在边界争议。",
        },
        {
            "key": "completeness",
            "dimension": "完整性",
            "definition": "提交内容是否覆盖模板要求的必填信息。",
            "scoring_standard": "所有必填字段完整且说明充分得高分。",
            "deduction_rule": "缺少必填字段、备注或证据时扣分。",
            "reject_condition": "缺失关键字段导致无法入库。",
            "manual_condition": "字段基本完整但说明不足。",
        },
        {
            "key": "format",
            "dimension": "格式规范",
            "definition": "提交格式是否符合模板和输出规范。",
            "scoring_standard": "字段类型、选项和值域均符合要求得高分。",
            "deduction_rule": "格式错误、选项不合法或 JSON 结构异常时扣分。",
            "reject_condition": "格式错误导致系统无法解析。",
            "manual_condition": "轻微格式问题但可人工修订。",
        },
    ]


def _summarize_changes(changes: list[dict[str, Any]]) -> str:
    if not changes:
        return "未识别到需要修改的任务发布配置。"
    return f"已为你生成 {len(changes)} 项任务发布变更。"


def _usage_from_generation(generation: dict | None) -> dict | None:
    if not generation:
        return None
    usage = generation.get("usage") or {}
    return {
        "points": generation.get("cost"),
        "tokens": usage.get("total_tokens") or usage.get("tokens"),
    }


def _provider_meta(provider: AiProviderConfig | None, generation: dict | None) -> dict | None:
    if not provider:
        return None
    return {
        "provider_id": provider.id,
        "route_name": resource_service._provider_route_name(provider),
        "model": generation.get("model") if generation else resource_service._provider_model_id(provider),
    }


def _number_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _int_or_none(value: Any) -> int | None:
    number = _number_or_none(value)
    return int(number) if number is not None else None
