from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import now_utc, verify_password
from app.models.production import Dataset, Task
from app.models.resource import TeamPointsBudget
from app.models.team import Team, TeamMember
from app.models.upload import UploadedFile
from app.services.audit_service import write_audit_log
from app.services.resource_service import (
    _append_points_wallet_ledger,
    _ensure_points_wallet_backfill,
    _points_budget_metrics,
    _wallet_available_points,
    ensure_points_budget,
)

PLAN_FREE = "free"
PLAN_BASIC = "basic"
PLAN_PRO = "pro"
PLAN_ENTERPRISE = "enterprise"
ACTIVE_TASK_STATUSES = {"pending_review", "published", "paused"}
PURCHASABLE_PLANS = {PLAN_BASIC, PLAN_PRO, PLAN_ENTERPRISE}
PLAN_ORDER = {PLAN_FREE: 0, PLAN_BASIC: 1, PLAN_PRO: 2, PLAN_ENTERPRISE: 3}
YEAR_DAYS = 365


@dataclass(frozen=True)
class MembershipPlan:
    key: str
    name: str
    annual_fee_points: int
    member_limit: int
    active_task_limit: int
    storage_bytes_limit: int


MEMBERSHIP_PLANS: dict[str, MembershipPlan] = {
    PLAN_FREE: MembershipPlan(PLAN_FREE, "Free", 0, 3, 3, 3 * 1024**3),
    PLAN_BASIC: MembershipPlan(PLAN_BASIC, "Basic", 999, 10, 5, 20 * 1024**3),
    PLAN_PRO: MembershipPlan(PLAN_PRO, "Pro", 3999, 50, 30, 500 * 1024**3),
    PLAN_ENTERPRISE: MembershipPlan(PLAN_ENTERPRISE, "Enterprise", 19999, 300, 200, 2 * 1024**4),
}


def _as_aware(value: datetime | None) -> datetime | None:
    if not value:
        return None
    if value.tzinfo:
        return value
    return value.replace(tzinfo=now_utc().tzinfo)


def _serialize_datetime(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _plan_key(value: str | None) -> str:
    return value if value in MEMBERSHIP_PLANS else PLAN_FREE


def _plan_payload(plan: MembershipPlan) -> dict:
    return {
        "plan": plan.key,
        "name": plan.name,
        "annual_fee_points": plan.annual_fee_points,
        "member_limit": plan.member_limit,
        "active_task_limit": plan.active_task_limit,
        "storage_bytes_limit": plan.storage_bytes_limit,
        "purchasable": plan.key in PURCHASABLE_PLANS,
        "contact_only": False,
    }


def plan_options_payload() -> list[dict]:
    return [
        *[_plan_payload(MEMBERSHIP_PLANS[key]) for key in [PLAN_FREE, PLAN_BASIC, PLAN_PRO, PLAN_ENTERPRISE]],
        {
            "plan": "more",
            "name": "More",
            "annual_fee_points": None,
            "member_limit": None,
            "active_task_limit": None,
            "storage_bytes_limit": None,
            "purchasable": False,
            "contact_only": True,
        },
    ]


def normalize_team_membership(db: MongoDatabase, team: Team) -> Team:
    now = now_utc()
    plan = _plan_key(getattr(team, "membership_plan", None))
    status = getattr(team, "membership_status", "active") or "active"
    expires_at = _as_aware(getattr(team, "membership_expires_at", None))
    next_plan = _plan_key(getattr(team, "membership_next_plan", None)) if getattr(team, "membership_next_plan", None) else None
    changed = False

    if plan != getattr(team, "membership_plan", None):
        team.membership_plan = plan
        changed = True

    if expires_at and expires_at <= now and next_plan:
        team.membership_plan = next_plan
        team.membership_status = "active"
        team.membership_started_at = getattr(team, "membership_expires_at", None)
        team.membership_expires_at = None if next_plan == PLAN_FREE else (now + timedelta(days=YEAR_DAYS)).replace(tzinfo=None)
        team.membership_next_plan = None
        changed = True
    elif plan != PLAN_FREE and expires_at and expires_at <= now and status != "expired":
        team.membership_status = "expired"
        changed = True
    elif plan == PLAN_FREE and status != "active":
        team.membership_status = "active"
        changed = True

    if changed:
        team.updated_at = now.replace(tzinfo=None)
        db.save(team)
        db.commit()
    return team


def stored_membership_plan(db: MongoDatabase, team_id: str) -> str:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "企业不存在")
    team = normalize_team_membership(db, team)
    return _plan_key(getattr(team, "membership_plan", None))


