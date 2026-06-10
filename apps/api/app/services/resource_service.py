import base64
import ipaddress
import json
import re
import time
from math import ceil
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import urlencode, urljoin, urlparse

import httpx
from fastapi import Request

from app.core.config import settings
from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import decrypt_secret, encrypt_secret, hash_password, now_utc, verify_password
from app.models.production import Submission, Task
from app.models.platform import PlatformFinanceLedger, PlatformPaymentRequest, PlatformSetting
from app.models.profile import Certification, PointsLedger
from app.models.resource import (
    AiCallLog,
    AiProviderConfig,
    BudgetRequest,
    TeamAiWallet,
    TeamAiWalletLedger,
    TeamBudget,
    TeamPointsBudget,
    TeamPointsWalletLedger,
)
from app.models.team import Team
from app.models.upload import UploadedFile
from app.models.user import User
from app.services.audit_service import write_audit_log
from app.services.auth_service import consume_email_code
from app.services.file_storage import read_storage_file


COMMISSION_SETTING_KEY = "commission"
DEFAULT_COMMISSION_RATE_BPS = 1000


def platform_commission_rate_bps(db: MongoDatabase) -> int:
    setting = db.find_one(PlatformSetting, {"key": COMMISSION_SETTING_KEY})
    if not setting:
        return DEFAULT_COMMISSION_RATE_BPS
    try:
        return max(0, min(10_000, int((setting.value or {}).get("commission_rate_bps", DEFAULT_COMMISSION_RATE_BPS))))
    except (TypeError, ValueError):
        return DEFAULT_COMMISSION_RATE_BPS


def platform_service_fee_points(db: MongoDatabase, reward_points: int, commission_rate_bps: int | None = None) -> int:
    reward = max(0, int(reward_points or 0))
    if reward <= 0:
        return 0
    rate = platform_commission_rate_bps(db) if commission_rate_bps is None else max(0, min(10_000, int(commission_rate_bps or 0)))
    if rate <= 0:
        return 0
    return ceil(reward * rate / 10_000)


def ensure_team(db: MongoDatabase, team_id: str) -> Team:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    return team


def ensure_budget(db: MongoDatabase, team_id: str) -> TeamBudget:
    budget = db.find_one(TeamBudget, {"team_id": team_id})
    if budget:
        return budget
    budget = TeamBudget(team_id=team_id, total_limit=0, used=0)
    db.add(budget)
    db.commit()
    return budget


def ensure_points_budget(db: MongoDatabase, team_id: str) -> TeamPointsBudget:
    budget = db.find_one(TeamPointsBudget, {"team_id": team_id})
    if budget:
        migrated = False
        if not hasattr(budget, "current_balance"):
            budget.current_balance = max(0, int(getattr(budget, "total_points", 0) or 0))
            migrated = True
        if not hasattr(budget, "spent_points_total"):
            budget.spent_points_total = 0
            migrated = True
        if migrated:
            db.save(budget)
            db.commit()
        return budget
    spent_points_total = _historical_team_spent_points(db, team_id)
    budget = TeamPointsBudget(
        team_id=team_id,
        total_points=0,
        current_balance=max(0, 0 - spent_points_total),
        spent_points_total=spent_points_total,
    )
    db.add(budget)
    db.commit()
    return budget


def _normalize_wallet_points(value: float | int) -> float:
    return round(float(value or 0), 6)


def ensure_ai_wallet(db: MongoDatabase, team_id: str) -> TeamAiWallet:
    wallet = db.find_one(TeamAiWallet, {"team_id": team_id})
    if wallet:
        if _normalize_wallet_points(getattr(wallet, "balance_points", 0)) != float(getattr(wallet, "balance_points", 0) or 0):
            wallet.balance_points = _normalize_wallet_points(getattr(wallet, "balance_points", 0))
            wallet.updated_at = now_utc()
            db.save(wallet)
            db.commit()
        return wallet
    wallet = TeamAiWallet(team_id=team_id, balance_points=0.0)
    db.add(wallet)
    db.commit()
    return wallet


def team_ai_wallet_payload(db: MongoDatabase, team_id: str) -> dict:
    ensure_team(db, team_id)
    wallet = ensure_ai_wallet(db, team_id)
    return {
        "team_id": team_id,
        "balance_points": _normalize_wallet_points(wallet.balance_points),
        "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
    }


def team_ai_wallet_ledger_payload(item: TeamAiWalletLedger) -> dict:
    return {
        "ledger_id": item.id,
        "team_id": item.team_id,
        "transaction_type": item.transaction_type,
        "direction": item.direction,
        "amount_points": _normalize_wallet_points(item.amount_points),
        "balance_after": round(float(item.balance_after or 0), 6),
        "provider_id": item.provider_id,
        "route_name": item.route_name,
        "payment_method": item.payment_method,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "request_id": item.request_id,
        "meta": item.meta or {},
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def list_team_ai_wallet_ledger(db: MongoDatabase, team_id: str) -> list[dict]:
    ensure_team(db, team_id)
    items = db.find(TeamAiWalletLedger, {"team_id": team_id}, sort=[("created_at", -1)])
    return [team_ai_wallet_ledger_payload(item) for item in items]


def _append_team_ai_wallet_ledger(
    db: MongoDatabase,
    *,
    team_id: str,
    transaction_type: str,
    direction: str,
    amount_points: float,
    balance_after: float,
    provider_id: str | None = None,
    route_name: str | None = None,
    payment_method: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
    request_id: str | None = None,
    meta: dict | None = None,
) -> TeamAiWalletLedger:
    item = TeamAiWalletLedger(
        team_id=team_id,
        transaction_type=transaction_type,
        direction=direction,
        amount_points=_normalize_wallet_points(amount_points),
        balance_after=round(float(balance_after or 0), 6),
        provider_id=provider_id,
        route_name=route_name,
        payment_method=payment_method,
        source_type=source_type,
        source_id=source_id,
        request_id=request_id,
        meta=meta or {},
    )
    db.add(item)
    return item


def recharge_team_ai_wallet(
    db: MongoDatabase,
    *,
    team_id: str,
    amount: float,
    payment_method: str,
    operator_id: str,
    request: Request,
) -> dict:
    ensure_team(db, team_id)
    wallet = ensure_ai_wallet(db, team_id)
    normalized_amount = _normalize_wallet_points(amount)
    previous_balance = _normalize_wallet_points(wallet.balance_points)
    next_balance = round(previous_balance + normalized_amount, 6)
    wallet.balance_points = next_balance
    wallet.updated_at = now_utc()
    db.save(wallet)
    _append_team_ai_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="recharge",
        direction="credit",
        amount_points=normalized_amount,
        balance_after=next_balance,
        payment_method=payment_method,
        request_id=getattr(request.state, "request_id", None),
        meta={"payment_method": payment_method, "unit_hint": "1 积分 = 1 元"},
    )
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=team_id,
        action="team_ai_wallet_recharged",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "amount_points": normalized_amount,
            "payment_method": payment_method,
            "balance_points": {"from": previous_balance, "to": next_balance},
        },
        request=request,
    )
    db.commit()
    return team_ai_wallet_payload(db, team_id)


def transfer_team_points_to_ai_wallet(
    db: MongoDatabase,
    *,
    team_id: str,
    amount: int,
    payment_password: str,
    operator_id: str,
    request: Request,
) -> dict:
    ensure_team(db, team_id)
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    password_hash = getattr(budget, "payment_password_hash", None)
    if not password_hash:
        raise AppError(ErrorCode.BUSINESS_RULE, "未设置支付密码，暂不可转入 AI 钱包")
    if not verify_password(payment_password, password_hash):
        write_audit_log(
            db,
            entity_type="ai_resource",
            entity_id=team_id,
            action="team_ai_wallet_transfer_in_failed_invalid_payment_password",
            operator_id=operator_id,
            team_id=team_id,
            changes={"amount": amount, "source_wallet": "team_points_wallet"},
            request=request,
        )
        db.commit()
        raise AppError(ErrorCode.BUSINESS_RULE, "支付密码错误", {"field": "payment_password"})

    current_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    reserved_points, _settled_points = _points_budget_metrics(db, team_id)
    pending_payment_points = 0
    available_points = _wallet_available_points(current_balance, reserved_points)
    if amount > available_points:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "可支配余额不足，无法转入 AI 钱包",
            {
                "field": "amount",
                "available_points": available_points,
                "reserved_points": reserved_points,
                "pending_payment_points": pending_payment_points,
                "current_balance": current_balance,
            },
        )

    wallet = ensure_ai_wallet(db, team_id)
    previous_points_balance = current_balance
    next_points_balance = max(previous_points_balance - amount, 0)
    previous_ai_balance = _normalize_wallet_points(wallet.balance_points)
    next_ai_balance = round(previous_ai_balance + _normalize_wallet_points(amount), 6)

    budget.current_balance = next_points_balance
    budget.updated_at = now_utc()
    db.save(budget)
    _append_points_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="ai_wallet_transfer",
        direction="out",
        amount=amount,
        balance_after=next_points_balance,
        status="completed",
        note="转入 AI 调用钱包",
        operator_id=operator_id,
        payment_method="team_points_wallet",
        reference_no=f"AIT-{int(now_utc().timestamp())}",
        meta={"source_wallet": "team_points_wallet", "target_wallet": "team_ai_wallet"},
    )

    wallet.balance_points = next_ai_balance
    wallet.updated_at = now_utc()
    db.save(wallet)
    _append_team_ai_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="transfer_in",
        direction="credit",
        amount_points=float(amount),
        balance_after=next_ai_balance,
        payment_method="team_points_wallet",
        request_id=getattr(request.state, "request_id", None),
        meta={"source_wallet": "team_points_wallet"},
    )
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=team_id,
        action="team_ai_wallet_transferred_in",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "amount_points": amount,
            "source_wallet": "team_points_wallet",
            "team_points_balance": {"from": previous_points_balance, "to": next_points_balance},
            "ai_wallet_balance": {"from": previous_ai_balance, "to": next_ai_balance},
        },
        request=request,
    )
    db.commit()
    return team_ai_wallet_payload(db, team_id)


def require_team_ai_wallet_positive_balance(db: MongoDatabase, team_id: str) -> TeamAiWallet:
    ensure_team(db, team_id)
    wallet = ensure_ai_wallet(db, team_id)
    if _normalize_wallet_points(wallet.balance_points) <= 0:
        raise AppError(ErrorCode.BUSINESS_RULE, "AI 钱包余额不足，请先充值", {"team_id": team_id})
    return wallet


def record_platform_ai_wallet_spend(
    db: MongoDatabase,
    *,
    team_id: str,
    provider_id: str,
    route_name: str,
    amount_points: float,
    source_type: str | None,
    source_id: str | None,
    request_id: str | None,
    operator_id: str | None = None,
) -> dict:
    ensure_team(db, team_id)
    wallet = ensure_ai_wallet(db, team_id)
    normalized_amount = _normalize_wallet_points(amount_points)
    next_balance = round(float(wallet.balance_points or 0) - normalized_amount, 6)
    wallet.balance_points = next_balance
    wallet.updated_at = now_utc()
    db.save(wallet)
    _append_team_ai_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="ai_spend",
        direction="debit",
        amount_points=normalized_amount,
        balance_after=next_balance,
        provider_id=provider_id,
        route_name=route_name,
        source_type=source_type,
        source_id=source_id,
        request_id=request_id,
        meta={"provider_id": provider_id, "route_name": route_name},
    )
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=team_id,
        action="team_ai_wallet_spent",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "provider_id": provider_id,
            "route_name": route_name,
            "amount_points": normalized_amount,
            "balance_points": next_balance,
            "source_type": source_type,
            "source_id": source_id,
            "request_id": request_id,
        },
        request=None,
    )
    db.commit()
    return team_ai_wallet_payload(db, team_id)


def _payment_password_status_payload(budget: TeamPointsBudget) -> dict:
    return {
        "is_set": bool(getattr(budget, "payment_password_hash", None)),
        "updated_at": budget.payment_password_updated_at.isoformat() if getattr(budget, "payment_password_updated_at", None) else None,
        "updated_by": getattr(budget, "payment_password_updated_by", None),
    }


def points_payment_password_status(db: MongoDatabase, team_id: str) -> dict:
    ensure_team(db, team_id)
    budget = ensure_points_budget(db, team_id)
    return _payment_password_status_payload(budget)


def _set_payment_password(
    db: MongoDatabase,
    *,
    budget: TeamPointsBudget,
    new_password: str,
    operator_id: str,
) -> None:
    budget.payment_password_hash = hash_password(new_password)
    budget.payment_password_updated_at = now_utc()
    budget.payment_password_updated_by = operator_id
    budget.updated_at = now_utc()
    db.save(budget)


def _validate_password_confirmation(new_password: str, confirm_password: str) -> None:
    if new_password != confirm_password:
        raise AppError(ErrorCode.VALIDATION_FORMAT, "两次输入的支付密码不一致", {"field": "confirm_password"})


def set_points_budget_payment_password(
    db: MongoDatabase,
    *,
    team_id: str,
    new_password: str,
    confirm_password: str,
    operator_id: str,
    request: Request,
) -> dict:
    ensure_team(db, team_id)
    budget = ensure_points_budget(db, team_id)
    if getattr(budget, "payment_password_hash", None):
        raise AppError(ErrorCode.STATE_CONFLICT, "企业已设置支付密码")
    _validate_password_confirmation(new_password, confirm_password)
    _set_payment_password(db, budget=budget, new_password=new_password, operator_id=operator_id)
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_payment_password_set",
        operator_id=operator_id,
        team_id=team_id,
        changes={"is_set": True},
        request=request,
    )
    db.commit()
    return _payment_password_status_payload(budget)


def change_points_budget_payment_password(
    db: MongoDatabase,
    *,
    team_id: str,
    current_password: str,
    new_password: str,
    confirm_password: str,
    operator_id: str,
    request: Request,
) -> dict:
    ensure_team(db, team_id)
    budget = ensure_points_budget(db, team_id)
    password_hash = getattr(budget, "payment_password_hash", None)
    if not password_hash:
        raise AppError(ErrorCode.BUSINESS_RULE, "企业尚未设置支付密码")
    if not verify_password(current_password, password_hash):
        raise AppError(ErrorCode.BUSINESS_RULE, "支付密码错误", {"field": "current_password"})
    _validate_password_confirmation(new_password, confirm_password)
    _set_payment_password(db, budget=budget, new_password=new_password, operator_id=operator_id)
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_payment_password_changed",
        operator_id=operator_id,
        team_id=team_id,
        changes={"updated": True},
        request=request,
    )
    db.commit()
    return _payment_password_status_payload(budget)


def reset_points_budget_payment_password(
    db: MongoDatabase,
    *,
    team_id: str,
    email: str,
    email_code: str,
    new_password: str,
    confirm_password: str,
    operator_id: str,
    request: Request,
) -> dict:
    ensure_team(db, team_id)
    budget = ensure_points_budget(db, team_id)
    _validate_password_confirmation(new_password, confirm_password)
    consume_email_code(db, email, email_code, "team_payment_password_reset")
    _set_payment_password(db, budget=budget, new_password=new_password, operator_id=operator_id)
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_payment_password_reset",
        operator_id=operator_id,
        team_id=team_id,
        changes={"updated": True},
        request=request,
    )
    db.commit()
    return _payment_password_status_payload(budget)


def _task_reward_budget(task: Task | None) -> int:
    if not task:
        return 0
    reward_rule = task.reward_rule or {}
    mode = reward_rule.get("mode")
    if mode == "task":
        return max(0, int(reward_rule.get("total_points") or 0))
    if mode == "item":
        points_per_item = max(0, int(reward_rule.get("points_per_item") or reward_rule.get("unit_points") or 0))
        stats = task.stats or {}
        quantity = stats.get("total") if isinstance(stats.get("total"), int) else getattr(task, "quota", None)
        return points_per_item * max(0, int(quantity or 0))
    return 0


def _task_service_fee_budget(db: MongoDatabase, task: Task | None) -> int:
    if not task:
        return 0
    reward_rule = task.reward_rule or {}
    mode = reward_rule.get("mode")
    if mode == "task":
        return platform_service_fee_points(db, max(0, int(reward_rule.get("total_points") or 0)))
    if mode == "item":
        points_per_item = max(0, int(reward_rule.get("points_per_item") or reward_rule.get("unit_points") or 0))
        stats = task.stats or {}
        quantity = stats.get("total") if isinstance(stats.get("total"), int) else getattr(task, "quota", None)
        return platform_service_fee_points(db, points_per_item) * max(0, int(quantity or 0))
    return 0


def _task_settled_points(db: MongoDatabase, task: Task | None) -> int:
    if not task:
        return 0
    submissions = db.find(Submission, {"team_id": task.team_id, "task_id": task.id})
    submission_ids = {submission.id for submission in submissions}
    if not submission_ids:
        return 0
    ledgers = db.find(PointsLedger, {"source_type": "submission_review"})
    return sum(max(0, int(item.change or 0)) for item in ledgers if item.source_id in submission_ids)


def _task_settled_service_fee_points(db: MongoDatabase, task: Task | None) -> int:
    if not task:
        return 0
    ledgers = db.find(PlatformFinanceLedger, {"transaction_type": "commission_income", "task_id": task.id, "status": "completed"})
    return sum(max(0, int(item.amount_points or 0)) for item in ledgers)


def _task_reserved_points(db: MongoDatabase, task: Task | None) -> int:
    if not task:
        return 0
    if task.status not in {"published", "paused"}:
        return 0
    reward_reserved = max(_task_reward_budget(task) - _task_settled_points(db, task), 0)
    service_fee_reserved = max(_task_service_fee_budget(db, task) - _task_settled_service_fee_points(db, task), 0)
    return reward_reserved + service_fee_reserved


def _points_budget_metrics(db: MongoDatabase, team_id: str) -> tuple[int, int]:
    tasks = db.find(Task, {"team_id": team_id})
    reserved_points = sum(_task_reserved_points(db, task) for task in tasks)
    settled_points = sum(_task_settled_points(db, task) for task in tasks)
    return reserved_points, settled_points


def _pending_payment_request_points(db: MongoDatabase, *, owner_type: str, owner_id: str) -> int:
    items = db.find(PlatformPaymentRequest, {"owner_type": owner_type, "owner_id": owner_id, "status": "pending"})
    return sum(max(0, int(item.amount_points or 0)) for item in items)


def _wallet_available_points(balance_points: int, reserved_points: int, pending_payment_points: int = 0) -> int:
    return max(balance_points - reserved_points - pending_payment_points, 0)


def _historical_team_spent_points(db: MongoDatabase, team_id: str) -> int:
    wallet_ledgers = db.find(TeamPointsWalletLedger, {"team_id": team_id})
    wallet_spent = sum(
        max(0, int(item.amount or 0))
        for item in wallet_ledgers
        if item.transaction_type in {"reward_spend", "membership_fee", "withdraw", "ai_wallet_transfer"}
        or (item.transaction_type == "platform_service_fee" and (item.meta or {}).get("count_in_spent_total"))
    )
    if wallet_spent > 0:
        return wallet_spent
    submissions = {submission.id: submission for submission in db.find(Submission, {"team_id": team_id})}
    ledgers = db.find(PointsLedger, {"source_type": "submission_review"})
    total = 0
    for ledger in ledgers:
        if ledger.change <= 0 or not ledger.source_id:
            continue
        if submissions.get(ledger.source_id):
            total += int(ledger.change or 0)
    return total


def _ensure_points_wallet_backfill(db: MongoDatabase, budget: TeamPointsBudget, team_id: str) -> TeamPointsBudget:
    expected_spent = _historical_team_spent_points(db, team_id)
    expected_balance = max(int(budget.total_points or 0) - expected_spent, 0)
    changed = False
    if int(getattr(budget, "spent_points_total", 0) or 0) != expected_spent:
        budget.spent_points_total = expected_spent
        changed = True
    current_balance = int(getattr(budget, "current_balance", 0) or 0)
    if current_balance < 0 or (current_balance == 0 and (budget.total_points or expected_spent)):
        budget.current_balance = expected_balance
        changed = True
    if changed:
        db.save(budget)
        db.commit()
    return budget


