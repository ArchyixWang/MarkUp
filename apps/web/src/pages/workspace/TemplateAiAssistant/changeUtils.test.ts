import { describe, expect, it } from 'vitest';
import type { AiTemplateChange, TemplateSchemaPayload } from '../../../types/api';
import { applyTemplateAiChanges } from './changeUtils';

const baseSchema: TemplateSchemaPayload = {
  schema_version: '1.1',
  tabs: [{ id: 'tab_label', title: '标注答案', components: [] }],
  components: [],
  validation_rules: {},
  linkage_rules: [],
  llm_config: {},
};

describe('TemplateAiAssistant change utils', () => {
  it('applies Scale and Ranking material changes returned by the schema-aligned assistant', () => {
    const changes: AiTemplateChange[] = [
      {
        id: 'scale-change',
        type: 'create_field',
        title: '新增量表',
        position: { type: 'append', tabId: 'tab_label' },
        after: {
          id: 'quality_score_ai',
          type: 'Scale',
          field: 'quality_score',
          label: '质量评分',
          required: true,
          config: { min: 1, max: 5 },
          options: [],
          version: '1.0',
        },
        selected: true,
      },
      {
        id: 'ranking-change',
        type: 'create_field',
        title: '新增排序',
        position: { type: 'append', tabId: 'tab_label' },
        after: {
          id: 'preference_rank_ai',
          type: 'Ranking',
          field: 'preference_rank',
          label: '偏好排序',
          required: true,
          config: {},
          options: [
            { label: '候选 A', value: 'candidate_a' },
            { label: '候选 B', value: 'candidate_b' },
          ],
          version: '1.0',
        },
        selected: true,
      },
    ];

    const nextSchema = applyTemplateAiChanges(baseSchema, changes);
    expect(nextSchema.tabs[0].components.map((component) => component.type)).toEqual(['Scale', 'Ranking']);
    expect(nextSchema.tabs[0].components.map((component) => component.field)).toEqual(['quality_score', 'preference_rank']);
  });
});
