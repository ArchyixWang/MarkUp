from __future__ import annotations

from collections.abc import Generator
from typing import Any

from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import settings

_client: Any | None = None
_database: "MongoDatabase" | None = None


class MongoDatabase:
    def __init__(self, database: Database) -> None:
        self.database = database

    def collection(self, name: str):
        return self.database[name]

    def get(self, model_cls, item_id: str):
        doc = self.collection(model_cls.collection_name).find_one({"_id": item_id})
        return model_cls.from_doc(doc) if doc else None

    def find_one(self, model_cls, filter_: dict | None = None, sort: list[tuple[str, int]] | None = None):
        doc = self.collection(model_cls.collection_name).find_one(filter_ or {}, sort=sort)
        return model_cls.from_doc(doc) if doc else None

    def find(self, model_cls, filter_: dict | None = None, sort: list[tuple[str, int]] | None = None) -> list:
        cursor = self.collection(model_cls.collection_name).find(filter_ or {})
        if sort:
            cursor = cursor.sort(sort)
        return [model_cls.from_doc(doc) for doc in cursor]

    def insert(self, item) -> None:
        self.collection(item.collection_name).insert_one(item.to_doc())

    def save(self, item) -> None:
        self.collection(item.collection_name).replace_one({"_id": item.id}, item.to_doc(), upsert=True)

    def delete_one(self, model_cls, filter_: dict) -> None:
        self.collection(model_cls.collection_name).delete_one(filter_)

    def delete_many(self, model_cls, filter_: dict) -> None:
        self.collection(model_cls.collection_name).delete_many(filter_)

    def update_many(self, model_cls, filter_: dict, update: dict) -> None:
        self.collection(model_cls.collection_name).update_many(filter_, update)

    def commit(self) -> None:
        return None

    def flush(self) -> None:
        return None

    def refresh(self, item) -> None:
        return None

    def add(self, item) -> None:
        self.insert(item)


def _build_client():
    if settings.mongodb_url.startswith("mongomock://"):
        import mongomock

        return mongomock.MongoClient()
    return MongoClient(settings.mongodb_url)


def get_database() -> MongoDatabase:
    global _client, _database
    if _database is None:
        _client = _build_client()
        _database = MongoDatabase(_client[settings.mongodb_database])
        init_db(_database)
    return _database


def get_db() -> Generator[MongoDatabase, None, None]:
    yield get_database()


