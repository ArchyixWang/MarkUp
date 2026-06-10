from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DatasetColumnUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    comment: str | None = Field(default=None, max_length=500)
    use_in_mapping: bool | None = None


class DatasetDerivedColumnRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")
    data_type: str = Field(default="text", pattern="^(text|number|image|audio|video|empty)$")
    comment: str | None = Field(default=None, max_length=500)
    use_in_mapping: bool = True
    source_column: str | None = Field(default=None, max_length=120)
    default_value: str | None = Field(default=None, max_length=2000)
    expression: str | None = Field(default=None, max_length=2000)


class UpdateDatasetRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    columns: list[DatasetColumnUpdate] | None = None
    derived_columns: list[DatasetDerivedColumnRequest] | None = None


class DatasetTableColumnRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    data_type: str | None = Field(default=None, max_length=40)
    comment: str | None = Field(default=None, max_length=500)
    use_in_mapping: bool | None = None


class DatasetTableUpdateRequest(BaseModel):
    columns: list[DatasetTableColumnRequest] = Field(min_length=1)
    rows: list[dict[str, Any]] = Field(min_length=1)


class DatasetMediaAssetBindRequest(BaseModel):
    asset_index: int = Field(ge=0)
    row_index: int = Field(ge=0)
    role: str = Field(default="context", pattern="^(primary|context|evidence)$")
    field: str | None = Field(default=None, min_length=1, max_length=120)
    media_type: str | None = Field(default=None, pattern="^(image|audio|video|document|file)$")


class TemplateComponent(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    type: str = Field(min_length=1, max_length=40)
    field: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=120)
    required: bool = False
    config: dict[str, Any] = Field(default_factory=dict)
    options: list[dict[str, Any]] = Field(default_factory=list)
    version: str = "1.0"


class TemplateTab(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=80)
    components: list[TemplateComponent] = Field(default_factory=list)


class TemplateSchemaPayload(BaseModel):
    schema_version: str = "1.1"
    tabs: list[TemplateTab] = Field(default_factory=list)
    components: list[TemplateComponent] = Field(default_factory=list)
    validation_rules: dict[str, Any] = Field(default_factory=dict)
    linkage_rules: list[dict[str, Any]] = Field(default_factory=list)
    llm_config: dict[str, Any] = Field(default_factory=dict)
    compatibility: dict[str, Any] | None = None

    @field_validator("tabs")
    @classmethod
    def require_content(cls, tabs: list[TemplateTab]) -> list[TemplateTab]:
        if not tabs:
            raise ValueError("模板至少需要一个页签")
        return tabs


class CreateTemplateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    auto_saved: bool = False
    template_schema: TemplateSchemaPayload = Field(alias="schema")


class UpdateTemplateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    auto_saved: bool | None = None
    template_schema: TemplateSchemaPayload | None = Field(default=None, alias="schema")


class CopyTemplateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class TemplateValidationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_schema: TemplateSchemaPayload = Field(alias="schema")
    answers: dict[str, Any] = Field(default_factory=dict)
    content: dict[str, Any] = Field(default_factory=dict)


class RewardRulePayload(BaseModel):
    mode: str = Field(pattern="^(task|item)$")
    total_points: int | None = Field(default=None, ge=0, le=1000000)
    points_per_item: int | None = Field(default=None, ge=0, le=1000000)


class LabelerAllocationPayload(BaseModel):
    labeler_id: str = Field(min_length=1, max_length=64)
    quota: int | None = Field(default=None, ge=0, le=100)


class AssignmentPayload(BaseModel):
    enabled: bool = False
    expire_hours: int = Field(default=72, ge=1, le=720)
    target_labeler_ids: list[str] = Field(default_factory=list, max_length=200)
    target_labeler_allocations: list[LabelerAllocationPayload] = Field(default_factory=list, max_length=200)


