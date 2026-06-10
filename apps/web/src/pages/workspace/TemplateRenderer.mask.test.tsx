import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateRenderer } from './TemplateRenderer';
import type { ComponentBindingsPayload, TemplateSchemaPayload } from '../../types/api';
import { authenticatedFetch } from '../../services/apiClient';

vi.mock('../../services/apiClient', () => ({
  authenticatedFetch: vi.fn(),
}));

function MaskRendererHarness({
  content = { image_url: 'https://example.com/sample.png' },
  config = { source_field: 'image_url' },
  componentBindings,
}: {
  content?: Record<string, unknown>;
  config?: Record<string, unknown>;
  componentBindings?: ComponentBindingsPayload;
} = {}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const schema: TemplateSchemaPayload = {
    schema_version: '1.0',
    tabs: [
      {
        id: 'tab-mask',
        title: '图片标注',
        components: [
          {
            id: 'mask_1',
            type: 'ImageMaskAnnotation',
            field: 'damage_mask',
            label: '图片区域',
            required: true,
            config: {
              ...config,
              mode: 'rect',
              brush_size: 18,
              stroke_color: '#1677ff',
            },
            options: [],
            version: '1.0',
          },
        ],
      },
    ],
    components: [],
    validation_rules: {},
    linkage_rules: [],
    llm_config: {},
  };
  return (
    <TemplateRenderer
      schema={schema}
      content={content}
      answers={answers}
      componentBindings={componentBindings}
      onAnswerChange={(field, value) => setAnswers((current) => ({ ...current, [field]: value }))}
      hideAiComponent={false}
    />
  );
}

describe('TemplateRenderer ImageMaskAnnotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('markup_access_token', 'access-token');
    window.localStorage.setItem('markup_refresh_token', 'refresh-token');
    window.localStorage.setItem('markup_user', JSON.stringify({ user_id: 'user-1', team_id: 'team-1' }));
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:protected-mask-image'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  it('renders image mask annotation and records rectangle marks', async () => {
    const { container } = render(<MaskRendererHarness />);

    expect(screen.getByText('图片区域 *')).toBeInTheDocument();
    const image = screen.getByAltText('图片区域 标注底图');
    expect(image).toHaveAttribute('src', 'https://example.com/sample.png');
    Object.defineProperties(image, {
      naturalWidth: { value: 1200, configurable: true },
      naturalHeight: { value: 1600, configurable: true },
    });
    fireEvent.load(image);

    const board = container.querySelector('.image-mask-board') as HTMLDivElement;
    expect(board).toBeTruthy();
    await waitFor(() => {
      expect(board.style.getPropertyValue('--image-mask-aspect-ratio')).toBe('1200 / 1600');
      expect(board.style.getPropertyValue('--image-mask-ratio')).toBe('0.75');
    });
    board.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(board, { pointerId: 1, clientX: 40, clientY: 30 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 200, clientY: 150 });

    await waitFor(() => expect(screen.getByText('1 个标注')).toBeInTheDocument());
    expect(container.querySelector('rect')).toBeTruthy();
  });

  it('uses row-level multimodal media metadata as the image mask source', () => {
    render(
      <MaskRendererHarness
        config={{}}
        content={{
          media: [
            {
              media_type: 'image',
              url: 'https://example.com/media-image.png',
              field: 'image_asset',
            },
          ],
        }}
      />,
    );

    expect(screen.getByAltText('图片区域 标注底图')).toHaveAttribute('src', 'https://example.com/media-image.png');
  });

  it('prefers the publish-time mask source binding over template defaults', () => {
    render(
      <MaskRendererHarness
        config={{
          source_binding: { source_type: 'media', media_type: 'image', role: 'primary', field: 'template_image' },
        }}
        content={{
          media: [
            {
              type: 'image',
              role: 'primary',
              field: 'template_image',
              url: 'https://example.com/template-image.png',
            },
            {
              type: 'image',
              role: 'context',
              field: 'publish_image',
              url: 'https://example.com/publish-image.png',
            },
          ],
        }}
        componentBindings={{
          mask_1: {
            mask_image: {
              source_type: 'media',
              media_type: 'image',
              role: 'context',
              field: 'publish_image',
            },
          },
        }}
      />,
    );

    expect(screen.getByAltText('图片区域 标注底图')).toHaveAttribute('src', 'https://example.com/publish-image.png');
  });

  it('uses the first image inside a legacy media list column binding', () => {
    render(
      <MaskRendererHarness
        config={{
          source_binding: { source_type: 'column', column_name: 'media', field: 'media' },
        }}
        content={{
          media: [
            {
              type: 'audio',
              url: 'https://example.com/audio.mp3',
              field: 'audio_url',
            },
            {
              type: 'image',
              url: 'https://example.com/from-media-list.png',
              field: 'image_url',
            },
          ],
        }}
      />,
    );

    expect(screen.getByAltText('图片区域 标注底图')).toHaveAttribute('src', 'https://example.com/from-media-list.png');
  });

  it('loads protected uploaded images through authenticated object URLs', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['mask-image'], { type: 'image/png' }),
    } as Response);

    render(
      <MaskRendererHarness
        config={{}}
        content={{
          media: [
            {
              media_type: 'image',
              url: '/api/v1/uploads/image-file/download',
              field: 'image_url',
              name: 'masked.png',
              mime_type: 'image/png',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('正在加载图片素材...')).toBeInTheDocument();
    expect(authenticatedFetch).toHaveBeenCalledWith('/uploads/image-file/download', {
      headers: { 'X-Team-ID': 'team-1' },
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    });
    await waitFor(() => expect(screen.getByAltText('图片区域 标注底图')).toHaveAttribute('src', 'blob:protected-mask-image'));
    expect(screen.queryByText('正在加载图片素材...')).not.toBeInTheDocument();
  });
});