def team_budget_payload(db: MongoDatabase, team_id: str) -> dict:
    ensure_team(db, team_id)
    budget = ensure_budget(db, team_id)
    used = max(0, int(budget.used or 0))
    total = max(0, int(budget.total_limit or 0))
    remaining = max(total - used, 0)
    return {
        "team_id": team_id,
        "total_limit": total,
        "used": used,
        "remaining": remaining,
        "usage_percent": round((used / total) * 100) if total else 0,
        "alert_enabled": bool(budget.alert_enabled),
        "alert_threshold": budget.alert_threshold,
        "updated_at": budget.updated_at.isoformat() if budget.updated_at else None,
    }


def team_points_budget_payload(db: MongoDatabase, team_id: str) -> dict:
    ensure_team(db, team_id)
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    balance_points = max(0, int(getattr(budget, "current_balance", 0) or 0))
    reserved_points, _settled_points = _points_budget_metrics(db, team_id)
    spent_points = max(0, int(getattr(budget, "spent_points_total", 0) or 0))
    pending_payment_points = 0
    available_points = _wallet_available_points(balance_points, reserved_points)
    return {
        "team_id": team_id,
        "balance_points": balance_points,
        "reserved_points": reserved_points,
        "pending_payment_points": pending_payment_points,
        "spent_points": spent_points,
        "available_points": available_points,
        "alert_enabled": bool(budget.alert_enabled),
        "alert_threshold": budget.alert_threshold,
        "updated_at": budget.updated_at.isoformat() if budget.updated_at else None,
    }


def team_points_wallet_ledger_payload(item: TeamPointsWalletLedger) -> dict:
    return {
        "ledger_id": item.id,
        "team_id": item.team_id,
        "transaction_type": item.transaction_type,
        "direction": item.direction,
        "amount": max(0, int(item.amount or 0)),
        "balance_after": max(0, int(item.balance_after or 0)),
        "status": item.status,
        "note": item.note,
        "payment_method": item.payment_method,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "reference_no": item.reference_no,
        "operator_id": item.operator_id,
        "meta": item.meta or {},
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def list_points_wallet_ledger(db: MongoDatabase, team_id: str) -> list[dict]:
    ensure_team(db, team_id)
    items = db.find(TeamPointsWalletLedger, {"team_id": team_id}, sort=[("created_at", -1)])
    return [team_points_wallet_ledger_payload(item) for item in items]


def _append_points_wallet_ledger(
    db: MongoDatabase,
    *,
    team_id: str,
    transaction_type: str,
    direction: str,
    amount: int,
    balance_after: int,
    status: str,
    note: str,
    operator_id: str | None,
    payment_method: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
    reference_no: str | None = None,
    meta: dict | None = None,
) -> TeamPointsWalletLedger:
    existing = None
    if source_type and source_id:
        existing = db.find_one(
            TeamPointsWalletLedger,
            {
                "team_id": team_id,
                "transaction_type": transaction_type,
                "source_type": source_type,
                "source_id": source_id,
            },
        )
    if existing:
        return existing
    item = TeamPointsWalletLedger(
        team_id=team_id,
        transaction_type=transaction_type,
        direction=direction,
        amount=amount,
        balance_after=balance_after,
        status=status,
        note=note,
        payment_method=payment_method,
        source_type=source_type,
        source_id=source_id,
        reference_no=reference_no,
        operator_id=operator_id,
        meta=meta or {},
    )
    db.add(item)
    return item


def set_budget_limit(db: MongoDatabase, team_id: str, total_limit: int, operator_id: str, request: Request) -> dict:
    ensure_team(db, team_id)
    budget = ensure_budget(db, team_id)
    changes = {"total_limit": {"from": budget.total_limit, "to": total_limit}}
    budget.total_limit = total_limit
    budget.updated_at = now_utc()
    db.save(budget)
    write_audit_log(db, entity_type="ai_resource", entity_id=team_id, action="budget_limit_updated", operator_id=operator_id, team_id=team_id, changes=changes, request=request)
    db.commit()
    return team_budget_payload(db, team_id)


def recharge_points_budget(db: MongoDatabase, team_id: str, amount: int, payment_method: str, operator_id: str, request: Request) -> dict:
    ensure_team(db, team_id)
    budget = ensure_points_budget(db, team_id)
    previous_balance = int(getattr(budget, "current_balance", 0) or 0)
    next_balance = previous_balance + amount
    changes = {
        "amount": amount,
        "payment_method": payment_method,
        "total_points": {"from": budget.total_points, "to": budget.total_points + amount},
        "current_balance": {"from": previous_balance, "to": next_balance},
    }
    budget.total_points += amount
    budget.current_balance = next_balance
    budget.updated_at = now_utc()
    db.save(budget)
    _append_points_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="recharge",
        direction="in",
        amount=amount,
        balance_after=next_balance,
        status="completed",
        note="企业积分充值",
        operator_id=operator_id,
        payment_method=payment_method,
        reference_no=f"RCG-{int(now_utc().timestamp())}",
        meta={"payment_method": payment_method},
    )
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_recharged",
        operator_id=operator_id,
        team_id=team_id,
        changes=changes,
        request=request,
    )
    db.commit()
    return team_points_budget_payload(db, team_id)


def withdraw_points_budget(
    db: MongoDatabase,
    *,
    team_id: str,
    amount: int,
    payout_method: str,
    account_name: str | None,
    account_no: str,
    bank_name: str | None,
    note: str | None,
    payment_password: str,
    operator_id: str,
    request: Request,
) -> dict:
    ensure_team(db, team_id)
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    password_hash = getattr(budget, "payment_password_hash", None)
    if not password_hash:
        raise AppError(ErrorCode.BUSINESS_RULE, "未设置支付密码，暂不可提现")
    if not verify_password(payment_password, password_hash):
        write_audit_log(
            db,
            entity_type="points_budget",
            entity_id=team_id,
            action="points_budget_withdraw_failed_invalid_payment_password",
            operator_id=operator_id,
            team_id=team_id,
            changes={"amount": amount, "payout_method": payout_method},
            request=request,
        )
        db.commit()
        raise AppError(ErrorCode.BUSINESS_RULE, "支付密码错误", {"field": "payment_password"})
    if payout_method == "bank_transfer":
        if not (account_name or "").strip():
            raise AppError(ErrorCode.VALIDATION_FORMAT, "对公转账需填写收款户名", {"field": "account_name"})
        if not (bank_name or "").strip():
            raise AppError(ErrorCode.VALIDATION_FORMAT, "对公转账需填写开户行", {"field": "bank_name"})
    current_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    reserved_points, _settled_points = _points_budget_metrics(db, team_id)
    pending_payment_points = 0
    available_points = _wallet_available_points(current_balance, reserved_points)
    if amount > available_points:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "提现积分不能超过可用余额",
            {
                "field": "amount",
                "available_balance": available_points,
                "reserved_points": reserved_points,
                "pending_payment_points": pending_payment_points,
                "current_balance": current_balance,
            },
        )
    next_balance = current_balance - amount
    budget.current_balance = next_balance
    budget.updated_at = now_utc()
    db.save(budget)
    _append_points_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="withdraw",
        direction="out",
        amount=amount,
        balance_after=next_balance,
        status="completed",
        note=note or "鍥㈤槦绉垎鎻愮幇",
        operator_id=operator_id,
        payment_method=payout_method,
        reference_no=f"WTD-{int(now_utc().timestamp())}",
        meta={
            "account_name": account_name,
            "account_no": account_no,
            "bank_name": bank_name,
            "unit_hint": "1 绉垎 = 1 鍏?",
        },
    )
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_withdraw_completed",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "amount": amount,
            "payout_method": payout_method,
            "account_name": account_name,
            "account_no": account_no,
            "bank_name": bank_name,
            "note": note,
            "current_balance": {"from": current_balance, "to": next_balance},
        },
        request=request,
    )
    db.commit()
    return team_points_budget_payload(db, team_id)
    team = ensure_team(db, team_id)
    payment_request = PlatformPaymentRequest(
        request_type="team_withdraw",
        owner_type="team",
        owner_id=team_id,
        owner_name=team.company_name,
        amount_points=amount,
        payout_method=payout_method,
        account_name=account_name,
        account_no=account_no,
        bank_name=bank_name,
        note=note or "企业积分提现",
        status="pending",
        created_by=operator_id,
    )
    db.add(payment_request)
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_withdraw_completed",
        operator_id=operator_id,
        team_id=team_id,
        changes={
            "amount": amount,
            "payout_method": payout_method,
            "account_name": account_name,
            "account_no": account_no,
            "bank_name": bank_name,
            "note": note,
            "payment_request_id": payment_request.id,
        },
        request=request,
    )
    db.commit()
    return team_points_budget_payload(db, team_id)


def set_points_budget_alert(db: MongoDatabase, team_id: str, enabled: bool, threshold: int, operator_id: str, request: Request) -> dict:
    ensure_team(db, team_id)
    budget = ensure_points_budget(db, team_id)
    changes = {
        "alert_enabled": {"from": budget.alert_enabled, "to": enabled},
        "alert_threshold": {"from": budget.alert_threshold, "to": threshold},
    }
    budget.alert_enabled = enabled
    budget.alert_threshold = threshold
    budget.updated_at = now_utc()
    db.save(budget)
    write_audit_log(
        db,
        entity_type="points_budget",
        entity_id=team_id,
        action="points_budget_alert_updated",
        operator_id=operator_id,
        team_id=team_id,
        changes=changes,
        request=request,
    )
    db.commit()
    return team_points_budget_payload(db, team_id)


def record_team_points_spend(
    db: MongoDatabase,
    *,
    team_id: str,
    amount: int,
    source_id: str,
    operator_id: str | None = None,
    request: Request | None = None,
) -> dict | None:
    if amount <= 0:
        return None
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    previous_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    if amount > previous_balance:
        raise AppError(ErrorCode.BUSINESS_RULE, "企业积分余额不足，无法完成结算", {"team_id": team_id, "required_points": amount, "balance_points": previous_balance})
    next_balance = max(previous_balance - amount, 0)
    budget.current_balance = next_balance
    budget.updated_at = now_utc()
    db.save(budget)
    _append_points_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="reward_spend",
        direction="out",
        amount=amount,
        balance_after=next_balance,
        status="completed",
        note="审核通过后发放标注奖励",
        operator_id=operator_id,
        source_type="submission_review",
        source_id=source_id,
        meta={"source_id": source_id},
    )
    if request and operator_id:
        write_audit_log(
            db,
            entity_type="points_budget",
            entity_id=team_id,
            action="points_budget_spent",
            operator_id=operator_id,
            team_id=team_id,
            changes={"amount": amount, "source_id": source_id, "current_balance": budget.current_balance, "spent_points_total": budget.spent_points_total},
            request=request,
        )
    return team_points_budget_payload(db, team_id)


def ensure_team_points_available_for_spend(db: MongoDatabase, *, team_id: str, amount: int) -> None:
    if amount <= 0:
        return
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    current_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    if amount > current_balance:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "企业积分余额不足，无法完成结算",
            {"team_id": team_id, "required_points": amount, "balance_points": current_balance},
        )


def ensure_team_points_available_for_task_reserve(db: MongoDatabase, *, team_id: str, task: Task) -> None:
    current_task_reserved = _task_reserved_points(db, task)
    target_task_reserved = max(_task_reward_budget(task) - _task_settled_points(db, task), 0) + max(
        _task_service_fee_budget(db, task) - _task_settled_service_fee_points(db, task),
        0,
    )
    additional_required_points = max(target_task_reserved - current_task_reserved, 0)
    if additional_required_points <= 0:
        return
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    current_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    reserved_points, _settled_points = _points_budget_metrics(db, team_id)
    available_points = _wallet_available_points(current_balance, reserved_points)
    if additional_required_points > available_points:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "企业可用余额不足，无法完成任务发布预扣",
            {
                "team_id": team_id,
                "task_id": task.id,
                "current_balance": current_balance,
                "reserved_points": reserved_points,
                "available_points": available_points,
                "required_reserve_points": target_task_reserved,
                "additional_required_points": additional_required_points,
            },
        )


def record_team_platform_fee_spend(
    db: MongoDatabase,
    *,
    team_id: str,
    amount: int,
    source_id: str,
    operator_id: str | None = None,
    request: Request | None = None,
    include_in_spent_total: bool = False,
) -> dict | None:
    if amount <= 0:
        return None
    budget = _ensure_points_wallet_backfill(db, ensure_points_budget(db, team_id), team_id)
    previous_balance = max(0, int(getattr(budget, "current_balance", 0) or 0))
    if amount > previous_balance:
        raise AppError(ErrorCode.BUSINESS_RULE, "企业积分余额不足，无法支付平台服务费", {"team_id": team_id, "required_points": amount, "balance_points": previous_balance})
    next_balance = previous_balance - amount
    budget.current_balance = next_balance
    if include_in_spent_total:
        budget.spent_points_total = max(0, int(getattr(budget, "spent_points_total", 0) or 0) + amount)
    budget.updated_at = now_utc()
    db.save(budget)
    _append_points_wallet_ledger(
        db,
        team_id=team_id,
        transaction_type="platform_service_fee",
        direction="out",
        amount=amount,
        balance_after=next_balance,
        status="completed",
        note="审核通过后支付平台服务费",
        operator_id=operator_id,
        source_type="submission_review",
        source_id=source_id,
        meta={"source_id": source_id, "unit_hint": "1 积分 = 1 元", "count_in_spent_total": include_in_spent_total},
    )
    if request and operator_id:
        write_audit_log(
            db,
            entity_type="points_budget",
            entity_id=team_id,
            action="platform_service_fee_spent",
            operator_id=operator_id,
            team_id=team_id,
            changes={"amount": amount, "source_id": source_id, "current_balance": budget.current_balance, "spent_points_total": budget.spent_points_total},
            request=request,
        )
    return team_points_budget_payload(db, team_id)


def set_budget_alert(db: MongoDatabase, team_id: str, enabled: bool, threshold: int, operator_id: str, request: Request) -> dict:
    ensure_team(db, team_id)
    budget = ensure_budget(db, team_id)
    changes = {
        "alert_enabled": {"from": budget.alert_enabled, "to": enabled},
        "alert_threshold": {"from": budget.alert_threshold, "to": threshold},
    }
    budget.alert_enabled = enabled
    budget.alert_threshold = threshold
    budget.updated_at = now_utc()
    db.save(budget)
    write_audit_log(db, entity_type="ai_resource", entity_id=team_id, action="budget_alert_updated", operator_id=operator_id, team_id=team_id, changes=changes, request=request)
    db.commit()
    return team_budget_payload(db, team_id)


def create_budget_request(db: MongoDatabase, team_id: str, requester_id: str, payload: dict, request: Request) -> dict:
    ensure_team(db, team_id)
    item = BudgetRequest(
        team_id=team_id,
        requester_id=requester_id,
        amount=payload["amount"],
        purpose=payload["purpose"],
        related_task_id=payload.get("related_task_id"),
        valid_until=payload.get("valid_until"),
        description=payload["description"],
    )
    db.add(item)
    write_audit_log(db, entity_type="ai_resource", entity_id=team_id, action="budget_requested", operator_id=requester_id, team_id=team_id, changes=payload, request=request)
    db.commit()
    return budget_request_payload(db, item)


def list_budget_requests(db: MongoDatabase, team_id: str) -> list[dict]:
    ensure_team(db, team_id)
    items = db.find(BudgetRequest, {"team_id": team_id}, sort=[("created_at", -1)])
    return [budget_request_payload(db, item) for item in items]


def approve_budget_request(db: MongoDatabase, team_id: str, request_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    ensure_team(db, team_id)
    item = db.get(BudgetRequest, request_id)
    if not item or item.team_id != team_id:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if item.status != "pending":
        raise AppError(ErrorCode.STATE_CONFLICT, "预算申请不在待审批状态")
    if payload["decision"] == "rejected" and not payload.get("comment"):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "拒绝预算申请必须填写审批备注")
    item.status = payload["decision"]
    item.approved_amount = payload.get("approved_amount") or (item.amount if payload["decision"] == "approved" else None)
    item.approver_id = operator_id
    item.approval_comment = payload.get("comment")
    item.updated_at = now_utc()
    if item.status == "approved" and item.approved_amount:
        budget = ensure_budget(db, team_id)
        budget.total_limit += item.approved_amount
        budget.updated_at = now_utc()
        db.save(budget)
    db.save(item)
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=team_id,
        action="budget_request_reviewed",
        operator_id=operator_id,
        team_id=team_id,
        changes={"request_id": request_id, "decision": item.status, "approved_amount": item.approved_amount},
        request=request,
    )
    db.commit()
    return budget_request_payload(db, item)


def _provider_has_configured_key(item: AiProviderConfig) -> bool:
    return bool(item.api_key_configured or getattr(item, "encrypted_api_key", None))


def _provider_visible_in_team_context(item: AiProviderConfig, *, manage_platform: bool) -> bool:
    if item.scope != "platform":
        return True
    if manage_platform:
        return True
    return item.status == "enabled" and _provider_has_configured_key(item)


def _sort_provider_records(items: list[AiProviderConfig]) -> list[AiProviderConfig]:
    return sorted(
        items,
        key=lambda item: (
            0 if item.scope == "platform" and bool(getattr(item, "is_platform_default", False)) else 1,
            0 if item.scope == "platform" else 1,
            0 if item.status == "enabled" else 1,
            -(item.updated_at.timestamp() if item.updated_at else 0),
        ),
    )


def list_provider_configs(
    db: MongoDatabase,
    team_id: str | None = None,
    *,
    manage_platform: bool = False,
    scope: str | None = None,
) -> list[dict]:
    query: dict = {}
    if team_id:
        query = {"$or": [{"team_id": team_id}, {"scope": "platform"}]}
    items = db.find(AiProviderConfig, query, sort=[("updated_at", -1)])
    visible_items = [
        item
        for item in items
        if ((not team_id) or item.team_id == team_id or _provider_visible_in_team_context(item, manage_platform=manage_platform))
        and (not scope or item.scope == scope)
    ]
    sorted_items = _sort_provider_records(visible_items)
    return [provider_payload(item, manage_platform=manage_platform) for item in sorted_items]


def create_provider_config(db: MongoDatabase, payload: dict, operator_id: str, request: Request) -> dict:
    scope = payload.get("scope") or "team"
    team_id = payload.get("team_id")
    if scope == "team" and team_id:
        ensure_team(db, team_id)
    item = AiProviderConfig(
        team_id=team_id if scope == "team" else None,
        provider=payload["provider"],
        scope=scope,
        api_base=payload.get("api_base"),
        api_key_configured=bool(payload.get("api_key")),
        default_model=payload["default_model"],
        models=payload.get("models") or [payload["default_model"]],
        status=payload.get("status") or "enabled",
        remark=payload.get("remark"),
        created_by=operator_id,
    )
    db.add(item)
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=item.id,
        action="ai_provider_created",
        operator_id=operator_id,
        team_id=team_id,
        changes={key: value for key, value in payload.items() if key != "api_key"},
        request=request,
    )
    db.commit()
    return provider_payload(item)


def estimate_tokens(payload: dict) -> dict:
    estimated_tokens = max(1, round((payload.get("prompt_chars", 0) + payload.get("completion_chars", 0)) / 4))
    estimated_cost = round(estimated_tokens * 0.000002, 6)
    return {"model": payload["model"], "estimated_tokens": estimated_tokens, "estimated_cost": estimated_cost}


def list_call_logs(db: MongoDatabase, team_id: str | None = None) -> list[dict]:
    query = {"team_id": team_id} if team_id else {}
    items = db.find(AiCallLog, query, sort=[("created_at", -1)])
    return [call_log_payload(item) for item in items]


