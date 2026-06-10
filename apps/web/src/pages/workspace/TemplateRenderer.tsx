import { type CSSProperties, type PointerEvent as ReactPointerEvent, type SyntheticEvent, useEffect, useRef, useState } from 'react';
import { AppstoreOutlined, ArrowDownOutlined, ArrowUpOutlined, AudioOutlined, ClearOutlined, CompressOutlined, ExperimentOutlined, FileTextOutlined, HighlightOutlined, OrderedListOutlined, PictureOutlined, SlidersOutlined, UndoOutlined, UploadOutlined, VideoCameraOutlined, ZoomInOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Radio, Select, Slider, Space, Spin, Tabs, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import type { ComponentBindingsPayload, DataBindingPayload, TemplateComponentSchema, TemplateLinkageCondition, TemplateLinkageRule, TemplateSchemaPayload } from '../../types/api';
import { WorkspaceMediaPreview, resolveWorkspaceMediaPreviewValue, useAuthenticatedMediaObjectUrl, type WorkspaceMediaPreviewValue } from './WorkspaceMediaPreview';

interface TemplateRendererProps {
  schema: TemplateSchemaPayload;
  content: Record<string, unknown>;
  answers: Record<string, unknown>;
  onAnswerChange?: (field: string, value: unknown) => void;
  onAiAssistRequest?: (component: TemplateComponentSchema) => void;
  errors?: Array<{ field?: string | null; component_id?: string | null; message: string }>;
  readonly?: boolean;
  variant?: 'form' | 'survey';
  hideAiComponent?: boolean;
  aiAssistLoading?: boolean;
  aiAssistDisabled?: boolean;
  aiAssistDisabledReason?: string;
  componentBindings?: ComponentBindingsPayload;
}

export function TemplateRenderer({ schema, content, answers, onAnswerChange, onAiAssistRequest, errors = [], readonly = false, variant = 'form', hideAiComponent = false, aiAssistLoading = false, aiAssistDisabled = false, aiAssistDisabledReason, componentBindings }: TemplateRendererProps) {
  const [activeTabId, setActiveTabId] = useState(schema.tabs[0]?.id ?? '');
  const activeTab = schema.tabs.find((tab) => tab.id === activeTabId) ?? schema.tabs[0];
  const visibleComponentIds = visibleTemplateComponentIds(schema, answers, content);
  const rendererComponents = variant === 'survey'
    ? schema.tabs.flatMap((tab) => tab.components)
    : activeTab?.components ?? [];
  const activeComponents = rendererComponents.filter((component) => visibleComponentIds.has(component.id) && visibleComponentIds.has(component.field));
  let questionIndex = 0;
  const renderedComponents = activeComponents
    .filter((component) => !hideAiComponent || component.type !== 'LLMComponent')
    .map((component) => ({
      component,
      questionIndex: isAnswerComponent(component) ? questionIndex++ : -1,
    }));
  const visibleErrors = errors.filter((error) => {
    const field = error.field ? String(error.field) : '';
    const componentId = error.component_id ? String(error.component_id) : '';
    return (!field || visibleComponentIds.has(field)) && (!componentId || visibleComponentIds.has(componentId));
  });

  if (!activeTab && variant !== 'survey') {
    return <p className="inline-message">当前模板没有可渲染的页签。</p>;
  }

  return (
    <div className={['template-renderer ant-template-renderer', variant === 'survey' ? 'survey-template-renderer' : ''].filter(Boolean).join(' ')}>
      {variant !== 'survey' && schema.tabs.length > 1 && activeTab && (
        <Tabs
          className="renderer-tabs"
          activeKey={activeTab.id}
          onChange={setActiveTabId}
          items={schema.tabs.map((tab) => ({ key: tab.id, label: tab.title }))}
        />
      )}
      <Form layout="vertical" className="renderer-fields renderer-form" requiredMark={false} component="div">
        {renderedComponents.length ? renderedComponents.map(({ component, questionIndex }) => (
          <RendererField
            key={component.id}
            component={component}
            index={questionIndex}
            variant={variant}
            content={content}
            answers={answers}
            errors={visibleErrors}
            readonly={readonly}
            onAnswerChange={onAnswerChange}
            onAiAssistRequest={onAiAssistRequest}
            aiAssistLoading={aiAssistLoading}
            aiAssistDisabled={aiAssistDisabled}
            aiAssistDisabledReason={aiAssistDisabledReason}
            componentBindings={componentBindings}
          />
        )) : (
          <div className="survey-empty-template">
            <strong>当前模板没有可填写组件</strong>
            <p>请确认发布任务时已经在模板中添加题目组件，或检查数据列映射是否完整。</p>
          </div>
        )}
      </Form>
    </div>
  );
}

function RendererField({
  component,
  index,
  variant,
  content,
  answers,
  errors,
  readonly,
  onAnswerChange,
  onAiAssistRequest,
  aiAssistLoading,
  aiAssistDisabled,
  aiAssistDisabledReason,
  componentBindings,
}: {
  component: TemplateComponentSchema;
  index: number;
  variant: 'form' | 'survey';
  content: Record<string, unknown>;
  answers: Record<string, unknown>;
  errors: Array<{ field?: string | null; component_id?: string | null; message: string }>;
  readonly: boolean;
  onAnswerChange?: (field: string, value: unknown) => void;
  onAiAssistRequest?: (component: TemplateComponentSchema) => void;
  aiAssistLoading: boolean;
  aiAssistDisabled: boolean;
  aiAssistDisabledReason?: string;
  componentBindings?: ComponentBindingsPayload;
}) {
  const value = answers[component.field] ?? '';
  const update = (next: unknown) => onAnswerChange?.(component.field, next);
  const fieldErrors = errors.filter((error) => error.field === component.field || error.component_id === component.id);
  const fieldLabel = `${component.label}${component.required ? ' *' : ''}`;
  const controlId = rendererControlId(component);
  const formStatus = fieldErrors.length ? 'error' : undefined;
  const surveyLabel = variant === 'survey' && isAnswerComponent(component) ? <SurveyQuestionTitle index={index} label={component.label} required={component.required} /> : fieldLabel;
  const description = String(component.config.description ?? '').trim();
  const descriptionBlock = description ? <Typography.Paragraph className="renderer-field-description">{description}</Typography.Paragraph> : null;
  const errorBlock = fieldErrors.length > 0 ? (
    <ul className="renderer-field-errors">
      {fieldErrors.map((error, index) => <li key={`${component.id}-${index}`}>{error.message}</li>)}
    </ul>
  ) : null;
  const [previewNoticeOpen, setPreviewNoticeOpen] = useState(false);

  if (component.type === 'ShowItem') {
    const displayItems = resolveShowItemValues(component, content);
    const displayValue = displayItems.length <= 1 ? displayItems[0]?.value : displayItems;
    return variant === 'survey' ? (
      <section className="renderer-field show-item survey-show-item">
        <div className="survey-show-title">{component.label}</div>
        {descriptionBlock}
        <div className="renderer-show-content">{displayItems.length > 1 ? renderShowItems(displayItems, component) : renderShowValue(displayValue)}</div>
      </section>
    ) : (
      <Card
        size="small"
        className="renderer-field show-item renderer-show-card"
        title={<Space size={8}><FileTextOutlined /><span>{component.label}</span></Space>}
      >
        {descriptionBlock}
        <div className="renderer-show-content">{displayItems.length > 1 ? renderShowItems(displayItems, component) : renderShowValue(displayValue)}</div>
      </Card>
    );
  }

  if (component.type === 'GroupContainer') {
    const description = String(component.config.description ?? '');
    const style = String(component.config.style ?? 'section');
    return (
      <section className={['renderer-field', 'renderer-group-container', `is-${style}`].join(' ')}>
        <div className="renderer-group-heading">
          <AppstoreOutlined />
          <strong>{component.label}</strong>
        </div>
        {description ? <Typography.Paragraph>{description}</Typography.Paragraph> : null}
      </section>
    );
  }

  if (component.type === 'LLMComponent') {
    const previewOnly = !onAiAssistRequest;
    const assistHint = String(component.config.prompt_hint || '结合当前材料给出建议答案和风险提示。');
    const assistButtonText = String(component.config.button_text || 'Run AI Assist');
    return (
      <>
        <section className="renderer-field renderer-llm-assist-shell">
          <div className="renderer-llm-assist-head">
            <div className="renderer-llm-assist-badge" aria-hidden="true">
              <ExperimentOutlined />
            </div>
            <div className="renderer-llm-assist-body">
              <span className="renderer-llm-assist-kicker">AI Assist</span>
              <h4 className="renderer-llm-assist-title">{component.label}</h4>
              <Typography.Paragraph className="renderer-llm-assist-description">
                {assistHint}
              </Typography.Paragraph>
              <div className="renderer-llm-assist-meta">
                <span className="renderer-llm-assist-chip">Prompt Context</span>
                <span className="renderer-llm-assist-chip">Current Answers</span>
                <span className="renderer-llm-assist-chip">Draft Suggestion</span>
              </div>
            </div>
            <div className="renderer-llm-assist-action">
              <span>{String(component.config.prompt_hint || 'AI 会结合当前题目内容、ShowItem 和已填写答案生成辅助建议。')}</span>
              <Button
                type="primary"
                icon={<HighlightOutlined />}
                loading={aiAssistLoading}
                disabled={aiAssistDisabled}
                title={aiAssistDisabled ? aiAssistDisabledReason : undefined}
                onClick={() => {
                  if (previewOnly) {
                    setPreviewNoticeOpen(true);
                    return;
                  }
                  onAiAssistRequest(component);
                }}
              >
                {String(component.config.button_text || '使用 AI 辅助')}
              </Button>
            </div>
          </div>
        </section>
        <Modal
          title="AI 辅助将在正式标注页运行"
          open={previewNoticeOpen}
          onCancel={() => setPreviewNoticeOpen(false)}
          onOk={() => setPreviewNoticeOpen(false)}
          okText="知道了"
          cancelButtonProps={{ style: { display: 'none' } }}
        >
          <p>当前是模板预览或只读 Renderer，按钮只展示入口位置和文案；Labeler 打开正式标注题目后会调用 AI 生成建议。</p>
        </Modal>
      </>
    );
  }

  if (component.type === 'TextArea' || component.type === 'RichEditor') {
    return (
      <Form.Item className="renderer-field survey-question-item" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <Input.TextArea
          id={controlId}
          aria-label={component.label}
          status={formStatus}
          value={String(value)}
          readOnly={readonly}
          autoSize={{ minRows: component.type === 'RichEditor' ? 5 : 3, maxRows: 10 }}
          placeholder={String(component.config.placeholder || `请输入${component.label}`)}
          onChange={(event) => update(event.target.value)}
        />
      </Form.Item>
    );
  }

  if (component.type === 'TextInput') {
    return (
      <Form.Item className="renderer-field survey-question-item" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <Input
          id={controlId}
          aria-label={component.label}
          status={formStatus}
          value={String(value)}
          readOnly={readonly}
          placeholder={String(component.config.placeholder || `请输入${component.label}`)}
          onChange={(event) => update(event.target.value)}
        />
      </Form.Item>
    );
  }

  if (component.type === 'JsonEditor') {
    return (
      <Form.Item className="renderer-field survey-question-item" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <Input.TextArea
          id={controlId}
          aria-label={component.label}
          status={formStatus}
          value={typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2)}
          readOnly={readonly}
          autoSize={{ minRows: 6, maxRows: 14 }}
          placeholder="请输入 JSON"
          onChange={(event) => update(event.target.value)}
        />
      </Form.Item>
    );
  }

  if (component.type === 'Scale') {
    const min = readFiniteNumber(component.config.min, 1);
    const max = readFiniteNumber(component.config.max, 5);
    const step = readFiniteNumber(component.config.step, 1);
    const current = typeof value === 'number' ? value : Number(value || min);
    return (
      <Form.Item className="renderer-field survey-question-item renderer-scale-field" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <div className="renderer-scale-labels">
          <span>{String(component.config.min_label || min)}</span>
          <strong>{Number.isFinite(current) ? current : min}</strong>
          <span>{String(component.config.max_label || max)}</span>
        </div>
        <Slider
          id={controlId}
          min={min}
          max={max}
          step={step}
          marks={scaleMarks(min, max)}
          value={Number.isFinite(current) ? current : min}
          disabled={readonly}
          onChange={(next) => update(next)}
        />
      </Form.Item>
    );
  }

  if (component.type === 'Ranking') {
    const defaultOrder = component.options.map((option) => option.value);
    const currentOrder = normalizeRankingAnswer(value, defaultOrder);
    const move = (optionValue: string, offset: -1 | 1) => {
      const index = currentOrder.indexOf(optionValue);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) return;
      const next = [...currentOrder];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      update(next);
    };
    return (
      <Form.Item className="renderer-field survey-question-item renderer-ranking-field" label={surveyLabel} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <div className="renderer-ranking-list" role="list" aria-label={component.label}>
          {currentOrder.map((optionValue, index) => {
            const option = component.options.find((item) => item.value === optionValue) ?? { value: optionValue, label: optionValue };
            return (
              <div className="renderer-ranking-item" role="listitem" key={option.value}>
                <span>{index + 1}</span>
                <strong>{option.label}</strong>
                <Space size={4}>
                  <Button aria-label={`上移 ${option.label}`} icon={<ArrowUpOutlined />} size="small" type="text" disabled={readonly || index === 0} onClick={() => move(option.value, -1)} />
                  <Button aria-label={`下移 ${option.label}`} icon={<ArrowDownOutlined />} size="small" type="text" disabled={readonly || index === currentOrder.length - 1} onClick={() => move(option.value, 1)} />
                </Space>
              </div>
            );
          })}
        </div>
      </Form.Item>
    );
  }

  if (component.type === 'SingleSelect') {
    if (variant === 'survey' && isScoreQuestion(component)) {
      return (
        <Form.Item className="renderer-field survey-question-item survey-score-question" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
          <div className="survey-scale-copy">
            <span>非常不满意</span>
            <span>非常满意</span>
          </div>
          <Radio.Group
            id={controlId}
            aria-label={component.label}
            className="survey-score-grid"
            value={String(value) || undefined}
            disabled={readonly}
            onChange={(event) => update(event.target.value)}
          >
            {component.options.map((option) => (
              <Radio.Button key={option.value} value={option.value} className="survey-score-button">
                {option.label}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
      );
    }
    if (variant === 'survey') {
      return (
        <Form.Item className="renderer-field survey-question-item survey-choice-question" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
          <Radio.Group
            id={controlId}
            aria-label={component.label}
            className="survey-choice-list"
            value={String(value) || undefined}
            disabled={readonly}
            onChange={(event) => update(event.target.value)}
          >
            {component.options.map((option) => (
              <Radio key={option.value} value={option.value} className="survey-choice-card">
                {option.label}
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>
      );
    }
    return (
      <Form.Item className="renderer-field" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <Select
          id={controlId}
          aria-label={component.label}
          value={String(value) || undefined}
          disabled={readonly}
          status={formStatus}
          placeholder="请选择"
          showSearch
          optionFilterProp="label"
          onChange={update}
          options={component.options.map((option) => ({ value: option.value, label: option.label }))}
        />
      </Form.Item>
    );
  }

  if (component.type === 'MultiSelect' || component.type === 'TagSelect') {
    const current = Array.isArray(value) ? value.map(String) : [];
    if (variant === 'survey' && isScoreQuestion(component)) {
      return (
        <Form.Item className="renderer-field survey-question-item survey-score-question" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
          <div className="survey-scale-copy">
            <span>非常不满意</span>
            <span>非常满意</span>
          </div>
          <Radio.Group
            id={controlId}
            aria-label={component.label}
            className="survey-score-grid"
            value={current[0]}
            disabled={readonly}
            onChange={(event) => update([event.target.value])}
          >
            {component.options.map((option) => (
              <Radio.Button key={option.value} value={option.value} className="survey-score-button">
                {option.label}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
      );
    }
    if (variant === 'survey') {
      if (component.type === 'MultiSelect') {
        return (
          <Form.Item className="renderer-field survey-question-item survey-choice-question" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
            <Checkbox.Group
              aria-label={component.label}
              className="survey-choice-list"
              value={current}
              disabled={readonly}
              onChange={(next) => update(next.map(String))}
            >
              {component.options.map((option) => (
                <Checkbox key={option.value} value={option.value} className="survey-choice-card">
                  {option.label}
                </Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>
        );
      }
      return (
        <Form.Item className="renderer-field survey-question-item survey-choice-question" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
          <Select
            id={controlId}
            aria-label={component.label}
            mode={component.type === 'TagSelect' && component.config.allow_create ? 'tags' : 'multiple'}
            value={current}
            disabled={readonly}
            status={formStatus}
            placeholder="请选择，可多选"
            optionFilterProp="label"
            onChange={(next) => update(next.map(String))}
            options={component.options.map((option) => ({ value: option.value, label: option.label }))}
          />
        </Form.Item>
      );
    }
    return (
      <Form.Item className="renderer-field renderer-option-field" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <Select
          id={controlId}
          aria-label={component.label}
          mode={component.type === 'TagSelect' && component.config.allow_create ? 'tags' : 'multiple'}
          value={current}
          disabled={readonly}
          status={formStatus}
          placeholder="请选择，可多选"
          optionFilterProp="label"
          onChange={(next) => update(next.map(String))}
          options={component.options.map((option) => ({ value: option.value, label: option.label }))}
        />
      </Form.Item>
    );
  }

  if (component.type === 'FileUpload' || component.type === 'ImageUpload' || component.type === 'AudioUpload' || component.type === 'VideoUpload') {
    const fileList = normalizeUploadFiles(value);
    const maxCount = readPositiveNumber(component.config.max_count ?? component.config.max_files);
    const accept = component.type === 'ImageUpload' ? 'image/*' : component.type === 'AudioUpload' ? 'audio/*' : component.type === 'VideoUpload' ? 'video/*' : undefined;
    const icon = component.type === 'ImageUpload' ? <PictureOutlined /> : component.type === 'AudioUpload' ? <AudioOutlined /> : component.type === 'VideoUpload' ? <VideoCameraOutlined /> : <UploadOutlined />;
    return (
      <Form.Item className="renderer-field renderer-upload-field survey-question-item" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <Upload
          disabled={readonly}
          accept={accept}
          multiple={!maxCount || maxCount > 1}
          maxCount={maxCount}
          fileList={fileList}
          beforeUpload={(file) => {
            const nextFile: UploadFile = {
              uid: file.uid,
              name: file.name,
              size: file.size,
              type: file.type,
              status: 'done',
            };
            const nextFiles = maxCount ? [...fileList, nextFile].slice(-maxCount) : [...fileList, nextFile];
            update(uploadAnswerValue(nextFiles));
            return Upload.LIST_IGNORE;
          }}
          onRemove={(file) => {
            update(uploadAnswerValue(fileList.filter((item) => item.uid !== file.uid)));
            return true;
          }}
        >
          <Button icon={icon} disabled={readonly}>
            选择文件
          </Button>
        </Upload>
        <Typography.Text type="secondary" className="renderer-upload-hint">
          已上传文件会记录名称、大小和类型。
        </Typography.Text>
      </Form.Item>
    );
  }

  if (component.type === 'ImageMaskAnnotation') {
    const imageSource = resolveImageMaskSource(component, content, componentBindings);
    return (
      <Form.Item className="renderer-field renderer-mask-field survey-question-item" label={surveyLabel} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
        <ImageMaskAnnotator
          component={component}
          imageSource={imageSource}
          value={value}
          readonly={readonly}
          onChange={update}
        />
      </Form.Item>
    );
  }

  return (
    <Form.Item className="renderer-field survey-question-item" label={surveyLabel} htmlFor={controlId} validateStatus={formStatus} help={errorBlock} extra={descriptionBlock}>
      <Input
        id={controlId}
        aria-label={component.label}
        status={formStatus}
        value={String(value)}
        readOnly={readonly}
        placeholder={String(component.config.placeholder || `请输入${component.label}`)}
        onChange={(event) => update(event.target.value)}
      />
    </Form.Item>
  );
}

type MaskPoint = { x: number; y: number };
type MaskAnnotation =
  | { id: string; type: 'rect'; x: number; y: number; width: number; height: number; label?: string }
  | { id: string; type: 'brush'; points: MaskPoint[]; strokeWidth: number; label?: string };
type ImageMaskSource = string | Record<string, unknown> | WorkspaceMediaPreviewValue | null;

interface ImageMaskAnswer {
  type: 'image_mask_annotation';
  image_source?: ImageMaskSource;
  annotations: MaskAnnotation[];
  updated_at?: string;
}

function ImageMaskAnnotator({
  component,
  imageSource,
  value,
  readonly,
  onChange,
}: {
  component: TemplateComponentSchema;
  imageSource: ImageMaskSource;
  value: unknown;
  readonly: boolean;
  onChange: (value: unknown) => void;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<'rect' | 'brush'>(String(component.config.mode || 'rect') === 'brush' ? 'brush' : 'rect');
  const [draft, setDraft] = useState<MaskAnnotation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageMetrics, setImageMetrics] = useState({ aspectRatio: '4 / 3', ratio: 4 / 3 });
  const viewportSize = useViewportSize();
  const answer = normalizeImageMaskAnswer(value, imageSource);
  const effectiveImageSource = imageSource || imageMaskCandidateFromValue(answer.image_source) || null;
  const imageUrl = imageMaskSourceUrl(effectiveImageSource);
  const imageMediaValue = resolveWorkspaceMediaPreviewValue(effectiveImageSource);
  const imagePlayback = useAuthenticatedMediaObjectUrl(imageUrl, imageMediaValue);
  const displayImageUrl = imagePlayback.playbackUrl;
  const strokeColor = String(component.config.stroke_color || '#1677ff');
  const brushSize = readPositiveNumber(component.config.brush_size) || 18;
  const maskOpacity = typeof component.config.mask_opacity === 'number' ? component.config.mask_opacity : 0.36;
  const commit = (annotations: MaskAnnotation[]) => {
    onChange({
      ...answer,
      image_source: effectiveImageSource,
      annotations,
      updated_at: new Date().toISOString(),
    });
  };
  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): MaskPoint => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height),
    };
  };
  const beginDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readonly || !displayImageUrl) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);
    if (mode === 'brush') {
      setDraft({ id: maskAnnotationId(), type: 'brush', points: [point], strokeWidth: brushSize / 1000 });
    } else {
      setDraft({ id: maskAnnotationId(), type: 'rect', x: point.x, y: point.y, width: 0, height: 0 });
    }
  };
  const moveDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    const point = pointFromEvent(event);
    if (draft.type === 'brush') {
      setDraft({ ...draft, points: [...draft.points, point] });
    } else {
      setDraft(rectAnnotationFromPoints(draft, point));
    }
  };
  const endDraw = () => {
    if (!draft) return;
    const valid = draft.type === 'brush'
      ? draft.points.length > 1
      : draft.width > 0.01 && draft.height > 0.01;
    if (valid) commit([...answer.annotations, draft]);
    setDraft(null);
  };
  const annotations = draft ? [...answer.annotations, draft] : answer.annotations;
  const boardHeightRatio = viewportSize.width > 0 && viewportSize.width <= 820 ? 0.52 : 0.58;
  const viewportHeight = viewportSize.height || 900;
  const maxBoardWidth = Math.max(180, Math.round(viewportHeight * boardHeightRatio * imageMetrics.ratio));
  const maxPreviewWidth = Math.max(180, Math.round(Math.max(260, viewportHeight - 210) * imageMetrics.ratio));
  const boardStyle = {
    '--image-mask-aspect-ratio': imageMetrics.aspectRatio,
    '--image-mask-ratio': String(imageMetrics.ratio),
    '--image-mask-max-board-width': `${maxBoardWidth}px`,
    '--image-mask-preview-max-width': `${maxPreviewWidth}px`,
  } as CSSProperties;
  const updateImageRatio = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setImageMetrics({ aspectRatio: `${naturalWidth} / ${naturalHeight}`, ratio: naturalWidth / naturalHeight });
    }
  };
  return (
    <div className="image-mask-annotator">
      <div className="image-mask-toolbar">
        <Space size={8} wrap>
          <Button size="small" icon={<CompressOutlined />} type={mode === 'rect' ? 'primary' : 'default'} disabled={readonly} onClick={() => setMode('rect')}>勾画</Button>
          <Button size="small" icon={<HighlightOutlined />} type={mode === 'brush' ? 'primary' : 'default'} disabled={readonly} onClick={() => setMode('brush')}>涂抹</Button>
          <Button size="small" icon={<UndoOutlined />} disabled={readonly || !answer.annotations.length} onClick={() => commit(answer.annotations.slice(0, -1))}>撤销</Button>
          <Button size="small" icon={<ClearOutlined />} danger disabled={readonly || !answer.annotations.length} onClick={() => commit([])}>清空</Button>
          <Button size="small" icon={<ZoomInOutlined />} disabled={!displayImageUrl} onClick={() => setPreviewOpen(true)}>放大查看</Button>
        </Space>
        <Typography.Text type="secondary">{answer.annotations.length} 个标注</Typography.Text>
      </div>
      {displayImageUrl ? (
        <div
          ref={boardRef}
          className={['image-mask-board', readonly ? 'is-readonly' : ''].filter(Boolean).join(' ')}
          style={boardStyle}
          onPointerDown={beginDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
        >
          <img src={displayImageUrl} alt={`${component.label} 标注底图`} draggable={false} onLoad={updateImageRatio} />
          <svg className="image-mask-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            {annotations.map((annotation) => renderMaskAnnotation(annotation, strokeColor, maskOpacity))}
          </svg>
        </div>
      ) : imageUrl && imagePlayback.isLoading ? (
        <div className="image-mask-loading">
          <Spin size="small" />
          <Typography.Text type="secondary">正在加载图片素材...</Typography.Text>
        </div>
      ) : (
        <Alert type="warning" showIcon title="未找到可标注图片" description="请在组件属性中选择图片列或行级图片媒体，或在任务发布映射中补齐图片来源。" />
      )}
      <Typography.Text type="secondary" className="image-mask-hint">
        {mode === 'rect' ? '按住鼠标或手指拖拽勾画矩形区域。' : '按住鼠标或手指拖拽涂抹 mask 区域。'}
      </Typography.Text>
      <Modal
        centered
        className="image-mask-preview-modal"
        footer={null}
        open={previewOpen}
        title={`${component.label} 放大查看`}
        width="min(1120px, calc(100vw - 48px))"
        onCancel={() => setPreviewOpen(false)}
      >
        {displayImageUrl ? (
          <div className="image-mask-preview-surface" style={boardStyle}>
            <img src={displayImageUrl} alt={`${component.label} 放大预览`} draggable={false} onLoad={updateImageRatio} />
            <svg className="image-mask-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              {annotations.map((annotation) => renderMaskAnnotation(annotation, strokeColor, maskOpacity))}
            </svg>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function useViewportSize() {
  const readSize = () => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  });
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setSize(readSize());
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

function renderMaskAnnotation(annotation: MaskAnnotation, color: string, opacity: number) {
  if (annotation.type === 'rect') {
    return (
      <rect
        key={annotation.id}
        x={annotation.x}
        y={annotation.y}
        width={annotation.width}
        height={annotation.height}
        fill={color}
        fillOpacity={opacity}
        stroke={color}
        strokeWidth={0.004}
      />
    );
  }
  return (
    <polyline
      key={annotation.id}
      points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
      fill="none"
      stroke={color}
      strokeOpacity={Math.min(0.95, opacity + 0.28)}
      strokeWidth={annotation.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function rectAnnotationFromPoints(start: Extract<MaskAnnotation, { type: 'rect' }>, point: MaskPoint): Extract<MaskAnnotation, { type: 'rect' }> {
  const x = Math.min(start.x, point.x);
  const y = Math.min(start.y, point.y);
  return {
    ...start,
    x,
    y,
    width: Math.abs(point.x - start.x),
    height: Math.abs(point.y - start.y),
  };
}

function normalizeImageMaskAnswer(value: unknown, imageSource: ImageMaskSource): ImageMaskAnswer {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    return {
      type: 'image_mask_annotation',
      image_source: (raw.image_source as ImageMaskAnswer['image_source']) ?? imageSource,
      annotations: Array.isArray(raw.annotations) ? raw.annotations.filter(isMaskAnnotation) : [],
      updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    };
  }
  return { type: 'image_mask_annotation', image_source: imageSource, annotations: [] };
}

function isMaskAnnotation(value: unknown): value is MaskAnnotation {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  if (raw.type === 'rect') return ['x', 'y', 'width', 'height'].every((key) => typeof raw[key] === 'number');
  if (raw.type === 'brush') return Array.isArray(raw.points);
  return false;
}

function resolveImageMaskSource(component: TemplateComponentSchema, content: Record<string, unknown>, componentBindings?: ComponentBindingsPayload): ImageMaskSource {
  const taskBinding = componentBindings?.[component.id]?.mask_image;
  if (taskBinding) {
    const value = resolveBindingValue(taskBinding, content);
    return imageMaskCandidateFromValue(value);
  }
  const binding = component.config.source_binding && typeof component.config.source_binding === 'object'
    ? component.config.source_binding as DataBindingPayload
    : null;
  if (binding) {
    const value = resolveBindingValue(binding, content);
    const media = imageMaskCandidateFromValue(value);
    if (media) return media;
  }
  const sourceField = String(component.config.source_field || component.config.image_field || '').trim();
  if (sourceField) {
    const media = imageMaskCandidateFromValue(content[sourceField]);
    if (media) return media;
  }
  const media = imageMaskCandidateFromValue(Array.isArray(content.media) ? content.media : []);
  if (media) return media;
  for (const [key, current] of Object.entries(content)) {
    if (key === 'media' || current == null) continue;
    const currentMedia = imageMaskCandidateFromValue(current);
    if (currentMedia) return currentMedia;
  }
  return null;
}

function imageMaskCandidateFromValue(value: unknown): ImageMaskSource {
  if (Array.isArray(value)) {
    for (const item of value) {
      const media = imageMaskCandidateFromValue(item);
      if (media) return media;
    }
    return null;
  }
  const media = resolveWorkspaceMediaPreviewValue(value);
  if (media && normalizeMediaKind(media.kind) === 'image') return media;
  return null;
}

function imageMaskSourceUrl(source: ImageMaskSource): string {
  if (!source) return '';
  if (typeof source === 'string') return source;
  const media = resolveWorkspaceMediaPreviewValue(source);
  const raw = source as Record<string, unknown>;
  return String(media?.url || raw['url'] || raw['src'] || raw['href'] || '');
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function maskAnnotationId(): string {
  return `mask_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function SurveyQuestionTitle({ index, label, required }: { index: number; label: string; required: boolean }) {
  return (
    <span className="survey-question-title">
      {required && <span className="survey-required">*</span>}
      <strong>{String(index + 1).padStart(2, '0')}</strong>
      <span>{label}</span>
    </span>
  );
}

function resolveShowItemValue(component: TemplateComponentSchema, content: Record<string, unknown>) {
  const values = resolveShowItemValues(component, content);
  if (values.length > 0) return values[0].value;
  return '';
}

type ShowDisplayItem = { key: string; label: string; value: unknown; binding?: DataBindingPayload | null };

function resolveShowItemValues(component: TemplateComponentSchema, content: Record<string, unknown>): ShowDisplayItem[] {
  const materialized = normalizeMaterializedShowDisplayItems(content[component.id] ?? content[component.field]);
  if (materialized.length > 0) return materialized;

  const rawFields = Array.isArray(component.config.display_fields) ? component.config.display_fields : [];
  const normalizedFields = rawFields
    .map((item, index): ShowDisplayItem | null => {
      if (typeof item === 'string') {
        const binding = bindingFromDisplayField(item);
        const value = binding ? resolveBindingValue(binding, content) : content[item];
        return { key: item || `field_${index + 1}`, label: item || `字段 ${index + 1}`, value, binding };
      }
      if (item && typeof item === 'object') {
        const raw = item as Record<string, unknown>;
        const binding = isDataBindingPayload(raw.binding) ? raw.binding : bindingFromDisplayField(String(raw.field || raw.column || raw.key || ''));
        const fallbackKey = String(raw.field || raw.column || raw.key || raw.label || `field_${index + 1}`);
        const value = binding ? resolveBindingValue(binding, content) : content[fallbackKey];
        return { key: fallbackKey, label: String(raw.label || bindingDisplayName(binding) || fallbackKey), value, binding };
      }
      return null;
    })
    .filter((item): item is ShowDisplayItem => item !== null && !isEmptyShowValue(item.value));

  if (normalizedFields.length > 0) return normalizedFields;

  const binding = component.config.binding && typeof component.config.binding === 'object'
    ? component.config.binding as DataBindingPayload
    : null;
  if (binding) {
    const value = resolveBindingValue(binding, content);
    if (!isEmptyShowValue(value)) return [{ key: bindingDisplayName(binding), label: bindingDisplayName(binding), value, binding }];
  }
  const contentField = String(component.config.content_field || '');
  if (contentField && !isEmptyShowValue(content[contentField])) return [{ key: contentField, label: contentField, value: content[contentField] }];
  if (!isEmptyShowValue(content[component.field])) return [{ key: component.field, label: component.field, value: content[component.field] }];
  if (!isEmptyShowValue(content[component.id])) return [{ key: component.id, label: component.id, value: content[component.id] }];
  return [];
}

function normalizeMaterializedShowDisplayItems(value: unknown): ShowDisplayItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ShowDisplayItem | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const raw = item as Record<string, unknown>;
      if (!('value' in raw)) return null;
      const key = String(raw.field || raw.key || raw.label || `field_${index + 1}`);
      const binding = isDataBindingPayload(raw.binding) ? raw.binding : null;
      return {
        key,
        label: String(raw.label || bindingDisplayName(binding) || key),
        value: raw.value,
        binding,
      };
    })
    .filter(isNonEmptyShowDisplayItem);
}

function isNonEmptyShowDisplayItem(item: ShowDisplayItem | null): item is ShowDisplayItem {
  return item !== null && !isEmptyShowValue(item.value);
}

function bindingFromDisplayField(field: string): DataBindingPayload | null {
  const key = field.trim();
  if (!key) return null;
  return { source_type: 'column', column_name: key, field: key };
}

function bindingDisplayName(binding: DataBindingPayload | null) {
  if (!binding) return '';
  return binding.column_name || binding.field || binding.key || binding.media_type || binding.source_type;
}

function isDataBindingPayload(value: unknown): value is DataBindingPayload {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).source_type === 'string';
}

function resolveBindingValue(binding: DataBindingPayload, content: Record<string, unknown>) {
  if (binding.source_type === 'column') {
    const key = binding.column_name || binding.field || '';
    return key ? content[key] : undefined;
  }
  if (binding.source_type === 'media') {
    const mediaItems = Array.isArray(content.media) ? content.media : [];
    const match = mediaItems.find((item) => mediaRefMatchesBinding(item, binding));
    if (match) return match;
    const key = binding.field || binding.column_name || '';
    return key ? content[key] : undefined;
  }
  if (binding.source_type === 'derived_context') {
    const context = content.derived_context && typeof content.derived_context === 'object' ? content.derived_context as Record<string, unknown> : {};
    const key = binding.key || binding.field || '';
    return key ? context[key] : undefined;
  }
  if (binding.source_type === 'attachment') {
    const attachments = Array.isArray(content.attachments) ? content.attachments : [];
    const key = binding.key || binding.field || '';
    return attachments.find((item) => {
      if (!item || typeof item !== 'object') return false;
      if (!key) return true;
      const raw = item as Record<string, unknown>;
      return raw.name === key || raw.field === key || raw.file_name === key || raw.filename === key || raw.url === key;
    });
  }
  return undefined;
}

function mediaRefMatchesBinding(item: unknown, binding: DataBindingPayload) {
  if (!item || typeof item !== 'object') return false;
  const raw = item as Record<string, unknown>;
  if (binding.media_type && normalizeMediaKind(raw.type || raw.media_type) !== normalizeMediaKind(binding.media_type)) return false;
  if (binding.field) return raw.field === binding.field;
  if (binding.role && raw.role !== binding.role) return false;
  return true;
}

function isEmptyShowValue(value: unknown) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function rendererControlId(component: TemplateComponentSchema) {
  return `renderer-${component.id || component.field}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function isAnswerComponent(component: TemplateComponentSchema) {
  return component.type !== 'ShowItem' && component.type !== 'LLMComponent' && component.type !== 'GroupContainer';
}

function isScoreQuestion(component: TemplateComponentSchema) {
  if (component.options.length < 3 || component.options.length > 10) return false;
  return component.options.every((option, index) => {
    const expected = String(index + 1);
    return option.value === expected || option.label === expected;
  });
}

function renderShowValue(value: unknown) {
  if (Array.isArray(value)) {
    if (!value.length) return <Typography.Text type="secondary">未绑定数据列</Typography.Text>;
    return <Space wrap size={[8, 8]}>{value.map((item, index) => <span key={index}>{renderShowValue(item)}</span>)}</Space>;
  }

  const mediaValue = resolveWorkspaceMediaPreviewValue(value);
  if (mediaValue) return <WorkspaceMediaPreview value={mediaValue} mode="inline" compact showUrl={false} showActions={false} className="renderer-media-preview" />;

  if (value && typeof value === 'object') {
    return <pre className="renderer-json-preview">{JSON.stringify(value, null, 2)}</pre>;
  }

  const text = String(value ?? '');
  const textMediaValue = resolveWorkspaceMediaPreviewValue(text);
  if (textMediaValue) return <WorkspaceMediaPreview value={textMediaValue} mode="inline" compact showUrl={false} showActions={false} className="renderer-media-preview" />;
  return (
    <Typography.Paragraph className="renderer-text-preview">
      {text || '未绑定数据列'}
    </Typography.Paragraph>
  );
}

function renderShowItems(items: ShowDisplayItem[], component: TemplateComponentSchema) {
  const maxItems = readPositiveNumber(component.config.max_items) || 12;
  const visibleItems = items.slice(0, maxItems);
  return (
    <div className={['renderer-show-grid', String(component.config.layout || 'dense') === 'media_grid' ? 'is-media-grid' : 'is-dense'].join(' ')}>
      {visibleItems.map((item) => (
        <div className="renderer-show-grid-item" key={item.key}>
          <span>{item.label}</span>
          <div className="renderer-show-grid-value">{renderShowValue(item.value)}</div>
        </div>
      ))}
      {items.length > visibleItems.length && (
        <Typography.Text type="secondary">还有 {items.length - visibleItems.length} 个字段未展示</Typography.Text>
      )}
    </div>
  );
}

function readFiniteNumber(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function scaleMarks(min: number, max: number) {
  const marks: Record<number, string> = { [min]: String(min), [max]: String(max) };
  if (max - min <= 10) {
    for (let value = min; value <= max; value += 1) marks[value] = String(value);
  }
  return marks;
}

function normalizeRankingAnswer(value: unknown, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value.map(String) : fallback;
  const seen = new Set<string>();
  const merged = [...source, ...fallback].filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
  return merged;
}

function normalizeMediaKind(type: unknown): string | null {
  if (typeof type !== 'string') return null;
  const lowered = type.toLowerCase();
  if (lowered === 'image' || lowered.startsWith('image/')) return 'image';
  if (lowered === 'audio' || lowered.startsWith('audio/')) return 'audio';
  if (lowered === 'video' || lowered.startsWith('video/')) return 'video';
  if (lowered === 'document' || lowered === 'pdf' || lowered === 'doc' || lowered === 'docx') return 'document';
  if (lowered === 'file') return 'file';
  if (lowered === 'text') return 'text';
  return null;
}

function normalizeUploadFiles(value: unknown): UploadFile[] {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.map((item, index) => {
    if (typeof item === 'string') {
      return { uid: `file-${index}-${item}`, name: item, status: 'done' };
    }
    if (item && typeof item === 'object') {
      const raw = item as Record<string, unknown>;
      const name = String(raw.name || raw.file_name || raw.url || `文件 ${index + 1}`);
      return {
        uid: String(raw.uid || raw.id || raw.url || `${index}-${name}`),
        name,
        url: typeof raw.url === 'string' ? raw.url : undefined,
        size: typeof raw.size === 'number' ? raw.size : undefined,
        type: typeof raw.type === 'string' ? raw.type : undefined,
        status: 'done',
      };
    }
    return { uid: `file-${index}`, name: `文件 ${index + 1}`, status: 'done' };
  });
}

function uploadAnswerValue(files: UploadFile[]) {
  return files.map((file) => ({
    uid: file.uid,
    name: file.name,
    size: file.size,
    type: file.type,
    url: file.url,
  }));
}

function readPositiveNumber(value: unknown): number | undefined {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : undefined;
}

function visibleTemplateComponentIds(schema: TemplateSchemaPayload, answers: Record<string, unknown>, content: Record<string, unknown>) {
  const components = templateComponents(schema);
  const componentById = new Map(components.map((component) => [component.id, component]));
  const componentByField = new Map(components.map((component) => [component.field, component]));
  const rulesByTarget = new Map<string, TemplateLinkageRule[]>();
  schema.linkage_rules.forEach((rule) => {
    const targetKey = linkageTargetKey(rule);
    const target = componentById.get(targetKey) ?? componentByField.get(targetKey);
    if (!target) return;
    const rules = rulesByTarget.get(target.id) ?? [];
    rules.push(rule);
    rulesByTarget.set(target.id, rules);
  });

  const visible = new Set<string>();
  components.forEach((component) => {
    const rules = rulesByTarget.get(component.id) ?? [];
    const hasShowRule = rules.some((rule) => linkageAction(rule) === 'show');
    let isVisible = !hasShowRule;
    rules.forEach((rule) => {
      const matched = linkageRuleMatches(rule, answers, content, componentById, componentByField);
      if (linkageAction(rule) === 'show' && matched) isVisible = true;
      if (linkageAction(rule) === 'hide' && matched) isVisible = false;
    });
    if (isVisible) {
      visible.add(component.id);
      visible.add(component.field);
    }
  });
  return visible;
}

function templateComponents(schema: TemplateSchemaPayload) {
  return [
    ...schema.tabs.flatMap((tab) => tab.components),
    ...(Array.isArray(schema.components) ? schema.components : []),
  ];
}

function linkageTargetKey(rule: TemplateLinkageRule) {
  return String(rule.target_component_id ?? rule.target_component ?? rule.target_id ?? rule.target_field ?? rule.target ?? rule.then_field ?? '');
}

function linkageAction(rule: TemplateLinkageRule) {
  return String(rule.action ?? rule.effect ?? 'show');
}

function linkageRuleMatches(
  rule: TemplateLinkageRule,
  answers: Record<string, unknown>,
  content: Record<string, unknown>,
  componentById: Map<string, TemplateComponentSchema>,
  componentByField: Map<string, TemplateComponentSchema>,
) {
  if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
    const results = rule.conditions.map((condition) => linkageConditionMatches(condition, answers, content, componentById, componentByField));
    const mode = String(rule.condition_mode ?? rule.logic ?? 'all');
    return mode === 'any' || mode === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  return linkageConditionMatches(rule, answers, content, componentById, componentByField);
}

function linkageConditionMatches(
  rule: TemplateLinkageRule | TemplateLinkageCondition,
  answers: Record<string, unknown>,
  content: Record<string, unknown>,
  componentById: Map<string, TemplateComponentSchema>,
  componentByField: Map<string, TemplateComponentSchema>,
) {
  const sourceKey = String(rule.source_field ?? rule.source_component_id ?? rule.field ?? rule.when_field ?? '');
  const source = componentById.get(sourceKey) ?? componentByField.get(sourceKey);
  const sourceField = source?.field ?? sourceKey;
  const sourceValue = answers[sourceField] ?? content[sourceField] ?? content[sourceKey];
  const expected = rule.value;
  switch (String(rule.operator ?? 'equals')) {
    case 'equals':
    case 'eq':
    case 'is':
      return linkageValueCandidates(sourceValue, source).includes(normalizeLinkageValue(expected));
    case 'not_equals':
    case 'neq':
    case 'not':
      return !linkageValueCandidates(sourceValue, source).includes(normalizeLinkageValue(expected));
    case 'contains':
      return Array.isArray(sourceValue)
        ? linkageValueCandidates(sourceValue, source).includes(normalizeLinkageValue(expected))
        : String(sourceValue ?? '').includes(String(expected ?? ''));
    case 'not_contains':
      return Array.isArray(sourceValue)
        ? !linkageValueCandidates(sourceValue, source).includes(normalizeLinkageValue(expected))
        : !String(sourceValue ?? '').includes(String(expected ?? ''));
    case 'not_empty':
    case 'filled':
      return !isEmptyAnswer(sourceValue);
    case 'empty':
    case 'is_empty':
      return isEmptyAnswer(sourceValue);
    default:
      return false;
  }
}

function normalizeLinkageValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function linkageValueCandidates(value: unknown, source?: TemplateComponentSchema) {
  const values = Array.isArray(value) ? value : [value];
  const candidates = new Set(values.map(normalizeLinkageValue));
  values.forEach((item) => {
    const normalized = normalizeLinkageValue(item);
    const option = source?.options.find((entry) => normalizeLinkageValue(entry.value) === normalized || normalizeLinkageValue(entry.label) === normalized);
    if (option) {
      candidates.add(normalizeLinkageValue(option.value));
      candidates.add(normalizeLinkageValue(option.label));
    }
  });
  return Array.from(candidates);
}

function isEmptyAnswer(value: unknown) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
}
