from dataclasses import dataclass, field
from datetime import datetime

from app.models.base import MongoDocument, utcnow


@dataclass
class Dataset(MongoDocument):
    collection_name = "datasets"
    team_id: str = ""
    owner_id: str = ""
    updated_by: str = ""
    name: str = ""
    description: str | None = None
    source_format: str = "json"
    columns: list[dict] = field(default_factory=list)
    rows: list[dict] = field(default_factory=list)
    preview_rows: list[dict] = field(default_factory=list)
    media_assets: list[dict] = field(default_factory=list)
    media_schema: list[dict] = field(default_factory=list)
    context_schema: list[dict] = field(default_factory=list)
    processing_summary: dict = field(default_factory=dict)
    row_count: int = 0
    storage_bytes: int = 0
    status: str = "ready"
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class AnnotationTemplate(MongoDocument):
    collection_name = "templates"
    team_id: str = ""
    owner_id: str = ""
    name: str = ""
    description: str | None = None
    schema: dict = field(default_factory=dict)
    latest_version: int = 1
    status: str = "draft"
    auto_saved: bool = False
    archived_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TemplateVersion(MongoDocument):
    collection_name = "template_versions"
    template_id: str = ""
    team_id: str = ""
    version: int = 1
    schema: dict = field(default_factory=dict)
    is_published: bool = False
    created_at: datetime = field(default_factory=utcnow)


@dataclass
class Task(MongoDocument):
    collection_name = "tasks"
    team_id: str = ""
    owner_id: str = ""
    title: str = ""
    description: str = ""
    rich_content: str | None = None
    tags: list[str] = field(default_factory=list)
    status: str = "draft"
    auto_saved: bool = False
    category: str = "multimodal"
    difficulty: str = "medium"
    deadline: str | None = None
    quota: int = 0
    distribution: str = "first_come_all"
    reward_rule: dict = field(default_factory=dict)
    reviewer_ids: list[str] = field(default_factory=list)
    review_config: dict = field(default_factory=dict)
    ai_config: dict = field(default_factory=dict)
    qualification_rules: dict = field(default_factory=dict)
    required_certs: list[str] = field(default_factory=list)
    agreement_config: dict = field(default_factory=dict)
    claim_config: dict = field(default_factory=dict)
    template_id: str = ""
    template_version_id: str | None = None
    dataset_id: str = ""
    column_mapping: dict = field(default_factory=dict)
    mapping_config: dict = field(default_factory=dict)
    component_bindings: dict = field(default_factory=dict)
    assignment: dict = field(default_factory=dict)
    stats: dict = field(default_factory=dict)
    published_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class Question(MongoDocument):
    collection_name = "questions"
    team_id: str = ""
    task_id: str = ""
    dataset_id: str = ""
    row_index: int = 0
    content: dict = field(default_factory=dict)
    status: str = "pending"
    assigned_to: str | None = None
    claim_bundle_id: str | None = None
    claim_due_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class Submission(MongoDocument):
    collection_name = "submissions"
    team_id: str = ""
    task_id: str = ""
    question_id: str = ""
    labeler_id: str = ""
    claim_bundle_id: str | None = None
    template_id: str = ""
    template_version_id: str | None = None
    answers: dict = field(default_factory=dict)
    draft: dict = field(default_factory=dict)
    status: str = "draft"
    current_round: int = 1
    validation_result: dict = field(default_factory=dict)
    submitted_at: datetime | None = None
    task_submitted_at: datetime | None = None
    abandoned_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class TaskClaimBundle(MongoDocument):
    collection_name = "task_claim_bundles"
    team_id: str = ""
    task_id: str = ""
    labeler_id: str = ""
    question_ids: list[str] = field(default_factory=list)
    bundle_size: int = 0
    reward_points_total: int = 0
    settled_reward_points: int = 0
    settled_service_fee_points: int = 0
    status: str = "claimed"
    claim_due_at: datetime | None = None
    settled_at: datetime | None = None
    created_at: datetime = field(default_factory=utcnow)
    updated_at: datetime = field(default_factory=utcnow)