def test_chat(db: MongoDatabase, payload: dict, team_id: str | None, operator_id: str, request: Request) -> dict:
    provider = None
    if payload.get("provider_id"):
        provider = db.get(AiProviderConfig, payload["provider_id"])
    if not provider and payload.get("provider"):
        provider = db.find_one(AiProviderConfig, {"provider": payload["provider"]})
    if not provider:
        raise AppError(ErrorCode.NOT_FOUND, "AI Provider 未配置")
    log = AiCallLog(
        team_id=team_id or provider.team_id or "",
        user_id=operator_id,
        provider_id=provider.id,
        route_name=_provider_route_name(provider),
        operation_type="test_connection",
        provider=provider.provider,
        model=payload.get("model") or provider.default_model,
        tokens=8,
        cost=0.000016,
        latency_ms=120,
        status="success",
    )
    db.add(log)
    write_audit_log(db, entity_type="ai_resource", entity_id=provider.id, action="ai_provider_tested", operator_id=operator_id, team_id=team_id or provider.team_id, changes={"provider": provider.provider}, request=request)
    db.commit()
    return {"provider": provider.provider, "model": log.model, "latency_ms": log.latency_ms, "status": "success", "request_id": None}


SUPPORTED_PROVIDER_CAPABILITIES = {"text", "image", "audio", "video"}
SUPPORTED_PROVIDER_TRANSPORT_MODES = {"external_url", "inline_data", "file_api"}
SUPPORTED_PROVIDER_MESSAGE_PARTS = {"text", "image", "audio", "video"}
OPENAI_COMPATIBLE_PROVIDER_KINDS = {
    "OpenAI",
    "OpenAI Compatible",
    "DeepSeek",
    "OpenRouter",
    "方舟",
    "通义千问",
    "Ollama / LM Studio",
}
DEFAULT_PROVIDER_BASES = {
    "方舟": "https://ark.cn-beijing.volces.com/api/v3",
    "通义千问": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "OpenAI": "https://api.openai.com/v1",
    "OpenAI Compatible": "https://api.example.com/v1",
    "DeepSeek": "https://api.deepseek.com/v1",
    "OpenRouter": "https://openrouter.ai/api/v1",
    "Anthropic": "https://api.anthropic.com/v1",
    "Gemini": "https://generativelanguage.googleapis.com/v1beta",
    "Azure OpenAI": "https://example-resource.openai.azure.com/openai/deployments/example-deployment",
    "Ollama / LM Studio": "http://127.0.0.1:11434/v1",
}
PROVIDER_CONNECTION_TEST_MAX_OUTPUT_TOKENS = 1
PROVIDER_CONNECTION_TEST_TIMEOUT_SECONDS = 8.0
SUPPORTED_PROVIDER_PROTOCOL_PROFILES = {
    "openai_chat",
    "openai_compatible_chat",
    "deepseek_chat",
    "openrouter_chat",
    "ark_chat",
    "qwen_chat",
    "anthropic_messages",
    "gemini_native",
    "azure_openai_chat",
    "ollama_chat",
}
PROVIDER_KIND_PROTOCOL_DEFAULTS = {
    "方舟": "ark_chat",
    "通义千问": "qwen_chat",
    "OpenAI": "openai_chat",
    "OpenAI Compatible": "openai_compatible_chat",
    "DeepSeek": "deepseek_chat",
    "OpenRouter": "openrouter_chat",
    "Anthropic": "anthropic_messages",
    "Gemini": "gemini_native",
    "Azure OpenAI": "azure_openai_chat",
    "Ollama / LM Studio": "ollama_chat",
}
PROTOCOL_PROFILE_SPECS: dict[str, dict[str, Any]] = {
    "openai_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["inline_data"], "request_part_types": ["input_audio"]},
            "video": {"transport_modes": [], "request_part_types": []},
        },
        "structured_output_mode": "json_schema",
    },
    "azure_openai_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["inline_data"], "request_part_types": ["input_audio"]},
            "video": {"transport_modes": [], "request_part_types": []},
        },
        "structured_output_mode": "json_schema",
    },
    "openai_compatible_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["audio_url", "input_audio"]},
            "video": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["video_url"]},
        },
        "structured_output_mode": "json_object",
    },
    "deepseek_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["audio_url", "input_audio"]},
            "video": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["video_url"]},
        },
        "structured_output_mode": "json_object",
    },
    "openrouter_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["audio_url", "input_audio"]},
            "video": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["video_url"]},
        },
        "structured_output_mode": "json_object",
    },
    "ark_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["audio_url", "input_audio"]},
            "video": {"transport_modes": ["external_url", "inline_data", "file_api"], "request_part_types": ["video_url", "input_video"]},
        },
        "structured_output_mode": "json_object",
    },
    "qwen_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["audio_url", "input_audio"]},
            "video": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["video_url"]},
        },
        "structured_output_mode": "json_object",
    },
    "anthropic_messages": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["inline_data"], "request_part_types": ["anthropic_image"]},
            "audio": {"transport_modes": [], "request_part_types": []},
            "video": {"transport_modes": [], "request_part_types": []},
        },
        "structured_output_mode": "prompt",
    },
    "gemini_native": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["file_data", "inline_data"]},
            "audio": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["file_data", "inline_data"]},
            "video": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["file_data", "inline_data"]},
        },
        "structured_output_mode": "json_mime",
    },
    "ollama_chat": {
        "supports_streaming": True,
        "modalities": {
            "text": {"transport_modes": [], "request_part_types": []},
            "image": {"transport_modes": ["external_url", "inline_data"], "request_part_types": ["image_url"]},
            "audio": {"transport_modes": [], "request_part_types": []},
            "video": {"transport_modes": [], "request_part_types": []},
        },
        "structured_output_mode": "prompt",
    },
}
OPENAI_COMPATIBLE_PROVIDER_KINDS.update({"方舟", "通义千问"})
DEFAULT_PROVIDER_BASES.setdefault("方舟", "https://ark.cn-beijing.volces.com/api/v3")
DEFAULT_PROVIDER_BASES.setdefault("通义千问", "https://dashscope.aliyuncs.com/compatible-mode/v1")


def _ensure_provider_exists(db: MongoDatabase, provider_id: str) -> AiProviderConfig:
    item = db.get(AiProviderConfig, provider_id)
    if not item:
        raise AppError(ErrorCode.NOT_FOUND, "AI Provider 不存在")
    return item


def _provider_kind(item_or_payload: AiProviderConfig | dict) -> str:
    if isinstance(item_or_payload, AiProviderConfig):
        raw_kind = (getattr(item_or_payload, "provider_kind", None) or item_or_payload.provider or "OpenAI Compatible").strip()
        return "DeepSeek" if raw_kind == "OpenAI Compatible" and _looks_like_deepseek_provider(item_or_payload) else raw_kind
    raw_kind = str(item_or_payload.get("provider_kind") or item_or_payload.get("provider") or "OpenAI Compatible").strip()
    return "DeepSeek" if raw_kind == "OpenAI Compatible" and _looks_like_deepseek_provider(item_or_payload) else raw_kind


def _looks_like_deepseek_provider(item_or_payload: AiProviderConfig | dict) -> bool:
    if isinstance(item_or_payload, AiProviderConfig):
        values = [
            getattr(item_or_payload, "route_name", None),
            getattr(item_or_payload, "api_base", None),
            getattr(item_or_payload, "model_id", None),
            getattr(item_or_payload, "default_model", None),
            getattr(item_or_payload, "provider", None),
        ]
    else:
        values = [
            item_or_payload.get("route_name"),
            item_or_payload.get("api_base"),
            item_or_payload.get("model_id"),
            item_or_payload.get("default_model"),
            item_or_payload.get("provider"),
        ]
    return any("deepseek" in str(value or "").strip().lower() for value in values)


def _provider_model_id(item_or_payload: AiProviderConfig | dict) -> str:
    if isinstance(item_or_payload, AiProviderConfig):
        return (
            getattr(item_or_payload, "model_id", None)
            or item_or_payload.default_model
            or (item_or_payload.models[0] if item_or_payload.models else "")
        ).strip()
    return str(item_or_payload.get("model_id") or item_or_payload.get("default_model") or "").strip()


def _provider_route_name(item_or_payload: AiProviderConfig | dict) -> str:
    if isinstance(item_or_payload, AiProviderConfig):
        route_name = getattr(item_or_payload, "route_name", None)
        if route_name:
            return route_name.strip()
        provider_kind = _provider_kind(item_or_payload)
        model_id = _provider_model_id(item_or_payload)
        return f"{provider_kind} / {model_id}" if model_id else provider_kind
    route_name = str(item_or_payload.get("route_name") or "").strip()
    if route_name:
        return route_name
    provider_kind = _provider_kind(item_or_payload)
    model_id = _provider_model_id(item_or_payload)
    return f"{provider_kind} / {model_id}" if model_id else provider_kind


def _provider_default_protocol_profile(provider_kind: str) -> str:
    if provider_kind in PROVIDER_KIND_PROTOCOL_DEFAULTS:
        return PROVIDER_KIND_PROTOCOL_DEFAULTS[provider_kind]
    normalized = str(provider_kind or "").strip().lower()
    if "ark" in normalized or "方舟" in provider_kind or "鏂硅垷" in provider_kind:
        return "ark_chat"
    if "qwen" in normalized or "dashscope" in normalized or "通义" in provider_kind or "閫氫箟" in provider_kind:
        return "qwen_chat"
    if "azure" in normalized:
        return "azure_openai_chat"
    if "anthropic" in normalized or "claude" in normalized:
        return "anthropic_messages"
    if "gemini" in normalized:
        return "gemini_native"
    if "openrouter" in normalized:
        return "openrouter_chat"
    if "deepseek" in normalized:
        return "deepseek_chat"
    if "ollama" in normalized or "lm studio" in normalized:
        return "ollama_chat"
    if normalized == "openai":
        return "openai_chat"
    return "openai_compatible_chat"


def _normalize_protocol_profile(protocol_profile: str | None, provider_kind: str) -> str:
    candidate = str(protocol_profile or "").strip()
    if candidate in SUPPORTED_PROVIDER_PROTOCOL_PROFILES:
        return candidate
    return _provider_default_protocol_profile(provider_kind)


def _provider_protocol_profile(item_or_payload: AiProviderConfig | dict) -> str:
    provider_kind = _provider_kind(item_or_payload)
    raw = getattr(item_or_payload, "protocol_profile", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("protocol_profile")
    return _normalize_protocol_profile(str(raw) if raw is not None else None, provider_kind)


def _protocol_profile_spec(protocol_profile: str) -> dict[str, Any]:
    return PROTOCOL_PROFILE_SPECS.get(protocol_profile, PROTOCOL_PROFILE_SPECS["openai_compatible_chat"])


def _protocol_modality_spec(protocol_profile: str, modality: str) -> dict[str, Any]:
    spec = _protocol_profile_spec(protocol_profile)
    modalities = spec.get("modalities") if isinstance(spec.get("modalities"), dict) else {}
    raw = modalities.get(modality)
    return raw if isinstance(raw, dict) else {"transport_modes": [], "request_part_types": []}


def _protocol_default_supports_streaming(protocol_profile: str) -> bool:
    return bool(_protocol_profile_spec(protocol_profile).get("supports_streaming", True))


def _protocol_default_media_transport_modes(protocol_profile: str, modality: str) -> list[str]:
    if modality == "text":
        return []
    raw = _protocol_modality_spec(protocol_profile, modality).get("transport_modes")
    return [mode for mode in _normalize_transport_modes(raw if isinstance(raw, list) else None)]


def _protocol_request_part_types(protocol_profile: str, modality: str) -> list[str]:
    raw = _protocol_modality_spec(protocol_profile, modality).get("request_part_types")
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if str(item).strip()]


def _protocol_default_request_part_type(protocol_profile: str, modality: str, transport_mode: str | None = None) -> str | None:
    part_types = _protocol_request_part_types(protocol_profile, modality)
    if not part_types:
        return None
    if transport_mode == "file_api" and "input_video" in part_types:
        return "input_video"
    if transport_mode == "inline_data" and "inline_data" in part_types:
        return "inline_data"
    if transport_mode == "inline_data" and "input_audio" in part_types:
        return "input_audio"
    if transport_mode == "external_url" and "file_data" in part_types:
        return "file_data"
    return part_types[0]


def _normalize_capability_options(protocol_profile: str, modality: str, options: Any) -> dict[str, Any]:
    raw = options if isinstance(options, dict) else {}
    normalized: dict[str, Any] = {}
    if modality == "video" and "video_url" in _protocol_request_part_types(protocol_profile, modality):
        fps = raw.get("fps")
        if fps is not None and str(fps).strip():
            try:
                normalized["fps"] = max(1, min(120, int(fps)))
            except (TypeError, ValueError):
                pass
    if modality == "image" and "image_url" in _protocol_request_part_types(protocol_profile, modality):
        detail = str(raw.get("detail") or "").strip().lower()
        if detail in {"low", "high", "auto"}:
            normalized["detail"] = detail
    return normalized


