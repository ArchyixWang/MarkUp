import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceMediaPreview } from './WorkspaceMediaPreview';
import { authenticatedFetch } from '../../services/apiClient';

vi.mock('../../services/apiClient', () => ({
  authenticatedFetch: vi.fn(),
}));

describe('WorkspaceMediaPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('markup_access_token', 'access-token');
    window.localStorage.setItem('markup_refresh_token', 'refresh-token');
    window.localStorage.setItem('markup_user', JSON.stringify({ user_id: 'user-1', team_id: 'team-1' }));
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:protected-video'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  it('loads protected uploaded video through a signed playback URL', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: 'ready',
          playback_url: 'http://testserver/api/v1/uploads/file-1/playback?token=signed',
        },
      }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: '/api/v1/uploads/file-1/download',
          name: '演示视频',
          field: 'video_filename',
        }}
        showActions={false}
      />,
    );

    expect(authenticatedFetch).toHaveBeenCalledWith('/uploads/file-1/video-preview', {
      method: 'POST',
      headers: { 'X-Team-ID': 'team-1' },
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    });
    await waitFor(() => expect(screen.getByLabelText('演示视频 视频预览')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/file-1/playback?token=signed'));
  });

  it('opens uploaded videos in a larger preview dialog even when actions are hidden', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: 'not_required',
          playback_url: 'http://testserver/api/v1/uploads/file-large/playback?token=signed',
        },
      }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          file_id: 'file-large',
          filename: 'large.mp4',
          name: 'large.mp4',
          mime_type: 'video/mp4',
        }}
        showActions={false}
        compact
        mode="inline"
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('large.mp4 视频预览')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/file-large/playback?token=signed'));
    fireEvent.click(screen.getByRole('button', { name: 'large.mp4 放大查看' }));

    expect(await screen.findByLabelText('large.mp4 放大视频预览')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/file-large/playback?token=signed');
  });

  it('plays uploaded MP4 when only file_id and octet-stream MIME are available', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: 'not_required',
          playback_url: 'http://testserver/api/v1/uploads/mp4-file/playback?token=signed',
        },
      }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          file_id: 'mp4-file',
          filename: 'sample.mp4',
          name: 'sample.mp4',
          mime_type: 'application/octet-stream',
        }}
        showActions={false}
      />,
    );

    expect(authenticatedFetch).toHaveBeenCalledWith('/uploads/mp4-file/video-preview', {
      method: 'POST',
      headers: { 'X-Team-ID': 'team-1' },
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    });
    await waitFor(() => expect(screen.getByLabelText('sample.mp4 视频预览')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/mp4-file/playback?token=signed'));
  });

  it('detects uploaded video ids from absolute backend download URLs', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: 'ready',
          playback_url: 'http://localhost:8000/api/v1/uploads/avi-file/playback?token=signed',
        },
      }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          source: 'uploaded_file',
          url: 'http://localhost:8000/api/v1/uploads/avi-file/download',
          filename: 'sample.avi',
          mime_type: 'video/x-msvideo',
        }}
        showActions={false}
      />,
    );

    expect(authenticatedFetch).toHaveBeenCalledWith('/uploads/avi-file/video-preview', {
      method: 'POST',
      headers: { 'X-Team-ID': 'team-1' },
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    });
    await waitFor(() => expect(screen.getByLabelText(/sample\.avi.*视频预览/)).toHaveAttribute('src', 'http://localhost:8000/api/v1/uploads/avi-file/playback?token=signed'));
  });

  it('prefers uploaded file playback when a media row still contains a local source path', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: 'ready',
          playback_url: 'http://testserver/api/v1/uploads/local-bound-video/playback?token=signed',
        },
      }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: 'C:\\datasets\\raw\\sample.avi',
          file_id: 'local-bound-video',
          filename: 'sample.avi',
          mime_type: 'video/x-msvideo',
        }}
        showActions={false}
      />,
    );

    expect(authenticatedFetch).toHaveBeenCalledWith('/uploads/local-bound-video/video-preview', {
      method: 'POST',
      headers: { 'X-Team-ID': 'team-1' },
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    });
    await waitFor(() => expect(screen.getByLabelText('sample.avi 视频预览')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/local-bound-video/playback?token=signed'));
  });

  it('extracts uploaded video ids from upload response payloads', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          status: 'not_required',
          playback_url: 'http://testserver/api/v1/uploads/response-video/playback?token=signed',
        },
      }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          name: 'sample.mp4',
          response: {
            data: {
              file_id: 'response-video',
              filename: 'sample.mp4',
              content_type: 'video/mp4',
            },
          },
        } as any}
        showActions={false}
      />,
    );

    expect(authenticatedFetch).toHaveBeenCalledWith('/uploads/response-video/video-preview', {
      method: 'POST',
      headers: { 'X-Team-ID': 'team-1' },
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    });
    await waitFor(() => expect(screen.getByLabelText('sample.mp4 视频预览')).toHaveAttribute('src', 'http://testserver/api/v1/uploads/response-video/playback?token=signed'));
  });

  it('shows processing state while uploaded unsupported video is being transcoded', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'processing' } }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: '/api/v1/uploads/file-2/download',
          name: '原始视频.avi',
          mime_type: 'video/x-msvideo',
        }}
        showActions={false}
      />,
    );

    await waitFor(() => expect(screen.getByText('正在生成可播放预览')).toBeInTheDocument());
    expect(screen.queryByLabelText('原始视频.avi 视频预览')).not.toBeInTheDocument();
  });

  it('explains when video transcoding is not configured', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'not_configured', preview_error: 'ffmpeg_not_configured' } }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: '/api/v1/uploads/file-3/download',
          name: '原始视频.avi',
          mime_type: 'video/x-msvideo',
        }}
        showActions={false}
      />,
    );

    await waitFor(() => expect(screen.getByText('当前未配置视频转码服务')).toBeInTheDocument());
    expect(screen.getByText('原视频已保存，可打开或下载；管理员配置 ffmpeg 后即可自动生成 MP4 预览。')).toBeInTheDocument();
  });

  it('falls back when an external browser-supported video fails to load', () => {
    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: 'https://cdn.example.com/video.mp4',
          name: '编码异常视频',
          mime_type: 'video/mp4',
        }}
        showActions={false}
      />,
    );

    fireEvent.error(screen.getByLabelText('编码异常视频 视频预览'));

    expect(screen.getByText('当前浏览器无法直接播放此视频格式')).toBeInTheDocument();
  });

  it('keeps external AVI as a browser fallback without requesting transcoding', () => {
    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: 'https://cdn.example.com/raw.avi',
          name: 'raw.avi',
          mime_type: 'video/x-msvideo',
        }}
        showActions={false}
      />,
    );

    expect(authenticatedFetch).not.toHaveBeenCalled();
    expect(screen.getByText('当前浏览器无法直接播放此视频格式')).toBeInTheDocument();
  });

  it('explains local absolute video paths instead of rendering a broken player', () => {
    render(
      <WorkspaceMediaPreview
        value={{
          type: 'video',
          url: 'C:\\Users\\Lenovo\\Desktop\\markup_multimodal_datasets\\04_video\\video\\traffic_light_car.avi',
          name: 'traffic_light_car.avi',
        }}
        showActions={false}
      />,
    );

    expect(screen.getByText('当前字段是本地视频路径引用')).toBeInTheDocument();
    expect(screen.queryByLabelText('traffic_light_car.avi 视频预览')).not.toBeInTheDocument();
  });

  it('classifies document MIME values as documents when protected URLs have no extension', () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
    } as Response);

    render(
      <WorkspaceMediaPreview
        value={{
          url: '/api/v1/uploads/file-pdf/download',
          name: '验收材料',
          mime_type: 'application/pdf',
        }}
        showActions={false}
      />,
    );

    expect(screen.getByText('文档')).toBeInTheDocument();
  });
});