def effective_membership_plan(db: MongoDatabase, team_id: str) -> str:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "企业不存在")
    team = normalize_team_membership(db, team)
    plan = _plan_key(getattr(team, "membership_plan", None))
    expires_at = _as_aware(getattr(team, "membership_expires_at", None))
    if plan != PLAN_FREE and expires_at and expires_at <= now_utc():
        return PLAN_FREE
    if getattr(team, "membership_status", "active") == "expired":
        return PLAN_FREE
    return plan


def active_member_count(db: MongoDatabase, team_id: str) -> int:
    members = db.find(TeamMember, {"team_id": team_id, "status": "active"})
    return len([item for item in members if is_billable_member(item)])


def is_billable_member(member: TeamMember) -> bool:
    return not (bool(getattr(member, "is_system_member", False)) or getattr(member, "team_role", None) == "agent")


def active_task_count(db: MongoDatabase, team_id: str) -> int:
    return len(db.find(Task, {"team_id": team_id, "status": {"$in": list(ACTIVE_TASK_STATUSES)}}))


def estimate_dataset_storage_bytes(dataset: Dataset) -> int:
    stored = int(getattr(dataset, "storage_bytes", 0) or 0)
    media_bytes = dataset_media_storage_bytes(dataset)
    if stored > 0:
        return max(0, stored - media_bytes)
    return dataset_rows_storage_bytes(dataset)


def dataset_rows_storage_bytes(dataset: Dataset) -> int:
    return len(json.dumps(getattr(dataset, "rows", []) or [], ensure_ascii=False, default=str).encode("utf-8"))


def dataset_media_storage_bytes(dataset: Dataset) -> int:
    total = 0
    for asset in getattr(dataset, "media_assets", []) or []:
        if not isinstance(asset, dict):
            continue
        try:
            total += max(0, int(asset.get("size") or 0))
        except (TypeError, ValueError):
            continue
    return total


def dataset_storage_usage_bytes(db: MongoDatabase, team_id: str) -> int:
    total = 0
    for dataset in db.find(Dataset, {"team_id": team_id}):
        storage_bytes = estimate_dataset_storage_bytes(dataset)
        total += storage_bytes
        if not getattr(dataset, "storage_bytes", 0):
            dataset.storage_bytes = storage_bytes
            db.save(dataset)
    total += uploaded_file_storage_usage_bytes(db, team_id)
    total += uploaded_preview_storage_usage_bytes(db, team_id)
    return total


def uploaded_file_storage_usage_bytes(db: MongoDatabase, team_id: str) -> int:
    total = 0
    for item in db.find(UploadedFile, {"team_id": {"$in": [team_id, f"agent:{team_id}"]}}):
        try:
            total += max(0, int(getattr(item, "size", 0) or 0))
        except (TypeError, ValueError):
            continue
    return total


def uploaded_preview_storage_usage_bytes(db: MongoDatabase, team_id: str) -> int:
    total = 0
    for item in db.find(UploadedFile, {"team_id": {"$in": [team_id, f"agent:{team_id}"]}}):
        try:
            total += max(0, int(getattr(item, "preview_size", 0) or 0))
        except (TypeError, ValueError):
            continue
    return total


def membership_usage(db: MongoDatabase, team_id: str) -> dict:
    storage_bytes = dataset_storage_usage_bytes(db, team_id)
    db.commit()
    return {
        "members": active_member_count(db, team_id),
        "active_tasks": active_task_count(db, team_id),
        "storage_bytes": storage_bytes,
    }