def _provider_pricing(item_or_payload: AiProviderConfig | dict) -> dict:
    raw = getattr(item_or_payload, "pricing", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("pricing")
    pricing = raw if isinstance(raw, dict) else {}
    return {
        "input_price_per_million": max(0.0, float(pricing.get("input_price_per_million") or 0)),
        "output_price_per_million": max(0.0, float(pricing.get("output_price_per_million") or 0)),
        "cache_hit_price_per_million": max(0.0, float(pricing.get("cache_hit_price_per_million") or 0)),
    }


def _provider_runtime(item_or_payload: AiProviderConfig | dict) -> dict:
    raw = getattr(item_or_payload, "runtime_config", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("runtime_config")
    runtime = raw if isinstance(raw, dict) else {}
    normalized: dict[str, Any] = {}
    if runtime.get("temperature") is not None:
        normalized["temperature"] = float(runtime["temperature"])
    if runtime.get("max_output_tokens") is not None:
        normalized["max_output_tokens"] = max(1, int(runtime["max_output_tokens"]))
    if runtime.get("timeout_ms") is not None:
        normalized["timeout_ms"] = max(1000, int(runtime["timeout_ms"]))
    for key, value in runtime.items():
        if key in {"temperature", "max_output_tokens", "timeout_ms"}:
            continue
        if isinstance(value, (str, bool)):
            normalized[key] = value.strip() if isinstance(value, str) else value
            continue
        if isinstance(value, (int, float)):
            normalized[key] = value
            continue
        if isinstance(value, dict):
            normalized[key] = {str(child_key): str(child_value) for child_key, child_value in value.items()}
    return normalized


def _provider_capabilities(item_or_payload: AiProviderConfig | dict) -> list[str]:
    raw = getattr(item_or_payload, "capabilities", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("capabilities")
    if isinstance(raw, list):
        values = [str(item).strip().lower() for item in raw if str(item).strip().lower() in SUPPORTED_PROVIDER_CAPABILITIES]
        if values:
            return sorted(set(values))
    return ["text"]


def _normalize_pricing(pricing: dict | None) -> dict:
    if not isinstance(pricing, dict):
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "请填写完整的 Provider 费率")
    return _provider_pricing({"pricing": pricing})


def _normalize_runtime(runtime_config: dict | None) -> dict:
    if runtime_config is None:
        return {}
    if not isinstance(runtime_config, dict):
        raise AppError(ErrorCode.VALIDATION_FORMAT, "运行配置格式不正确")
    return _provider_runtime({"runtime_config": runtime_config})


def _normalize_capabilities(capabilities: list[str] | None) -> list[str]:
    if not capabilities:
        return ["text"]
    values = [str(item).strip().lower() for item in capabilities if str(item).strip()]
    filtered = [item for item in values if item in SUPPORTED_PROVIDER_CAPABILITIES]
    return sorted(set(filtered or ["text"]))


def _normalize_transport_modes(transport_modes: list[str] | None) -> list[str]:
    if not transport_modes:
        return []
    values = [str(item).strip().lower() for item in transport_modes if str(item).strip()]
    filtered = [item for item in values if item in SUPPORTED_PROVIDER_TRANSPORT_MODES]
    return sorted(set(filtered))


def _provider_default_supports_streaming(provider_kind: str) -> bool:
    return provider_kind in {
        "OpenAI",
        "OpenAI Compatible",
        "DeepSeek",
        "OpenRouter",
        "Azure OpenAI",
        "Anthropic",
        "Gemini",
        "鏂硅垷",
        "閫氫箟鍗冮棶",
        "Ollama / LM Studio",
    }


def _provider_default_media_transport_modes(provider_kind: str, modality: str) -> list[str]:
    if modality == "text":
        return []
    if provider_kind == "Anthropic":
        return ["inline_data"] if modality == "image" else []
    if provider_kind == "Gemini":
        return ["external_url", "inline_data"]
    if modality == "image":
        return ["external_url", "inline_data"]
    return []


def _provider_base_capability_profile(
    provider_kind: str,
    capabilities: list[str],
    transport_modes: list[str] | None = None,
    supports_streaming: bool | None = None,
) -> dict[str, dict[str, Any]]:
    normalized_capabilities = _normalize_capabilities(capabilities)
    normalized_transport_modes = _normalize_transport_modes(transport_modes)
    effective_streaming = _provider_default_supports_streaming(provider_kind) if supports_streaming is None else bool(supports_streaming)
    capability_set = set(normalized_capabilities)
    profile: dict[str, dict[str, Any]] = {}
    for modality in ("text", "image", "audio", "video"):
        enabled = modality in capability_set
        default_modes = _provider_default_media_transport_modes(provider_kind, modality)
        modes = default_modes
        if modality != "text" and normalized_transport_modes:
            modes = [mode for mode in normalized_transport_modes if mode in default_modes]
        if modality in {"audio", "video"} and provider_kind != "Gemini":
            enabled = False
            modes = []
        if provider_kind in {"OpenAI", "Azure OpenAI"} and modality in {"audio", "video"}:
            enabled = False
            modes = []
        if provider_kind == "Anthropic" and modality not in {"text", "image"}:
            enabled = False
            modes = []
        profile[modality] = {
            "enabled": enabled,
            "transport_modes": modes,
            "supports_streaming": effective_streaming,
        }
    profile["text"]["enabled"] = True
    profile["text"]["transport_modes"] = []
    return profile


def _normalize_capability_profile(
    provider_kind: str,
    capabilities: list[str] | None,
    transport_modes: list[str] | None,
    supports_streaming: bool | None,
    capability_profile: dict | None,
) -> dict[str, dict[str, Any]]:
    profile = _provider_base_capability_profile(provider_kind, capabilities or ["text"], transport_modes, supports_streaming)
    if not isinstance(capability_profile, dict):
        return profile
    for modality in ("text", "image", "audio", "video"):
        raw = capability_profile.get(modality)
        if not isinstance(raw, dict):
            continue
        if raw.get("enabled") is not None:
            profile[modality]["enabled"] = bool(raw.get("enabled"))
        raw_modes = raw.get("transport_modes")
        if isinstance(raw_modes, list):
            allowed_modes = _provider_default_media_transport_modes(provider_kind, modality)
            profile[modality]["transport_modes"] = [mode for mode in _normalize_transport_modes(raw_modes) if mode in allowed_modes]
        if raw.get("supports_streaming") is not None:
            profile[modality]["supports_streaming"] = bool(raw.get("supports_streaming"))
    profile["text"]["enabled"] = True
    profile["text"]["transport_modes"] = []
    return profile


def _provider_transport_modes(item_or_payload: AiProviderConfig | dict) -> list[str]:
    raw = getattr(item_or_payload, "transport_modes", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("transport_modes")
    explicit = _normalize_transport_modes(raw if isinstance(raw, list) else None)
    if explicit:
        return explicit
    provider_kind = _provider_kind(item_or_payload)
    capabilities = _provider_capabilities(item_or_payload)
    modes: set[str] = set()
    for modality in capabilities:
        if modality == "text":
            continue
        modes.update(_provider_default_media_transport_modes(provider_kind, modality))
    return sorted(modes)


def _provider_supports_streaming(item_or_payload: AiProviderConfig | dict) -> bool:
    raw = getattr(item_or_payload, "supports_streaming", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("supports_streaming")
    if raw is not None:
        return bool(raw)
    return _provider_default_supports_streaming(_provider_kind(item_or_payload))


def _provider_capability_profile(item_or_payload: AiProviderConfig | dict) -> dict[str, dict[str, Any]]:
    provider_kind = _provider_kind(item_or_payload)
    capabilities = _provider_capabilities(item_or_payload)
    transport_modes = _provider_transport_modes(item_or_payload)
    supports_streaming = _provider_supports_streaming(item_or_payload)
    raw_profile = getattr(item_or_payload, "capability_profile", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("capability_profile")
    return _normalize_capability_profile(provider_kind, capabilities, transport_modes, supports_streaming, raw_profile if isinstance(raw_profile, dict) else None)


def _provider_base_capability_profile(
    protocol_profile: str,
    capabilities: list[str],
    transport_modes: list[str] | None = None,
    supports_streaming: bool | None = None,
) -> dict[str, dict[str, Any]]:
    normalized_capabilities = _normalize_capabilities(capabilities)
    normalized_transport_modes = _normalize_transport_modes(transport_modes)
    effective_streaming = _protocol_default_supports_streaming(protocol_profile) if supports_streaming is None else bool(supports_streaming)
    capability_set = set(normalized_capabilities)
    profile: dict[str, dict[str, Any]] = {}
    for modality in ("text", "image", "audio", "video"):
        default_modes = _protocol_default_media_transport_modes(protocol_profile, modality)
        supported = bool(default_modes or _protocol_request_part_types(protocol_profile, modality))
        modes = default_modes
        if modality != "text" and normalized_transport_modes:
            modes = [mode for mode in normalized_transport_modes if mode in default_modes]
        profile[modality] = {
            "enabled": modality == "text" or (supported and modality in capability_set),
            "transport_modes": modes,
            "supports_streaming": effective_streaming,
            "request_part_type": _protocol_default_request_part_type(protocol_profile, modality, modes[0] if modes else None),
            "options": {},
        }
    profile["text"]["enabled"] = True
    profile["text"]["transport_modes"] = []
    return profile


def _normalize_capability_profile(
    protocol_profile: str,
    capabilities: list[str] | None,
    transport_modes: list[str] | None,
    supports_streaming: bool | None,
    capability_profile: dict | None,
) -> dict[str, dict[str, Any]]:
    profile = _provider_base_capability_profile(protocol_profile, capabilities or ["text"], transport_modes, supports_streaming)
    if not isinstance(capability_profile, dict):
        return profile
    for modality in ("text", "image", "audio", "video"):
        raw = capability_profile.get(modality)
        if not isinstance(raw, dict):
            continue
        if raw.get("enabled") is not None:
            profile[modality]["enabled"] = bool(raw.get("enabled"))
        raw_modes = raw.get("transport_modes")
        if isinstance(raw_modes, list):
            allowed_modes = _protocol_default_media_transport_modes(protocol_profile, modality)
            normalized_modes = [mode for mode in _normalize_transport_modes(raw_modes) if mode in allowed_modes]
            profile[modality]["transport_modes"] = normalized_modes if normalized_modes else allowed_modes
        if raw.get("supports_streaming") is not None:
            profile[modality]["supports_streaming"] = bool(raw.get("supports_streaming"))
        request_part_type = str(raw.get("request_part_type") or "").strip()
        if request_part_type and request_part_type in _protocol_request_part_types(protocol_profile, modality):
            profile[modality]["request_part_type"] = request_part_type
        profile[modality]["options"] = _normalize_capability_options(protocol_profile, modality, raw.get("options"))
    profile["text"]["enabled"] = True
    profile["text"]["transport_modes"] = []
    for modality in ("image", "audio", "video"):
        if not profile[modality].get("enabled"):
            continue
        default_modes = _protocol_default_media_transport_modes(protocol_profile, modality)
        if default_modes and not list(profile[modality].get("transport_modes") or []):
            profile[modality]["transport_modes"] = default_modes
        if not profile[modality].get("request_part_type"):
            profile[modality]["request_part_type"] = _protocol_default_request_part_type(
                protocol_profile,
                modality,
                (profile[modality].get("transport_modes") or [None])[0],
            )
    return profile


def _provider_transport_modes(item_or_payload: AiProviderConfig | dict) -> list[str]:
    raw = getattr(item_or_payload, "transport_modes", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("transport_modes")
    explicit = _normalize_transport_modes(raw if isinstance(raw, list) else None)
    if explicit:
        return explicit
    raw_profile = getattr(item_or_payload, "capability_profile", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("capability_profile")
    if isinstance(raw_profile, dict):
        from_profile = {
            mode
            for modality in ("image", "audio", "video")
            for mode in _normalize_transport_modes(
                (raw_profile.get(modality) or {}).get("transport_modes") if isinstance(raw_profile.get(modality), dict) else None,
            )
        }
        if from_profile:
            return sorted(from_profile)
    protocol_profile = _provider_protocol_profile(item_or_payload)
    capabilities = _provider_capabilities(item_or_payload)
    modes: set[str] = set()
    for modality in capabilities:
        if modality != "text":
            modes.update(_protocol_default_media_transport_modes(protocol_profile, modality))
    return sorted(modes)


def _provider_supports_streaming(item_or_payload: AiProviderConfig | dict) -> bool:
    raw = getattr(item_or_payload, "supports_streaming", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("supports_streaming")
    if raw is not None:
        return bool(raw)
    return _protocol_default_supports_streaming(_provider_protocol_profile(item_or_payload))


def _provider_capability_profile(item_or_payload: AiProviderConfig | dict) -> dict[str, dict[str, Any]]:
    protocol_profile = _provider_protocol_profile(item_or_payload)
    capabilities = _provider_capabilities(item_or_payload)
    transport_modes = _provider_transport_modes(item_or_payload)
    supports_streaming = _provider_supports_streaming(item_or_payload)
    raw_profile = getattr(item_or_payload, "capability_profile", None) if isinstance(item_or_payload, AiProviderConfig) else item_or_payload.get("capability_profile")
    return _normalize_capability_profile(protocol_profile, capabilities, transport_modes, supports_streaming, raw_profile if isinstance(raw_profile, dict) else None)


def _unique_route_name(db: MongoDatabase, *, team_id: str | None, route_name: str, exclude_provider_id: str | None = None) -> str:
    base = route_name.strip()
    candidate = base
    index = 1
    while True:
        existing = db.find_one(AiProviderConfig, {"team_id": team_id, "route_name": candidate})
        if not existing or existing.id == exclude_provider_id:
            return candidate
        index += 1
        candidate = f"{base} {index}"


def _set_platform_default_provider(
    db: MongoDatabase,
    *,
    target_provider_id: str | None,
    enabled: bool,
) -> None:
    items = db.find(AiProviderConfig, {"scope": "platform"})
    for entry in items:
        next_value = bool(enabled and target_provider_id and entry.id == target_provider_id)
        if bool(getattr(entry, "is_platform_default", False)) == next_value:
            continue
        entry.is_platform_default = next_value
        entry.updated_at = now_utc()
        db.save(entry)


def create_provider_config(db: MongoDatabase, payload: dict, operator_id: str, request: Request) -> dict:
    scope = str(payload.get("scope") or "team")
    team_id = str(payload.get("team_id") or "") if scope == "team" else None
    if scope == "team":
        ensure_team(db, team_id)
    provider_kind = _provider_kind(payload)
    model_id = _provider_model_id(payload)
    route_name = _unique_route_name(db, team_id=team_id, route_name=_provider_route_name(payload))
    api_key = (payload.get("api_key") or "").strip()
    is_platform_default = bool(payload.get("is_platform_default")) if scope == "platform" else False
    capabilities = _normalize_capabilities(payload.get("capabilities"))
    protocol_profile = _normalize_protocol_profile(payload.get("protocol_profile"), provider_kind)
    transport_modes = _normalize_transport_modes(payload.get("transport_modes"))
    supports_streaming = payload.get("supports_streaming")
    capability_profile = _normalize_capability_profile(
        protocol_profile,
        capabilities,
        transport_modes,
        supports_streaming if supports_streaming is None else bool(supports_streaming),
        payload.get("capability_profile") if isinstance(payload.get("capability_profile"), dict) else None,
    )
    item = AiProviderConfig(
        team_id=team_id,
        route_name=route_name,
        provider_kind=provider_kind,
        provider=provider_kind,
        scope=scope,
        is_platform_default=is_platform_default,
        api_base=(payload.get("api_base") or DEFAULT_PROVIDER_BASES.get(provider_kind) or "").strip() or None,
        encrypted_api_key=encrypt_secret(api_key) if api_key else None,
        api_key_configured=bool(api_key),
        model_id=model_id,
        default_model=model_id,
        models=[model_id],
        pricing=_normalize_pricing(payload.get("pricing")),
        capabilities=capabilities,
        protocol_profile=protocol_profile,
        transport_modes=transport_modes,
        supports_streaming=_protocol_default_supports_streaming(protocol_profile) if supports_streaming is None else bool(supports_streaming),
        capability_profile=capability_profile,
        runtime_config=_normalize_runtime(payload.get("runtime_config")),
        status=payload.get("status") or "enabled",
        remark=(payload.get("remark") or "").strip() or None,
        created_by=operator_id,
    )
    db.add(item)
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=item.id,
        action="ai_provider_created",
        operator_id=operator_id,
        team_id=team_id,
        changes={"route_name": item.route_name, "provider_kind": item.provider_kind, "model_id": item.model_id},
        request=request,
    )
    if scope == "platform" and is_platform_default:
        _set_platform_default_provider(db, target_provider_id=item.id, enabled=True)
    db.commit()
    return provider_payload(item, manage_platform=True)


def update_provider_config(db: MongoDatabase, provider_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    item = _ensure_provider_exists(db, provider_id)
    before = provider_payload(item, manage_platform=True)
    if "route_name" in payload and payload["route_name"]:
        item.route_name = _unique_route_name(db, team_id=item.team_id, route_name=str(payload["route_name"]), exclude_provider_id=item.id)
    if "provider_kind" in payload and payload["provider_kind"]:
        item.provider_kind = str(payload["provider_kind"]).strip()
        item.provider = item.provider_kind
    if "protocol_profile" in payload and payload["protocol_profile"] is not None:
        item.protocol_profile = _normalize_protocol_profile(payload.get("protocol_profile"), _provider_kind(item))
    if "is_platform_default" in payload and item.scope == "platform":
        item.is_platform_default = bool(payload.get("is_platform_default"))
    if "api_base" in payload:
        item.api_base = (payload.get("api_base") or "").strip() or None
    if "model_id" in payload and payload["model_id"]:
        item.model_id = str(payload["model_id"]).strip()
        item.default_model = item.model_id
        item.models = [item.model_id]
    if "pricing" in payload and payload["pricing"] is not None:
        item.pricing = _normalize_pricing(payload["pricing"])
    if "capabilities" in payload and payload["capabilities"] is not None:
        item.capabilities = _normalize_capabilities(payload["capabilities"])
    if "transport_modes" in payload and payload["transport_modes"] is not None:
        item.transport_modes = _normalize_transport_modes(payload["transport_modes"])
    if "supports_streaming" in payload and payload["supports_streaming"] is not None:
        item.supports_streaming = bool(payload["supports_streaming"])
    if "capability_profile" in payload and payload["capability_profile"] is not None:
        item.capability_profile = _normalize_capability_profile(
            _provider_protocol_profile(item),
            item.capabilities,
            item.transport_modes,
            item.supports_streaming,
            payload["capability_profile"] if isinstance(payload["capability_profile"], dict) else None,
        )
    if "runtime_config" in payload and payload["runtime_config"] is not None:
        item.runtime_config = _normalize_runtime(payload["runtime_config"])
    if "status" in payload and payload["status"]:
        item.status = str(payload["status"])
    if "remark" in payload:
        item.remark = (payload.get("remark") or "").strip() or None
    api_key = (payload.get("api_key") or "").strip() if "api_key" in payload else ""
    if api_key:
        item.encrypted_api_key = encrypt_secret(api_key)
        item.api_key_configured = True
    item.capability_profile = _normalize_capability_profile(
        _provider_protocol_profile(item),
        item.capabilities,
        item.transport_modes,
        item.supports_streaming,
        item.capability_profile if isinstance(item.capability_profile, dict) else None,
    )
    item.updated_at = now_utc()
    db.save(item)
    if item.scope == "platform" and item.is_platform_default:
        _set_platform_default_provider(db, target_provider_id=item.id, enabled=True)
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=item.id,
        action="ai_provider_updated",
        operator_id=operator_id,
        team_id=item.team_id,
        changes={"before": before, "after": provider_payload(item, manage_platform=True), "api_key_rotated": bool(api_key)},
        request=request,
    )
    db.commit()
    return provider_payload(item, manage_platform=True)


def duplicate_provider_config(db: MongoDatabase, provider_id: str, operator_id: str, request: Request) -> dict:
    source = _ensure_provider_exists(db, provider_id)
    copied = AiProviderConfig(
        team_id=source.team_id,
        route_name=_unique_route_name(db, team_id=source.team_id, route_name=f"{_provider_route_name(source)} 副本"),
        provider_kind=_provider_kind(source),
        provider=_provider_kind(source),
        scope=source.scope,
        is_platform_default=False,
        api_base=source.api_base,
        encrypted_api_key=source.encrypted_api_key,
        api_key_configured=bool(source.api_key_configured),
        model_id=_provider_model_id(source),
        default_model=_provider_model_id(source),
        models=[_provider_model_id(source)],
        pricing=_provider_pricing(source),
        capabilities=_provider_capabilities(source),
        protocol_profile=_provider_protocol_profile(source),
        transport_modes=_provider_transport_modes(source),
        supports_streaming=_provider_supports_streaming(source),
        capability_profile=_provider_capability_profile(source),
        runtime_config=_provider_runtime(source),
        status="disabled",
        remark=source.remark,
        created_by=operator_id,
    )
    db.add(copied)
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=copied.id,
        action="ai_provider_duplicated",
        operator_id=operator_id,
        team_id=copied.team_id,
        changes={"source_provider_id": source.id, "route_name": copied.route_name},
        request=request,
    )
    db.commit()
    return provider_payload(copied, manage_platform=True)


def set_provider_config_status(db: MongoDatabase, provider_id: str, status: str, operator_id: str, request: Request) -> dict:
    item = _ensure_provider_exists(db, provider_id)
    previous_status = item.status
    item.status = status
    if item.scope == "platform" and status != "enabled" and bool(getattr(item, "is_platform_default", False)):
        item.is_platform_default = False
    item.updated_at = now_utc()
    db.save(item)
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=item.id,
        action="ai_provider_status_updated",
        operator_id=operator_id,
        team_id=item.team_id,
        changes={"status": {"from": previous_status, "to": status}},
        request=request,
    )
    db.commit()
    return provider_payload(item, manage_platform=True)


def delete_provider_config(db: MongoDatabase, provider_id: str, operator_id: str, request: Request) -> None:
    item = _ensure_provider_exists(db, provider_id)
    db.delete_one(AiProviderConfig, {"_id": provider_id})
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=provider_id,
        action="ai_provider_deleted",
        operator_id=operator_id,
        team_id=item.team_id,
        changes={"route_name": _provider_route_name(item)},
        request=request,
    )
    db.commit()


def _provider_timeout_seconds(item: AiProviderConfig) -> float:
    runtime = _provider_runtime(item)
    return max(1.0, float(runtime.get("timeout_ms", 60000)) / 1000)


def _provider_generation_timeout_seconds(item: AiProviderConfig) -> float:
    runtime = _provider_runtime(item)
    return max(1.0, float(runtime.get("timeout_ms", 60000)) / 1000)


def _provider_connection_test_timeout_seconds(item: AiProviderConfig) -> float:
    return min(_provider_timeout_seconds(item), PROVIDER_CONNECTION_TEST_TIMEOUT_SECONDS)


def _provider_http_trust_env(item: AiProviderConfig) -> bool:
    runtime = _provider_runtime(item)
    return bool(runtime.get("trust_env_proxy") or runtime.get("trust_env"))


def _provider_http_client(item: AiProviderConfig, *, timeout: float) -> httpx.Client:
    return httpx.Client(timeout=timeout, trust_env=_provider_http_trust_env(item))


def _provider_requires_api_key(item: AiProviderConfig) -> bool:
    return _provider_kind(item) != "Ollama / LM Studio"


def _provider_api_base(item: AiProviderConfig) -> str:
    provider_kind = _provider_kind(item)
    runtime = _provider_runtime(item)
    api_base = (item.api_base or DEFAULT_PROVIDER_BASES.get(provider_kind) or "").strip().rstrip("/")
    if provider_kind == "方舟" and str(runtime.get("region") or "").strip():
        region = str(runtime["region"]).strip()
        if "volces.com/api/v3" in api_base or not api_base:
            api_base = f"https://ark.{region}.volces.com/api/v3"
    if provider_kind == "Gemini" and str(runtime.get("api_version") or "").strip() and "/v" in api_base:
        head, _, _ = api_base.rpartition("/")
        if head:
            api_base = f"{head}/{str(runtime['api_version']).strip().strip('/')}"
    return api_base


def _provider_extra_headers(item: AiProviderConfig) -> dict[str, str]:
    provider_kind = _provider_kind(item)
    runtime = _provider_runtime(item)
    headers: dict[str, str] = {}
    if provider_kind == "OpenAI":
        if runtime.get("organization_id"):
            headers["OpenAI-Organization"] = str(runtime["organization_id"])
        if runtime.get("project_id"):
            headers["OpenAI-Project"] = str(runtime["project_id"])
    if provider_kind == "OpenRouter":
        if runtime.get("site_url"):
            headers["HTTP-Referer"] = str(runtime["site_url"])
        if runtime.get("app_name"):
            headers["X-Title"] = str(runtime["app_name"])
    if provider_kind in {"OpenAI Compatible", "DeepSeek"}:
        custom_headers = runtime.get("custom_headers")
        if isinstance(custom_headers, dict):
            headers.update({str(key): str(value) for key, value in custom_headers.items()})
    if provider_kind == "通义千问" and runtime.get("workspace_id"):
        headers["X-DashScope-WorkSpace"] = str(runtime["workspace_id"])
    return headers


def _provider_headers(item: AiProviderConfig, api_key: str | None) -> dict[str, str]:
    provider_kind = _provider_kind(item)
    runtime = _provider_runtime(item)
    headers: dict[str, str] = {"content-type": "application/json"}
    if provider_kind == "Anthropic":
        headers["x-api-key"] = api_key or ""
        headers["anthropic-version"] = str(runtime.get("anthropic_version") or "2023-06-01")
        return headers
    if provider_kind == "Azure OpenAI":
        headers["api-key"] = api_key or ""
        return headers
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"
    headers.update(_provider_extra_headers(item))
    return headers


def _provider_api_base(item: AiProviderConfig) -> str:
    provider_kind = _provider_kind(item)
    protocol_profile = _provider_protocol_profile(item)
    runtime = _provider_runtime(item)
    api_base = (item.api_base or DEFAULT_PROVIDER_BASES.get(provider_kind) or "").strip().rstrip("/")
    if protocol_profile == "ark_chat" and str(runtime.get("region") or "").strip():
        region = str(runtime["region"]).strip()
        if "volces.com/api/v3" in api_base or not api_base:
            api_base = f"https://ark.{region}.volces.com/api/v3"
    if protocol_profile == "gemini_native" and str(runtime.get("api_version") or "").strip() and "/v" in api_base:
        head, _, _ = api_base.rpartition("/")
        if head:
            api_base = f"{head}/{str(runtime['api_version']).strip().strip('/')}"
    return api_base


def _provider_extra_headers(item: AiProviderConfig) -> dict[str, str]:
    provider_kind = _provider_kind(item)
    protocol_profile = _provider_protocol_profile(item)
    runtime = _provider_runtime(item)
    headers: dict[str, str] = {}
    if provider_kind == "OpenAI":
        if runtime.get("organization_id"):
            headers["OpenAI-Organization"] = str(runtime["organization_id"])
        if runtime.get("project_id"):
            headers["OpenAI-Project"] = str(runtime["project_id"])
    if provider_kind == "OpenRouter":
        if runtime.get("site_url"):
            headers["HTTP-Referer"] = str(runtime["site_url"])
        if runtime.get("app_name"):
            headers["X-Title"] = str(runtime["app_name"])
    if provider_kind in {"OpenAI Compatible", "DeepSeek"}:
        custom_headers = runtime.get("custom_headers")
        if isinstance(custom_headers, dict):
            headers.update({str(key): str(value) for key, value in custom_headers.items()})
    if protocol_profile == "qwen_chat" and runtime.get("workspace_id"):
        headers["X-DashScope-WorkSpace"] = str(runtime["workspace_id"])
    return headers


def build_text_messages(prompt: str) -> list[dict[str, Any]]:
    return [{"role": "user", "content": [{"type": "text", "text": prompt}]}]


def _message_part_data_url(url: str) -> tuple[str, str] | None:
    if not url.startswith("data:") or ";base64," not in url:
        return None
    header, data = url.split(";base64,", 1)
    return header.removeprefix("data:"), data


def _summarize_debug_source(value: str) -> str:
    source = str(value or "").strip()
    if not source:
        return ""
    if source.startswith("provider-file://"):
        return "provider_file"
    data_url = _message_part_data_url(source)
    if data_url:
        mime_type, encoded = data_url
        return f"inline_data:{mime_type}:len={len(encoded)}"
    if source.startswith("/api/v1/uploads/"):
        return "internal_upload_url"
    if source.startswith(("http://", "https://")):
        return "external_url"
    return "raw"


def _safe_debug_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _safe_debug_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_safe_debug_value(item) for item in value[:12]]
    if isinstance(value, str):
        if value.startswith("Bearer "):
            return "Bearer ***"
        if value.startswith("sk-"):
            return "***"
        if value.startswith("data:") and ";base64," in value:
            mime_type, encoded = _message_part_data_url(value) or ("application/octet-stream", "")
            return f"data:{mime_type};base64(len={len(encoded)})"
        return value if len(value) <= 240 else f"{value[:240]}...(len={len(value)})"
    return value


def _debug_response_summary(response_data: dict[str, Any], content: str) -> dict[str, Any]:
    output = response_data.get("output") if isinstance(response_data.get("output"), list) else []
    return {
        "top_level_keys": sorted([str(key) for key in response_data.keys()])[:20],
        "has_output": bool(output),
        "output_item_count": len(output),
        "content_preview": _safe_debug_value(content[:400]),
    }


def _normalize_message_part(part: dict[str, Any]) -> dict[str, Any]:
    part_type = str(part.get("type") or "").strip().lower()
    if part_type == "text":
        return {"type": "text", "text": str(part.get("text") or "")}
    if part_type in {"image", "audio", "video"}:
        source_url = str(part.get("source_url") or part.get("url") or "").strip()
        mime_type = str(part.get("mime_type") or "").strip() or None
        return {
            "type": part_type,
            "source_url": source_url,
            "mime_type": mime_type,
            "asset_id": str(part.get("asset_id") or "").strip() or None,
            "provider_file_id": str(part.get("provider_file_id") or "").strip() or None,
            "transport_mode_override": str(part.get("transport_mode_override") or "").strip() or None,
            "label": str(part.get("label") or part_type).strip() or part_type,
            "supports_external_url": bool(part.get("supports_external_url", True)),
            "supports_inline_data": bool(part.get("supports_inline_data", True)),
        }
    if part_type.endswith("_url"):
        url_key = f"{part_type}"
        source_url = str((part.get(url_key) or {}).get("url") or part.get("url") or "").strip()
        base_type = part_type.removesuffix("_url")
        return {
            "type": base_type,
            "source_url": source_url,
            "mime_type": str(part.get("mime_type") or "").strip() or None,
            "asset_id": str(part.get("asset_id") or "").strip() or None,
            "provider_file_id": str(part.get("provider_file_id") or "").strip() or None,
            "transport_mode_override": str(part.get("transport_mode_override") or "").strip() or None,
            "label": str(part.get("label") or base_type).strip() or base_type,
            "supports_external_url": True,
            "supports_inline_data": True,
        }
    raise AppError(ErrorCode.VALIDATION_FORMAT, f"不支持的 AI 消息片段类型：{part_type or 'unknown'}")


def normalize_ai_messages(messages: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized_messages: list[dict[str, Any]] = []
    for raw_message in messages or []:
        if not isinstance(raw_message, dict):
            continue
        role = str(raw_message.get("role") or "user")
        raw_content = raw_message.get("content")
        parts: list[dict[str, Any]] = []
        if isinstance(raw_content, list):
            for raw_part in raw_content:
                if isinstance(raw_part, dict):
                    parts.append(_normalize_message_part(raw_part))
        else:
            parts.append({"type": "text", "text": str(raw_content or "")})
        normalized_messages.append({"role": role, "content": parts})
    return normalized_messages


def _provider_base_url_is_publicly_reachable(value: str) -> bool:
    parsed = urlparse(str(value or "").strip())
    hostname = (parsed.hostname or "").strip().lower()
    if parsed.scheme not in {"http", "https"} or not hostname:
        return False
    if hostname in {"localhost", "127.0.0.1", "0.0.0.0", "testserver"} or hostname.endswith((".local", ".localhost", ".internal", ".lan")):
        return False
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified)


def _provider_public_api_base_url(request: Request | None) -> str:
    candidates: list[str] = []
    if settings.public_api_base_url:
        candidates.append(str(settings.public_api_base_url))
    if request is not None:
        candidates.append(str(request.base_url))
    if settings.frontend_app_url:
        candidates.append(str(settings.frontend_app_url))
    for candidate in candidates:
        value = str(candidate or "").strip()
        if not value:
            continue
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        base = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
        normalized = base.rstrip("/")
        if _provider_base_url_is_publicly_reachable(normalized):
            return normalized
        if request is not None and normalized.rstrip("/") == str(request.base_url).rstrip("/"):
            return normalized
    raise AppError(
        ErrorCode.BUSINESS_RULE,
        "当前环境未配置可供 AI Provider 访问的 API 公网地址，请设置 PUBLIC_API_BASE_URL",
    )


def _provider_signed_upload_url(item: UploadedFile, *, variant: str, request: Request | None) -> str:
    from app.services.video_preview_service import create_playback_token

    base = _provider_public_api_base_url(request)
    api_base = base if base.endswith(settings.api_v1_prefix) else f"{base}{settings.api_v1_prefix}"
    token = create_playback_token(item, variant)
    return f"{api_base}/uploads/{item.id}/playback?{urlencode({'token': token})}"


def _upload_file_id_from_provider_source(url: str) -> str:
    value = str(url or "").strip()
    if not value:
        return ""
    match = re.search(r"/api/v1/uploads/([^/?#]+)/(?:download|playback|public)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-fA-F0-9]{24}", value):
        return value
    return ""


def _provider_accessible_upload_variant(
    db: MongoDatabase,
    item: UploadedFile,
    *,
    part_type: str,
) -> tuple[UploadedFile, str, str | None]:
    from app.services.video_preview_service import is_native_browser_video, process_video_preview_background

    if part_type != "video":
        return item, "original", item.content_type or None
    if is_native_browser_video(item):
        return item, "original", item.content_type or "video/mp4"
    if getattr(item, "preview_status", "") == "ready" and getattr(item, "preview_path", ""):
        return item, "preview", getattr(item, "preview_content_type", None) or "video/mp4"
    process_video_preview_background(item.id)
    refreshed = db.get(UploadedFile, item.id) or item
    if getattr(refreshed, "preview_status", "") == "ready" and getattr(refreshed, "preview_path", ""):
        return refreshed, "preview", getattr(refreshed, "preview_content_type", None) or "video/mp4"
    if is_native_browser_video(refreshed):
        return refreshed, "original", refreshed.content_type or "video/mp4"
    raise AppError(
        ErrorCode.BUSINESS_RULE,
        "当前视频还没有可供 AI Provider 读取的可播放版本，请先生成视频预览或上传 mp4/webm",
        {
            "file_id": item.id,
            "preview_status": getattr(refreshed, "preview_status", None),
            "preview_error": getattr(refreshed, "preview_error", None),
        },
    )


def _provider_upload_inline_data_url(item: UploadedFile, *, variant: str, mime_type: str | None) -> str:
    if variant == "preview":
        preview_path = str(getattr(item, "preview_path", "") or "").strip()
        if not preview_path:
            raise AppError(ErrorCode.NOT_FOUND, "视频预览文件不存在")
        body = read_storage_file(preview_path)
    else:
        body = read_storage_file(item.path) if getattr(item, "path", None) else b""
    if not body:
        raise AppError(ErrorCode.NOT_FOUND, "媒体文件内容为空")
    media_type = str(mime_type or item.content_type or "application/octet-stream").split(";", 1)[0].strip() or "application/octet-stream"
    encoded = base64.b64encode(body).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def _provider_upload_file_api_asset(
    provider: AiProviderConfig,
    *,
    api_key: str | None,
    item: UploadedFile,
    variant: str,
    mime_type: str | None,
    fps: float | None = None,
    debug_entry: dict[str, Any] | None = None,
) -> str:
    api_base = _provider_api_base(provider)
    if not api_base:
        raise AppError(ErrorCode.BUSINESS_RULE, "Provider API Base 不能为空")
    if variant == "preview":
        preview_path = str(getattr(item, "preview_path", "") or "").strip()
        if not preview_path:
            raise AppError(ErrorCode.NOT_FOUND, "视频预览文件不存在")
        body = read_storage_file(preview_path)
        filename = f"{Path(item.filename or item.id).stem or item.id}.preview.mp4"
    else:
        body = read_storage_file(item.path) if getattr(item, "path", None) else b""
        filename = item.filename or f"{item.id}.bin"
    if not body:
        raise AppError(ErrorCode.NOT_FOUND, "媒体文件内容为空")
    media_type = str(mime_type or item.content_type or "application/octet-stream").split(";", 1)[0].strip() or "application/octet-stream"
    effective_fps = max(0.2, min(float(fps or 1.0), 5.0))
    upload_url = urljoin(f"{api_base}/", "files")
    if debug_entry is not None:
        debug_entry.update(
            {
                "transport_mode": "file_api",
                "upload_endpoint": "/files",
                "upload_purpose": "user_data",
                "upload_variant": variant,
                "upload_mime_type": media_type,
                "upload_fps": effective_fps,
            }
        )
    request_headers = {
        key: value
        for key, value in _provider_headers(provider, api_key).items()
        if key.lower() != "content-type"
    }
    with _provider_http_client(provider, timeout=_provider_generation_timeout_seconds(provider)) as client:
        response = client.post(
            upload_url,
            headers=request_headers,
            data={"purpose": "user_data", "preprocess_configs[video][fps]": str(effective_fps)},
            files={"file": (filename, body, media_type)},
        )
    if response.status_code >= 400:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 文件上传返回 {response.status_code}", response.text[:1000])
    payload = response.json()
    file_id = str(payload.get("id") or payload.get("file_id") or "").strip()
    if not file_id:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Provider 文件上传未返回 file_id")
    if debug_entry is not None:
        debug_entry["provider_file_id"] = file_id
    status = str(payload.get("status") or "").strip().lower()
    if status in {"processing", "uploaded", "pending"}:
        status_url = urljoin(f"{api_base}/", f"files/{file_id}")
        poll_count = 0
        with _provider_http_client(provider, timeout=_provider_generation_timeout_seconds(provider)) as client:
            for _ in range(30):
                poll_count += 1
                status_response = client.get(status_url, headers=request_headers)
                if status_response.status_code >= 400:
                    raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 文件状态接口返回 {status_response.status_code}", status_response.text[:1000])
                status_payload = status_response.json()
                current_status = str(status_payload.get("status") or "").strip().lower()
                if debug_entry is not None:
                    debug_entry["file_status_endpoint"] = f"/files/{file_id}"
                    debug_entry["file_status"] = current_status
                    debug_entry["file_status_polls"] = poll_count
                if current_status in {"processed", "ready", "completed", "succeeded"}:
                    return file_id
                if current_status in {"failed", "error", "cancelled"}:
                    raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Provider 文件处理失败", status_payload)
                time.sleep(2)
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Provider 文件处理超时", {"file_id": file_id})
    if debug_entry is not None:
        debug_entry["file_status"] = status or "processed"
        debug_entry["file_status_polls"] = 0
    return file_id


def _resolve_provider_accessible_messages(
    db: MongoDatabase,
    *,
    item: AiProviderConfig,
    api_key: str | None,
    team_id: str,
    messages: list[dict[str, Any]],
    request: Request | None,
    debug_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    resolved_messages = normalize_ai_messages(messages)
    capability_profile = _provider_capability_profile(item)
    media_debug = debug_context.setdefault("media_parts", []) if isinstance(debug_context, dict) else None
    public_base_available = False
    try:
        public_base_available = _provider_base_url_is_publicly_reachable(_provider_public_api_base_url(request))
    except AppError:
        public_base_available = False
    for message in resolved_messages:
        next_parts: list[dict[str, Any]] = []
        for part in message.get("content") or []:
            part_type = str(part.get("type") or "")
            if part_type == "text":
                next_parts.append(part)
                continue
            source_url = str(part.get("source_url") or "").strip()
            if not source_url or _message_part_data_url(source_url):
                next_parts.append(part)
                continue
            file_id = _upload_file_id_from_provider_source(source_url)
            if not file_id:
                next_parts.append(part)
                continue
            upload_record = db.get(UploadedFile, file_id)
            if not upload_record or upload_record.team_id != team_id:
                next_parts.append(part)
                continue
            upload_item, variant, mime_type = _provider_accessible_upload_variant(db, upload_record, part_type=part_type)
            part_capability = capability_profile.get(part_type) or {}
            protocol_profile = _provider_protocol_profile(item)
            allowed_modes = list(part_capability.get("transport_modes") or [])
            protocol_allowed_modes = _protocol_default_media_transport_modes(protocol_profile, part_type)
            effective_allowed_modes = allowed_modes or protocol_allowed_modes
            debug_entry = None
            if isinstance(media_debug, list):
                debug_entry = {
                    "label": str(part.get("label") or part_type),
                    "part_type": part_type,
                    "asset_id": upload_item.id,
                    "mime_type": mime_type,
                    "source_before": _summarize_debug_source(source_url),
                    "configured_transport_modes": allowed_modes,
                    "protocol_transport_modes": protocol_allowed_modes,
                }
                media_debug.append(debug_entry)
            request_part_type = str(
                part_capability.get("request_part_type")
                or _protocol_default_request_part_type(protocol_profile, part_type, (effective_allowed_modes or [None])[0])
                or ""
            ).strip()
            auto_force_file_api = protocol_profile == "ark_chat" and part_type == "video" and "file_api" in protocol_allowed_modes
            if (request_part_type == "input_video" and "file_api" in effective_allowed_modes) or auto_force_file_api:
                video_options = part_capability.get("options") if isinstance(part_capability.get("options"), dict) else {}
                provider_file_id = _provider_upload_file_api_asset(
                    item,
                    api_key=api_key,
                    item=upload_item,
                    variant=variant,
                    mime_type=mime_type,
                    fps=video_options.get("fps"),
                    debug_entry=debug_entry,
                )
                next_parts.append(
                    {
                        **part,
                        "source_url": f"provider-file://{provider_file_id}",
                        "mime_type": mime_type or part.get("mime_type"),
                        "asset_id": upload_item.id,
                        "provider_file_id": provider_file_id,
                        "transport_mode_override": "file_api",
                    }
                )
                if debug_entry is not None:
                    debug_entry["request_part_type"] = "input_video"
                    debug_entry["source_after"] = "provider_file"
                continue
            prefer_inline = "inline_data" in effective_allowed_modes and (
                not public_base_available or request_part_type in {"inline_data", "input_audio"}
            )
            next_source_url = (
                _provider_upload_inline_data_url(upload_item, variant=variant, mime_type=mime_type)
                if prefer_inline
                else _provider_signed_upload_url(upload_item, variant=variant, request=request)
            )
            next_parts.append(
                {
                    **part,
                    "source_url": next_source_url,
                    "mime_type": mime_type or part.get("mime_type"),
                    "asset_id": upload_item.id,
                }
            )
            if debug_entry is not None:
                debug_entry["transport_mode"] = "inline_data" if prefer_inline else "external_url"
                debug_entry["request_part_type"] = request_part_type or None
                debug_entry["source_after"] = _summarize_debug_source(next_source_url)
        message["content"] = next_parts
    return resolved_messages


def _message_required_modalities(messages: list[dict[str, Any]]) -> set[str]:
    modalities: set[str] = {"text"}
    for message in messages:
        for part in message.get("content") or []:
            part_type = str(part.get("type") or "")
            if part_type in SUPPORTED_PROVIDER_MESSAGE_PARTS:
                modalities.add(part_type)
    return modalities


def _message_part_transport_mode(part: dict[str, Any]) -> str | None:
    if str(part.get("type") or "") == "text":
        return None
    override = str(part.get("transport_mode_override") or "").strip()
    if override in SUPPORTED_PROVIDER_TRANSPORT_MODES:
        return override
    source_url = str(part.get("source_url") or "")
    if not source_url:
        return None
    return "inline_data" if _message_part_data_url(source_url) else "external_url"


def _validate_provider_messages(item: AiProviderConfig, messages: list[dict[str, Any]], *, stream: bool = False) -> None:
    profile = _provider_capability_profile(item)
    if stream and not _provider_supports_streaming(item):
        raise AppError(ErrorCode.BUSINESS_RULE, f"{_provider_route_name(item)} 未声明流式能力")
    for modality in _message_required_modalities(messages):
        entry = profile.get(modality) or {}
        if not bool(entry.get("enabled")):
            raise AppError(
                ErrorCode.BUSINESS_RULE,
                f"{_provider_route_name(item)} 不支持 {modality} 模态输入",
                {"provider_id": item.id, "provider_kind": _provider_kind(item), "unsupported_modality": modality},
            )
        if stream and modality != "text" and not bool(entry.get("supports_streaming", _provider_supports_streaming(item))):
            raise AppError(
                ErrorCode.BUSINESS_RULE,
                f"{_provider_route_name(item)} 不支持流式 {modality} 输入",
                {"provider_id": item.id, "provider_kind": _provider_kind(item), "unsupported_modality": modality},
            )
    for message in messages:
        for part in message.get("content") or []:
            part_type = str(part.get("type") or "")
            if part_type == "text":
                continue
            source_url = str(part.get("source_url") or "")
            if not source_url:
                raise AppError(ErrorCode.VALIDATION_REQUIRED, f"{part_type} 媒体缺少 source_url")
            transport_mode = _message_part_transport_mode(part)
            allowed_modes = list((profile.get(part_type) or {}).get("transport_modes") or [])
            if transport_mode and transport_mode not in allowed_modes:
                raise AppError(
                    ErrorCode.BUSINESS_RULE,
                    f"{_provider_route_name(item)} 不支持 {part_type} 的 {transport_mode} 传输方式",
                    {
                        "provider_id": item.id,
                        "provider_kind": _provider_kind(item),
                        "unsupported_modality": part_type,
                        "unsupported_transport_mode": transport_mode,
                        "supported_transport_modes": allowed_modes,
                    },
                )


def _validate_provider_messages(item: AiProviderConfig, messages: list[dict[str, Any]], *, stream: bool = False) -> None:
    profile = _provider_capability_profile(item)
    protocol_profile = _provider_protocol_profile(item)
    if stream and not _provider_supports_streaming(item):
        raise AppError(ErrorCode.BUSINESS_RULE, f"{_provider_route_name(item)} 未声明流式能力")
    for modality in _message_required_modalities(messages):
        entry = profile.get(modality) or {}
        if not bool(entry.get("enabled")):
            raise AppError(
                ErrorCode.BUSINESS_RULE,
                f"{_provider_route_name(item)} 不支持 {modality} 模态输入",
                {"provider_id": item.id, "provider_kind": _provider_kind(item), "unsupported_modality": modality},
            )
        if stream and modality != "text" and not bool(entry.get("supports_streaming", _provider_supports_streaming(item))):
            raise AppError(
                ErrorCode.BUSINESS_RULE,
                f"{_provider_route_name(item)} 不支持流式 {modality} 输入",
                {"provider_id": item.id, "provider_kind": _provider_kind(item), "unsupported_modality": modality},
            )
    for message in messages:
        for part in message.get("content") or []:
            part_type = str(part.get("type") or "")
            if part_type == "text":
                continue
            transport_mode = _message_part_transport_mode(part)
            provider_file_id = str(part.get("provider_file_id") or "").strip()
            source_url = str(part.get("source_url") or "")
            if transport_mode == "file_api" and provider_file_id:
                source_url = f"provider-file://{provider_file_id}"
            if not source_url:
                raise AppError(ErrorCode.VALIDATION_REQUIRED, f"{part_type} 媒体缺少 source_url")
            allowed_modes = list((profile.get(part_type) or {}).get("transport_modes") or [])
            protocol_allowed_modes = _protocol_default_media_transport_modes(protocol_profile, part_type)
            effective_allowed_modes = sorted({*allowed_modes, *protocol_allowed_modes}) if (allowed_modes or protocol_allowed_modes) else []
            if transport_mode and transport_mode not in effective_allowed_modes:
                raise AppError(
                    ErrorCode.BUSINESS_RULE,
                    f"{_provider_route_name(item)} 不支持 {part_type} 的 {transport_mode} 传输方式",
                    {
                        "provider_id": item.id,
                        "provider_kind": _provider_kind(item),
                        "unsupported_modality": part_type,
                        "unsupported_transport_mode": transport_mode,
                        "supported_transport_modes": effective_allowed_modes,
                    },
                )


def _messages_with_structured_output_schema(messages: list[dict[str, Any]], schema: dict[str, Any]) -> list[dict[str, Any]]:
    schema_text = "\nStructured output JSON schema:\n" + json.dumps(schema, ensure_ascii=False)
    cloned = normalize_ai_messages(messages)
    for index in range(len(cloned) - 1, -1, -1):
        if str(cloned[index].get("role") or "user") != "user":
            continue
        cloned[index]["content"] = [*(cloned[index].get("content") or []), {"type": "text", "text": schema_text}]
        return cloned
    return [*cloned, {"role": "user", "content": [{"type": "text", "text": schema_text}]}]


def _should_retry_without_native_response_format(
    request_body: dict[str, Any],
    structured_output_schema: dict[str, Any] | None,
) -> bool:
    return bool(structured_output_schema and isinstance(request_body, dict) and request_body.get("response_format"))


def _mime_type_audio_format(mime_type: str | None) -> str:
    value = str(mime_type or "").strip().lower()
    if "/" in value:
        value = value.split("/", 1)[1]
    value = value.split(";", 1)[0]
    if value in {"mpeg", "mp3"}:
        return "mp3"
    if value in {"wav", "wave", "x-wav"}:
        return "wav"
    if value in {"ogg", "oga"}:
        return "ogg"
    if value == "webm":
        return "webm"
    return "mp3"


def _openai_like_part_from_message_part(
    part: dict[str, Any],
    *,
    protocol_profile: str,
    capability_profile: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    part_type = str(part.get("type") or "")
    if part_type == "text":
        return {"type": "text", "text": str(part.get("text") or "")}
    source_url = str(part.get("source_url") or "")
    transport_mode = _message_part_transport_mode(part)
    part_profile = capability_profile.get(part_type) or {}
    request_part_type = str(
        part_profile.get("request_part_type")
        or _protocol_default_request_part_type(protocol_profile, part_type, transport_mode)
        or ""
    ).strip()
    options = part_profile.get("options") if isinstance(part_profile.get("options"), dict) else {}
    if request_part_type == "image_url":
        image_payload: dict[str, Any] = {"url": source_url}
        detail = str(options.get("detail") or "").strip().lower()
        if detail in {"low", "high", "auto"}:
            image_payload["detail"] = detail
        return {"type": "image_url", "image_url": image_payload}
    if request_part_type == "audio_url":
        return {"type": "audio_url", "audio_url": {"url": source_url}}
    if request_part_type == "input_audio":
        data_url = _message_part_data_url(source_url)
        if not data_url:
            raise AppError(ErrorCode.BUSINESS_RULE, "input_audio 仅支持 inline_data/base64 音频输入")
        media_type, encoded = data_url
        return {
            "type": "input_audio",
            "input_audio": {
                "data": encoded,
                "format": _mime_type_audio_format(media_type or part.get("mime_type")),
            },
        }
    if request_part_type == "video_url":
        video_payload: dict[str, Any] = {"url": source_url}
        if options.get("fps") is not None:
            video_payload["fps"] = int(options["fps"])
        return {"type": "video_url", "video_url": video_payload}
    raise AppError(ErrorCode.BUSINESS_RULE, f"{protocol_profile} 请求构建器不支持 {part_type}")


def _openai_message_from_message(
    message: dict[str, Any],
    *,
    text_only: bool = False,
    protocol_profile: str = "openai_compatible_chat",
    capability_profile: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    parts = message.get("content") if isinstance(message.get("content"), list) else [{"type": "text", "text": str(message.get("content") or "")}]
    if text_only:
        lines: list[str] = []
        for part in parts:
            if str(part.get("type") or "") == "text":
                text = str(part.get("text") or "").strip()
                if text:
                    lines.append(text)
        return {"role": str(message.get("role") or "user"), "content": "\n".join(lines)}
    payload_parts: list[dict[str, Any]] = []
    normalized_profile = capability_profile or _provider_base_capability_profile(protocol_profile, ["text"])
    for part in parts:
        payload_parts.append(
            _openai_like_part_from_message_part(
                part,
                protocol_profile=protocol_profile,
                capability_profile=normalized_profile,
            ),
        )
    return {"role": str(message.get("role") or "user"), "content": payload_parts}


def _gemini_message_from_message(message: dict[str, Any]) -> dict[str, Any]:
    parts: list[dict[str, Any]] = []
    for part in message.get("content") or []:
        part_type = str(part.get("type") or "")
        if part_type == "text":
            parts.append({"text": str(part.get("text") or "")})
            continue
        source_url = str(part.get("source_url") or "")
        mime_type = str(part.get("mime_type") or "").strip() or "*/*"
        data_url = _message_part_data_url(source_url)
        if data_url:
            actual_mime_type, encoded = data_url
            parts.append({"inline_data": {"mime_type": actual_mime_type, "data": encoded}})
        else:
            parts.append({"file_data": {"mime_type": mime_type, "file_uri": source_url}})
    return {"role": "user", "parts": parts}


def _anthropic_message_from_message(message: dict[str, Any]) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    for part in message.get("content") or []:
        part_type = str(part.get("type") or "")
        if part_type == "text":
            content.append({"type": "text", "text": str(part.get("text") or "")})
            continue
        if part_type != "image":
            raise AppError(ErrorCode.BUSINESS_RULE, f"Anthropic 请求构建器不支持 {part_type}")
        source_url = str(part.get("source_url") or "")
        data_url = _message_part_data_url(source_url)
        if not data_url:
            raise AppError(ErrorCode.BUSINESS_RULE, "Anthropic 图片输入当前仅支持 inline_data/base64")
        media_type, encoded = data_url
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": encoded}})
    return {"role": str(message.get("role") or "user"), "content": content}


def _messages_require_responses_api(
    messages: list[dict[str, Any]],
    *,
    protocol_profile: str,
    capability_profile: dict[str, dict[str, Any]],
) -> bool:
    if protocol_profile != "ark_chat":
        return False
    for message in messages:
        for part in message.get("content") or []:
            part_type = str(part.get("type") or "")
            if part_type == "text":
                continue
            transport_mode = _message_part_transport_mode(part)
            part_profile = capability_profile.get(part_type) or {}
            request_part_type = str(
                part_profile.get("request_part_type")
                or _protocol_default_request_part_type(protocol_profile, part_type, transport_mode)
                or ""
            ).strip()
            if request_part_type == "input_video" or transport_mode == "file_api":
                return True
    return False


def _responses_input_part_from_message_part(
    part: dict[str, Any],
    *,
    protocol_profile: str,
    capability_profile: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    part_type = str(part.get("type") or "")
    if part_type == "text":
        return {"type": "input_text", "text": str(part.get("text") or "")}
    transport_mode = _message_part_transport_mode(part)
    part_profile = capability_profile.get(part_type) or {}
    provider_file_id = str(part.get("provider_file_id") or "").strip()
    request_part_type = str(
        part_profile.get("request_part_type")
        or _protocol_default_request_part_type(protocol_profile, part_type, transport_mode)
        or ""
    ).strip()
    if request_part_type == "input_video" or (transport_mode == "file_api" and provider_file_id):
        if provider_file_id:
            return {"type": "input_video", "file_id": provider_file_id}
        source_url = str(part.get("source_url") or "")
        if source_url:
            return {"type": "input_video", "video_url": source_url}
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "input_video 缺少 file_id 或 video_url")
    raise AppError(ErrorCode.BUSINESS_RULE, f"{protocol_profile} 响应构建器不支持 {part_type}")


def _responses_input_from_message(
    message: dict[str, Any],
    *,
    protocol_profile: str,
    capability_profile: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    parts = list(message.get("content") or [])
    ordered_parts = [part for part in parts if str(part.get("type") or "") != "text"] + [part for part in parts if str(part.get("type") or "") == "text"]
    return {
        "role": str(message.get("role") or "user"),
        "content": [
            _responses_input_part_from_message_part(
                part,
                protocol_profile=protocol_profile,
                capability_profile=capability_profile,
            )
            for part in ordered_parts
        ],
    }


def _provider_messages_request(
    item: AiProviderConfig,
    api_key: str | None,
    model_id: str,
    messages: list[dict[str, Any]],
    *,
    max_tokens: int | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    native_structured_output: bool = True,
    stream: bool = False,
    debug_context: dict[str, Any] | None = None,
) -> tuple[str, dict[str, str], dict[str, Any]]:
    provider_kind = _provider_kind(item)
    protocol_profile = _provider_protocol_profile(item)
    capability_profile = _provider_capability_profile(item)
    api_base = _provider_api_base(item)
    runtime = _provider_runtime(item)
    temperature = float(runtime.get("temperature", 0))
    output_tokens = int(max_tokens or runtime.get("max_output_tokens") or 4096)
    if not api_base:
        raise AppError(ErrorCode.BUSINESS_RULE, "Provider API Base 不能为空")
    if _provider_requires_api_key(item) and not api_key:
        raise AppError(ErrorCode.BUSINESS_RULE, f"{provider_kind} 需要配置 API Key")
    normalized_messages = normalize_ai_messages(messages)
    _validate_provider_messages(item, normalized_messages, stream=stream)
    structured_output_mode = str(runtime.get("structured_output_mode") or "").strip().lower()
    default_structured_output_mode = str(_protocol_profile_spec(protocol_profile).get("structured_output_mode") or "").strip().lower()
    prompt_schema_required = False
    effective_structured_output_mode = structured_output_mode or default_structured_output_mode
    use_responses_api = _messages_require_responses_api(
        normalized_messages,
        protocol_profile=protocol_profile,
        capability_profile=capability_profile,
    )
    if isinstance(debug_context, dict):
        debug_context.update(
            {
                "protocol_profile": protocol_profile,
                "request_model": model_id,
                "use_responses_api": use_responses_api,
                "structured_output_mode": effective_structured_output_mode,
                "native_structured_output": native_structured_output,
                "stream": stream,
            }
        )
    if use_responses_api and stream:
        raise AppError(ErrorCode.BUSINESS_RULE, f"{_provider_route_name(item)} 的 file_api 视频输入暂不支持流式输出")
    if structured_output_schema and native_structured_output and effective_structured_output_mode == "json_object":
        prompt_schema_required = True
    if structured_output_schema and native_structured_output and effective_structured_output_mode not in {"json_schema", "json_object", "json_mime"} and protocol_profile not in {"anthropic_messages"}:
        prompt_schema_required = True
    if structured_output_schema and not native_structured_output:
        prompt_schema_required = True
    request_messages = _messages_with_structured_output_schema(normalized_messages, structured_output_schema) if prompt_schema_required and structured_output_schema else normalized_messages
    if use_responses_api:
        request_body = {
            "model": model_id,
            "input": [
                _responses_input_from_message(
                    message,
                    protocol_profile=protocol_profile,
                    capability_profile=capability_profile,
                )
                for message in request_messages
            ],
            "temperature": temperature,
            "max_output_tokens": output_tokens,
        }
        if isinstance(debug_context, dict):
            debug_context["request_endpoint"] = "/responses"
            debug_context["request_body_summary"] = _safe_debug_value(request_body)
        return (
            urljoin(f"{api_base}/", "responses"),
            _provider_headers(item, api_key),
            request_body,
        )
    if protocol_profile == "gemini_native":
        generation_config: dict[str, Any] = {"temperature": temperature, "maxOutputTokens": output_tokens}
        if structured_output_schema and native_structured_output:
            generation_config["responseMimeType"] = "application/json"
        endpoint = "streamGenerateContent?alt=sse" if stream else "generateContent"
        return (
            f"{api_base}/models/{model_id}:{endpoint}&key={api_key}" if stream else f"{api_base}/models/{model_id}:{endpoint}?key={api_key}",
            {"content-type": "application/json"},
            {"contents": [_gemini_message_from_message(message) for message in request_messages], "generationConfig": generation_config},
        )
    if protocol_profile == "anthropic_messages":
        anthropic_messages = request_messages
        if structured_output_schema and native_structured_output:
            anthropic_messages = _messages_with_structured_output_schema(request_messages, structured_output_schema)
        body: dict[str, Any] = {
            "model": model_id,
            "max_tokens": output_tokens,
            "temperature": temperature,
            "messages": [_anthropic_message_from_message(message) for message in anthropic_messages],
        }
        if stream:
            body["stream"] = True
        return (f"{api_base}/messages", _provider_headers(item, api_key), body)
    api_version = str(runtime.get("api_version") or "2024-02-15-preview")
    url = f"{api_base}/chat/completions?api-version={api_version}" if protocol_profile == "azure_openai_chat" else urljoin(f"{api_base}/", "chat/completions")
    text_only_messages = bool(structured_output_schema and not native_structured_output)
    payload: dict[str, Any] = {
        "model": model_id,
        "messages": [
            _openai_message_from_message(
                message,
                text_only=text_only_messages,
                protocol_profile=protocol_profile,
                capability_profile=capability_profile,
            )
            for message in request_messages
        ],
        "temperature": temperature,
        "max_tokens": output_tokens,
    }
    if stream:
        payload["stream"] = True
    if protocol_profile == "ollama_chat":
        if runtime.get("keep_alive"):
            payload["keep_alive"] = str(runtime["keep_alive"])
        if runtime.get("num_ctx") is not None:
            payload["options"] = {"num_ctx": int(runtime["num_ctx"])}
    if structured_output_schema and native_structured_output and effective_structured_output_mode == "json_schema":
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "ai_generation_result",
                "schema": structured_output_schema,
                "strict": True,
            },
        }
    elif structured_output_schema and native_structured_output and effective_structured_output_mode == "json_object":
        payload["response_format"] = {"type": "json_object"}
    if isinstance(debug_context, dict):
        debug_context["request_endpoint"] = "/chat/completions" if protocol_profile != "azure_openai_chat" else "/chat/completions?api-version"
        debug_context["request_body_summary"] = _safe_debug_value(payload)
    return (url, _provider_headers(item, api_key), payload)


def _provider_chat_payload(item: AiProviderConfig, model_id: str, content: str, *, max_output_tokens: int) -> dict[str, Any]:
    runtime = _provider_runtime(item)
    payload: dict[str, Any] = {
        "model": model_id,
        "messages": [{"role": "user", "content": content}],
        "temperature": float(runtime.get("temperature", 0)),
        "max_tokens": max_output_tokens,
    }
    if _provider_kind(item) == "Ollama / LM Studio":
        if runtime.get("keep_alive"):
            payload["keep_alive"] = str(runtime["keep_alive"])
        if runtime.get("num_ctx") is not None:
            payload["options"] = {"num_ctx": int(runtime["num_ctx"])}
    return payload


def _provider_test_request(item: AiProviderConfig, api_key: str | None, message: str) -> tuple[str, dict[str, str], dict]:
    model_id = _provider_model_id(item)
    return _provider_messages_request(
        item,
        api_key,
        model_id,
        build_text_messages(message),
        max_tokens=PROVIDER_CONNECTION_TEST_MAX_OUTPUT_TOKENS,
    )


def _run_provider_test(
    item: AiProviderConfig,
    *,
    api_key: str | None,
    message: str,
    request: Request,
) -> dict:
    url, headers, request_body = _provider_test_request(item, api_key, message)
    started_at = time.perf_counter()
    status = "failed"
    last_error = None
    latency_ms = 0
    request_id = getattr(request.state, "request_id", None)
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    try:
        with _provider_http_client(item, timeout=_provider_connection_test_timeout_seconds(item)) as client:
            response = client.post(url, headers=headers, json=request_body)
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        request_id = response.headers.get("x-request-id") or request_id
        if response.status_code >= 400:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 杩斿洖 {response.status_code}", response.text)
        response_data = response.json()
        prompt_tokens, completion_tokens, total_tokens = _extract_usage(response_data)
        status = "success"
    except AppError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        last_error = exc.message
    except httpx.HTTPError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        last_error = str(exc)
    return {
        "status": status,
        "latency_ms": latency_ms,
        "request_id": request_id,
        "last_error": last_error,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def run_provider_messages_generation(
    db: MongoDatabase,
    *,
    team_id: str,
    provider_id: str,
    model: str | None,
    messages: list[dict[str, Any]],
    operation_type: str,
    operator_id: str,
    request: Request | None,
    task_id: str | None = None,
    source_id: str | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    charge_ai_resource: bool = True,
    max_tokens: int | None = None,
) -> dict:
    item = _ensure_provider_exists(db, provider_id)
    if item.status != "enabled":
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 AI Provider 未启用")
    if item.scope == "team" and item.team_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "AI Provider 不属于当前企业")
    if item.scope == "platform" and charge_ai_resource:
        require_team_ai_wallet_positive_balance(db, team_id)
    model_id = (model or _provider_model_id(item)).strip()
    if not model_id:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 AI Provider 尚未配置模型")
    api_key = decrypt_secret(getattr(item, "encrypted_api_key", None))
    debug_context: dict[str, Any] = {
        "provider_kind": _provider_kind(item),
        "route_name": _provider_route_name(item),
        "operation_type": operation_type,
    }
    normalized_messages = _resolve_provider_accessible_messages(
        db,
        item=item,
        api_key=api_key,
        team_id=team_id,
        messages=messages,
        request=request,
        debug_context=debug_context,
    )
    if not normalized_messages:
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "AI 消息不能为空")
    url, headers, request_body = _provider_messages_request(
        item,
        api_key,
        model_id,
        normalized_messages,
        max_tokens=max_tokens,
        structured_output_schema=structured_output_schema,
        debug_context=debug_context,
    )
    started_at = time.perf_counter()
    request_state = getattr(request, "state", None)
    request_id = getattr(request_state, "request_id", None)
    try:
        with _provider_http_client(item, timeout=_provider_generation_timeout_seconds(item)) as client:
            response = client.post(url, headers=headers, json=request_body)
            if response.status_code >= 400 and _should_retry_without_native_response_format(request_body, structured_output_schema):
                fallback_url, fallback_headers, fallback_body = _provider_messages_request(
                    item,
                    api_key,
                    model_id,
                    normalized_messages,
                    max_tokens=max_tokens,
                    structured_output_schema=structured_output_schema,
                    native_structured_output=False,
                )
                response = client.post(fallback_url, headers=fallback_headers, json=fallback_body)
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        request_id = response.headers.get("x-request-id") or request_id
        if response.status_code >= 400:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 返回 {response.status_code}", response.text[:1000])
        response_data = response.json()
        prompt_tokens, completion_tokens, total_tokens = _extract_usage(response_data)
        content = _extract_generation_text(_provider_kind(item), response_data).strip()
        if not content:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Provider 未返回生成内容")
        debug_context["response_summary"] = _debug_response_summary(response_data, content)
        cost = _estimate_provider_cost(_provider_pricing(item), prompt_tokens, completion_tokens)
        billable = item.scope == "platform" and charge_ai_resource
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                operation_type=operation_type,
                provider=_provider_kind(item),
                model=model_id,
                tokens=total_tokens,
                cost=cost,
                billable=billable,
                charged_points=cost if billable else 0.0,
                source_type=operation_type,
                source_id=source_id,
                latency_ms=latency_ms,
                status="success",
                request_id=request_id,
                meta={"debug": _safe_debug_value(debug_context)},
            )
        )
        if billable:
            record_platform_ai_wallet_spend(
                db,
                team_id=team_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                amount_points=cost,
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
                operator_id=operator_id,
            )
        else:
            db.commit()
        return {
            "content": content,
            "provider_id": item.id,
            "model": model_id,
            "request_id": request_id,
            "latency_ms": latency_ms,
            "tokens": total_tokens,
            "cost": cost,
        }
    except AppError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                operation_type=operation_type,
                provider=_provider_kind(item),
                model=model_id,
                latency_ms=latency_ms,
                status="failed",
                error=exc.message[:1000],
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
                meta={"debug": _safe_debug_value(debug_context)},
            )
        )
        db.commit()
        raise
    except httpx.TimeoutException as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                provider=_provider_kind(item),
                model=model_id,
                operation_type=operation_type,
                tokens=0,
                cost=0.0,
                latency_ms=latency_ms,
                status="failed",
                error=str(exc)[:1000],
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
                meta={"debug": _safe_debug_value(debug_context)},
            )
        )
        db.commit()
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI Provider 调用超时，请检查模型服务或调大 Provider 超时时间", {"error": str(exc)}) from exc
    except httpx.HTTPError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                operation_type=operation_type,
                provider=_provider_kind(item),
                model=model_id,
                latency_ms=latency_ms,
                status="failed",
                error=str(exc)[:1000],
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
                meta={"debug": _safe_debug_value(debug_context)},
            )
        )
        db.commit()
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI Provider 调用失败", {"error": str(exc)}) from exc


