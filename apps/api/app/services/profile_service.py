from fastapi import Request

from app.core.database import MongoDatabase
from app.core.errors import AppError, ErrorCode
from app.core.security import now_utc
from app.models.platform import PlatformPaymentRequest
from app.models.profile import Certification, PointsLedger, PointsWallet, ReputationAppeal, ReputationLedger, ReputationWallet
from app.models.user import User, UserProfile
from app.services.audit_service import write_audit_log


def ensure_profile(db: MongoDatabase, user: User) -> UserProfile:
    profile = db.find_one(UserProfile, {"user_id": user.id})
    if profile:
        return profile
    profile = UserProfile(user_id=user.id, display_name=user.username)
    db.add(profile)
    return profile


def my_profile_payload(db: MongoDatabase, user: User) -> dict:
    profile = ensure_profile(db, user)
    wallet = ensure_wallet(db, user.id)
    certifications = db.find(Certification, {"user_id": user.id}, sort=[("created_at", -1)])
    db.commit()
    return {
        "user": {
            "user_id": user.id,
            "username": user.username,
            "display_name": profile.display_name,
            "email": user.email,
            "role": user.global_role,
            "avatar": user.avatar,
            "email_verified": user.email_verified,
            "status": user.status,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "profile": profile_payload(profile),
        "certifications": [certification_payload(item) for item in certifications],
        "points": wallet_payload(wallet),
        "labeler_account": labeler_account_payload(profile, certifications, wallet),
    }


def update_my_profile(db: MongoDatabase, user: User, updates: dict, request: Request) -> dict:
    profile = ensure_profile(db, user)
    if user.global_role == "labeler" and basic_info_update_fields(updates) and labeler_basic_info_status(db, profile) == "pending_review":
        raise AppError(ErrorCode.STATE_CONFLICT, "基础信息正在等待平台管理员审核，审核完成前暂不能修改")
    changes = {}
    if "avatar" in updates:
        changes["avatar"] = {"from": user.avatar, "to": updates["avatar"]}
        user.avatar = updates["avatar"]
        user.updated_at = now_utc().replace(tzinfo=None)
        db.save(user)
    for field in [
        "display_name",
        "real_name",
        "gender",
        "birthday",
        "profession",
        "work_years",
        "bio",
        "phone",
        "location",
        "education_summary",
        "education_school",
        "education_report_mode",
        "education_report_documents",
        "expertise_tags",
        "notification_settings",
    ]:
        if field in updates and updates[field] is not None:
            changes[field] = {"from": getattr(profile, field), "to": updates[field]}
            setattr(profile, field, updates[field])
    profile.updated_at = now_utc().replace(tzinfo=None)
    db.save(profile)
    basic_info_cert = None
    if user.global_role == "labeler" and labeler_basic_info_complete(profile):
        basic_info_cert = submit_basic_info_review_if_needed(db, user, profile, request)
        if basic_info_cert:
            changes["labeler_basic_info_review"] = {"to": basic_info_cert.status, "cert_id": basic_info_cert.id}
    write_audit_log(db, entity_type="user_profile", entity_id=profile.id, action="profile_updated", operator_id=user.id, changes=changes, request=request)
    db.commit()
    return my_profile_payload(db, user)


def submit_domain_certification(db: MongoDatabase, user: User, payload: dict, request: Request) -> dict:
    cert = Certification(
        user_id=user.id,
        cert_category="domain",
        cert_type=payload["domain"],
        cert_name=payload["cert_name"],
        status="pending_review",
        provider="markup",
        submitted_data={
            "real_name": payload["real_name"],
            "industry": payload.get("industry"),
            "evidence_type": payload.get("evidence_type"),
            "title": payload.get("title"),
            "organization": payload.get("organization"),
            "display_type": payload.get("display_type"),
            "registration_number": payload.get("registration_number"),
            "agreement_accepted": payload.get("agreement_accepted"),
            "description": payload.get("description"),
            "supplement_documents": payload.get("supplement_documents") or [],
        },
        documents=payload.get("documents") or [],
    )
    db.add(cert)
    write_audit_log(db, entity_type="certification", entity_id=cert.id, action="domain_cert_submitted", operator_id=user.id, changes=payload, request=request)
    db.commit()
    return certification_payload(cert)


def submit_education_certification(db: MongoDatabase, user: User, payload: dict, request: Request) -> dict:
    cert = Certification(
        user_id=user.id,
        cert_category="education",
        cert_type=payload["education_level"],
        cert_name=f"{payload['school']} {education_level_label(payload['education_level'])}",
        status="pending_review",
        provider="manual",
        submitted_data={
            "real_name": payload["real_name"],
            "education_level": payload["education_level"],
            "school": payload["school"],
            "major": payload.get("major"),
            "graduation_year": payload.get("graduation_year"),
            "degree": payload.get("degree"),
        },
        documents=payload.get("documents") or [],
    )
    db.add(cert)
    write_audit_log(db, entity_type="certification", entity_id=cert.id, action="education_cert_submitted", operator_id=user.id, changes=payload, request=request)
    db.commit()
    return certification_payload(cert)


def list_certification_review_queue(db: MongoDatabase, cert_category: str | None, status: str | None, keyword: str | None) -> list[dict]:
    query: dict = {"status": status or "pending_review"}
    if cert_category:
        query["cert_category"] = cert_category
    certifications = db.find(Certification, query, sort=[("created_at", 1)])
    if keyword:
        lowered = keyword.lower()
        certifications = [
            cert
            for cert in certifications
            if (user := db.get(User, cert.user_id))
            and (
                lowered in user.username.lower()
                or (user.email and lowered in user.email.lower())
                or (
                    (profile := db.find_one(UserProfile, {"user_id": cert.user_id}))
                    and profile.display_name
                    and lowered in profile.display_name.lower()
                )
            )
        ]
    return [certification_review_payload(db, item) for item in certifications]


def review_certification(db: MongoDatabase, cert_id: str, payload: dict, operator_id: str, request: Request) -> dict:
    cert = db.get(Certification, cert_id)
    if not cert:
        raise AppError(ErrorCode.NOT_FOUND, "资源不存在")
    if cert.status != "pending_review":
        raise AppError(ErrorCode.STATE_CONFLICT, "资质不在待审核状态")
    cert.status = payload["decision"]
    cert.reviewer_notes = payload.get("reviewer_notes")
    if payload["decision"] == "approved":
        cert.verified_at = now_utc()
    db.save(cert)
    if cert.cert_category == "basic_info":
        profile = db.find_one(UserProfile, {"user_id": cert.user_id})
        if profile:
            settings = dict(profile.notification_settings or {})
            settings["labeler_basic_info_status"] = payload["decision"]
            if payload["decision"] == "approved":
                settings["labeler_basic_info_ever_approved"] = True
            settings["labeler_basic_info_reviewed_at"] = now_utc().replace(tzinfo=None).isoformat()
            settings["labeler_basic_info_review_notes"] = payload.get("reviewer_notes")
            profile.notification_settings = settings
            profile.updated_at = now_utc().replace(tzinfo=None)
            db.save(profile)
    write_audit_log(
        db,
        entity_type="certification",
        entity_id=cert.id,
        action="certification_reviewed",
        operator_id=operator_id,
        changes={"decision": payload["decision"], "reviewer_notes": payload.get("reviewer_notes")},
        request=request,
    )
    db.commit()
    return certification_review_payload(db, cert)


def ensure_wallet(db: MongoDatabase, user_id: str) -> PointsWallet:
    wallet = db.find_one(PointsWallet, {"user_id": user_id})
    if wallet:
        return wallet
    wallet = PointsWallet(user_id=user_id)
    db.add(wallet)
    return wallet


def points_payload(db: MongoDatabase, user: User) -> dict:
    backfill_approved_submission_points(db, user.id)
    wallet = ensure_wallet(db, user.id)
    ledger = db.find(PointsLedger, {"user_id": user.id}, sort=[("created_at", -1)])
    db.commit()
    pending_withdraw_points = pending_profile_withdraw_points(db, user.id)
    return {
        "wallet": wallet_payload(wallet),
        "overview": points_overview_payload(wallet, ledger, pending_withdraw_points=pending_withdraw_points),
        "items": [ledger_payload(db, item) for item in ledger],
    }


def backfill_approved_submission_points(db: MongoDatabase, user_id: str) -> None:
    from app.models.production import Submission, Task
    from app.services.labels_service import submission_unit_points

    approved_submissions = db.find(Submission, {"labeler_id": user_id, "status": "approved"})
    processed_bundle_ids: set[str] = set()
    for submission in approved_submissions:
        claim_bundle_id = str(getattr(submission, "claim_bundle_id", "") or "").strip()
        if claim_bundle_id:
            if claim_bundle_id in processed_bundle_ids:
                continue
            processed_bundle_ids.add(claim_bundle_id)
            settle_claim_bundle_points(db, claim_bundle_id=claim_bundle_id)
            continue
        if db.find_one(PointsLedger, {"user_id": user_id, "source_type": "submission_review", "source_id": submission.id}):
            continue
        task = db.get(Task, submission.task_id) if submission.task_id else None
        change = submission_unit_points(db, submission)
        if change <= 0:
            continue
        settle_submission_points(
            db,
            user_id=user_id,
            change=change,
            reason=f"任务「{task.title if task else '未知任务'}」标注审核通过",
            source_type="submission_review",
            source_id=submission.id,
        )


def add_points(db: MongoDatabase, payload: dict, operator_id: str, request: Request) -> dict:
    wallet = ensure_wallet(db, payload["user_id"])
    wallet.total_points += payload["change"]
    wallet.available_points += payload["change"]
    wallet.updated_at = now_utc().replace(tzinfo=None)
    if wallet.total_points >= 1000:
        wallet.level = "gold"
    elif wallet.total_points >= 300:
        wallet.level = "silver"
    db.save(wallet)
    ledger = PointsLedger(
        user_id=payload["user_id"],
        change=payload["change"],
        reason=payload["reason"],
        source_type=payload.get("source_type"),
        source_id=payload.get("source_id"),
        balance_after=wallet.available_points,
    )
    db.add(ledger)
    write_audit_log(db, entity_type="points", entity_id=payload["user_id"], action="points_added", operator_id=operator_id, changes=payload, request=request)
    db.commit()
    return {"wallet": wallet_payload(wallet), "ledger": ledger_payload(db, ledger)}


def settle_submission_points(
    db: MongoDatabase,
    *,
    user_id: str,
    change: int,
    reason: str,
    source_type: str,
    source_id: str,
) -> dict | None:
    if change <= 0:
        return None
    existing = db.find_one(PointsLedger, {"user_id": user_id, "source_type": source_type, "source_id": source_id})
    if existing:
        return {"wallet": wallet_payload(ensure_wallet(db, user_id)), "ledger": ledger_payload(db, existing), "created": False}
    wallet = ensure_wallet(db, user_id)
    wallet.total_points += change
    wallet.available_points += change
    wallet.updated_at = now_utc().replace(tzinfo=None)
    if wallet.total_points >= 1000:
        wallet.level = "gold"
    elif wallet.total_points >= 300:
        wallet.level = "silver"
    db.save(wallet)
    ledger = PointsLedger(
        user_id=user_id,
        change=change,
        reason=reason,
        source_type=source_type,
        source_id=source_id,
        balance_after=wallet.available_points,
    )
    db.add(ledger)
    return {"wallet": wallet_payload(wallet), "ledger": ledger_payload(db, ledger), "created": True}


def is_claim_bundle_ready_for_settlement(db: MongoDatabase, claim_bundle_id: str) -> bool:
    from app.models.production import Question, Submission, TaskClaimBundle
    from app.services.labels_service import is_claim_cycle_finished

    bundle = db.get(TaskClaimBundle, claim_bundle_id)
    if not bundle:
        return False
    submissions = db.find(
        Submission,
        {
            "team_id": bundle.team_id,
            "task_id": bundle.task_id,
            "labeler_id": bundle.labeler_id,
            "claim_bundle_id": bundle.id,
        },
    )
    if not submissions:
        return False
    question_map = {
        question.id: question
        for question in db.find(Question, {"team_id": bundle.team_id, "task_id": bundle.task_id, "claim_bundle_id": bundle.id})
    }
    submission_map = {submission.question_id: submission for submission in submissions}
    for question_id in bundle.question_ids:
        submission = submission_map.get(question_id)
        question = question_map.get(question_id)
        if not submission or not is_claim_cycle_finished(question, submission, bundle.labeler_id):
            return False
    return True


def settle_claim_bundle_points(
    db: MongoDatabase,
    *,
    claim_bundle_id: str,
    operator_id: str | None = None,
    request: Request | None = None,
) -> dict | None:
    from app.models.production import Question, Submission, Task, TaskClaimBundle
    from app.services.labels_service import submission_unit_points
    from app.services.platform_service import record_platform_commission_income
    from app.services.resource_service import (
        ensure_team_points_available_for_spend,
        platform_service_fee_points,
        record_team_platform_fee_spend,
        record_team_points_spend,
    )

    bundle = db.get(TaskClaimBundle, claim_bundle_id)
    if not bundle:
        return None
    if bundle.status == "settled":
        return {
            "bundle_id": bundle.id,
            "status": bundle.status,
            "reward_points": int(bundle.settled_reward_points or 0),
            "service_fee_points": int(bundle.settled_service_fee_points or 0),
            "created": False,
        }
    submissions = db.find(
        Submission,
        {
            "team_id": bundle.team_id,
            "task_id": bundle.task_id,
            "labeler_id": bundle.labeler_id,
            "claim_bundle_id": bundle.id,
        },
    )
    if not submissions:
        return None
    if not is_claim_bundle_ready_for_settlement(db, bundle.id):
        if bundle.status != "in_review":
            bundle.status = "in_review"
            bundle.updated_at = now_utc().replace(tzinfo=None)
            db.save(bundle)
        return {"bundle_id": bundle.id, "status": bundle.status, "ready": False, "created": False}

    task = db.get(Task, bundle.task_id)
    approved_submissions = [submission for submission in submissions if submission.status == "approved"]
    pending_settlements: list[tuple[Submission, int, int]] = []
    total_reward_points = 0
    total_service_fee_points = 0
    for submission in approved_submissions:
        if db.find_one(PointsLedger, {"user_id": submission.labeler_id, "source_type": "submission_review", "source_id": submission.id}):
            continue
        reward_points = submission_unit_points(db, submission)
        if reward_points <= 0:
            continue
        service_fee_points = platform_service_fee_points(db, reward_points)
        pending_settlements.append((submission, reward_points, service_fee_points))
        total_reward_points += reward_points
        total_service_fee_points += service_fee_points

    if total_reward_points + total_service_fee_points > 0:
        ensure_team_points_available_for_spend(
            db,
            team_id=bundle.team_id,
            amount=total_reward_points + total_service_fee_points,
        )

    created_submission_ids: list[str] = []
    for submission, reward_points, service_fee_points in pending_settlements:
        points_settlement = settle_submission_points(
            db,
            user_id=submission.labeler_id,
            change=reward_points,
            reason=f"任务《{task.title if task else '未知任务'}》任务包结算发放",
            source_type="submission_review",
            source_id=submission.id,
        )
        if not points_settlement or not points_settlement.get("created"):
            continue
        created_submission_ids.append(submission.id)
        record_team_points_spend(
            db,
            team_id=bundle.team_id,
            amount=reward_points,
            source_id=submission.id,
            operator_id=operator_id,
            request=request,
        )
        record_team_platform_fee_spend(
            db,
            team_id=bundle.team_id,
            amount=service_fee_points,
            source_id=submission.id,
            operator_id=operator_id,
            request=request,
            include_in_spent_total=True,
        )
        record_platform_commission_income(
            db,
            submission_id=submission.id,
            team_id=bundle.team_id,
            task_id=bundle.task_id,
            labeler_id=submission.labeler_id,
            reward_points=reward_points,
            operator_id=operator_id,
        )

    now = now_utc().replace(tzinfo=None)
    bundle.status = "settled"
    bundle.settled_at = now
    bundle.updated_at = now
    bundle.settled_reward_points = max(0, int(bundle.settled_reward_points or 0) + total_reward_points)
    bundle.settled_service_fee_points = max(0, int(bundle.settled_service_fee_points or 0) + total_service_fee_points)
    db.save(bundle)
    if request and operator_id:
        question_map = {
            question.id: question
            for question in db.find(Question, {"team_id": bundle.team_id, "task_id": bundle.task_id, "claim_bundle_id": bundle.id})
        }
        write_audit_log(
            db,
            entity_type="task",
            entity_id=bundle.task_id,
            action="task_bundle_settled",
            operator_id=operator_id,
            team_id=bundle.team_id,
            changes={
                "bundle_id": bundle.id,
                "labeler_id": bundle.labeler_id,
                "question_ids": bundle.question_ids,
                "approved_question_ids": [submission.question_id for submission in approved_submissions if question_map.get(submission.question_id)],
                "reward_points": total_reward_points,
                "service_fee_points": total_service_fee_points,
                "submission_ids": created_submission_ids,
            },
            request=request,
        )
    return {
        "bundle_id": bundle.id,
        "status": bundle.status,
        "reward_points": total_reward_points,
        "service_fee_points": total_service_fee_points,
        "submission_ids": created_submission_ids,
        "created": bool(created_submission_ids),
    }



REPUTATION_INITIAL_SCORE = 100
REPUTATION_MAX_SCORE = 100
REPUTATION_MIN_SCORE = 0
REPUTATION_CLAIM_MIN_SCORE = 80
REPUTATION_DEDUCTION_MULTIPLIER = 5


def ensure_reputation_wallet(db: MongoDatabase, user_id: str) -> ReputationWallet:
    wallet = db.find_one(ReputationWallet, {"user_id": user_id})
    if not wallet:
        wallet = ReputationWallet(user_id=user_id)
        db.add(wallet)
    apply_reputation_recovery(db, wallet)
    return wallet


def apply_reputation_recovery(db: MongoDatabase, wallet: ReputationWallet) -> None:
    now = now_utc().replace(tzinfo=None)
    last = normalize_datetime(wallet.last_recovered_at) if wallet.last_recovered_at else now
    elapsed_days = max(0, (now.date() - last.date()).days)
    if elapsed_days <= 0:
        return
    old_score = int(wallet.score or 0)
    wallet.score = min(REPUTATION_MAX_SCORE, old_score + elapsed_days)
    wallet.last_recovered_at = now
    wallet.updated_at = now
    db.save(wallet)
    if wallet.score > old_score:
        ledger = ReputationLedger(
            user_id=wallet.user_id,
            change=wallet.score - old_score,
            reason="信誉分每日自然恢复",
            source_type="daily_recovery",
            source_id=f"{wallet.user_id}:{now.date().isoformat()}",
            balance_after=wallet.score,
        )
        try:
            db.add(ledger)
        except Exception:
            pass


def reputation_payload(db: MongoDatabase, user: User) -> dict:
    wallet = ensure_reputation_wallet(db, user.id)
    ledgers = db.find(ReputationLedger, {"user_id": user.id}, sort=[("created_at", -1)])
    appeals = db.find(ReputationAppeal, {"user_id": user.id}, sort=[("created_at", -1)])
    db.commit()
    appeal_by_ledger = {appeal.ledger_id: appeal for appeal in appeals}
    return {
        "wallet": reputation_wallet_payload(wallet),
        "overview": reputation_overview_payload(wallet, ledgers),
        "items": [reputation_ledger_payload(item, appeal_by_ledger.get(item.id)) for item in ledgers],
        "rules": reputation_rules_payload(),
    }


def reputation_rules_payload() -> list[dict]:
    return [
        {"title": "初始与上下限", "description": "信誉分初始为 100 分，最高 100 分，最低 0 分。"},
        {"title": "自然恢复", "description": "当信誉分低于 100 分时，每天自然恢复 1 分，恢复到 100 分后停止。"},
        {"title": "质量加分", "description": "每累计 50 道题被审核通过并正式收录，信誉分增加 1 分。"},
        {"title": "终审不合格", "description": "同一道题经过三轮打回后仍未通过终审，每题扣 5 分；若任务已结束，该题不再重新流转。"},
        {"title": "超时扣分", "description": "领取后超时未完成的题目按题扣分，每个超时题目扣 5 分。"},
        {"title": "超额放弃", "description": "超过当前任务免扣信誉分放弃次数后，继续放弃题目每题扣 5 分。"},
        {"title": "接单限制", "description": "信誉分低于 80 分时仍可浏览任务广场，但不能接取新任务。"},
    ]


def reputation_overview_payload(wallet: ReputationWallet, ledgers: list[ReputationLedger]) -> dict:
    now = now_utc().replace(tzinfo=None)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    positive = [item for item in ledgers if item.change > 0]
    negative = [item for item in ledgers if item.change < 0]
    return {
        "score": wallet.score,
        "max_score": REPUTATION_MAX_SCORE,
        "min_score": REPUTATION_MIN_SCORE,
        "claim_min_score": REPUTATION_CLAIM_MIN_SCORE,
        "month_gain": sum(item.change for item in positive if item.created_at and normalize_datetime(item.created_at) >= month_start),
        "month_deduction": abs(sum(item.change for item in negative if item.created_at and normalize_datetime(item.created_at) >= month_start)),
        "can_claim_task": wallet.score >= REPUTATION_CLAIM_MIN_SCORE,
        "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
    }


def reputation_wallet_payload(wallet: ReputationWallet) -> dict:
    return {
        "score": wallet.score,
        "last_recovered_at": wallet.last_recovered_at.isoformat() if wallet.last_recovered_at else None,
        "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
    }


def reputation_ledger_payload(item: ReputationLedger, appeal: ReputationAppeal | None = None) -> dict:
    return {
        "ledger_id": item.id,
        "change": item.change,
        "reason": item.reason,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "balance_after": item.balance_after,
        "metadata": item.metadata,
        "appeal_status": appeal.status if appeal else item.appeal_status,
        "appeal_id": appeal.id if appeal else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def adjust_reputation(
    db: MongoDatabase,
    *,
    user_id: str,
    change: int,
    reason: str,
    source_type: str,
    source_id: str,
    metadata: dict | None = None,
) -> dict | None:
    if change == 0:
        return None
    existing = db.find_one(ReputationLedger, {"user_id": user_id, "source_type": source_type, "source_id": source_id})
    if existing:
        return {"wallet": reputation_wallet_payload(ensure_reputation_wallet(db, user_id)), "ledger": reputation_ledger_payload(existing), "created": False}
    wallet = ensure_reputation_wallet(db, user_id)
    wallet.score = min(REPUTATION_MAX_SCORE, max(REPUTATION_MIN_SCORE, int(wallet.score or 0) + change))
    wallet.updated_at = now_utc().replace(tzinfo=None)
    db.save(wallet)
    ledger = ReputationLedger(
        user_id=user_id,
        change=change,
        reason=reason,
        source_type=source_type,
        source_id=source_id,
        balance_after=wallet.score,
        metadata=metadata or {},
    )
    db.add(ledger)
    return {"wallet": reputation_wallet_payload(wallet), "ledger": reputation_ledger_payload(ledger), "created": True}


def reward_reputation_for_approved_submission(db: MongoDatabase, *, user_id: str) -> dict | None:
    from app.models.production import Submission

    approved_count = len(db.find(Submission, {"labeler_id": user_id, "status": "approved"}))
    if approved_count <= 0 or approved_count % 50 != 0:
        return None
    milestone = approved_count // 50
    return adjust_reputation(
        db,
        user_id=user_id,
        change=1,
        reason=f"累计 {approved_count} 题审核通过，信誉分奖励",
        source_type="approved_milestone",
        source_id=f"{user_id}:{milestone}",
        metadata={"approved_count": approved_count, "milestone": milestone},
    )


def deduct_reputation_for_final_reject(db: MongoDatabase, *, user_id: str, submission_id: str, task_id: str, question_id: str, task_title: str) -> dict | None:
    return adjust_reputation(
        db,
        user_id=user_id,
        change=-REPUTATION_DEDUCTION_MULTIPLIER,
        reason=f"任务「{task_title}」题目终审未通过",
        source_type="final_reject",
        source_id=submission_id,
        metadata={"task_id": task_id, "question_id": question_id, "task_title": task_title},
    )


def submit_reputation_appeal(db: MongoDatabase, *, user: User, ledger_id: str, reason: str, request: Request) -> dict:
    ledger = db.get(ReputationLedger, ledger_id)
    if not ledger or ledger.user_id != user.id:
        raise AppError(ErrorCode.NOT_FOUND, "信誉分流水不存在")
    if ledger.change >= 0:
        raise AppError(ErrorCode.BUSINESS_RULE, "只有扣分记录可以申诉")
    existing = db.find_one(ReputationAppeal, {"user_id": user.id, "ledger_id": ledger_id})
    if existing:
        raise AppError(ErrorCode.STATE_CONFLICT, "该扣分记录已提交申诉")
    now = now_utc().replace(tzinfo=None)
    appeal = ReputationAppeal(user_id=user.id, ledger_id=ledger_id, reason=reason.strip(), status="pending", created_at=now, updated_at=now)
    db.add(appeal)
    ledger.appeal_status = "pending"
    db.save(ledger)
    write_audit_log(db, entity_type="reputation_appeal", entity_id=appeal.id, action="reputation_appeal_submitted", operator_id=user.id, changes={"ledger_id": ledger_id, "reason": reason}, request=request)
    db.commit()
    return reputation_appeal_payload(appeal)


def reputation_appeal_payload(appeal: ReputationAppeal) -> dict:
    return {
        "appeal_id": appeal.id,
        "ledger_id": appeal.ledger_id,
        "reason": appeal.reason,
        "status": appeal.status,
        "reviewer_id": appeal.reviewer_id,
        "reviewer_notes": appeal.reviewer_notes,
        "created_at": appeal.created_at.isoformat() if appeal.created_at else None,
        "updated_at": appeal.updated_at.isoformat() if appeal.updated_at else None,
    }

def profile_payload(profile: UserProfile) -> dict:
    return {
        "display_name": profile.display_name,
        "real_name": profile.real_name,
        "gender": profile.gender,
        "birthday": profile.birthday,
        "profession": profile.profession,
        "work_years": profile.work_years,
        "bio": profile.bio,
        "phone": profile.phone,
        "location": profile.location,
        "education_summary": profile.education_summary,
        "education_school": profile.education_school,
        "education_report_mode": profile.education_report_mode,
        "education_report_documents": profile.education_report_documents,
        "expertise_tags": profile.expertise_tags,
        "notification_settings": profile.notification_settings,
        "labeler_basic_info_status": labeler_basic_info_status_from_profile(profile),
    }


def labeler_account_payload(profile: UserProfile, certifications: list[Certification], wallet: PointsWallet) -> dict:
    completion = basic_info_completion(profile)
    cert_summary = certification_summary_payload(certifications)
    basic_status = labeler_basic_info_status_from_profile(profile)
    return {
        "welcome_title": "欢迎加入 MarkUp 数据平台!",
        "welcome_subtitle": "完善基础资料、提交资质材料后，可以更稳定地匹配适合的标注任务。",
        "basic_info": completion,
        "basic_info_status": basic_status,
        "certifications": cert_summary,
        "points": wallet_payload(wallet),
        "readiness_steps": [
            {
                "key": "account",
                "label": "账号已创建",
                "status": "completed",
                "description": "登录邮箱和基础账号已建立。",
            },
            {
                "key": "basic_info",
                "label": "基础信息",
                "status": "completed" if basic_status == "approved" else "pending_review" if basic_status == "pending_review" else "pending",
                "description": basic_info_status_description(completion, basic_status),
            },
            {
                "key": "certification",
                "label": "资质认证",
                "status": certification_step_status(cert_summary),
                "description": f"已通过 {cert_summary['approved_count']} 项，待审核 {cert_summary['pending_count']} 项。",
            },
        ],
    }


def basic_info_completion(profile: UserProfile) -> dict:
    fields = [
        ("real_name", "实名信息"),
        ("phone", "联系电话"),
        ("education_summary", "最高学历"),
        ("education_school", "最高学历就读院校"),
        ("education_report_documents", "学历/学籍验证报告"),
    ]
    missing = [label for field, label in fields if not profile_field_has_value(profile, field)]
    total = len(fields)
    completed = total - len(missing)
    return {
        "completed_count": completed,
        "total_count": total,
        "completion_percent": round(completed / total * 100) if total else 100,
        "missing_fields": missing,
    }


def profile_field_has_value(profile: UserProfile, field: str) -> bool:
    value = getattr(profile, field)
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, str):
        return bool(value.strip())
    return value is not None


def basic_info_update_fields(updates: dict) -> bool:
    return bool(
        {
            "real_name",
            "phone",
            "education_summary",
            "education_school",
            "education_report_mode",
            "education_report_documents",
        }
        & set(updates.keys())
    )


def labeler_basic_info_complete(profile: UserProfile) -> bool:
    return basic_info_completion(profile)["completion_percent"] == 100


def labeler_basic_info_status(db: MongoDatabase, profile: UserProfile) -> str:
    status = labeler_basic_info_status_from_profile(profile)
    if status == "approved":
        return status
    latest = db.find_one(Certification, {"user_id": profile.user_id, "cert_category": "basic_info"}, sort=[("created_at", -1)])
    if latest:
        return latest.status
    if labeler_basic_info_complete(profile):
        return "not_submitted"
    return "incomplete"


def labeler_basic_info_status_from_profile(profile: UserProfile) -> str:
    status = str((profile.notification_settings or {}).get("labeler_basic_info_status") or "").strip()
    if status in {"approved", "pending_review", "rejected"}:
        return status
    return "not_submitted" if labeler_basic_info_complete(profile) else "incomplete"


def labeler_basic_info_allows_claim(profile: UserProfile, status: str | None = None) -> bool:
    current_status = status or labeler_basic_info_status_from_profile(profile)
    settings = profile.notification_settings or {}
    return current_status == "approved" or (current_status == "pending_review" and bool(settings.get("labeler_basic_info_ever_approved")))


def basic_info_status_description(completion: dict, status: str) -> str:
    if status == "approved":
        return "平台管理员已审核通过。"
    if status == "pending_review":
        return "已提交平台管理员审核，审核完成前暂不能修改。"
    if status == "rejected":
        return "审核未通过，请按反馈修改后重新提交。"
    return f"已完成 {completion['completed_count']}/{completion['total_count']} 项。"


def submit_basic_info_review_if_needed(db: MongoDatabase, user: User, profile: UserProfile, request: Request) -> Certification | None:
    current_status = labeler_basic_info_status(db, profile)
    if current_status == "pending_review":
        return None
    now = now_utc().replace(tzinfo=None)
    settings = dict(profile.notification_settings or {})
    settings["labeler_basic_info_status"] = "pending_review"
    settings["labeler_basic_info_submitted_at"] = now.isoformat()
    profile.notification_settings = settings
    db.save(profile)
    cert = Certification(
        user_id=user.id,
        cert_category="basic_info",
        cert_type="labeler_basic_info",
        cert_name="批注员基础信息认证",
        status="pending_review",
        provider="markup",
        submitted_data={
            "real_name": profile.real_name,
            "phone": profile.phone,
            "education_summary": profile.education_summary,
            "education_school": profile.education_school,
            "education_report_mode": profile.education_report_mode,
        },
        documents=profile.education_report_documents or [],
    )
    db.add(cert)
    write_audit_log(
        db,
        entity_type="certification",
        entity_id=cert.id,
        action="basic_info_cert_submitted",
        operator_id=user.id,
        changes={"profile_id": profile.id, "status": cert.status},
        request=request,
    )
    return cert


def certification_summary_payload(certifications: list[Certification]) -> dict:
    statuses = [cert.status for cert in certifications]
    return {
        "total_count": len(certifications),
        "approved_count": statuses.count("approved"),
        "pending_count": statuses.count("pending_review"),
        "rejected_count": statuses.count("rejected"),
        "education_status": latest_certification_status(certifications, "education"),
        "domain_status": latest_certification_status(certifications, "domain"),
    }


def latest_certification_status(certifications: list[Certification], category: str) -> str:
    for cert in certifications:
        if cert.cert_category == category:
            return cert.status
    return "not_submitted"


def certification_step_status(summary: dict) -> str:
    if summary["approved_count"] > 0:
        return "completed"
    if summary["pending_count"] > 0:
        return "pending_review"
    return "pending"


def pending_profile_withdraw_points(db: MongoDatabase, user_id: str) -> int:
    items = db.find(PlatformPaymentRequest, {"owner_type": "user", "owner_id": user_id, "status": "pending"})
    return sum(max(0, int(item.amount_points or 0)) for item in items)


def points_overview_payload(wallet: PointsWallet, ledger: list[PointsLedger], *, pending_withdraw_points: int = 0) -> dict:
    now = now_utc().replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    income_items = [item for item in ledger if item.change > 0]
    cost_items = [item for item in ledger if item.change < 0]
    return {
        "total_points": wallet.total_points,
        "available_points": wallet.available_points,
        "settled_points": sum(item.change for item in income_items),
        "pending_points": pending_withdraw_points,
        "spent_points": abs(sum(item.change for item in cost_items)),
        "today_points": sum(item.change for item in income_items if item.created_at and normalize_datetime(item.created_at) >= today_start),
        "month_points": sum(item.change for item in income_items if item.created_at and normalize_datetime(item.created_at) >= month_start),
        "level": wallet.level,
        "next_level_gap": next_level_gap(wallet.total_points),
        "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
    }


def normalize_datetime(value):
    return value.replace(tzinfo=None) if getattr(value, "tzinfo", None) else value


def next_level_gap(total_points: int) -> int:
    if total_points >= 1000:
        return 0
    if total_points >= 300:
        return 1000 - total_points
    return 300 - total_points


def certification_payload(cert: Certification) -> dict:
    return {
        "cert_id": cert.id,
        "cert_category": cert.cert_category,
        "cert_type": cert.cert_type,
        "cert_name": cert.cert_name,
        "status": cert.status,
        "provider": cert.provider,
        "submitted_data": cert.submitted_data,
        "documents": cert.documents,
        "reviewer_notes": cert.reviewer_notes,
        "verified_at": cert.verified_at.isoformat() if cert.verified_at else None,
        "expires_at": cert.expires_at.isoformat() if cert.expires_at else None,
        "created_at": cert.created_at.isoformat() if cert.created_at else None,
    }


def certification_review_payload(db: MongoDatabase, cert: Certification) -> dict:
    payload = certification_payload(cert)
    user = db.get(User, cert.user_id)
    profile = db.find_one(UserProfile, {"user_id": user.id}) if user else None
    payload["user"] = {
        "user_id": user.id,
        "username": user.username,
        "display_name": profile.display_name if profile and profile.display_name else user.username,
        "email": user.email,
        "avatar": user.avatar,
        "role": user.global_role,
        "status": user.status,
    }
    return payload


def education_level_label(level: str) -> str:
    labels = {
        "associate": "专科",
        "bachelor": "本科",
        "master": "硕士",
        "doctor": "博士",
        "other": "其他学历",
    }
    return labels.get(level, level)


def wallet_payload(wallet: PointsWallet) -> dict:
    return {
        "total_points": wallet.total_points,
        "available_points": wallet.available_points,
        "level": wallet.level,
        "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
    }


def ledger_payload(db: MongoDatabase, item: PointsLedger) -> dict:
    metadata = points_ledger_metadata(db, item)
    return {
        "ledger_id": item.id,
        "change": item.change,
        "reason": item.reason,
        "source_type": item.source_type,
        "source_id": item.source_id,
        "balance_after": item.balance_after,
        "metadata": metadata,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def points_ledger_metadata(db: MongoDatabase, item: PointsLedger) -> dict:
    if item.source_type != "submission_review" or not item.source_id:
        return {}
    from app.models.production import Question, Submission, Task

    submission = db.get(Submission, item.source_id)
    if not submission:
        return {}
    task = db.get(Task, submission.task_id) if submission.task_id else None
    question = db.get(Question, submission.question_id) if submission.question_id else None
    return {
        "task_id": task.id if task else submission.task_id,
        "task_title": task.title if task else "未知任务",
        "question_id": question.id if question else submission.question_id,
        "row_index": question.row_index if question else None,
        "scene": "线上任务",
    }
