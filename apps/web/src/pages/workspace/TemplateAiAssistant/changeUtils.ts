import type { AiTemplateChange, TemplateComponentSchema, TemplateSchemaPayload, TemplateTabSchema } from '../../../types/api';

const supportedTypes = new Set([
  'ShowItem',
  'TextInput',
  'TextArea',
  'SingleSelect',
  'MultiSelect',
  'TagSelect',
  'Scale',
  'Ranking',
  'RichEditor',
  'FileUpload',
  'ImageUpload',
  'ImageMaskAnnotation',
  'AudioUpload',
  'VideoUpload',
  'JsonEditor',
  'LLMComponent',
  'GroupContainer',
]);

const nonAnswerTypes = new Set(['ShowItem', 'LLMComponent', 'GroupContainer']);

export function applyTemplateAiChanges(schema: TemplateSchemaPayload, changes: AiTemplateChange[]): TemplateSchemaPayload {
  return changes.filter((change) => change.selected).reduce((current, change) => applySingleChange(current, change), schema);
}

function applySingleChange(schema: TemplateSchemaPayload, change: AiTemplateChange): TemplateSchemaPayload {
  if (change.type === 'create_field') {
    const component = normalizeComponent(change.after, schema);
    if (!component) return schema;
    return insertComponent(schema, component, change.position);
  }
  if (change.type === 'delete_field') {
    const targetId = change.targetFieldId || findComponentIdByField(schema, change.targetFieldName || '');
    if (!targetId) return schema;
    return removeComponent(schema, targetId);
  }
  if (change.type === 'update_field' || change.type === 'update_options' || change.type === 'update_validation') {
    const targetId = change.targetFieldId || findComponentIdByField(schema, change.targetFieldName || '');
    if (!targetId || !isPlainRecord(change.after)) return schema;
    return updateComponent(schema, targetId, change.after);
  }
  if (change.type === 'reorder_field') {
    const targetId = change.targetFieldId || findComponentIdByField(schema, change.targetFieldName || '');
    if (!targetId) return schema;
    return moveComponent(schema, targetId, change.position);
  }
  if (change.type === 'create_quality_rule') {
    const existing = Array.isArray(schema.llm_config?.quality_rules) ? schema.llm_config.quality_rules : [];
    return {
      ...schema,
      llm_config: {
        ...schema.llm_config,
        quality_rules: [...existing, change.after ?? { title: change.title, description: change.description }],
      },
    };
  }
  return schema;
}

function insertComponent(schema: TemplateSchemaPayload, component: TemplateComponentSchema, position: AiTemplateChange['position']): TemplateSchemaPayload {
  const tabId = position?.tabId || schema.tabs[0]?.id;
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const components = [...tab.components];
      const targetIndex = position?.fieldId ? components.findIndex((item) => item.id === position.fieldId) : -1;
      if (position?.type === 'prepend') {
        return { ...tab, components: [component, ...components] };
      }
      if ((position?.type === 'before' || position?.type === 'after') && targetIndex >= 0) {
        const insertIndex = position.type === 'before' ? targetIndex : targetIndex + 1;
        return { ...tab, components: [...components.slice(0, insertIndex), component, ...components.slice(insertIndex)] };
      }
      return { ...tab, components: [...components, component] };
    }),
  };
}

function removeComponent(schema: TemplateSchemaPayload, targetId: string): TemplateSchemaPayload {
  const removed = allComponents(schema).find((component) => component.id === targetId);
  const removedKeys = new Set([targetId, removed?.field].filter(Boolean));
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => ({ ...tab, components: tab.components.filter((component) => component.id !== targetId) })),
    components: schema.components.filter((component) => component.id !== targetId),
    linkage_rules: schema.linkage_rules.filter((rule) => {
      const values = [
        rule.source_field,
        rule.source_component_id,
        rule.field,
        rule.when_field,
        rule.target_component_id,
        rule.target_component,
        rule.target_id,
        rule.target_field,
        rule.target,
        rule.then_field,
      ].filter(Boolean).map(String);
      return !values.some((value) => removedKeys.has(value));
    }),
  };
}

function updateComponent(schema: TemplateSchemaPayload, targetId: string, patch: Record<string, unknown>): TemplateSchemaPayload {
  const patchComponent = (component: TemplateComponentSchema): TemplateComponentSchema => {
    if (component.id !== targetId) return component;
    const nextType = supportedTypes.has(String(patch.type)) ? String(patch.type) as TemplateComponentSchema['type'] : component.type;
    const next = {
      ...component,
      ...patch,
      id: component.id,
      type: nextType,
      config: isPlainRecord(patch.config) ? patch.config : component.config,
      options: Array.isArray(patch.options) ? patch.options as Array<{ value: string; label: string }> : component.options,
      required: typeof patch.required === 'boolean' ? patch.required : component.required,
    };
    return normalizeExistingComponent(next);
  };
  return {
    ...schema,
    tabs: schema.tabs.map((tab) => ({ ...tab, components: tab.components.map(patchComponent) })),
    components: schema.components.map(patchComponent),
  };
}

function moveComponent(schema: TemplateSchemaPayload, targetId: string, position: AiTemplateChange['position']): TemplateSchemaPayload {
  const moving = allComponents(schema).find((component) => component.id === targetId);
  if (!moving) return schema;
  const without = removeComponent(schema, targetId);
  return insertComponent(without, moving, position);
}

function normalizeComponent(raw: unknown, schema: TemplateSchemaPayload): TemplateComponentSchema | null {
  if (!isPlainRecord(raw) || !supportedTypes.has(String(raw.type))) return null;
  const fields = new Set(allComponents(schema).map((component) => component.field));
  let field = sanitizeField(String(raw.field || 'ai_generated_field'));
  const base = field;
  let index = 2;
  while (fields.has(field)) {
    field = `${base}_${index}`;
    index += 1;
  }
  return normalizeExistingComponent({
    id: String(raw.id || `${field}_ai`).slice(0, 80),
    type: String(raw.type) as TemplateComponentSchema['type'],
    field,
    label: String(raw.label || field).slice(0, 120),
    required: typeof raw.required === 'boolean' ? raw.required : !nonAnswerTypes.has(String(raw.type)),
    config: isPlainRecord(raw.config) ? raw.config : {},
    options: Array.isArray(raw.options) ? raw.options as Array<{ value: string; label: string }> : [],
    version: String(raw.version || '1.0'),
  });
}

function normalizeExistingComponent(component: TemplateComponentSchema): TemplateComponentSchema {
  return {
    ...component,
    field: sanitizeField(component.field),
    label: component.label || component.field,
    config: isPlainRecord(component.config) ? component.config : {},
    options: Array.isArray(component.options)
      ? component.options.map((option, index) => ({
        value: String(option.value || `option_${index + 1}`),
        label: String(option.label || option.value || `选项 ${index + 1}`),
      }))
      : [],
    version: component.version || '1.0',
  };
}

function findComponentIdByField(schema: TemplateSchemaPayload, field: string): string {
  return allComponents(schema).find((component) => component.field === field || component.label === field)?.id ?? '';
}

function allComponents(schema: TemplateSchemaPayload): TemplateComponentSchema[] {
  return [...schema.tabs.flatMap((tab: TemplateTabSchema) => tab.components), ...schema.components];
}

function sanitizeField(value: string): string {
  const field = value.trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z_])/, 'field_$1');
  return field || 'ai_generated_field';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