def run_provider_text_generation(
    db: MongoDatabase,
    *,
    team_id: str,
    provider_id: str,
    model: str | None,
    prompt: str,
    operation_type: str,
    operator_id: str,
    request: Request | None,
    task_id: str | None = None,
    source_id: str | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    charge_ai_resource: bool = True,
) -> dict:
    item = _ensure_provider_exists(db, provider_id)
    if item.status != "enabled":
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 AI Provider 未启用")
    if item.scope == "team" and item.team_id != team_id:
        raise AppError(ErrorCode.PERMISSION_DENIED, "AI Provider 不属于当前企业")
    if item.scope == "platform" and charge_ai_resource:
        require_team_ai_wallet_positive_balance(db, team_id)
    model_id = (model or _provider_model_id(item)).strip()
    if not model_id:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 AI Provider 尚未配置模型")
    if not prompt.strip():
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "生成提示词不能为空")
    api_key = decrypt_secret(getattr(item, "encrypted_api_key", None))
    url, headers, request_body = _provider_generation_request(
        item,
        api_key,
        model_id,
        prompt,
        structured_output_schema=structured_output_schema,
    )
    started_at = time.perf_counter()
    request_state = getattr(request, "state", None)
    request_id = getattr(request_state, "request_id", None)
    try:
        with _provider_http_client(item, timeout=_provider_generation_timeout_seconds(item)) as client:
            response = client.post(url, headers=headers, json=request_body)
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        request_id = response.headers.get("x-request-id") or request_id
        if response.status_code >= 400:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 返回 {response.status_code}", response.text[:1000])
        response_data = response.json()
        prompt_tokens, completion_tokens, total_tokens = _extract_usage(response_data)
        content = _extract_generation_text(_provider_kind(item), response_data).strip()
        if not content:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, "Provider 未返回生成内容")
        cost = _estimate_provider_cost(_provider_pricing(item), prompt_tokens, completion_tokens)
        billable = item.scope == "platform" and charge_ai_resource
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                operation_type=operation_type,
                provider=_provider_kind(item),
                model=model_id,
                tokens=total_tokens,
                cost=cost,
                billable=billable,
                charged_points=cost if billable else 0.0,
                source_type=operation_type,
                source_id=source_id,
                latency_ms=latency_ms,
                status="success",
                request_id=request_id,
            )
        )
        if billable:
            record_platform_ai_wallet_spend(
                db,
                team_id=team_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                amount_points=cost,
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
                operator_id=operator_id,
            )
        else:
            db.commit()
        return {
            "content": content,
            "provider_id": item.id,
            "model": model_id,
            "request_id": request_id,
            "latency_ms": latency_ms,
            "tokens": total_tokens,
            "cost": cost,
        }
    except AppError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                operation_type=operation_type,
                provider=_provider_kind(item),
                model=model_id,
                latency_ms=latency_ms,
                status="failed",
                error=exc.message[:1000],
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
            )
        )
        db.commit()
        raise
    except httpx.TimeoutException as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                provider=_provider_kind(item),
                model=model_id,
                operation_type=operation_type,
                tokens=0,
                cost=0.0,
                latency_ms=latency_ms,
                status="failed",
                error=str(exc)[:1000],
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
            )
        )
        db.commit()
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI Provider 调用超时，请检查模型服务或调大 Provider 超时时间", {"error": str(exc)}) from exc
    except httpx.HTTPError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        db.add(
            AiCallLog(
                team_id=team_id,
                task_id=task_id,
                user_id=operator_id,
                provider_id=item.id,
                route_name=_provider_route_name(item),
                operation_type=operation_type,
                provider=_provider_kind(item),
                model=model_id,
                latency_ms=latency_ms,
                status="failed",
                error=str(exc)[:1000],
                source_type=operation_type,
                source_id=source_id,
                request_id=request_id,
            )
        )
        db.commit()
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, "AI Provider 调用失败", {"error": str(exc)}) from exc