def _limit_payload(plan_key: str) -> dict:
    plan = MEMBERSHIP_PLANS[plan_key]
    return {
        "members": plan.member_limit,
        "active_tasks": plan.active_task_limit,
        "storage_bytes": plan.storage_bytes_limit,
    }


def _over_limit_items(usage: dict, limits: dict) -> list[dict]:
    items = []
    for key, current in usage.items():
        limit = limits[key]
        if current > limit:
            items.append({"key": key, "current": current, "limit": limit})
    return items


def membership_payload(db: MongoDatabase, team_id: str) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "企业不存在")
    team = normalize_team_membership(db, team)
    current_plan = _plan_key(getattr(team, "membership_plan", None))
    effective_plan = effective_membership_plan(db, team_id)
    usage = membership_usage(db, team_id)
    limits = _limit_payload(effective_plan)
    return {
        "team_id": team_id,
        "current_plan": current_plan,
        "effective_plan": effective_plan,
        "status": getattr(team, "membership_status", "active") or "active",
        "started_at": _serialize_datetime(getattr(team, "membership_started_at", None)),
        "expires_at": _serialize_datetime(getattr(team, "membership_expires_at", None)),
        "next_plan": getattr(team, "membership_next_plan", None),
        "last_paid_at": _serialize_datetime(getattr(team, "membership_last_paid_at", None)),
        "plans": plan_options_payload(),
        "usage": usage,
        "limits": limits,
        "over_limit_items": _over_limit_items(usage, limits),
    }


def assert_member_capacity(db: MongoDatabase, team_id: str, *, add_count: int = 1) -> None:
    plan_key = effective_membership_plan(db, team_id)
    limit = MEMBERSHIP_PLANS[plan_key].member_limit
    current = active_member_count(db, team_id)
    if current + add_count > limit:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "Membership member limit exceeded",
            {"key": "members", "current": current, "incoming": add_count, "limit": limit, "plan": plan_key},
        )


def assert_active_task_capacity(db: MongoDatabase, team_id: str, *, add_count: int = 0) -> None:
    plan_key = effective_membership_plan(db, team_id)
    limit = MEMBERSHIP_PLANS[plan_key].active_task_limit
    current = active_task_count(db, team_id)
    if current + add_count > limit:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "Membership active task limit exceeded",
            {"key": "active_tasks", "current": current, "incoming": add_count, "limit": limit, "plan": plan_key},
        )


def assert_dataset_storage_capacity(db: MongoDatabase, team_id: str, *, incoming_bytes: int) -> None:
    plan_key = effective_membership_plan(db, team_id)
    limit = MEMBERSHIP_PLANS[plan_key].storage_bytes_limit
    current = dataset_storage_usage_bytes(db, team_id)
    if current + max(0, incoming_bytes) > limit:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "Membership dataset storage limit exceeded",
            {"key": "storage_bytes", "current": current, "incoming": incoming_bytes, "limit": limit, "plan": plan_key},
        )


def _require_payment_password(budget: TeamPointsBudget, payment_password: str | None) -> None:
    password_hash = getattr(budget, "payment_password_hash", None)
    if not password_hash:
        raise AppError(ErrorCode.BUSINESS_RULE, "企业支付密码未设置", {"field": "payment_password"})
    if not payment_password or not verify_password(payment_password, password_hash):
        raise AppError(ErrorCode.BUSINESS_RULE, "支付密码错误", {"field": "payment_password"})


def _available_wallet_points(db: MongoDatabase, team_id: str, budget: TeamPointsBudget) -> int:
    current_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    reserved_points, _settled_points = _points_budget_metrics(db, team_id)
    return _wallet_available_points(current_balance, reserved_points)