class AiConfigPayload(BaseModel):
    enabled: bool = False
    provider_id: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=120)
    labeler_assist_ratio: int = Field(default=5, ge=0, le=100)
    selected_dimensions: list[str] = Field(default_factory=list, max_length=20)
    custom_dimensions: list[str] = Field(default_factory=list, max_length=20)
    input_prompt: str | None = Field(default=None, max_length=10000)
    input_confirmed: bool = False
    review_matrix: list[dict[str, Any]] = Field(default_factory=list, max_length=40)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    thresholds: dict[str, Any] = Field(default_factory=dict)
    matrix_confirmed: bool = False
    dimensions: list[str] = Field(default_factory=list, max_length=40)
    prompt: str | None = Field(default=None, max_length=20000)
    review_threshold: int | None = Field(default=None, ge=0, le=100)


class AiReviewMatrixGenerateRequest(BaseModel):
    provider_id: str = Field(min_length=1, max_length=64)
    model: str | None = Field(default=None, max_length=120)
    dimensions: list[str] = Field(min_length=1, max_length=40)
    input_prompt: str | None = Field(default=None, max_length=10000)
    dataset: dict[str, Any] | None = None
    template: dict[str, Any] | None = None
    context: dict[str, Any] = Field(default_factory=dict)

    @field_validator("dimensions")
    @classmethod
    def normalize_dimensions(cls, dimensions: list[str]) -> list[str]:
        values: list[str] = []
        for item in dimensions:
            value = str(item).strip()
            if value and value not in values:
                values.append(value)
        if not values:
            raise ValueError("请至少选择一个审核维度")
        return values


class AiReviewInputGenerateRequest(BaseModel):
    provider_id: str = Field(min_length=1, max_length=64)
    model: str | None = Field(default=None, max_length=120)
    dataset: dict[str, Any] | None = None
    template: dict[str, Any] | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class TaskDifficultyEvaluateRequest(BaseModel):
    dataset_id: str | None = Field(default=None, max_length=64)
    template_id: str | None = Field(default=None, max_length=64)
    required_certs: list[str] = Field(default_factory=list, max_length=20)
    qualification_rules: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class QualificationRulesPayload(BaseModel):
    min_completed_tasks: int | None = Field(default=None, ge=0, le=100000)
    min_accuracy_rate: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=1000)
    category_tags: list[str] = Field(default_factory=list, max_length=4)


class AgreementConfigPayload(BaseModel):
    required: bool = False
    use_default_template: bool = False
    text: str | None = Field(default=None, max_length=10000)
    file_name: str | None = Field(default=None, max_length=255)


class ClaimConfigPayload(BaseModel):
    completion_hours: int | None = Field(default=None, ge=1, le=8760)
    deadline_mode: str = Field(default="date", pattern="^(date|long_term)$")
    labeling_ai_assist_percent: int = Field(default=5, ge=0, le=100)


class ReviewerAllocationPayload(BaseModel):
    reviewer_id: str = Field(min_length=1, max_length=64)
    quota: int | None = Field(default=None, ge=0, le=100000)


class ReviewConfigPayload(BaseModel):
    reviewer_allocations: list[ReviewerAllocationPayload] = Field(default_factory=list, max_length=50)


class DataBindingPayload(BaseModel):
    source_type: str = Field(pattern="^(column|media|derived_context|attachment)$")
    column_name: str | None = Field(default=None, max_length=120)
    media_type: str | None = Field(default=None, pattern="^(image|audio|video|document|file|text)$")
    role: str | None = Field(default=None, pattern="^(primary|context|evidence)$")
    field: str | None = Field(default=None, max_length=120)
    key: str | None = Field(default=None, max_length=120)
    display_fields: list[dict[str, Any]] = Field(default_factory=list, max_length=60)