def _provider_generation_request(
    item: AiProviderConfig,
    api_key: str | None,
    model_id: str,
    prompt: str,
    *,
    structured_output_schema: dict[str, Any] | None = None,
) -> tuple[str, dict[str, str], dict]:
    provider_kind = _provider_kind(item)
    api_base = _provider_api_base(item)
    runtime = _provider_runtime(item)
    temperature = float(runtime.get("temperature", 0))
    max_output_tokens = int(runtime.get("max_output_tokens", 4096))
    if not api_base:
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 Provider 缺少 API Base")
    if _provider_requires_api_key(item) and not api_key:
        raise AppError(ErrorCode.BUSINESS_RULE, f"{provider_kind} 需要配置 API Key")
    if provider_kind == "Gemini":
        generation_config: dict[str, Any] = {"temperature": temperature, "maxOutputTokens": max_output_tokens}
        if structured_output_schema:
            generation_config["responseMimeType"] = "application/json"
        return (
            f"{api_base}/models/{model_id}:generateContent?key={api_key}",
            {"content-type": "application/json"},
            {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": generation_config,
            },
        )
    if provider_kind == "Anthropic":
        return (
            f"{api_base}/messages",
            _provider_headers(item, api_key),
            {
                "model": model_id,
                "max_tokens": max_output_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    api_version = str(runtime.get("api_version") or "2024-02-15-preview")
    url = (
        f"{api_base}/chat/completions?api-version={api_version}"
        if provider_kind == "Azure OpenAI"
        else urljoin(f"{api_base}/", "chat/completions")
    )
    payload = _provider_chat_payload(item, model_id, prompt, max_output_tokens=max_output_tokens)
    structured_output_mode = str(runtime.get("structured_output_mode") or "").strip().lower()
    if structured_output_schema and (
        structured_output_mode == "json_schema"
        or (not structured_output_mode and provider_kind in {"OpenAI", "Azure OpenAI"})
    ):
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "ai_review_result",
                "schema": structured_output_schema,
                "strict": True,
            },
        }
    elif structured_output_schema and (
        structured_output_mode == "json_object"
        or (not structured_output_mode and provider_kind in {"OpenAI Compatible", "DeepSeek", "OpenRouter"})
    ):
        payload["response_format"] = {"type": "json_object"}
    return (
        url,
        _provider_headers(item, api_key),
        payload,
    )


