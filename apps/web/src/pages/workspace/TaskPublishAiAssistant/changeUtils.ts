import type { AiTaskPublishChange } from '../../../types/api';

export function applyTaskPublishAiChanges<TForm extends Record<string, unknown>>(
  form: TForm,
  mapping: Record<string, string | null>,
  changes: AiTaskPublishChange[],
) {
  return changes.filter((change) => change.selected).reduce((current, change) => applySingleChange(current, change), {
    form: { ...form },
    mapping: { ...mapping },
  });
}

function applySingleChange<TForm extends Record<string, unknown>>(
  current: { form: TForm; mapping: Record<string, string | null> },
  change: AiTaskPublishChange,
) {
  const after = isRecord(change.after) ? change.after : {};
  if (!Object.keys(after).length) return current;
  if (change.type === 'update_field_mapping' && isRecord(after.mapping)) {
    return { ...current, mapping: { ...current.mapping, ...normalizeMapping(after.mapping) } };
  }
  const nextForm = { ...current.form };
  assignKnownFields(nextForm, after);
  if (isRecord(after.mapping)) {
    return { form: nextForm, mapping: { ...current.mapping, ...normalizeMapping(after.mapping) } };
  }
  return { ...current, form: nextForm };
}

function assignKnownFields<TForm extends Record<string, unknown>>(form: TForm, after: Record<string, unknown>) {
  const assignment = isRecord(after.assignment) ? after.assignment : {};
  const qualificationRules = isRecord(after.qualification_rules) ? after.qualification_rules : {};
  const rewardRule = isRecord(after.reward_rule) ? after.reward_rule : {};
  const reviewConfig = isRecord(after.review_config) ? after.review_config : {};
  const aiConfig = isRecord(after.ai_config) ? after.ai_config : {};
  const agreementConfig = isRecord(after.agreement_config) ? after.agreement_config : {};
  const claimConfig = isRecord(after.claim_config) ? after.claim_config : {};
  setString(form, 'title', after.title);
  setString(form, 'description', after.description);
  setString(form, 'difficulty', after.difficulty);
  setString(form, 'deadline', after.deadline);
  setString(form, 'completion_hours', after.completion_hours ?? claimConfig.completion_hours);
  setString(form, 'template_id', after.template_id);
  setString(form, 'dataset_id', after.dataset_id);
  setString(form, 'distribution', after.distribution);
  setString(form, 'expire_hours', after.expire_hours ?? assignment.expire_hours);
  setString(form, 'reward_mode', after.reward_mode ?? rewardRule.mode);
  setString(form, 'points_per_item', after.points_per_item ?? rewardRule.points_per_item);
  setString(form, 'total_points', after.total_points ?? rewardRule.total_points);
  setString(form, 'required_certs', after.required_certs ?? qualificationRules.required_certs);
  setString(form, 'min_completed_tasks', after.min_completed_tasks ?? qualificationRules.min_completed_tasks);
  setString(form, 'min_accuracy_rate', after.min_accuracy_rate ?? qualificationRules.min_accuracy_rate);
  setString(form, 'qualification_notes', after.qualification_notes ?? qualificationRules.notes);
  setString(form, 'ai_provider_id', after.ai_provider_id ?? aiConfig.provider_id);
  setString(form, 'ai_input_prompt', after.ai_input_prompt ?? aiConfig.input_prompt);
  setString(form, 'ai_pass_threshold', after.ai_pass_threshold ?? readThreshold(aiConfig, 'pass'));
  setString(form, 'ai_reject_threshold', after.ai_reject_threshold ?? readThreshold(aiConfig, 'reject'));
  setString(form, 'ai_threshold', after.ai_pass_threshold ?? after.ai_threshold ?? readThreshold(aiConfig, 'pass'));
  setString(form, 'agreement_text', after.agreement_text ?? agreementConfig.text);
  setString(form, 'agreement_file_name', after.agreement_file_name ?? agreementConfig.file_name);
  setBoolean(form, 'deadline_long_term', after.deadline_long_term ?? (claimConfig.deadline_mode === 'long_term' ? true : undefined));
  setBoolean(form, 'share_enabled', after.share_enabled ?? assignment.enabled);
  setBoolean(form, 'ai_enabled', after.ai_enabled ?? aiConfig.enabled);
  setBoolean(form, 'ai_input_confirmed', after.ai_input_confirmed ?? aiConfig.input_confirmed);
  setBoolean(form, 'ai_matrix_confirmed', after.ai_matrix_confirmed ?? aiConfig.matrix_confirmed);
  setBoolean(form, 'agreement_required', after.agreement_required ?? agreementConfig.required);
  setBoolean(form, 'agreement_use_default', after.agreement_use_default ?? agreementConfig.use_default_template);
  const categoryValues = Array.isArray(after.category_values) ? after.category_values : Array.isArray(after.category_tags) ? after.category_tags : [];
  if (categoryValues.length) {
    setValue(form, 'category_values', categoryValues.map(String));
    setValue(form, 'category', deriveTaskCategory(categoryValues.map(String)));
  }
  if (Array.isArray(after.tag_items) || Array.isArray(after.tags)) {
    const tags = Array.from(new Set((Array.isArray(after.tag_items) ? after.tag_items : after.tags as unknown[]).map(String).filter(Boolean)));
    setValue(form, 'tag_items', tags);
    setValue(form, 'tags', tags.join(', '));
  }
  if (Array.isArray(after.ai_selected_dimensions) || Array.isArray(aiConfig.selected_dimensions)) setValue(form, 'ai_selected_dimensions', (Array.isArray(after.ai_selected_dimensions) ? after.ai_selected_dimensions : aiConfig.selected_dimensions as unknown[]).map(String));
  if (Array.isArray(after.ai_custom_dimensions) || Array.isArray(aiConfig.custom_dimensions)) setValue(form, 'ai_custom_dimensions', (Array.isArray(after.ai_custom_dimensions) ? after.ai_custom_dimensions : aiConfig.custom_dimensions as unknown[]).map(String));
  if (Array.isArray(after.ai_review_matrix) || Array.isArray(aiConfig.review_matrix)) setValue(form, 'ai_review_matrix', Array.isArray(after.ai_review_matrix) ? after.ai_review_matrix : aiConfig.review_matrix);
  if (Array.isArray(after.reviewer_ids)) setValue(form, 'reviewer_ids', after.reviewer_ids.map(String));
  if (Array.isArray(after.review_allocations) || Array.isArray(reviewConfig.reviewer_allocations)) setValue(form, 'review_allocations', Array.isArray(after.review_allocations) ? after.review_allocations : reviewConfig.reviewer_allocations);
  if (Array.isArray(after.internal_labeler_ids) || Array.isArray(assignment.target_labeler_ids)) setValue(form, 'internal_labeler_ids', (Array.isArray(after.internal_labeler_ids) ? after.internal_labeler_ids : assignment.target_labeler_ids as unknown[]).map(String));
  if (Array.isArray(after.internal_labeler_allocations) || Array.isArray(assignment.target_labeler_allocations)) setValue(form, 'internal_labeler_allocations', Array.isArray(after.internal_labeler_allocations) ? after.internal_labeler_allocations : assignment.target_labeler_allocations);
}

function setString<TForm extends Record<string, unknown>>(form: TForm, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  form[key as keyof TForm] = String(value) as TForm[keyof TForm];
}

function setBoolean<TForm extends Record<string, unknown>>(form: TForm, key: string, value: unknown) {
  if (typeof value !== 'boolean') return;
  setValue(form, key, value);
}

function setValue<TForm extends Record<string, unknown>>(form: TForm, key: string, value: unknown) {
  form[key as keyof TForm] = value as TForm[keyof TForm];
}

function normalizeMapping(raw: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value === null || value === undefined ? null : String(value)]));
}

function deriveTaskCategory(values: string[]) {
  if (values.length > 1) return 'multimodal';
  return values[0] || '';
}

function readThreshold(aiConfig: Record<string, unknown>, key: string) {
  const thresholds = isRecord(aiConfig.thresholds) ? aiConfig.thresholds : {};
  return thresholds[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
