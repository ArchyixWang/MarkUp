import { describe, expect, it } from 'vitest';
import type { AiTaskPublishChange } from '../../../types/api';
import { applyTaskPublishAiChanges } from './changeUtils';

describe('TaskPublishAiAssistant change utils', () => {
  it('maps API-shaped assistant changes into publish wizard form fields', () => {
    const form = {
      title: '',
      description: '',
      category: '',
      category_values: [],
      tags: '',
      tag_items: [],
      distribution: 'first_come_all',
      share_enabled: false,
      expire_hours: '',
      reward_mode: 'item',
      points_per_item: '',
      total_points: '',
      internal_labeler_ids: [],
      internal_labeler_allocations: [],
      ai_enabled: false,
      ai_provider_id: '',
      ai_selected_dimensions: [],
      ai_custom_dimensions: [],
      ai_input_prompt: '',
      ai_input_confirmed: false,
      ai_review_matrix: [],
      ai_matrix_confirmed: false,
      ai_pass_threshold: '',
      ai_reject_threshold: '',
      ai_threshold: '',
      agreement_required: false,
      agreement_use_default: false,
      agreement_text: '',
      agreement_file_name: '',
    };
    const changes: AiTaskPublishChange[] = [{
      id: 'api-shaped-change',
      type: 'update_ai_review',
      step: 'ai_review',
      title: '应用 API 风格配置',
      after: {
        category_tags: ['image', 'text'],
        distribution: 'quota_grab',
        assignment: {
          enabled: true,
          expire_hours: 48,
          target_labeler_ids: ['labeler-1', 'labeler-2'],
          target_labeler_allocations: [{ labeler_id: 'labeler-1', quota: 60 }, { labeler_id: 'labeler-2', quota: 40 }],
        },
        reward_rule: { mode: 'item', points_per_item: 0 },
        ai_config: {
          enabled: true,
          provider_id: 'provider-1',
          selected_dimensions: ['准确性'],
          input_prompt: '根据模板答案字段审核提交质量。',
          review_matrix: [{ key: 'accuracy', dimension: '准确性' }],
          input_confirmed: true,
          matrix_confirmed: false,
          thresholds: { pass: 85, reject: 45 },
        },
      },
      selected: true,
    }];

    const next = applyTaskPublishAiChanges(form, {}, changes);
    expect(next.form.category_values).toEqual(['image', 'text']);
    expect(next.form.category).toBe('multimodal');
    expect(next.form.distribution).toBe('quota_grab');
    expect(next.form.share_enabled).toBe(true);
    expect(next.form.expire_hours).toBe('48');
    expect(next.form.internal_labeler_ids).toEqual(['labeler-1', 'labeler-2']);
    expect(next.form.internal_labeler_allocations).toEqual([{ labeler_id: 'labeler-1', quota: 60 }, { labeler_id: 'labeler-2', quota: 40 }]);
    expect(next.form.points_per_item).toBe('0');
    expect(next.form.ai_enabled).toBe(true);
    expect(next.form.ai_provider_id).toBe('provider-1');
    expect(next.form.ai_selected_dimensions).toEqual(['准确性']);
    expect(next.form.ai_pass_threshold).toBe('85');
    expect(next.form.ai_reject_threshold).toBe('45');
  });
});