def _provider_stream_request(item: AiProviderConfig, api_key: str | None, model_id: str, prompt: str) -> tuple[str, dict[str, str], dict]:
    provider_kind = _provider_kind(item)
    api_base = _provider_api_base(item)
    runtime = _provider_runtime(item)
    temperature = float(runtime.get("temperature", 0))
    max_output_tokens = int(runtime.get("max_output_tokens", 4096))
    if not api_base:
        raise AppError(ErrorCode.BUSINESS_RULE, "Provider API Base 不能为空")
    if _provider_requires_api_key(item) and not api_key:
        raise AppError(ErrorCode.BUSINESS_RULE, f"{provider_kind} 需要配置 API Key")
    if provider_kind == "Gemini":
        return (
            f"{api_base}/models/{model_id}:streamGenerateContent?alt=sse&key={api_key}",
            {"content-type": "application/json"},
            {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": temperature, "maxOutputTokens": max_output_tokens},
            },
        )
    if provider_kind == "Anthropic":
        return (
            f"{api_base}/messages",
            _provider_headers(item, api_key),
            {
                "model": model_id,
                "max_tokens": max_output_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
            },
        )
    api_version = str(runtime.get("api_version") or "2024-02-15-preview")
    url = (
        f"{api_base}/chat/completions?api-version={api_version}"
        if provider_kind == "Azure OpenAI"
        else urljoin(f"{api_base}/", "chat/completions")
    )
    payload = _provider_chat_payload(item, model_id, prompt, max_output_tokens=max_output_tokens)
    payload["stream"] = True
    return (url, _provider_headers(item, api_key), payload)


def _iter_sse_events(lines: Iterable[str]) -> Iterator[tuple[str, str]]:
    event_name = "message"
    data_lines: list[str] = []
    for raw_line in lines:
        line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
        if line == "":
            if data_lines:
                yield event_name, "\n".join(data_lines)
            event_name = "message"
            data_lines = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line.replace("event:", "", 1).strip() or "message"
            continue
        if line.startswith("data:"):
            data_lines.append(line.replace("data:", "", 1).strip())
    if data_lines:
        yield event_name, "\n".join(data_lines)


def _extract_openai_stream_delta(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") if isinstance(payload.get("choices"), list) else []
    if not choices or not isinstance(choices[0], dict):
        return ""
    delta = choices[0].get("delta") if isinstance(choices[0].get("delta"), dict) else {}
    content = delta.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)
    return ""


def iter_provider_generation_stream(
    item: AiProviderConfig,
    *,
    api_key: str | None,
    model_id: str,
    prompt: str,
) -> Iterator[dict[str, Any]]:
    provider_kind = _provider_kind(item)
    url, headers, request_body = _provider_stream_request(item, api_key, model_id, prompt)
    with _provider_http_client(item, timeout=_provider_generation_timeout_seconds(item)) as client:
        with client.stream("POST", url, headers=headers, json=request_body) as response:
            request_id = response.headers.get("x-request-id")
            if response.status_code >= 400:
                error_text = response.read().decode("utf-8", errors="ignore")
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 返回 {response.status_code}", error_text[:1000])
            yield {"type": "meta", "request_id": request_id}
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0
            full_text = ""
            gemini_snapshot = ""
            for event_name, data in _iter_sse_events(response.iter_lines()):
                if data == "[DONE]":
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if provider_kind == "Anthropic":
                    if event_name == "message_start":
                        message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
                        usage = message.get("usage") if isinstance(message.get("usage"), dict) else {}
                        prompt_tokens = int(usage.get("input_tokens") or prompt_tokens)
                        continue
                    if event_name == "content_block_delta":
                        delta = payload.get("delta") if isinstance(payload.get("delta"), dict) else {}
                        text = str(delta.get("text") or "")
                        if text:
                            full_text += text
                            yield {"type": "delta", "content": text}
                        continue
                    if event_name == "message_delta":
                        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
                        completion_tokens = max(completion_tokens, int(usage.get("output_tokens") or completion_tokens))
                        continue
                    if event_name == "message_stop":
                        continue
                elif provider_kind == "Gemini":
                    snapshot = _extract_generation_text(provider_kind, payload).strip()
                    if snapshot:
                        delta = snapshot[len(gemini_snapshot):] if snapshot.startswith(gemini_snapshot) else snapshot
                        gemini_snapshot = snapshot
                        if delta:
                            full_text += delta
                            yield {"type": "delta", "content": delta}
                    next_prompt_tokens, next_completion_tokens, next_total_tokens = _extract_usage(payload)
                    prompt_tokens = max(prompt_tokens, next_prompt_tokens)
                    completion_tokens = max(completion_tokens, next_completion_tokens)
                    total_tokens = max(total_tokens, next_total_tokens)
                    continue
                else:
                    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
                    if usage:
                        prompt_tokens = max(prompt_tokens, int(usage.get("prompt_tokens") or prompt_tokens))
                        completion_tokens = max(completion_tokens, int(usage.get("completion_tokens") or completion_tokens))
                        total_tokens = max(total_tokens, int(usage.get("total_tokens") or total_tokens))
                    text = _extract_openai_stream_delta(payload)
                    if text:
                        full_text += text
                        yield {"type": "delta", "content": text}
            if not prompt_tokens:
                prompt_tokens = max(1, round(len(prompt) / 4))
            if not completion_tokens:
                completion_tokens = max(1, round(len(full_text) / 4)) if full_text else 0
            if not total_tokens:
                total_tokens = prompt_tokens + completion_tokens
            yield {
                "type": "done",
                "request_id": request_id,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "content": full_text,
            }
def _extract_generation_text(provider_kind: str, response_data: dict) -> str:
    output = response_data.get("output") if isinstance(response_data.get("output"), list) else []
    if output:
        chunks: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content") if isinstance(item.get("content"), list) else []
            for part in content:
                if not isinstance(part, dict):
                    continue
                if isinstance(part.get("text"), str) and part["text"].strip():
                    chunks.append(part["text"])
                elif isinstance(part.get("content"), str) and part["content"].strip():
                    chunks.append(part["content"])
        if chunks:
            return "".join(chunks)
    if provider_kind == "Gemini":
        candidates = response_data.get("candidates") if isinstance(response_data.get("candidates"), list) else []
        content = candidates[0].get("content", {}) if candidates and isinstance(candidates[0], dict) else {}
        parts = content.get("parts") if isinstance(content, dict) else []
        if isinstance(parts, list) and parts and isinstance(parts[0], dict):
            return str(parts[0].get("text") or "")
    if provider_kind == "Anthropic":
        content = response_data.get("content") if isinstance(response_data.get("content"), list) else []
        if content and isinstance(content[0], dict):
            return str(content[0].get("text") or "")
    choices = response_data.get("choices") if isinstance(response_data.get("choices"), list) else []
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message") if isinstance(choices[0].get("message"), dict) else {}
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(str(item.get("text") or "") for item in content if isinstance(item, dict))
        return str(content or "")
    return ""


def _extract_usage(result: dict) -> tuple[int, int, int]:
    usage = result.get("usage") if isinstance(result.get("usage"), dict) else {}
    if usage:
        prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
        total = int(usage.get("total_tokens") or (prompt + completion))
        return prompt, completion, total
    usage_metadata = result.get("usageMetadata") if isinstance(result.get("usageMetadata"), dict) else {}
    if usage_metadata:
        prompt = int(usage_metadata.get("promptTokenCount") or 0)
        completion = int(usage_metadata.get("candidatesTokenCount") or 0)
        total = int(usage_metadata.get("totalTokenCount") or (prompt + completion))
        return prompt, completion, total
    return 0, 0, 0


def run_provider_text_generation(
    db: MongoDatabase,
    *,
    team_id: str,
    provider_id: str,
    model: str | None,
    prompt: str,
    operation_type: str,
    operator_id: str,
    request: Request | None,
    task_id: str | None = None,
    source_id: str | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    charge_ai_resource: bool = True,
) -> dict:
    if not prompt.strip():
        raise AppError(ErrorCode.VALIDATION_REQUIRED, "Prompt 不能为空")
    return run_provider_messages_generation(
        db,
        team_id=team_id,
        provider_id=provider_id,
        model=model,
        messages=build_text_messages(prompt),
        operation_type=operation_type,
        operator_id=operator_id,
        request=request,
        task_id=task_id,
        source_id=source_id,
        structured_output_schema=structured_output_schema,
        charge_ai_resource=charge_ai_resource,
    )


def iter_provider_message_generation_stream(
    item: AiProviderConfig,
    *,
    api_key: str | None,
    model_id: str,
    messages: list[dict[str, Any]],
) -> Iterator[dict[str, Any]]:
    provider_kind = _provider_kind(item)
    normalized_messages = normalize_ai_messages(messages)
    url, headers, request_body = _provider_messages_request(
        item,
        api_key,
        model_id,
        normalized_messages,
        stream=True,
    )
    with _provider_http_client(item, timeout=_provider_generation_timeout_seconds(item)) as client:
        with client.stream("POST", url, headers=headers, json=request_body) as response:
            request_id = response.headers.get("x-request-id")
            if response.status_code >= 400:
                error_text = response.read().decode("utf-8", errors="ignore")
                raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 返回 {response.status_code}", error_text[:1000])
            yield {"type": "meta", "request_id": request_id}
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0
            full_text = ""
            gemini_snapshot = ""
            for event_name, data in _iter_sse_events(response.iter_lines()):
                if data == "[DONE]":
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if provider_kind == "Anthropic":
                    if event_name == "message_start":
                        message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
                        usage = message.get("usage") if isinstance(message.get("usage"), dict) else {}
                        prompt_tokens = int(usage.get("input_tokens") or prompt_tokens)
                        continue
                    if event_name == "content_block_delta":
                        delta = payload.get("delta") if isinstance(payload.get("delta"), dict) else {}
                        text = str(delta.get("text") or "")
                        if text:
                            full_text += text
                            yield {"type": "delta", "content": text}
                        continue
                    if event_name == "message_delta":
                        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
                        completion_tokens = max(completion_tokens, int(usage.get("output_tokens") or completion_tokens))
                        continue
                    if event_name == "message_stop":
                        continue
                elif provider_kind == "Gemini":
                    snapshot = _extract_generation_text(provider_kind, payload).strip()
                    if snapshot:
                        delta = snapshot[len(gemini_snapshot):] if snapshot.startswith(gemini_snapshot) else snapshot
                        gemini_snapshot = snapshot
                        if delta:
                            full_text += delta
                            yield {"type": "delta", "content": delta}
                    next_prompt_tokens, next_completion_tokens, next_total_tokens = _extract_usage(payload)
                    prompt_tokens = max(prompt_tokens, next_prompt_tokens)
                    completion_tokens = max(completion_tokens, next_completion_tokens)
                    total_tokens = max(total_tokens, next_total_tokens)
                    continue
                else:
                    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
                    if usage:
                        prompt_tokens = max(prompt_tokens, int(usage.get("prompt_tokens") or prompt_tokens))
                        completion_tokens = max(completion_tokens, int(usage.get("completion_tokens") or completion_tokens))
                        total_tokens = max(total_tokens, int(usage.get("total_tokens") or total_tokens))
                    text = _extract_openai_stream_delta(payload)
                    if text:
                        full_text += text
                        yield {"type": "delta", "content": text}
            if not prompt_tokens:
                prompt_tokens = max(1, round(sum(len(str(part.get("text") or "")) for message in normalized_messages for part in message.get("content") or [] if str(part.get("type") or "") == "text") / 4))
            if not completion_tokens:
                completion_tokens = max(1, round(len(full_text) / 4)) if full_text else 0
            if not total_tokens:
                total_tokens = prompt_tokens + completion_tokens
            yield {
                "type": "done",
                "request_id": request_id,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "content": full_text,
            }