def subscribe_membership(
    db: MongoDatabase,
    *,
    team_id: str,
    target_plan: str,
    payment_password: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "企业不存在")
    target_plan = _plan_key(target_plan)
    if target_plan == "more":
        raise AppError(ErrorCode.BUSINESS_RULE, "更多成员请联系平台处理")
    team = normalize_team_membership(db, team)
    current_effective = effective_membership_plan(db, team_id)
    now = now_utc()

    if PLAN_ORDER[target_plan] < PLAN_ORDER[current_effective]:
        expires_at = _as_aware(getattr(team, "membership_expires_at", None))
        if not expires_at or expires_at <= now:
            team.membership_plan = target_plan
            team.membership_status = "active"
            team.membership_next_plan = None
            team.membership_started_at = now.replace(tzinfo=None)
            team.membership_expires_at = None if target_plan == PLAN_FREE else (now + timedelta(days=YEAR_DAYS)).replace(tzinfo=None)
            action = "membership_changed"
        else:
            team.membership_next_plan = target_plan
            action = "membership_downgrade_scheduled"
        team.updated_at = now.replace(tzinfo=None)
        db.save(team)
        write_audit_log(
            db,
            entity_type="membership",
            entity_id=team_id,
            action=action,
            operator_id=operator_id,
            team_id=team_id,
            changes={"target_plan": target_plan, "current_plan": current_effective},
            request=request,
        )
        db.commit()
        return membership_payload(db, team_id)

    if target_plan == PLAN_FREE:
        return membership_payload(db, team_id)

    plan = MEMBERSHIP_PLANS[target_plan]
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    _require_payment_password(budget, payment_password)
    available_points = _available_wallet_points(db, team_id, budget)
    if plan.annual_fee_points > available_points:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "Team wallet balance is insufficient",
            {"available_points": available_points, "required_points": plan.annual_fee_points},
        )

    previous_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    next_balance = previous_balance - plan.annual_fee_points
    budget.current_balance = next_balance
    budget.spent_points_total = max(0, int(getattr(budget, "spent_points_total", 0) or 0)) + plan.annual_fee_points
    budget.updated_at = now
    db.save(budget)
    _append_points_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="membership_fee",
        direction="out",
        amount=plan.annual_fee_points,
        balance_after=next_balance,
        status="completed",
        note=f"{plan.name} annual membership fee",
        operator_id=operator_id,
        payment_method="team_points_wallet",
        source_type="membership",
        source_id=f"{team_id}:{target_plan}:{int(now.timestamp())}",
        reference_no=f"MEM-{int(now.timestamp())}",
        meta={"target_plan": target_plan, "annual_fee_points": plan.annual_fee_points},
    )

    previous_plan = getattr(team, "membership_plan", PLAN_FREE)
    same_plan_active = previous_plan == target_plan and current_effective == target_plan
    base_start = _as_aware(getattr(team, "membership_expires_at", None)) if same_plan_active else None
    period_start = base_start if base_start and base_start > now else now
    team.membership_plan = target_plan
    team.membership_status = "active"
    team.membership_started_at = now.replace(tzinfo=None)
    team.membership_expires_at = (period_start + timedelta(days=YEAR_DAYS)).replace(tzinfo=None)
    team.membership_next_plan = None
    team.membership_last_paid_at = now.replace(tzinfo=None)
    team.updated_at = now.replace(tzinfo=None)
    db.save(team)
    write_audit_log(
        db,
        entity_type="membership",
        entity_id=team_id,
        action="membership_subscribed",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "from_plan": previous_plan,
            "to_plan": target_plan,
            "fee_points": plan.annual_fee_points,
            "wallet_balance": {"from": previous_balance, "to": next_balance},
        },
        request=request,
    )
    db.commit()
    return membership_payload(db, team_id)


def cancel_scheduled_membership_change(
    db: MongoDatabase,
    *,
    team_id: str,
    operator_id: str,
    request: Request,
) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "企业不存在")
    if not getattr(team, "membership_next_plan", None):
        return membership_payload(db, team_id)
    previous_next_plan = team.membership_next_plan
    team.membership_next_plan = None
    team.updated_at = now_utc().replace(tzinfo=None)
    db.save(team)
    write_audit_log(
        db,
        entity_type="membership",
        entity_id=team_id,
        action="membership_scheduled_change_cancelled",
        operator_id=operator_id,
        team_id=team_id,
        changes={"previous_next_plan": previous_next_plan},
        request=request,
    )
    db.commit()
    return membership_payload(db, team_id)