def init_db(db: MongoDatabase | None = None) -> None:
    database = db or get_database()
    database.collection("users").create_index("username", unique=True)
    database.collection("users").create_index("email", unique=True, sparse=True)
    database.collection("email_verifications").create_index([("email", 1), ("purpose", 1), ("created_at", -1)])
    database.collection("refresh_sessions").create_index("jti_hash", unique=True)
    database.collection("oauth_states").create_index([("provider", 1), ("state_hash", 1)], unique=True)
    database.collection("oauth_identities").create_index([("provider", 1), ("provider_user_id", 1)], unique=True)
    database.collection("teams").create_index("company_name", unique=True)
    database.collection("team_members").create_index([("team_id", 1), ("user_id", 1)], unique=True)
    database.collection("team_invitations").create_index("invite_code_hash", unique=True)
    database.collection("user_profiles").create_index("user_id", unique=True)
    database.collection("points_wallets").create_index("user_id", unique=True)
    database.collection("reputation_wallets").create_index("user_id", unique=True)
    database.collection("reputation_ledger").create_index([("user_id", 1), ("created_at", -1)])
    database.collection("reputation_ledger").create_index([("user_id", 1), ("source_type", 1), ("source_id", 1)], unique=True, sparse=True)
    database.collection("reputation_appeals").create_index([("user_id", 1), ("ledger_id", 1)], unique=True)
    database.collection("datasets").create_index([("team_id", 1), ("created_at", -1)])
    database.collection("templates").create_index([("team_id", 1), ("updated_at", -1)])
    database.collection("template_versions").create_index([("template_id", 1), ("version", 1)])
    database.collection("tasks").create_index([("team_id", 1), ("status", 1), ("created_at", -1)])
    database.collection("questions").create_index([("task_id", 1), ("row_index", 1)])
    database.collection("questions").create_index([("task_id", 1), ("claim_bundle_id", 1)])
    database.collection("submissions").create_index([("question_id", 1), ("labeler_id", 1)], unique=True)
    database.collection("submissions").create_index([("task_id", 1), ("status", 1), ("updated_at", -1)])
    database.collection("submissions").create_index([("task_id", 1), ("claim_bundle_id", 1), ("labeler_id", 1)])
    database.collection("task_claim_bundles").create_index([("team_id", 1), ("task_id", 1), ("labeler_id", 1), ("created_at", -1)])
    database.collection("task_claim_bundles").create_index([("task_id", 1), ("status", 1), ("created_at", -1)])
    database.collection("ai_review_jobs").create_index("idempotency_key", unique=True)
    database.collection("ai_review_jobs").create_index([("team_id", 1), ("status", 1), ("created_at", -1)])
    database.collection("ai_review_jobs").create_index([("submission_id", 1), ("created_at", -1)])
    database.collection("team_budgets").create_index("team_id", unique=True)
    database.collection("team_points_budgets").create_index("team_id", unique=True)
    database.collection("team_ai_wallets").create_index("team_id", unique=True)
    database.collection("team_ai_wallet_ledger").create_index([("team_id", 1), ("created_at", -1)])
    database.collection("platform_settings").create_index("key", unique=True)
    database.collection("platform_finance_ledger").create_index([("transaction_type", 1), ("source_type", 1), ("source_id", 1)], unique=True)
    database.collection("platform_finance_ledger").create_index([("team_id", 1), ("created_at", -1)])
    database.collection("platform_payment_requests").create_index([("status", 1), ("owner_type", 1), ("created_at", -1)])
    database.collection("platform_payment_requests").create_index([("owner_type", 1), ("owner_id", 1), ("status", 1)])
    database.collection("budget_requests").create_index([("team_id", 1), ("created_at", -1)])
    database.collection("ai_provider_configs").create_index([("team_id", 1), ("route_name", 1)], unique=True, sparse=True)
    database.collection("ai_provider_configs").create_index([("team_id", 1), ("provider_kind", 1), ("model_id", 1)])
    database.collection("ai_provider_configs").create_index([("scope", 1), ("is_platform_default", 1)])
    database.collection("ai_call_logs").create_index([("team_id", 1), ("created_at", -1)])
    database.collection("notifications").create_index([("team_id", 1), ("notification_type", 1), ("created_at", -1)])
    database.collection("notifications").create_index([("team_id", 1), ("event_key", 1)], unique=True, partialFilterExpression={"event_key": {"$exists": True}})
    database.collection("export_jobs").create_index([("team_id", 1), ("task_id", 1), ("created_at", -1)])
    database.collection("uploaded_files").create_index([("team_id", 1), ("created_at", -1)])
    database.collection("audit_logs").create_index([("team_id", 1), ("entity_type", 1), ("entity_id", 1), ("created_at", -1)])
    remove_legacy_inline_storage(database)


def remove_legacy_inline_storage(database: MongoDatabase) -> None:
    database.collection("uploaded_files").delete_many(
        {
            "$or": [
                {"content_base64": {"$exists": True}},
                {"storage": {"$in": ["mongo", "inline_data_url"]}},
                {"url": {"$regex": r"^data:.*;base64,"}},
            ]
        }
    )
    database.collection("export_jobs").delete_many({"file_content": {"$exists": True}})
    for dataset in list(database.collection("datasets").find({})):
        if contains_inline_base64(dataset.get("rows")) or contains_inline_base64(dataset.get("media_assets")):
            database.collection("datasets").delete_one({"_id": dataset.get("_id")})


def contains_inline_base64(value: Any) -> bool:
    if isinstance(value, str):
        text = value.strip()
        return text.startswith("data:") and ";base64," in text
    if isinstance(value, dict):
        return any(contains_inline_base64(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_inline_base64(item) for item in value)
    return False


def reset_database() -> None:
    db = get_database()
    for name in db.database.list_collection_names():
        db.collection(name).drop()
    init_db(db)