def iter_provider_generation_stream(
    item: AiProviderConfig,
    *,
    api_key: str | None,
    model_id: str,
    prompt: str | None = None,
    messages: list[dict[str, Any]] | None = None,
) -> Iterator[dict[str, Any]]:
    effective_messages = normalize_ai_messages(messages) if messages is not None else build_text_messages(prompt or "")
    return iter_provider_message_generation_stream(
        item,
        api_key=api_key,
        model_id=model_id,
        messages=effective_messages,
    )


def _estimate_provider_cost(pricing: dict, prompt_tokens: int, completion_tokens: int, cache_hit_tokens: int = 0) -> float:
    return round(
        (prompt_tokens / 1_000_000) * float(pricing.get("input_price_per_million") or 0)
        + (completion_tokens / 1_000_000) * float(pricing.get("output_price_per_million") or 0)
        + (cache_hit_tokens / 1_000_000) * float(pricing.get("cache_hit_price_per_million") or 0),
        6,
    )


def estimate_tokens(db: MongoDatabase, payload: dict) -> dict:
    provider = _ensure_provider_exists(db, payload["provider_id"]) if payload.get("provider_id") else None
    if not provider:
        raise AppError(ErrorCode.BUSINESS_RULE, "请先选择已配置的 Provider 路由")
    prompt_tokens = max(0, round(int(payload.get("prompt_chars") or 0) / 4))
    completion_tokens = max(0, round(int(payload.get("completion_chars") or 0) / 4))
    cache_hit_tokens = max(0, round(int(payload.get("cache_hit_chars") or 0) / 4))
    total_tokens = prompt_tokens + completion_tokens + cache_hit_tokens
    pricing = _provider_pricing(provider)
    if not any(pricing.values()):
        raise AppError(ErrorCode.BUSINESS_RULE, "当前 Provider 未配置费率，无法估算成本")
    estimated_cost = _estimate_provider_cost(pricing, prompt_tokens, completion_tokens, cache_hit_tokens)
    return {
        "provider_id": provider.id,
        "route_name": _provider_route_name(provider),
        "model": _provider_model_id(provider),
        "estimated_prompt_tokens": prompt_tokens,
        "estimated_completion_tokens": completion_tokens,
        "estimated_cache_hit_tokens": cache_hit_tokens,
        "estimated_tokens": total_tokens,
        "estimated_cost": estimated_cost,
    }


def list_call_logs(db: MongoDatabase, team_id: str | None = None) -> list[dict]:
    query = {"team_id": team_id} if team_id else {}
    items = db.find(AiCallLog, query, sort=[("created_at", -1)])
    return [call_log_payload(item) for item in items]


def test_provider_config(db: MongoDatabase, provider_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    item = _ensure_provider_exists(db, provider_id)
    message = str(payload.get("message") or "ping").strip() or "ping"
    api_key = decrypt_secret(getattr(item, "encrypted_api_key", None))
    result = _run_provider_test(item, api_key=api_key, message=message, request=request)
    status = "failed"
    last_error = None
    latency_ms = 0
    request_id = getattr(request.state, "request_id", None)
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    try:
        with _provider_http_client(item, timeout=_provider_connection_test_timeout_seconds(item)) as client:
            response = client.post(url, headers=headers, json=request_body)
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        request_id = response.headers.get("x-request-id") or request_id
        if response.status_code >= 400:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 返回 {response.status_code}", response.text)
        response_data = response.json()
        prompt_tokens, completion_tokens, total_tokens = _extract_usage(response_data)
        status = "success"
    except AppError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        last_error = exc.message
    except httpx.HTTPError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        last_error = str(exc)
    pricing = _provider_pricing(item)
    cost = _estimate_provider_cost(pricing, prompt_tokens, completion_tokens)
    item.last_test_status = status
    item.last_test_at = now_utc()
    item.last_test_latency_ms = latency_ms
    item.last_test_error = last_error
    item.last_request_id = request_id
    item.updated_at = now_utc()
    db.save(item)
    db.add(
        AiCallLog(
            team_id=item.team_id or "",
            user_id=operator_id,
            provider_id=item.id,
            route_name=_provider_route_name(item),
            operation_type="test_connection",
            provider=_provider_kind(item),
            model=_provider_model_id(item),
            tokens=total_tokens,
            cost=cost,
            latency_ms=latency_ms,
            status=status,
            error=last_error,
            request_id=request_id,
        )
    )
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=item.id,
        action="ai_provider_tested",
        operator_id=operator_id,
        team_id=item.team_id,
        changes={"route_name": _provider_route_name(item), "status": status, "request_id": request_id},
        request=request,
    )
    db.commit()
    if last_error:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 测试失败：{last_error}")
    return {
        "provider_id": item.id,
        "route_name": _provider_route_name(item),
        "provider_kind": _provider_kind(item),
        "model": _provider_model_id(item),
        "latency_ms": latency_ms,
        "status": status,
        "request_id": request_id,
        "validated_modalities": sorted([key for key, entry in _provider_capability_profile(item).items() if entry.get("enabled")]),
        "validated_transport_modes": _provider_transport_modes(item),
    }


def test_provider_config_draft(payload: dict, request: Request) -> dict:
    scope = str(payload.get("scope") or "team")
    provider_kind = _provider_kind(payload)
    protocol_profile = _normalize_protocol_profile(payload.get("protocol_profile"), provider_kind)
    model_id = _provider_model_id(payload)
    api_key = (payload.get("api_key") or "").strip() or None
    item = AiProviderConfig(
        team_id=str(payload.get("team_id") or "") if scope == "team" else None,
        route_name=_provider_route_name(payload),
        provider_kind=provider_kind,
        provider=provider_kind,
        scope=scope,
        api_base=(payload.get("api_base") or DEFAULT_PROVIDER_BASES.get(provider_kind) or "").strip() or None,
        model_id=model_id,
        default_model=model_id,
        models=[model_id],
        pricing={},
        capabilities=_normalize_capabilities(payload.get("capabilities")),
        protocol_profile=protocol_profile,
        transport_modes=_normalize_transport_modes(payload.get("transport_modes")),
        supports_streaming=_protocol_default_supports_streaming(protocol_profile) if payload.get("supports_streaming") is None else bool(payload.get("supports_streaming")),
        capability_profile=_normalize_capability_profile(
            protocol_profile,
            payload.get("capabilities"),
            payload.get("transport_modes"),
            payload.get("supports_streaming") if payload.get("supports_streaming") is None else bool(payload.get("supports_streaming")),
            payload.get("capability_profile") if isinstance(payload.get("capability_profile"), dict) else None,
        ),
        runtime_config=_normalize_runtime(payload.get("runtime_config")),
        status="enabled",
    )
    result = _run_provider_test(
        item,
        api_key=api_key,
        message=str(payload.get("message") or "ping").strip() or "ping",
        request=request,
    )
    if result["last_error"]:
        raise AppError(
            ErrorCode.THIRD_PARTY_ERROR,
            f"Provider test failed: {result['last_error']}",
            {"request_id": result["request_id"], "latency_ms": result["latency_ms"]},
        )
    return {
        "route_name": item.route_name,
        "provider_kind": provider_kind,
        "model": model_id,
        "latency_ms": result["latency_ms"],
        "status": result["status"],
        "request_id": result["request_id"],
        "validated_modalities": sorted([key for key, entry in _provider_capability_profile(item).items() if entry.get("enabled")]),
        "validated_transport_modes": _provider_transport_modes(item),
    }


def _run_provider_test(
    item: AiProviderConfig,
    *,
    api_key: str | None,
    message: str,
    request: Request,
) -> dict:
    url, headers, request_body = _provider_test_request(item, api_key, message)
    started_at = time.perf_counter()
    status = "failed"
    last_error = None
    latency_ms = 0
    request_id = getattr(request.state, "request_id", None)
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    try:
        with _provider_http_client(item, timeout=_provider_connection_test_timeout_seconds(item)) as client:
            response = client.post(url, headers=headers, json=request_body)
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        request_id = response.headers.get("x-request-id") or request_id
        if response.status_code >= 400:
            raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 返回 {response.status_code}", response.text)
        response_data = response.json()
        prompt_tokens, completion_tokens, total_tokens = _extract_usage(response_data)
        status = "success"
    except AppError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        last_error = exc.message
    except httpx.HTTPError as exc:
        latency_ms = max(1, round((time.perf_counter() - started_at) * 1000))
        last_error = str(exc)
    return {
        "status": status,
        "latency_ms": latency_ms,
        "request_id": request_id,
        "last_error": last_error,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def test_provider_config(db: MongoDatabase, provider_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    item = _ensure_provider_exists(db, provider_id)
    message = str(payload.get("message") or "ping").strip() or "ping"
    api_key = decrypt_secret(getattr(item, "encrypted_api_key", None))
    result = _run_provider_test(item, api_key=api_key, message=message, request=request)
    pricing = _provider_pricing(item)
    cost = _estimate_provider_cost(pricing, result["prompt_tokens"], result["completion_tokens"])
    item.last_test_status = result["status"]
    item.last_test_at = now_utc()
    item.last_test_latency_ms = result["latency_ms"]
    item.last_test_error = result["last_error"]
    item.last_request_id = result["request_id"]
    item.updated_at = now_utc()
    db.save(item)
    db.add(
        AiCallLog(
            team_id=item.team_id or "",
            user_id=operator_id,
            provider_id=item.id,
            route_name=_provider_route_name(item),
            operation_type="test_connection",
            provider=_provider_kind(item),
            model=_provider_model_id(item),
            tokens=result["total_tokens"],
            cost=cost,
            latency_ms=result["latency_ms"],
            status=result["status"],
            error=result["last_error"],
            request_id=result["request_id"],
        )
    )
    write_audit_log(
        db,
        entity_type="ai_resource",
        entity_id=item.id,
        action="ai_provider_tested",
        operator_id=operator_id,
        team_id=item.team_id,
        changes={"route_name": _provider_route_name(item), "status": result["status"], "request_id": result["request_id"]},
        request=request,
    )
    db.commit()
    if result["last_error"]:
        raise AppError(ErrorCode.THIRD_PARTY_ERROR, f"Provider 测试失败：{result['last_error']}")
    return {
        "provider_id": item.id,
        "route_name": _provider_route_name(item),
        "provider_kind": _provider_kind(item),
        "model": _provider_model_id(item),
        "latency_ms": result["latency_ms"],
        "status": result["status"],
        "request_id": result["request_id"],
        "validated_modalities": sorted([key for key, entry in _provider_capability_profile(item).items() if entry.get("enabled")]),
        "validated_transport_modes": _provider_transport_modes(item),
    }


def cost_report(db: MongoDatabase, team_id: str) -> dict:
    logs = db.find(AiCallLog, {"team_id": team_id})
    total_tokens = sum(item.tokens for item in logs)
    total_cost = round(sum(item.cost for item in logs), 6)
    by_model: dict[str, dict] = {}
    for item in logs:
        key = item.model or "unknown"
        if key not in by_model:
            by_model[key] = {"model": key, "tokens": 0, "cost": 0.0, "calls": 0}
        by_model[key]["tokens"] += item.tokens
        by_model[key]["cost"] = round(by_model[key]["cost"] + item.cost, 6)
        by_model[key]["calls"] += 1
    return {"team_id": team_id, "total_tokens": total_tokens, "total_cost": total_cost, "by_model": list(by_model.values())}


def list_cert_types(db: MongoDatabase) -> list[dict]:
    certifications = db.find(Certification)
    seen = {
        "education": {"cert_type": "education", "cert_name": "学历认证", "required_docs": ["学历证明"], "verification_method": "manual", "status": "enabled", "referenced_tasks": 0},
        "domain": {"cert_type": "domain", "cert_name": "领域认证", "required_docs": ["领域证明"], "verification_method": "manual", "status": "enabled", "referenced_tasks": 0},
    }
    for cert in certifications:
        if cert.cert_type not in seen:
            seen[cert.cert_type] = {
                "cert_type": cert.cert_type,
                "cert_name": cert.cert_name,
                "required_docs": [],
                "verification_method": "manual",
                "status": "enabled",
                "referenced_tasks": 0,
            }
    tasks = db.find(Task)
    for task in tasks:
        for cert_type in task.required_certs or []:
            if cert_type in seen:
                seen[cert_type]["referenced_tasks"] += 1
    return list(seen.values())


def budget_request_payload(db: MongoDatabase, item: BudgetRequest) -> dict:
    user = db.get(User, item.requester_id)
    approver = db.get(User, item.approver_id) if item.approver_id else None
    return {
        "request_id": item.id,
        "team_id": item.team_id,
        "requester_id": item.requester_id,
        "requester_name": user.username if user else item.requester_id,
        "amount": item.amount,
        "purpose": item.purpose,
        "related_task_id": item.related_task_id,
        "valid_until": item.valid_until,
        "description": item.description,
        "status": item.status,
        "approved_amount": item.approved_amount,
        "approver_name": approver.username if approver else None,
        "approval_comment": item.approval_comment,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def provider_payload(item: AiProviderConfig, *, manage_platform: bool = False) -> dict:
    provider_kind = _provider_kind(item)
    model_id = _provider_model_id(item)
    route_name = _provider_route_name(item)
    pricing = _provider_pricing(item)
    capabilities = _provider_capabilities(item)
    protocol_profile = _provider_protocol_profile(item)
    transport_modes = _provider_transport_modes(item)
    supports_streaming = _provider_supports_streaming(item)
    capability_profile = _provider_capability_profile(item)
    runtime_config = _provider_runtime(item)
    team_can_manage = item.scope == "team" or manage_platform
    return {
        "provider_id": item.id,
        "team_id": item.team_id,
        "route_name": route_name,
        "provider_kind": provider_kind,
        "provider": provider_kind,
        "scope": item.scope,
        "is_platform_default": bool(getattr(item, "is_platform_default", False)),
        "team_can_manage": team_can_manage,
        "api_base": item.api_base,
        "api_key_configured": _provider_has_configured_key(item),
        "model_id": model_id,
        "default_model": model_id,
        "models": [model_id] if model_id else [],
        "pricing": pricing,
        "capabilities": capabilities,
        "protocol_profile": protocol_profile,
        "transport_modes": transport_modes,
        "supports_streaming": supports_streaming,
        "capability_profile": capability_profile,
        "runtime_config": runtime_config,
        "status": item.status,
        "remark": item.remark,
        "last_test_status": getattr(item, "last_test_status", None),
        "last_test_at": item.last_test_at.isoformat() if getattr(item, "last_test_at", None) else None,
        "last_test_latency_ms": getattr(item, "last_test_latency_ms", None),
        "last_test_error": getattr(item, "last_test_error", None),
        "last_request_id": getattr(item, "last_request_id", None),
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def call_log_payload(item: AiCallLog) -> dict:
    return {
        "log_id": item.id,
        "team_id": item.team_id,
        "task_id": item.task_id,
        "user_id": item.user_id,
        "provider_id": getattr(item, "provider_id", None),
        "route_name": getattr(item, "route_name", None),
        "operation_type": item.operation_type,
        "provider": item.provider,
        "model": item.model,
        "tokens": item.tokens,
        "cost": item.cost,
        "billable": bool(getattr(item, "billable", False)),
        "charged_points": _normalize_wallet_points(getattr(item, "charged_points", 0.0)),
        "source_type": getattr(item, "source_type", None),
        "source_id": getattr(item, "source_id", None),
        "latency_ms": item.latency_ms,
        "status": item.status,
        "error": item.error,
        "request_id": getattr(item, "request_id", None),
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def list_team_ai_history(db: MongoDatabase, team_id: str) -> list[dict]:
    ensure_team(db, team_id)
    ledger_items = db.find(TeamAiWalletLedger, {"team_id": team_id}, sort=[("created_at", -1)])
    call_logs = db.find(AiCallLog, {"team_id": team_id}, sort=[("created_at", -1)])
    spend_items = [item for item in ledger_items if item.transaction_type == "ai_spend"]
    spend_by_request_id = {
        item.request_id: item
        for item in spend_items
        if item.transaction_type == "ai_spend" and getattr(item, "request_id", None)
    }
    spend_by_source = {
        (item.source_type, item.source_id): item
        for item in spend_items
        if item.source_type and item.source_id
    }
    matched_spend_ids: set[str] = set()
    history_items: list[dict] = []

    for item in ledger_items:
        if item.transaction_type == "ai_spend":
            continue
        record_type = "transfer_in" if item.transaction_type in {"transfer_in", "recharge"} else "adjustment"
        points_delta = _normalize_wallet_points(item.amount_points)
        if item.direction == "debit":
            points_delta = -points_delta
        history_items.append(
            {
                "history_id": f"ledger:{item.id}",
                "record_type": record_type,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "provider_name": "企业积分钱包" if item.payment_method == "team_points_wallet" else None,
                "model_name": None,
                "route_name": item.route_name,
                "tokens": None,
                "points_delta": points_delta,
                "balance_after": round(float(item.balance_after or 0), 6),
                "status": "completed",
                "request_id": item.request_id,
                "source_label": "企业积分钱包" if item.payment_method == "team_points_wallet" else (item.payment_method or item.source_type or item.transaction_type),
            }
        )

    for item in call_logs:
        request_id = getattr(item, "request_id", None)
        matched_spend = spend_by_request_id.get(request_id or "")
        if not matched_spend:
            matched_spend = spend_by_source.get((getattr(item, "source_type", None), getattr(item, "source_id", None)))
        if matched_spend:
            matched_spend_ids.add(matched_spend.id)
        history_items.append(
            {
                "history_id": f"call:{item.id}",
                "record_type": "ai_call",
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "provider_name": getattr(item, "route_name", None) or getattr(item, "provider", None),
                "model_name": item.model,
                "route_name": getattr(item, "route_name", None),
                "tokens": int(item.tokens or 0),
                "points_delta": -_normalize_wallet_points(matched_spend.amount_points) if matched_spend else 0.0,
                "balance_after": round(float(matched_spend.balance_after or 0), 6) if matched_spend else None,
                "status": item.status,
                "request_id": getattr(item, "request_id", None),
                "source_label": item.operation_type,
            }
        )

    for item in spend_items:
        if item.id in matched_spend_ids:
            continue
        history_items.append(
            {
                "history_id": f"ledger:{item.id}",
                "record_type": "ai_call",
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "provider_name": item.route_name or None,
                "model_name": None,
                "route_name": item.route_name,
                "tokens": None,
                "points_delta": -_normalize_wallet_points(item.amount_points),
                "balance_after": round(float(item.balance_after or 0), 6),
                "status": "completed",
                "request_id": item.request_id or item.source_id,
                "source_label": item.source_type or "ai_spend",
            }
        )

    history_items.sort(key=lambda current: current.get("created_at") or "", reverse=True)
    return history_items
