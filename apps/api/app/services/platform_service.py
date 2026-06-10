from __future__ import annotations

from datetime import datetime, time, timedelta

from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.config import settings
from app.core.security import decrypt_secret, encrypt_secret, now_utc
from app.models.platform import PlatformFinanceLedger, PlatformPaymentRequest, PlatformSetting
from app.models.profile import PointsLedger, PointsWallet, ReputationAppeal, ReputationLedger
from app.models.resource import TeamPointsBudget, TeamPointsWalletLedger
from app.models.team import Team
from app.models.user import User, UserProfile
from app.services.audit_service import write_audit_log
from app.services.profile_service import adjust_reputation, certification_review_payload, list_certification_review_queue, reputation_appeal_payload, reputation_ledger_payload, review_certification
from app.services.resource_service import (
    DEFAULT_COMMISSION_RATE_BPS,
    platform_commission_rate_bps,
    platform_service_fee_points,
)

COMMISSION_SETTING_KEY = "commission"
AGENT_EMBEDDING_SETTING_KEY = "platform_agent_embedding"
DEFAULT_AGENT_EMBEDDING_MODEL = "text-embedding-3-small"


def commission_setting_payload(db: MongoDatabase) -> dict:
    rate = platform_commission_rate_bps(db)
    setting = db.find_one(PlatformSetting, {"key": COMMISSION_SETTING_KEY})
    return {
        "commission_rate_bps": rate,
        "commission_rate_percent": round(rate / 100, 2),
        "unit_hint": "1 积分 = 1 元",
        "updated_by": setting.updated_by if setting else None,
        "updated_at": setting.updated_at.isoformat() if setting and setting.updated_at else None,
    }


def update_commission_setting(db: MongoDatabase, *, commission_rate_bps: int, operator_id: str, request: Request) -> dict:
    rate = max(0, min(10_000, int(commission_rate_bps)))
    setting = db.find_one(PlatformSetting, {"key": COMMISSION_SETTING_KEY})
    before = commission_setting_payload(db)
    if not setting:
        setting = PlatformSetting(key=COMMISSION_SETTING_KEY, value={"commission_rate_bps": DEFAULT_COMMISSION_RATE_BPS})
        db.add(setting)
    setting.value = {"commission_rate_bps": rate}
    setting.updated_by = operator_id
    setting.updated_at = now_utc().replace(tzinfo=None)
    db.save(setting)
    write_audit_log(
        db,
        entity_type="platform_setting",
        entity_id=setting.id,
        action="platform_commission_rate_updated",
        operator_id=operator_id,
        changes={"before": before, "after": {"commission_rate_bps": rate}},
        request=request,
    )
    db.commit()
    return commission_setting_payload(db)