class CreateTaskRequest(BaseModel):
    title: str = Field(min_length=0, max_length=100)
    description: str = Field(default="", max_length=2000)
    rich_content: str | None = Field(default=None, max_length=10000)
    tags: list[str] = Field(default_factory=list)
    auto_saved: bool = False
    category: str = Field(default="multimodal", pattern="^(text|image|audio|video|multimodal)$")
    difficulty: str | None = Field(default=None, pattern="^(easy|medium|hard)$")
    deadline: str | None = Field(default=None, max_length=40)
    distribution: str = Field(pattern="^(first_come_all|quota_grab|assigned_link)$")
    quota: int | None = Field(default=None, ge=1, le=100000)
    reward_rule: RewardRulePayload = Field(default_factory=lambda: RewardRulePayload(mode="item"))
    reviewer_ids: list[str] = Field(default_factory=list, max_length=50)
    review_config: ReviewConfigPayload = Field(default_factory=ReviewConfigPayload)
    ai_config: AiConfigPayload = Field(default_factory=AiConfigPayload)
    qualification_rules: QualificationRulesPayload = Field(default_factory=QualificationRulesPayload)
    required_certs: list[str] = Field(default_factory=list, max_length=20)
    agreement_config: AgreementConfigPayload = Field(default_factory=AgreementConfigPayload)
    claim_config: ClaimConfigPayload = Field(default_factory=ClaimConfigPayload)
    template_id: str = Field(default="", max_length=64)
    dataset_id: str = Field(default="", max_length=64)
    column_mapping: dict[str, str | None] = Field(default_factory=dict)
    mapping_config: dict[str, DataBindingPayload] = Field(default_factory=dict)
    component_bindings: dict[str, dict[str, DataBindingPayload]] = Field(default_factory=dict)
    assignment: AssignmentPayload = Field(default_factory=AssignmentPayload)


class UpdateTaskRequest(BaseModel):
    title: str | None = Field(default=None, min_length=0, max_length=100)
    description: str | None = Field(default=None, min_length=0, max_length=2000)
    rich_content: str | None = Field(default=None, max_length=10000)
    tags: list[str] | None = None
    auto_saved: bool | None = None
    category: str | None = Field(default=None, pattern="^(text|image|audio|video|multimodal)$")
    difficulty: str | None = Field(default=None, pattern="^(easy|medium|hard)$")
    deadline: str | None = Field(default=None, max_length=40)
    distribution: str | None = Field(default=None, pattern="^(first_come_all|quota_grab|assigned_link)$")
    quota: int | None = Field(default=None, ge=1, le=100000)
    reward_rule: RewardRulePayload | None = None
    reviewer_ids: list[str] | None = Field(default=None, max_length=50)
    review_config: ReviewConfigPayload | None = None
    ai_config: AiConfigPayload | None = None
    qualification_rules: QualificationRulesPayload | None = None
    required_certs: list[str] | None = Field(default=None, max_length=20)
    agreement_config: AgreementConfigPayload | None = None
    claim_config: ClaimConfigPayload | None = None
    template_id: str | None = Field(default=None, min_length=1, max_length=64)
    dataset_id: str | None = Field(default=None, min_length=1, max_length=64)
    column_mapping: dict[str, str | None] | None = None
    mapping_config: dict[str, DataBindingPayload] | None = None
    component_bindings: dict[str, dict[str, DataBindingPayload]] | None = None
    assignment: AssignmentPayload | None = None


class UpdateTaskStatusRequest(BaseModel):
    action: str = Field(pattern="^(approve|pause|resume|finish)$")


class TransferTaskOwnerRequest(BaseModel):
    target_owner_id: str = Field(min_length=1, max_length=64)
    reason: str | None = Field(default=None, max_length=400)


class UpdateInternalLabelersRequest(BaseModel):
    target_labeler_ids: list[str] = Field(default_factory=list, max_length=200)
    target_labeler_allocations: list[LabelerAllocationPayload] = Field(default_factory=list, max_length=200)


class RequestTaskAssistanceRequest(BaseModel):
    target_reviewer_id: str = Field(min_length=1, max_length=64)
    submission_ids: list[str] = Field(default_factory=list, max_length=1000)
    reason: str | None = Field(default=None, max_length=400)


class CopyTaskRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=100)


class TaskQuestionBatchCreateRequest(BaseModel):
    items: list[dict[str, Any]] = Field(min_length=1, max_length=1000)


class TaskQuestionUpdateRequest(BaseModel):
    content: dict[str, Any] | None = None
    status: str | None = Field(default=None, pattern="^(pending|claimed|submitted|approved|rejected)$")
    assigned_to: str | None = Field(default=None, max_length=64)


class TaskQuestionBatchDeleteRequest(BaseModel):
    question_ids: list[str] = Field(min_length=1, max_length=1000)
