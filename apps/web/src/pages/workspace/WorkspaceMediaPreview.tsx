import { FullscreenOutlined, LinkOutlined, FileTextOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button, Image, Modal, Spin, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { DatasetMediaRef } from '../../types/api';
import { authenticatedFetch } from '../../services/apiClient';
import { getStoredSessionWithStorage } from '../../stores/authStore';

export type WorkspaceMediaPreviewMode = 'card' | 'inline';

export interface WorkspaceMediaPreviewValue {
  kind: 'image' | 'audio' | 'video' | 'document' | 'file' | 'text';
  url: string;
  label: string;
  role?: string;
  status?: string;
  source?: string;
  field?: string;
  name?: string;
  filename?: string;
  size?: number;
  duration_ms?: number;
  mime_type?: string;
  file_id?: string;
}

type VideoPreviewStatus = 'idle' | 'loading' | 'not_required' | 'pending' | 'processing' | 'ready' | 'failed' | 'not_configured';

interface VideoPreviewState {
  status: VideoPreviewStatus;
  playbackUrl: string;
  error?: string | null;
}

interface WorkspaceMediaPreviewProps {
  value: DatasetMediaRef | WorkspaceMediaPreviewValue | string | null | undefined;
  compact?: boolean;
  mode?: WorkspaceMediaPreviewMode;
  showUrl?: boolean;
  showActions?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function WorkspaceMediaPreview({
  value,
  compact = false,
  mode = 'card',
  showUrl = true,
  showActions = true,
  className = '',
  ariaLabel,
}: WorkspaceMediaPreviewProps) {
  const media = resolveWorkspaceMediaPreviewValue(value);
  const videoSupport = media?.kind === 'video' ? getVideoPreviewSupport(media) : 'supported';
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);
  const [largePreviewOpen, setLargePreviewOpen] = useState(false);
  const protectedFetchPath = media ? protectedApiMediaFetchPath(media.url) : null;
  const uploadedVideoFileId = media?.kind === 'video' ? uploadedFileIdFromMedia(media) : '';
  const videoPreview = useVideoPreview(media, uploadedVideoFileId);
  const authenticatedMedia = useAuthenticatedMediaObjectUrl(media && media.kind !== 'video' ? media.url : '', media);
  const playbackUrl = media?.kind === 'video'
    ? (uploadedVideoFileId ? videoPreview.playbackUrl : media.url)
    : authenticatedMedia.playbackUrl;
  const isPreparingVideo = media?.kind === 'video' && Boolean(uploadedVideoFileId) && ['loading', 'pending', 'processing'].includes(videoPreview.status);
  const canRenderVideoPlayer = media?.kind === 'video'
    && !videoPlaybackFailed
    && Boolean(playbackUrl)
    && !isPreparingVideo
    && (uploadedVideoFileId ? ['ready', 'not_required'].includes(videoPreview.status) : videoSupport === 'supported');
  const canOpenLargePreview = Boolean(media && playbackUrl && (
    media.kind === 'image'
    || media.kind === 'audio'
    || (media.kind === 'video' && canRenderVideoPlayer)
  ));
  const rootClass = [
    mode === 'card' ? 'workspace-media-preview' : 'preview-media-value',
    compact ? `${mode === 'card' ? 'workspace-media-preview' : 'preview-media-value'}--compact` : '',
    media ? `is-${media.kind}` : 'is-empty',
    media?.kind === 'video' && !canRenderVideoPlayer ? 'is-unsupported-video' : '',
    className,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    setVideoPlaybackFailed(false);
    setLargePreviewOpen(false);
  }, [media?.url, media?.mime_type, playbackUrl, videoPreview.status]);

  if (!media) {
    return (
      <span className={rootClass} aria-label={ariaLabel || '未命名素材'}>
        <span className="workspace-media-preview__surface workspace-media-preview__surface--empty">
          <FileTextOutlined />
        </span>
        <span className="workspace-media-preview__meta">
          <strong>未命名素材</strong>
          <Typography.Text type="secondary">无法识别素材地址</Typography.Text>
        </span>
      </span>
    );
  }

  const descriptionBits = [
    media.field ? { label: '字段', value: media.field } : null,
    media.source ? { label: '来源', value: mediaSourceLabel(media.source) } : null,
    media.size ? { label: '大小', value: formatFileSize(media.size) } : null,
    media.duration_ms ? { label: '时长', value: formatDuration(media.duration_ms) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <article className={rootClass} aria-label={ariaLabel || media.label}>
      <div className="workspace-media-preview__surface">
        {media.kind === 'image' ? (
          <Image
            alt={media.label}
            className="workspace-media-preview__image"
            preview={{ cover: <span>预览</span> }}
            src={playbackUrl}
          />
        ) : media.kind === 'audio' ? (
          <audio
            aria-label={`${media.label} 音频预览`}
            className="workspace-media-preview__player workspace-media-preview__player--audio"
            controls
            preload="metadata"
            src={playbackUrl}
          >
            音频预览
          </audio>
        ) : isPreparingVideo ? (
          <div className="workspace-media-preview__unsupported workspace-media-preview__unsupported--loading">
            <Spin size="small" />
            <strong>{videoPreview.status === 'loading' ? '正在准备视频预览' : '正在生成可播放预览'}</strong>
            <Typography.Text type="secondary">
              {videoPreview.status === 'loading' ? '正在读取视频预览状态...' : '系统正在生成 MP4 预览，稍后会自动刷新。'}
            </Typography.Text>
          </div>
        ) : canRenderVideoPlayer ? (
          <video
            aria-label={`${media.label} 视频预览`}
            className="workspace-media-preview__player workspace-media-preview__player--video"
            controls
            onError={() => setVideoPlaybackFailed(true)}
            preload="metadata"
            src={playbackUrl}
          >
            视频预览
          </video>
        ) : media.kind === 'video' ? (
          <div className="workspace-media-preview__unsupported">
            <PlayCircleOutlined />
            <strong>{videoFallbackTitle(media, videoPreview)}</strong>
            <Typography.Text type="secondary">
              {videoFallbackMessage(media, videoPreview)}
            </Typography.Text>
          </div>
        ) : (
          <div className="workspace-media-preview__file">
            <FileTextOutlined />
            <span>文件预览</span>
          </div>
        )}
        {canOpenLargePreview ? (
          <Button
            aria-label={`${media.label} 放大查看`}
            className="workspace-media-preview__zoom"
            icon={<FullscreenOutlined />}
            size="small"
            type="primary"
            onClick={() => setLargePreviewOpen(true)}
          >
            放大
          </Button>
        ) : null}
      </div>
      <div className="workspace-media-preview__meta">
        <div className="workspace-media-preview__title-row">
          <strong title={media.label}>{media.label}</strong>
          <Tag color={mediaKindColor(media.kind)}>{mediaKindLabel(media.kind)}</Tag>
        </div>
        <div className="workspace-media-preview__tag-row">
          {media.role ? <Tag>{mediaRoleLabel(media.role)}</Tag> : null}
          {media.status && media.status !== 'ready' ? <Tag color={media.status === 'failed' ? 'red' : media.status === 'processing' ? 'blue' : 'green'}>{mediaStatusLabel(media.status)}</Tag> : null}
        </div>
        {descriptionBits.length ? (
          <div className="workspace-media-preview__detail-list">
            {descriptionBits.map((item) => (
              <div key={`${item.label}-${item.value}`} className="workspace-media-preview__detail-item">
                <span className="workspace-media-preview__detail-key">{item.label}</span>
                <Typography.Text className="workspace-media-preview__detail-value" title={item.value}>
                  {item.value}
                </Typography.Text>
              </div>
            ))}
          </div>
        ) : null}
        {showUrl && media.url ? (
          <Typography.Text className="workspace-media-preview__url" title={media.url}>
            {media.url}
          </Typography.Text>
        ) : null}
        {showActions ? <div className="workspace-media-preview__actions">
          {media.url && protectedFetchPath ? (
            <Button icon={<LinkOutlined />} size="small" type="link" onClick={() => void openProtectedMediaUrl(protectedFetchPath)}>
              打开素材
            </Button>
          ) : media.url ? (
            <Button href={media.url} icon={<LinkOutlined />} rel="noreferrer" size="small" target="_blank" type="link">
              打开素材
            </Button>
          ) : null}
        </div> : null}
      </div>
      {canOpenLargePreview ? (
        <Modal
          centered
          className="workspace-media-preview-modal"
          footer={null}
          open={largePreviewOpen}
          title={media.label}
          width="min(1120px, calc(100vw - 32px))"
          onCancel={() => setLargePreviewOpen(false)}
        >
          {media.kind === 'video' ? (
            <video
              aria-label={`${media.label} 放大视频预览`}
              className="workspace-media-preview-modal__video"
              controls
              preload="metadata"
              src={playbackUrl}
            >
              视频预览
            </video>
          ) : media.kind === 'audio' ? (
            <audio
              aria-label={`${media.label} 放大音频预览`}
              className="workspace-media-preview-modal__audio"
              controls
              preload="metadata"
              src={playbackUrl}
            >
              音频预览
            </audio>
          ) : (
            <img className="workspace-media-preview-modal__image" src={playbackUrl} alt={media.label} />
          )}
        </Modal>
      ) : null}
    </article>
  );
}

export function useAuthenticatedMediaObjectUrl(url: string, media?: WorkspaceMediaPreviewValue | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPath = protectedApiMediaFetchPath(url);
    if (!fetchPath || typeof URL.createObjectURL !== 'function') {
      setObjectUrl(null);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    let nextObjectUrl: string | null = null;
    setIsLoading(true);
    setObjectUrl(null);

    const teamId = currentStoredTeamId();
    void authenticatedFetch(fetchPath, {
      headers: teamId ? { 'X-Team-ID': teamId } : undefined,
      invalidateOnAuthFailure: false,
      invalidateOnRefreshFailure: false,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const responseBlob = await response.blob();
        const blob = normalizeMediaBlob(responseBlob, media);
        if (cancelled) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (nextObjectUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [media?.filename, media?.kind, media?.mime_type, media?.name, url]);

  const fetchPath = protectedApiMediaFetchPath(url);
  return {
    playbackUrl: objectUrl ?? (fetchPath ? '' : url),
    isLoading,
    isProtected: Boolean(fetchPath),
  };
}

function useVideoPreview(media: WorkspaceMediaPreviewValue | null, fileId: string): VideoPreviewState {
  const [state, setState] = useState<VideoPreviewState>({ status: 'idle', playbackUrl: '' });

  useEffect(() => {
    if (!media || media.kind !== 'video' || !fileId) {
      setState({ status: 'idle', playbackUrl: '' });
      return undefined;
    }

    let cancelled = false;
    let timer: number | null = null;
    const teamId = currentStoredTeamId();
    const headers = teamId ? { 'X-Team-ID': teamId } : undefined;

    const applyPayload = (payload: Record<string, unknown>) => {
      const status = (firstString(payload.status) || 'pending') as VideoPreviewStatus;
      const playbackUrl = firstString(payload.playback_url);
      const error = firstString(payload.preview_error);
      setState({ status, playbackUrl, error });
      return status;
    };

    const requestPreview = async (method: 'POST' | 'GET') => {
      try {
        const path = method === 'POST'
          ? `/uploads/${encodeURIComponent(fileId)}/video-preview`
          : `/uploads/${encodeURIComponent(fileId)}/video-preview/status`;
        const response = await authenticatedFetch(path, {
          method,
          headers,
          invalidateOnAuthFailure: false,
          invalidateOnRefreshFailure: false,
        });
        if (!response.ok) {
          if (!cancelled) setState({ status: 'failed', playbackUrl: '', error: 'request_failed' });
          return;
        }
        const body = await response.json() as { data?: Record<string, unknown> };
        if (cancelled) return;
        const status = applyPayload(body.data || {});
        if (status === 'pending' || status === 'processing') {
          timer = window.setTimeout(() => void requestPreview('GET'), 1600);
        }
      } catch {
        if (!cancelled) setState({ status: 'failed', playbackUrl: '', error: 'request_failed' });
      }
    };

    setState({ status: 'loading', playbackUrl: '' });
    void requestPreview('POST');

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [fileId, media?.kind, media?.url]);

  return state;
}

function currentStoredTeamId(): string {
  const stored = getStoredSessionWithStorage();
  return stored?.session.user.team_id || stored?.session.user.default_team_id || '';
}

async function openProtectedMediaUrl(fetchPath: string) {
  const teamId = currentStoredTeamId();
  const response = await authenticatedFetch(fetchPath, {
    headers: teamId ? { 'X-Team-ID': teamId } : undefined,
    invalidateOnAuthFailure: false,
    invalidateOnRefreshFailure: false,
  });
  if (!response.ok) return;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function protectedApiMediaFetchPath(url: string): string | null {
  const value = url.trim();
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null;

  const apiPrefix = '/api/v1';
  if (value.startsWith(`${apiPrefix}/uploads/`) && value.includes('/download')) {
    return value.slice(apiPrefix.length);
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.pathname.startsWith(`${apiPrefix}/uploads/`) && parsed.pathname.includes('/download')) {
      return `${parsed.pathname.slice(apiPrefix.length)}${parsed.search}`;
    }
  } catch {
    return null;
  }

  return null;
}

function uploadedFileIdFromMedia(media: WorkspaceMediaPreviewValue): string {
  if (media.file_id) return media.file_id;
  const fetchPath = protectedApiMediaFetchPath(media.url);
  if (!fetchPath) return '';
  const match = fetchPath.match(/^\/uploads\/([^/]+)\/download/);
  return match ? decodeURIComponent(match[1]) : '';
}

function uploadFileIdFromUrl(url: string): string {
  const fetchPath = protectedApiMediaFetchPath(url);
  if (!fetchPath) return '';
  const match = fetchPath.match(/^\/uploads\/([^/]+)\/download/);
  return match ? decodeURIComponent(match[1]) : '';
}

function uploadedFileIdFromObjectId(raw: Record<string, unknown>): string {
  if (firstString(raw.source) !== 'uploaded_file') return '';
  return firstString(raw.upload_id, raw.uploadId, raw.id);
}

function getVideoPreviewSupport(media: WorkspaceMediaPreviewValue): 'supported' | 'unsupported' {
  const type = (media.mime_type || '').split(';', 1)[0].trim().toLowerCase();
  const extension = deriveMediaExtension(media.filename || media.name || media.url);
  if (isLocalAbsoluteMediaPath(media.url)) return 'unsupported';
  if (isBareMediaFilename(media.url)) return 'unsupported';
  if (type && canNativePlayVideoType(type)) return 'supported';
  if ((!type || type === 'application/octet-stream' || type === 'binary/octet-stream') && extension && canNativePlayVideoExtension(extension)) return 'supported';
  if (type && isKnownUnsupportedBrowserVideoType(type)) return 'unsupported';
  if (extension && isKnownUnsupportedBrowserVideoExtension(extension)) return 'unsupported';
  return 'supported';
}

function videoFallbackTitle(media: WorkspaceMediaPreviewValue, preview?: VideoPreviewState) {
  if (isLocalAbsoluteMediaPath(media.url)) return '当前字段是本地视频路径引用';
  if (isBareMediaFilename(media.url)) return '当前字段是视频文件名引用';
  if (preview?.status === 'not_configured') return '当前未配置视频转码服务';
  if (preview?.status === 'failed') return '视频预览生成失败';
  return '当前浏览器无法直接播放此视频格式';
}

function videoFallbackMessage(media: WorkspaceMediaPreviewValue, preview?: VideoPreviewState) {
  if (isLocalAbsoluteMediaPath(media.url)) {
    return '浏览器不能读取导入文件里的本机路径；请在导入或补上传时同时上传视频文件，系统会按文件名自动绑定后预览。';
  }
  if (isBareMediaFilename(media.url)) {
    return '文件名已保存；请通过行级媒体或上传素材绑定后预览播放。';
  }
  if (preview?.status === 'not_configured') {
    return '原视频已保存，可打开或下载；管理员配置 ffmpeg 后即可自动生成 MP4 预览。';
  }
  if (preview?.status === 'failed') {
    if (preview.error === 'quota_exceeded') return '生成 MP4 预览会超出团队存储额度，请清理空间或升级套餐。';
    return '原视频已保存，但系统暂时无法生成可播放预览，请下载原视频或稍后重试。';
  }
  return media.mime_type || media.filename || media.url
    ? `${media.mime_type || deriveMediaLabel(media.filename || media.url)} 已保存，可下载或转为 MP4 / WebM 后预览标注。`
    : '请转为 MP4 / WebM 后预览标注。';
}

function isLocalAbsoluteMediaPath(value: string) {
  const trimmed = value.trim();
  return /^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('file://');
}

function isBareMediaFilename(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return !trimmed.includes('/') && !trimmed.includes('\\');
}

function canNativePlayVideoType(type: string) {
  if (!type || typeof document === 'undefined') return false;
  const video = document.createElement('video');
  return Boolean(video.canPlayType(type));
}

function canNativePlayVideoExtension(extension: string) {
  return ['mp4', 'm4v', 'webm', 'ogv', 'ogg', '3gp'].includes(extension);
}

function isKnownUnsupportedBrowserVideoType(type: string) {
  return ['video/avi', 'video/x-msvideo', 'video/msvideo', 'video/x-matroska', 'video/quicktime'].includes(type);
}

function isKnownUnsupportedBrowserVideoExtension(extension: string) {
  return ['avi', 'mkv', 'mov'].includes(extension);
}

function deriveMediaExtension(value: string) {
  const withoutQuery = value.toLowerCase().split(/[?#]/)[0];
  const filename = withoutQuery.split('/').pop() || withoutQuery;
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function resolveWorkspaceMediaPreviewValue(value: unknown): WorkspaceMediaPreviewValue | null {
  if (typeof value === 'string') {
    const url = value.trim();
    if (!url || !looksLikeMediaReference(url)) return null;
    return {
      kind: inferMediaKind(url),
      url,
      label: deriveMediaLabel(url),
    };
  }

  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const response = raw.response && typeof raw.response === 'object' ? raw.response as Record<string, unknown> : {};
  const responseData = response.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : {};
  const rawUrl = firstString(
    raw.url,
    raw.src,
    raw.href,
    raw.preview_url,
    raw.data_url,
    raw.file_url,
    raw.path,
    raw.uri,
    responseData.url,
    response.url,
  );
  const explicitFileId = firstString(
    raw.file_id,
    raw.fileId,
    raw.upload_id,
    raw.uploadId,
    responseData.file_id,
    responseData.fileId,
    responseData.id,
    response.file_id,
    response.fileId,
    response.id,
  );
  const fileId = explicitFileId || uploadFileIdFromUrl(rawUrl) || uploadedFileIdFromObjectId(raw);
  const url = normalizeWorkspaceMediaUrl(rawUrl, fileId);
  if (!url) return null;
  const filename = firstString(raw.filename, raw.file_name, responseData.filename, responseData.file_name, response.filename, response.file_name);
  const name = firstString(raw.name);
  const mimeType = firstString(raw.mime_type, raw.content_type, responseData.content_type, responseData.mime_type, response.content_type, response.mime_type);
  const kind = normalizeMediaKind(firstString(raw.type, raw.media_type, raw.kind, mimeType)) ?? inferMediaKind(filename || name || url);
  return {
    kind,
    url,
    label: firstString(raw.name, raw.filename, raw.label, raw.field, raw.id, responseData.filename) || deriveMediaLabel(url),
    role: firstString(raw.role),
    status: firstString(raw.status),
    source: firstString(raw.source),
    field: firstString(raw.field),
    name,
    filename,
    file_id: fileId,
    size: toNumber(raw.size) ?? toNumber(responseData.size),
    duration_ms: toNumber(raw.duration_ms),
    mime_type: mimeType,
  };
}

function normalizeWorkspaceMediaUrl(url: string, fileId: string): string {
  if (!fileId) return url;
  if (fileId.startsWith('/api/v1/uploads/') || fileId.startsWith('http://') || fileId.startsWith('https://') || fileId.startsWith('data:') || fileId.startsWith('blob:')) return fileId;
  if (!url || isBareMediaFilename(url) || isLocalAbsoluteMediaPath(url)) {
    return `/api/v1/uploads/${encodeURIComponent(fileId)}/download`;
  }
  if (url) return url;
  return `/api/v1/uploads/${encodeURIComponent(fileId)}/download`;
}

function normalizeMediaBlob(blob: Blob, media?: WorkspaceMediaPreviewValue | null): Blob {
  if (!media) return blob;
  const currentType = (blob.type || '').split(';', 1)[0].trim().toLowerCase();
  if (currentType && currentType !== 'application/octet-stream' && currentType !== 'binary/octet-stream') return blob;
  const inferredType = inferMimeTypeFromMedia(media);
  return inferredType ? new Blob([blob], { type: inferredType }) : blob;
}

function inferMimeTypeFromMedia(media: WorkspaceMediaPreviewValue): string {
  const declared = (media.mime_type || '').split(';', 1)[0].trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream' && declared !== 'binary/octet-stream') return declared;
  const extension = deriveMediaExtension(media.filename || media.name || media.url);
  if (extension === 'mp4' || extension === 'm4v') return 'video/mp4';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'ogv' || extension === 'ogg') return 'video/ogg';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'm4a') return 'audio/mp4';
  if (extension === 'aac') return 'audio/aac';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return '';
}

export function mediaKindLabel(kind: WorkspaceMediaPreviewValue['kind']) {
  if (kind === 'image') return '图片';
  if (kind === 'audio') return '音频';
  if (kind === 'video') return '视频';
  if (kind === 'document') return '文档';
  if (kind === 'text') return '文本';
  return '文件';
}

export function mediaKindColor(kind: WorkspaceMediaPreviewValue['kind']) {
  if (kind === 'image') return 'cyan';
  if (kind === 'audio') return 'geekblue';
  if (kind === 'video') return 'volcano';
  if (kind === 'document') return 'gold';
  if (kind === 'text') return 'green';
  return 'default';
}

function mediaRoleLabel(role: string) {
  if (role === 'primary') return '主展示素材';
  if (role === 'context') return '补充上下文';
  if (role === 'evidence') return '参考附件';
  return role;
}

function mediaStatusLabel(status: string) {
  if (status === 'ready') return '可用';
  if (status === 'processing') return '处理中';
  if (status === 'failed') return '失败';
  return status;
}

function mediaSourceLabel(source: string) {
  if (source === 'uploaded_file') return '上传文件';
  if (source === 'external_url') return '外部链接';
  if (source === 'object_storage') return '对象存储';
  if (source === 'inline_text') return '内联文本';
  return source;
}

function inferMediaKind(url: string): WorkspaceMediaPreviewValue['kind'] {
  const lowered = url.toLowerCase().split(/[?#]/)[0];
  if (lowered.startsWith('data:image') || lowered.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/)) return 'image';
  if (lowered.startsWith('data:audio') || lowered.match(/\.(mp3|wav|m4a|ogg|aac|flac|opus)$/)) return 'audio';
  if (lowered.startsWith('data:video') || lowered.match(/\.(mp4|mov|webm|m4v|avi|mkv|3gp)$/)) return 'video';
  if (lowered.match(/\.(pdf|docx?|pptx?|xlsx?|txt|md|json|jsonl|csv)$/)) return 'document';
  return 'file';
}

function normalizeMediaKind(kind: string | null | undefined): WorkspaceMediaPreviewValue['kind'] | null {
  if (!kind) return null;
  const lowered = kind.toLowerCase();
  if (lowered === 'image' || lowered.startsWith('image/')) return 'image';
  if (lowered === 'audio' || lowered.startsWith('audio/')) return 'audio';
  if (lowered === 'video' || lowered.startsWith('video/')) return 'video';
  if (
    lowered === 'document'
    || lowered === 'pdf'
    || lowered === 'doc'
    || lowered === 'docx'
    || lowered === 'application/pdf'
    || lowered === 'application/msword'
    || lowered === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || lowered === 'application/vnd.ms-powerpoint'
    || lowered === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || lowered === 'application/vnd.ms-excel'
    || lowered === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || lowered === 'text/plain'
    || lowered === 'text/markdown'
    || lowered === 'application/json'
  ) return 'document';
  if (lowered === 'file') return 'file';
  if (lowered === 'text') return 'text';
  return null;
}

function looksLikeMediaReference(url: string) {
  const lowered = url.toLowerCase().split(/[?#]/)[0];
  if (lowered.startsWith('data:image') || lowered.startsWith('data:audio') || lowered.startsWith('data:video')) return true;
  if (/^https?:\/\/.+/i.test(url) || /^file:\/\//i.test(url) || /^blob:/i.test(url)) {
    return /\.(png|jpg|jpeg|gif|webp|bmp|svg|mp3|wav|m4a|ogg|aac|flac|opus|mp4|mov|webm|m4v|avi|mkv|pdf|docx?|pptx?|xlsx?|txt|md|json|jsonl|csv)(\?.*)?$/.test(lowered) || /\/(media|files|uploads)\//i.test(lowered);
  }
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg|mp3|wav|m4a|ogg|aac|flac|opus|mp4|mov|webm|m4v|avi|mkv|pdf|docx?|pptx?|xlsx?|txt|md|json|jsonl|csv)(\?.*)?$/.test(lowered);
}

function deriveMediaLabel(url: string) {
  if (!url) return '未命名素材';
  if (url.startsWith('data:')) return url.slice(0, 32);
  const withoutQuery = url.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  return segments[segments.length - 1] || url;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

function firstString(...values: Array<unknown>) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

function toNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : undefined;
}