def _normalize_optional_text(value: object | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    normalized = value.strip()
    return normalized or None


def _parse_date_bound(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    normalized = _normalize_optional_text(value)
    if not normalized:
        return None
    try:
        if "T" not in normalized:
            parsed_date = datetime.fromisoformat(normalized).date()
            return datetime.combine(parsed_date, time.max if end_of_day else time.min)
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    except ValueError:
        return None


def _within_date_range(created_at: datetime | None, start_date: str | None, end_date: str | None) -> bool:
    if not created_at:
        return not start_date and not end_date
    start = _parse_date_bound(start_date)
    end = _parse_date_bound(end_date, end_of_day=True)
    if start and created_at < start:
        return False
    if end and created_at > end:
        return False
    return True


def _contains_keyword(keyword: str | None, *values: object | None) -> bool:
    normalized = _normalize_optional_text(keyword)
    if not normalized:
        return True
    needle = normalized.lower()
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            if _contains_keyword(needle, *value):
                return True
            continue
        if needle in str(value).lower():
            return True
    return False


def _embedding_setting(db: MongoDatabase) -> PlatformSetting | None:
    return db.find_one(PlatformSetting, {"key": AGENT_EMBEDDING_SETTING_KEY})


def resolve_agent_embedding_config(db: MongoDatabase) -> dict:
    setting = _embedding_setting(db)
    stored_value = setting.value if setting else {}
    stored_encrypted_key = stored_value.get("encrypted_api_key") if stored_value else None
    stored_key = decrypt_secret(stored_encrypted_key) if isinstance(stored_encrypted_key, str) else None
    api_key = stored_key or _normalize_optional_text(settings.platform_agent_embedding_api_key)
    api_base = _normalize_optional_text(stored_value.get("api_base")) or _normalize_optional_text(settings.platform_agent_embedding_api_base)
    model = (
        _normalize_optional_text(stored_value.get("model"))
        or _normalize_optional_text(settings.platform_agent_embedding_model)
        or DEFAULT_AGENT_EMBEDDING_MODEL
    )
    return {
        "api_base": api_base,
        "api_key": api_key,
        "api_key_configured": bool(api_key),
        "model": model,
        "source": "platform" if setting else "env",
        "updated_by": setting.updated_by if setting else None,
        "updated_at": setting.updated_at.isoformat() if setting and setting.updated_at else None,
    }


def agent_embedding_setting_payload(db: MongoDatabase) -> dict:
    config = resolve_agent_embedding_config(db)
    return {
        "api_base": config["api_base"],
        "model": config["model"],
        "api_key_configured": config["api_key_configured"],
        "updated_by": config["updated_by"],
        "updated_at": config["updated_at"],
    }


def update_agent_embedding_setting(
    db: MongoDatabase,
    *,
    api_base: str | None,
    api_key: str | None,
    model: str,
    operator_id: str,
    request: Request,
) -> dict:
    setting = _embedding_setting(db)
    before = agent_embedding_setting_payload(db)
    current_value = (setting.value or {}) if setting else {}
    current_encrypted_key = current_value.get("encrypted_api_key")
    normalized_key = _normalize_optional_text(api_key)
    existing_key = decrypt_secret(current_encrypted_key) if isinstance(current_encrypted_key, str) else None
    env_key = _normalize_optional_text(settings.platform_agent_embedding_api_key)
    if not normalized_key and not existing_key and not env_key:
        raise AppError(
            ErrorCode.BUSINESS_RULE,
            "请先填写 Embedding API Key，否则平台问答 Agent 无法启用向量检索",
            {"field": "api_key"},
        )

    if not setting:
        setting = PlatformSetting(key=AGENT_EMBEDDING_SETTING_KEY, value={})
        db.add(setting)

    next_value = {
        "api_base": _normalize_optional_text(api_base),
        "model": _normalize_optional_text(model) or DEFAULT_AGENT_EMBEDDING_MODEL,
    }
    if normalized_key:
        next_value["encrypted_api_key"] = encrypt_secret(normalized_key)
    elif isinstance(current_encrypted_key, str) and current_encrypted_key:
        next_value["encrypted_api_key"] = current_encrypted_key

    setting.value = next_value
    setting.updated_by = operator_id
    setting.updated_at = now_utc().replace(tzinfo=None)
    db.save(setting)
    after = agent_embedding_setting_payload(db)
    write_audit_log(
        db,
        entity_type="platform_setting",
        entity_id=setting.id,
        action="platform_agent_embedding_updated",
        operator_id=operator_id,
        changes={"before": before, "after": after},
        request=request,
    )
    db.commit()
    return after


def record_platform_commission_income(
    db: MongoDatabase,
    *,
    submission_id: str,
    team_id: str,
    task_id: str,
    labeler_id: str,
    reward_points: int,
    operator_id: str | None,
) -> dict | None:
    rate = platform_commission_rate_bps(db)
    amount = platform_service_fee_points(db, reward_points, commission_rate_bps=rate)
    if amount <= 0:
        return None
    existing = db.find_one(
        PlatformFinanceLedger,
        {"transaction_type": "commission_income", "source_type": "submission_review", "source_id": submission_id},
    )
    if existing:
        return platform_finance_ledger_payload(db, existing)
    item = PlatformFinanceLedger(
        transaction_type="commission_income",
        source_type="submission_review",
        source_id=submission_id,
        team_id=team_id,
        task_id=task_id,
        labeler_id=labeler_id,
        reward_points=reward_points,
        commission_rate_bps=rate,
        amount_points=amount,
        status="completed",
        note="标注审核通过后确认平台服务费收入",
        meta={"unit_hint": "1 积分 = 1 元"},
        operator_id=operator_id,
    )
    db.add(item)
    return platform_finance_ledger_payload(db, item)


def platform_finance_ledger_payload(db: MongoDatabase, item: PlatformFinanceLedger) -> dict:
    team = db.get(Team, item.team_id) if item.team_id else None
    labeler = db.get(User, item.labeler_id) if item.labeler_id else None
    return {
        "ledger_id": item.id,
        "transaction_type": item.transaction_type,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "team_id": item.team_id,
        "team_name": team.company_name if team else None,
        "task_id": item.task_id,
        "labeler_id": item.labeler_id,
        "labeler_name": display_user_name(db, labeler) if labeler else None,
        "reward_points": item.reward_points,
        "commission_rate_bps": item.commission_rate_bps,
        "amount_points": item.amount_points,
        "amount_yuan": item.amount_points,
        "status": item.status,
        "note": item.note,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def list_platform_settlements(
    db: MongoDatabase,
    *,
    team_id: str | None = None,
    status: str | None = None,
    keyword: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    query: dict = {"transaction_type": "commission_income"}
    if team_id:
        query["team_id"] = team_id
    if status:
        query["status"] = status
    items = db.find(PlatformFinanceLedger, query, sort=[("created_at", -1)])
    payloads = [platform_finance_ledger_payload(db, item) for item in items if _within_date_range(item.created_at, start_date, end_date)]
    filtered = [
        item
        for item in payloads
        if _contains_keyword(
            keyword,
            item.get("ledger_id"),
            item.get("team_id"),
            item.get("team_name"),
            item.get("task_id"),
            item.get("labeler_id"),
            item.get("labeler_name"),
            item.get("source_id"),
            item.get("source_type"),
            item.get("note"),
        )
    ]
    return paginated_payload(filtered, page, page_size)


def create_profile_withdraw_request(
    db: MongoDatabase,
    *,
    user: User,
    amount: int,
    payout_method: str,
    account_name: str | None,
    account_no: str,
    bank_name: str | None,
    note: str | None,
    request: Request,
) -> dict:
    wallet = db.find_one(PointsWallet, {"user_id": user.id})
    if not wallet:
        wallet = PointsWallet(user_id=user.id)
        db.add(wallet)
    pending = pending_payment_points(db, owner_type="user", owner_id=user.id)
    available = max(0, int(wallet.available_points or 0) - pending)
    if amount > available:
        raise AppError(ErrorCode.BUSINESS_RULE, "提现积分不能超过可用余额", {"available_points": available, "pending_payment_points": pending})
    next_balance = int(wallet.available_points or 0) - amount
    completed_at = now_utc().replace(tzinfo=None)
    item = PlatformPaymentRequest(
        request_type="labeler_withdraw",
        owner_type="user",
        owner_id=user.id,
        owner_name=display_user_name(db, user),
        amount_points=amount,
        payout_method=payout_method,
        account_name=account_name,
        account_no=account_no,
        bank_name=bank_name,
        note=note or "标注员积分提现",
        status="approved",
        reviewer_id="system:auto_withdraw",
        review_comment="余额校验通过，系统自动完成提现",
        reviewed_at=completed_at,
        created_by=user.id,
    )
    db.add(item)
    wallet.available_points = next_balance
    wallet.updated_at = completed_at
    db.save(wallet)
    db.add(
        PointsLedger(
            user_id=user.id,
            change=-amount,
            reason=note or "标注员积分提现",
            source_type="platform_payment_request",
            source_id=item.id,
            balance_after=next_balance,
        )
    )
    write_audit_log(
        db,
        entity_type="points",
        entity_id=user.id,
        action="profile_points_withdraw_completed",
        operator_id=user.id,
        changes={"amount_points": amount, "payment_request_id": item.id, "balance_after": next_balance, "unit_hint": "1 积分 = 1 元"},
        request=request,
    )
    db.commit()
    return platform_payment_request_payload(db, item)


def list_payment_requests(
    db: MongoDatabase,
    *,
    status: str | None = None,
    owner_type: str | None = None,
    keyword: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    query: dict = {}
    if status:
        query["status"] = status
    if owner_type:
        query["owner_type"] = owner_type
    items = db.find(PlatformPaymentRequest, query, sort=[("created_at", -1)])
    payloads = [platform_payment_request_payload(db, item) for item in items if _within_date_range(item.created_at, start_date, end_date)]
    filtered = [
        item
        for item in payloads
        if _contains_keyword(
            keyword,
            item.get("request_id"),
            item.get("request_type"),
            item.get("owner_id"),
            item.get("owner_name"),
            item.get("account_name"),
            item.get("account_no"),
            item.get("bank_name"),
            item.get("note"),
            item.get("review_comment"),
        )
    ]
    return paginated_payload(filtered, page, page_size)


def review_payment_request(
    db: MongoDatabase,
    *,
    request_id: str,
    decision: str,
    comment: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    item = db.get(PlatformPaymentRequest, request_id)
    if not item:
        raise AppError(ErrorCode.NOT_FOUND, "支付申请不存在")
    if item.status != "pending":
        raise AppError(ErrorCode.STATE_CONFLICT, "支付申请不在待处理状态")
    if decision == "approved":
        apply_payment_request_approval(db, item, operator_id)
        next_status = "approved"
    else:
        next_status = "rejected"
    item.status = next_status
    item.reviewer_id = operator_id
    item.review_comment = comment
    item.reviewed_at = now_utc().replace(tzinfo=None)
    item.updated_at = now_utc().replace(tzinfo=None)
    db.save(item)
    write_audit_log(
        db,
        entity_type="platform_payment_request",
        entity_id=item.id,
        action="platform_payment_request_reviewed",
        operator_id=operator_id,
        changes={"decision": next_status, "comment": comment, "amount_points": item.amount_points, "owner_type": item.owner_type, "owner_id": item.owner_id},
        request=request,
    )
    db.commit()
    return platform_payment_request_payload(db, item)


def apply_payment_request_approval(db: MongoDatabase, item: PlatformPaymentRequest, operator_id: str) -> None:
    amount = max(0, int(item.amount_points or 0))
    if item.owner_type == "team":
        budget = db.find_one(TeamPointsBudget, {"team_id": item.owner_id})
        if not budget or int(budget.current_balance or 0) < amount:
            raise AppError(ErrorCode.BUSINESS_RULE, "企业积分余额不足，无法批准提现")
        budget.current_balance = int(budget.current_balance or 0) - amount
        budget.updated_at = now_utc().replace(tzinfo=None)
        db.save(budget)
        db.add(
            TeamPointsWalletLedger(
                team_id=item.owner_id,
                transaction_type="withdraw",
                direction="out",
                amount=amount,
                balance_after=budget.current_balance,
                status="completed",
                note=item.note or "企业积分提现",
                payment_method=item.payout_method,
                source_type="platform_payment_request",
                source_id=item.id,
                reference_no=f"WTD-{int(now_utc().timestamp())}",
                operator_id=operator_id,
                meta={"account_name": item.account_name, "account_no": item.account_no, "bank_name": item.bank_name, "unit_hint": "1 积分 = 1 元"},
            )
        )
        return
    wallet = db.find_one(PointsWallet, {"user_id": item.owner_id})
    if not wallet or int(wallet.available_points or 0) < amount:
        raise AppError(ErrorCode.BUSINESS_RULE, "标注员积分余额不足，无法批准提现")
    wallet.available_points = int(wallet.available_points or 0) - amount
    wallet.updated_at = now_utc().replace(tzinfo=None)
    db.save(wallet)
    db.add(
        PointsLedger(
            user_id=item.owner_id,
            change=-amount,
            reason=item.note or "标注员积分提现",
            source_type="platform_payment_request",
            source_id=item.id,
            balance_after=wallet.available_points,
        )
    )


def list_team_verification_queue(
    db: MongoDatabase,
    *,
    status: str | None = "pending_review",
    keyword: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    query = {"verification_status": status} if status else {}
    teams = db.find(Team, query, sort=[("verification_submitted_at", 1)])
    payloads = [
        team_verification_payload(team)
        for team in teams
        if _within_date_range(team.verification_submitted_at or team.created_at, start_date, end_date)
    ]
    filtered = [
        item
        for item in payloads
        if _contains_keyword(
            keyword,
            item.get("team_id"),
            item.get("company_name"),
            item.get("legal_name"),
            item.get("registration_number"),
            item.get("verification_contact"),
            item.get("verification_phone"),
            item.get("verification_materials"),
            item.get("verification_review_comment"),
        )
    ]
    return paginated_payload(filtered, page, page_size)


def review_team_verification(
    db: MongoDatabase,
    *,
    team_id: str,
    decision: str,
    comment: str | None,
    operator_id: str,
    request: Request,
) -> dict:
    team = db.get(Team, team_id)
    if not team:
        raise AppError(ErrorCode.NOT_FOUND, "企业不存在")
    if team.verification_status != "pending_review":
        raise AppError(ErrorCode.STATE_CONFLICT, "企业认证不在待审核状态")
    previous = team.verification_status
    team.verification_status = "verified" if decision == "approved" else "rejected"
    team.verification_review_comment = comment
    team.updated_at = now_utc().replace(tzinfo=None)
    db.save(team)
    write_audit_log(
        db,
        entity_type="team",
        entity_id=team.id,
        action="team_verification_reviewed",
        operator_id=operator_id,
        team_id=team.id,
        changes={"verification_status": {"from": previous, "to": team.verification_status}, "comment": comment},
        request=request,
    )
    db.commit()
    return team_verification_payload(team)


def platform_certification_queue(db: MongoDatabase, *, cert_category: str | None, status: str | None, keyword: str | None, page: int, page_size: int) -> dict:
    return paginated_payload(list_certification_review_queue(db, cert_category, status, keyword), page, page_size)


def platform_review_certification(db: MongoDatabase, *, cert_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    return review_certification(db, cert_id, payload, operator_id, request)


def platform_reputation_appeal_queue(db: MongoDatabase, *, status: str | None, page: int, page_size: int) -> dict:
    query = {}
    if status:
        query["status"] = status
    items = db.find(ReputationAppeal, query, sort=[("created_at", -1)])
    return paginated_payload([platform_reputation_appeal_payload(db, item) for item in items], page, page_size)


def platform_reputation_appeal_payload(db: MongoDatabase, appeal: ReputationAppeal) -> dict:
    ledger = db.get(ReputationLedger, appeal.ledger_id)
    user = db.get(User, appeal.user_id)
    return {
        **reputation_appeal_payload(appeal),
        "user": user_payload(user) if user else None,
        "ledger": reputation_ledger_payload(ledger) if ledger else None,
    }


def user_payload(user: User) -> dict:
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
    }


def platform_review_reputation_appeal(db: MongoDatabase, *, appeal_id: str, decision: str, reviewer_notes: str | None, operator_id: str, request: Request) -> dict:
    appeal = db.get(ReputationAppeal, appeal_id)
    if not appeal:
        raise AppError(ErrorCode.NOT_FOUND, "信誉分申诉不存在")
    if appeal.status != "pending":
        raise AppError(ErrorCode.STATE_CONFLICT, "该申诉已处理")
    ledger = db.get(ReputationLedger, appeal.ledger_id)
    if not ledger:
        raise AppError(ErrorCode.NOT_FOUND, "关联信誉分流水不存在")
    if ledger.change >= 0:
        raise AppError(ErrorCode.BUSINESS_RULE, "只有扣分流水可以被申诉返还")
    if decision not in {"approved", "rejected"}:
        raise AppError(ErrorCode.VALIDATION_ERROR, "申诉处理结果无效")
    now = now_utc().replace(tzinfo=None)
    appeal.status = decision
    appeal.reviewer_id = operator_id
    appeal.reviewer_notes = reviewer_notes
    appeal.updated_at = now
    ledger.appeal_status = decision
    db.save(appeal)
    db.save(ledger)
    adjustment = None
    if decision == "approved":
        adjustment = adjust_reputation(
            db,
            user_id=appeal.user_id,
            change=abs(int(ledger.change or 0)),
            reason=f"申诉通过，返还信誉分：{ledger.reason}",
            source_type="appeal_refund",
            source_id=appeal.id,
            metadata={"appeal_id": appeal.id, "original_ledger_id": ledger.id, "reviewer_notes": reviewer_notes or ""},
        )
    write_audit_log(
        db,
        entity_type="reputation_appeal",
        entity_id=appeal.id,
        action="reputation_appeal_reviewed",
        operator_id=operator_id,
        changes={"decision": decision, "ledger_id": ledger.id, "refund": adjustment},
        request=request,
    )
    db.commit()
    payload = platform_reputation_appeal_payload(db, appeal)
    payload["refund_adjustment"] = adjustment
    return payload


def workbench_payload(db: MongoDatabase) -> dict:
    ledgers = db.find(PlatformFinanceLedger, {"transaction_type": "commission_income"})
    payments = db.find(PlatformPaymentRequest, {})
    teams = db.find(Team, {})
    pending_certs = list_certification_review_queue(db, None, "pending_review", None)
    now = now_utc().replace(tzinfo=None)
    month_start = now - timedelta(days=30)
    recent_ledgers = [item for item in ledgers if item.created_at and item.created_at >= month_start]
    return {
        "summary": {
            "total_commission_points": sum(item.amount_points for item in ledgers if item.status == "completed"),
            "month_commission_points": sum(item.amount_points for item in recent_ledgers if item.status == "completed"),
            "pending_payment_count": len([item for item in payments if item.status == "pending"]),
            "pending_payment_points": sum(item.amount_points for item in payments if item.status == "pending"),
            "pending_team_verifications": len([team for team in teams if team.verification_status == "pending_review"]),
            "pending_certifications": len(pending_certs),
        },
        "commission_setting": commission_setting_payload(db),
        "settlement_trend": settlement_trend_payload(recent_ledgers, now),
        "recent_settlements": [platform_finance_ledger_payload(db, item) for item in sorted(ledgers, key=lambda item: item.created_at, reverse=True)[:8]],
        "pending_payments": [platform_payment_request_payload(db, item) for item in payments if item.status == "pending"][:8],
        "unit_hint": "1 积分 = 1 元",
    }


def settlement_trend_payload(items: list[PlatformFinanceLedger], now) -> list[dict]:
    days = [(now.date() - timedelta(days=offset)).isoformat() for offset in range(29, -1, -1)]
    buckets = {day: 0 for day in days}
    for item in items:
        if item.status != "completed" or not item.created_at:
            continue
        day = item.created_at.date().isoformat()
        if day in buckets:
            buckets[day] += max(0, int(item.amount_points or 0))
    return [{"date": day, "commission_points": amount, "commission_yuan": amount} for day, amount in buckets.items()]


def pending_payment_points(db: MongoDatabase, *, owner_type: str, owner_id: str) -> int:
    items = db.find(PlatformPaymentRequest, {"owner_type": owner_type, "owner_id": owner_id, "status": "pending"})
    return sum(max(0, int(item.amount_points or 0)) for item in items)


def platform_payment_request_payload(db: MongoDatabase, item: PlatformPaymentRequest) -> dict:
    return {
        "request_id": item.id,
        "request_type": item.request_type,
        "owner_type": item.owner_type,
        "owner_id": item.owner_id,
        "owner_name": item.owner_name or owner_name(db, item),
        "amount_points": item.amount_points,
        "amount_yuan": item.amount_points,
        "payout_method": item.payout_method,
        "account_name": item.account_name,
        "account_no": item.account_no,
        "bank_name": item.bank_name,
        "note": item.note,
        "status": item.status,
        "reviewer_id": item.reviewer_id,
        "review_comment": item.review_comment,
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "created_by": item.created_by,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "unit_hint": "1 积分 = 1 元",
    }


def owner_name(db: MongoDatabase, item: PlatformPaymentRequest) -> str | None:
    if item.owner_type == "team":
        team = db.get(Team, item.owner_id)
        return team.company_name if team else None
    user = db.get(User, item.owner_id)
    return display_user_name(db, user) if user else None


def team_verification_payload(team: Team) -> dict:
    return {
        "team_id": team.id,
        "company_name": team.company_name,
        "verification_status": team.verification_status,
        "legal_name": team.legal_name,
        "registration_number": team.registration_number,
        "verification_contact": team.verification_contact,
        "verification_phone": team.verification_phone,
        "verification_materials": team.verification_materials,
        "verification_review_comment": team.verification_review_comment,
        "verification_submitted_at": team.verification_submitted_at.isoformat() if team.verification_submitted_at else None,
        "created_at": team.created_at.isoformat() if team.created_at else None,
    }


def display_user_name(db: MongoDatabase, user: User | None) -> str | None:
    if not user:
        return None
    profile = db.find_one(UserProfile, {"user_id": user.id})
    return profile.display_name if profile and profile.display_name else user.username


def paginated_payload(items: list[dict], page: int, page_size: int) -> dict:
    safe_page = max(1, int(page or 1))
    safe_size = max(1, min(100, int(page_size or 20)))
    total = len(items)
    start = (safe_page - 1) * safe_size
    end = start + safe_size
    return {
        "items": items[start:end],
        "pagination": {
            "page": safe_page,
            "page_size": safe_size,
            "total": total,
            "total_pages": (total + safe_size - 1) // safe_size if total else 1,
        },
    }
