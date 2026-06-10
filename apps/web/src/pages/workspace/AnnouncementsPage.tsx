import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Drawer, Form, Input, Modal, Select, Space, Switch, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, MailOutlined, RollbackOutlined } from '@ant-design/icons';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { ApiClientError } from '../../services/apiClient';
import {
  createNotification,
  deleteNotification,
  getAdminOverview,
  getMyProfile,
  getTeamMembers,
  listNotifications,
  markAllNotificationsRead,
  previewNotificationRecipients,
  revokeNotification,
  updateMyProfile,
  updateNotificationState,
} from '../../services/workspaceService';
import type { ApiUser, NotificationListResponse, NotificationPayload, NotificationRecipientPreview, TeamDetail, TeamMember } from '../../types/api';
import { formatApiDateTime } from '../../utils/dateTime';
import { WorkspaceLoading } from './WorkspaceLoading';
import { WorkspaceSummaryStrip } from './WorkspaceListPrimitives';
import { fixedTablePagination, workspacePopupContainer } from './workspaceListHelpers';
import { WorkspaceTableActions } from './WorkspaceTableActions';
import { WorkspaceEntityReference, formatShortId } from './workspaceDisplay';

type TabKey = 'all' | 'system' | 'team' | 'review' | 'export';
type NotificationSettingsForm = {
  in_app: boolean;
  email: boolean;
  system: boolean;
  team: boolean;
  review: boolean;
  export: boolean;
};

const typeLabels: Record<string, string> = {
  system: '系统公告',
  team: '企业通知',
  organization: '企业通知',
  review: '审核提醒',
  export: '导出提醒',
};

const statusLabels: Record<string, string> = {
  unread: '未读',
  read: '已读',
  handled: '已处理',
  revoked: '已撤回',
  expired: '已过期',
};

const priorityColors: Record<string, string> = {
  normal: 'default',
  important: 'orange',
  urgent: 'red',
};

export function AnnouncementsPage({ user }: { user: ApiUser }) {
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [selected, setSelected] = useState<NotificationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [preview, setPreview] = useState<NotificationRecipientPreview | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [settingsForm] = Form.useForm<NotificationSettingsForm>();
  const canManageTeamNotifications = canManageNotifications(user);

  const overviewItems = useMemo(() => [
    { label: '未读消息', value: data?.summary.unread ?? 0 },
    { label: '企业通知', value: data?.summary.team ?? 0 },
    { label: '审核提醒', value: data?.summary.review ?? 0 },
    { label: '导出提醒', value: data?.summary.export ?? 0 },
    { label: '系统公告', value: data?.summary.system ?? 0 },
  ], [data?.summary]);

  const selectedNotifications = useMemo(
    () => (data?.items ?? []).filter((item) => selectedRowKeys.includes(item.notification_id)),
    [data?.items, selectedRowKeys],
  );

  const unreadSelected = useMemo(
    () => selectedNotifications.filter((item) => item.status === 'unread'),
    [selectedNotifications],
  );

  const handleableSelected = useMemo(
    () => selectedNotifications.filter((item) => isHandleableNotification(item)),
    [selectedNotifications],
  );

  const loadNotifications = async (targetTeam = team, nextTab = activeTab, nextStatus = status) => {
    if (!targetTeam) return;
    setTableLoading(true);
    setError(null);
    try {
      const response = await listNotifications(targetTeam.team_id, {
        notification_type: nextTab,
        status: nextStatus,
        keyword,
        page_size: 50,
      });
      setData(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '通知加载失败');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getAdminOverview()
      .then(async (overview) => {
        if (!active) return;
        const currentTeam = overview.teams[0] ?? null;
        setTeam(currentTeam);
        if (currentTeam) {
          const notifications = await listNotifications(currentTeam.team_id, { page_size: 50 });
          const memberResponse = canManageTeamNotifications
            ? await getTeamMembers(currentTeam.team_id, { status: 'active' })
            : null;
          if (!active) return;
          setData(notifications);
          setMembers(memberResponse?.items ?? []);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiClientError ? err.message : '公告通知加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageTeamNotifications]);

  const changeTab = (key: string) => {
    const nextTab = key as TabKey;
    setActiveTab(nextTab);
    void loadNotifications(team, nextTab);
  };

  const submitNotification = async (values: {
    title: string;
    content: string;
    priority: string;
    target_type: string;
    target_roles?: string[];
    target_user_ids?: string[];
    related_entity_type?: string;
    related_entity_id?: string;
    email_enabled?: boolean;
    in_app_enabled?: boolean;
    expire_at?: string;
  }) => {
    if (!team) return;
    setError(null);
    const relatedEntityId = normalizeNotificationRelatedId(values.related_entity_id);
    const payload = {
      title: values.title,
      content: values.content,
      notification_type: 'organization',
      priority: values.priority,
      target_type: values.target_type,
      target_roles: values.target_roles ?? [],
      target_user_ids: values.target_user_ids ?? [],
      related_entity_type: values.target_type === 'task' ? 'task' : values.related_entity_type,
      related_entity_id: relatedEntityId,
      email_enabled: Boolean(values.email_enabled),
      in_app_enabled: values.in_app_enabled !== false,
      expire_at: values.expire_at,
    };
    let recipientPreview = preview;
    if (!recipientPreview) {
      recipientPreview = await previewNotificationRecipients(team.team_id, {
        target_type: values.target_type ?? 'team',
        target_roles: values.target_roles ?? [],
        target_user_ids: values.target_user_ids ?? [],
        related_entity_id: relatedEntityId,
      });
      setPreview(recipientPreview);
    }
    if (recipientPreview.total <= 0) {
      setError('接收人为 0，无法发送企业通知。请调整分发对象后重新预览。');
      return;
    }
    if (payload.priority === 'urgent') {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '发送紧急通知？',
          content: '紧急通知会高亮展示给接收人。',
          okText: '确认发送',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    const created = await createNotification(team.team_id, payload);
    setData((current) => current ? { ...current, items: [created, ...current.items], summary: { ...current.summary, team: (current.summary.team ?? 0) + 1, organization: (current.summary.organization ?? 0) + 1 }, pagination: { ...current.pagination, total: current.pagination.total + 1 } } : current);
    setModalOpen(false);
    setPreview(null);
    form.resetFields();
    setMessage('企业通知已发送');
  };

  const refreshPreview = async () => {
    if (!team) return;
    const values = form.getFieldsValue();
    const relatedEntityId = normalizeNotificationRelatedId(values.related_entity_id);
    setError(null);
    const nextPreview = await previewNotificationRecipients(team.team_id, {
      target_type: values.target_type ?? 'team',
      target_roles: values.target_roles ?? [],
      target_user_ids: values.target_user_ids ?? [],
      related_entity_id: relatedEntityId,
    });
    setPreview(nextPreview);
    if (nextPreview.total <= 0) {
      setError('接收人为 0，无法发送企业通知。请调整分发对象。');
    }
  };

  const markRead = async (item: NotificationPayload) => {
    if (!team) return;
    const updated = await updateNotificationState(team.team_id, item.notification_id, 'read');
    replaceItem(updated);
    setMessage('通知已标为已读');
  };

  const markHandled = async (item: NotificationPayload) => {
    if (!team) return;
    const updated = await updateNotificationState(team.team_id, item.notification_id, 'handled');
    replaceItem(updated);
    setMessage('提醒已处理');
  };

  const batchUpdateSelected = async (nextStatus: 'read' | 'handled') => {
    if (!team) return;
    const targets = nextStatus === 'read' ? unreadSelected : handleableSelected;
    if (targets.length === 0) return;
    setBatchLoading(true);
    setError(null);
    try {
      const updatedItems = await Promise.all(targets.map((item) => updateNotificationState(team.team_id, item.notification_id, nextStatus)));
      setData((current) => {
        if (!current) return current;
        const updatedById = new Map(updatedItems.map((item) => [item.notification_id, item]));
        const nextItems = current.items.map((item) => updatedById.get(item.notification_id) ?? item);
        return { ...current, items: nextItems, summary: notificationSummaryFromItems(nextItems) };
      });
      setSelected((current) => current ? updatedItems.find((item) => item.notification_id === current.notification_id) ?? current : current);
      setSelectedRowKeys((keys) => keys.filter((key) => !updatedItems.some((item) => item.notification_id === key)));
      setMessage(nextStatus === 'read' ? `已批量标记 ${updatedItems.length} 条通知为已读` : `已批量处理 ${updatedItems.length} 条提醒`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : nextStatus === 'read' ? '批量标为已读失败' : '批量处理提醒失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const revokeTeamNotification = async (item: NotificationPayload) => {
    if (!team) return;
    const updated = await revokeNotification(team.team_id, item.notification_id, '发送者撤回企业通知');
    replaceItem(updated);
    setMessage('企业通知已撤回');
  };

  const deleteTeamNotification = async (item: NotificationPayload) => {
    if (!team) return;
    await deleteNotification(team.team_id, item.notification_id);
    setData((current) => {
      if (!current) return current;
      const nextItems = current.items.filter((candidate) => candidate.notification_id !== item.notification_id);
      return {
        ...current,
        items: nextItems,
        summary: notificationSummaryFromItems(nextItems),
        pagination: { ...current.pagination, total: Math.max(current.pagination.total - 1, 0) },
      };
    });
    setSelected((current) => (current?.notification_id === item.notification_id ? null : current));
    setMessage('企业通知已删除');
  };

  const markAllRead = async () => {
    if (!team) return;
    const result = await markAllNotificationsRead(team.team_id);
    setMessage(`已标记 ${result.updated} 条通知`);
    await loadNotifications();
    setSelectedRowKeys([]);
  };

  const replaceItem = (updated: NotificationPayload) => {
    setData((current) => {
      if (!current) return current;
      const nextItems = current.items.map((item) => (item.notification_id === updated.notification_id ? updated : item));
      return { ...current, items: nextItems, summary: notificationSummaryFromItems(nextItems) };
    });
    setSelected((current) => (current?.notification_id === updated.notification_id ? updated : current));
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    setSettingsLoading(true);
    setError(null);
    try {
      const profile = await getMyProfile();
      settingsForm.setFieldsValue(settingsFromProfile(profile.profile.notification_settings));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '通知设置加载失败');
      settingsForm.setFieldsValue(defaultNotificationSettings());
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async (values: NotificationSettingsForm) => {
    setSettingsSaving(true);
    setError(null);
    try {
      await updateMyProfile({ notification_settings: values });
      setSettingsOpen(false);
      setMessage('通知设置已保存');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '通知设置保存失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  if (loading) return <main className="workspace-content announcements-page workspace-loading-page"><WorkspaceLoading tip="正在加载公告通知" /></main>;
  if (!team) return <main className="workspace-content announcements-page"><Alert className="inline-message-ant" type="warning" showIcon title="请先完成企业企业配置。" /></main>;

  return (
    <main className="workspace-content announcements-page production-list-page workspace-fixed-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Announcements</p>
          <h1>公告通知</h1>
        </div>
        <div className="page-actions">
          {canManageTeamNotifications && <Button type="primary" onClick={() => setModalOpen(true)}>新建企业通知</Button>}
          <Button onClick={() => void markAllRead()}>全部标为已读</Button>
          <Button onClick={() => void openSettings()}>通知设置</Button>
        </div>
      </section>

      <WorkspaceSummaryStrip
        ariaLabel="公告通知概览"
        items={overviewItems.map((item) => ({ key: item.label, label: item.label, value: item.value }))}
      />

      {message && <Alert className="inline-message-ant" type="success" showIcon closable onClose={() => setMessage(null)} message={message} />}
      {error && <Alert className="inline-message-ant" type="error" showIcon closable onClose={() => setError(null)} message={error} action={<Button size="small" onClick={() => void loadNotifications()}>重试</Button>} />}

      <div className="production-filter-bar workspace-fixed-toolbar">
        <Input.Search className="production-filter-search" aria-label="搜索通知" allowClear placeholder="搜索标题、正文、发送人" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void loadNotifications()} />
        <Select className="production-filter-select" aria-label="状态筛选" value={status} onChange={(value) => { setStatus(value); void loadNotifications(team, activeTab, value); }} getPopupContainer={workspacePopupContainer} options={[
          { value: 'all', label: '全部状态' },
          { value: 'unread', label: '未读' },
          { value: 'read', label: '已读' },
          { value: 'handled', label: '已处理' },
          { value: 'expired', label: '已过期' },
        ]} />
        <Button onClick={() => void loadNotifications()}>刷新</Button>
      </div>

      <section className="workspace-table-panel production-table-shell workspace-fixed-table-panel">
        {selectedNotifications.length > 0 && (
          <Alert
            className="inline-message-ant"
            type="info"
            showIcon
            title={`已选择 ${selectedNotifications.length} 条通知`}
            description={`可标为已读 ${unreadSelected.length} 条，可设为已处理 ${handleableSelected.length} 条。企业通知撤回和删除仍需逐条确认。`}
            action={(
              <Space>
                <Button loading={batchLoading} disabled={unreadSelected.length === 0} onClick={() => void batchUpdateSelected('read')}>批量标为已读</Button>
                <Button loading={batchLoading} disabled={handleableSelected.length === 0} onClick={() => void batchUpdateSelected('handled')}>批量设为已处理</Button>
                <Button disabled={batchLoading} onClick={() => setSelectedRowKeys([])}>取消选择</Button>
              </Space>
            )}
          />
        )}
        <Tabs activeKey={activeTab} onChange={changeTab} items={[
          { key: 'all', label: '全部消息' },
          { key: 'system', label: '系统公告' },
          { key: 'team', label: '企业通知' },
          { key: 'review', label: '审核提醒' },
          { key: 'export', label: '导出提醒' },
        ]} />
        <EnhancedTable
          className="workspace-fixed-table"
          rowKey="notification_id"
          loading={tableLoading}
          dataSource={data?.items ?? []}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys.map(String)),
            getCheckboxProps: (record) => ({ disabled: ['revoked', 'expired', 'deleted'].includes(record.status) }),
          }}
          locale={{ emptyText: activeTab === 'team' ? '暂无企业通知' : '暂无通知' }}
          pagination={fixedTablePagination(data?.pagination.total ?? data?.items.length ?? 0)}
          scroll={{ y: 'calc(var(--workspace-table-body-height) - 96px)' }}
          tableLayout="fixed"
          columns={decorateNotificationColumns([
            {
              title: '标题',
              dataIndex: 'title',
              render: (_, item) => (
                <button type="button" className="link-button table-title-button" onClick={() => setSelected(item)}>
                  {item.status === 'unread' && !item.is_read && <Badge status="processing" />}
                  <span>{item.title}</span>
                  <small>{item.content}</small>
                </button>
              ),
            },
            { title: '类型', dataIndex: 'notification_type', render: (value) => typeLabels[String(value)] ?? value },
            { title: '优先级', dataIndex: 'priority', render: (value) => <Tag color={priorityColors[String(value)]}>{String(value)}</Tag> },
            { title: '分发对象', dataIndex: 'target_type', render: (_, item) => describeTarget(item) },
            { title: '状态', dataIndex: 'status', render: (value) => <Tag color={statusColor(String(value))}>{statusLabels[String(value)] ?? value}</Tag> },
            { title: '发送人', dataIndex: 'sender_name', render: (value) => value || '系统' },
            { title: '时间', dataIndex: 'created_at', render: formatTime },
            {
              title: '操作',
              key: 'actions',
              width: 138,
              fixed: 'right',
              className: 'workspace-table-action-cell',
              render: (_, item) => (
                <WorkspaceTableActions
                  visible={[
                    { key: 'view', label: '查看', icon: <EyeOutlined />, onClick: () => setSelected(item) },
                    ...(isHandleableNotification(item)
                      ? [{ key: 'handled', label: '处理', icon: <CheckCircleOutlined />, onClick: () => void markHandled(item) }]
                      : []),
                  ]}
                  menu={[
                    ...(item.status === 'unread' ? [{ key: 'read', label: '标为已读', icon: <MailOutlined />, onClick: () => void markRead(item) }] : []),
                    ...(canManageTeamNotifications && isOrganizationNotification(item) && item.status !== 'revoked'
                      ? [{
                        key: 'revoke',
                        label: '撤回通知',
                        icon: <RollbackOutlined />,
                        onClick: () => void revokeTeamNotification(item),
                        confirm: { title: '撤回这条企业通知？', okText: '撤回' },
                      }]
                      : []),
                    ...(canManageTeamNotifications && isOrganizationNotification(item)
                      ? [{
                        key: 'delete',
                        label: '删除通知',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => void deleteTeamNotification(item),
                        confirm: { title: '删除这条企业通知？', content: '删除后列表不再展示，审计日志仍会保留记录。', okText: '删除' },
                      }]
                      : []),
                  ]}
                />
              ),
            },
          ], data?.items ?? [])}
        />
      </section>

      <Drawer title="消息详情" open={Boolean(selected)} onClose={() => setSelected(null)} width={520}>
        {selected && (
          <div className="detail-drawer-content">
            <Tag color={priorityColors[selected.priority]}>{selected.priority}</Tag>
            <h2>{selected.title}</h2>
            <p>{selected.content}</p>
            <dl>
              <dt>类型</dt><dd>{typeLabels[selected.notification_type] ?? selected.notification_type}</dd>
              <dt>状态</dt><dd>{statusLabels[selected.status] ?? selected.status}</dd>
              <dt>发送人</dt><dd>{selected.sender_name || '系统'}</dd>
              <dt>分发对象</dt><dd>{describeTarget(selected)}</dd>
              <dt>阅读统计</dt><dd>{selected.read_count} 已读 / {selected.handled_count} 已处理</dd>
              <dt>撤回时间</dt><dd>{formatTime(selected.revoked_at)}</dd>
              <dt>关联对象</dt><dd><WorkspaceEntityReference type={selected.related_entity_type} id={selected.related_entity_id} /></dd>
            </dl>
          </div>
        )}
      </Drawer>

      <Modal title="新建企业通知" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="发送通知" width={720}>
        <Form form={form} layout="vertical" initialValues={{ priority: 'normal', target_type: 'team', in_app_enabled: true, email_enabled: false }} onFinish={submitNotification} onValuesChange={() => { setPreview(null); setError(null); }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input /></Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: '请输入正文' }]}><Input.TextArea rows={5} /></Form.Item>
          <Form.Item name="priority" label="优先级"><Select options={[{ value: 'normal', label: '普通' }, { value: 'important', label: '重要' }, { value: 'urgent', label: '紧急' }]} /></Form.Item>
          <Form.Item name="target_type" label="分发对象"><Select options={[{ value: 'team', label: '全企业' }, { value: 'role', label: '按角色' }, { value: 'member', label: '指定成员' }, { value: 'task', label: '指定任务相关成员' }]} /></Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => form.getFieldValue('target_type') === 'role' && (
              <Form.Item name="target_roles" label="角色"><Select mode="multiple" options={[{ value: 'owner', label: 'Owner' }, { value: 'reviewer', label: 'Reviewer' }, { value: 'labeler', label: 'Labeler' }]} /></Form.Item>
            )}
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => form.getFieldValue('target_type') === 'member' && (
              <Form.Item name="target_user_ids" label="指定成员"><Select mode="multiple" options={members.filter(isHumanNotificationRecipient).map((member) => ({ value: member.user_id, label: member.display_name || member.email || member.user_id }))} /></Form.Item>
            )}
          </Form.Item>
          <div className="form-inline-grid">
            <Form.Item name="related_entity_type" label="关联对象类型"><Input placeholder="task/export/review" /></Form.Item>
            <Form.Item name="related_entity_id" label="关联对象标识" tooltip="仅在需要绑定任务、导出或审核记录时填写，可从对应详情页复制。" rules={[({ getFieldValue }) => ({
              validator(_, value) {
                if (getFieldValue('target_type') !== 'task' || normalizeNotificationRelatedId(value)) return Promise.resolve();
                return Promise.reject(new Error('按任务分发时请输入任务标识'));
              },
            })]}><Input placeholder="关联任务或业务记录标识" /></Form.Item>
          </div>
          <div className="form-inline-grid">
            <Form.Item name="in_app_enabled" label="站内通知" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="email_enabled" label="邮件通知" valuePropName="checked"><Switch /></Form.Item>
          </div>
          <Space>
            <Button onClick={() => void refreshPreview()}>预览接收人</Button>
            {preview && <span className="muted-text">预计 {preview.total} 人，角色分布：{Object.entries(preview.role_counts).map(([role, count]) => `${role} ${count}`).join(' / ') || '无'}</span>}
          </Space>
        </Form>
      </Modal>

      <Drawer
        title="通知设置"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        extra={<Button type="primary" loading={settingsSaving} onClick={() => settingsForm.submit()}>保存设置</Button>}
      >
        <Alert
          className="inline-message-ant"
          type="info"
          showIcon
          title="通知设置"
          description="按需调整站内和邮件提醒。"
        />
        <Form<NotificationSettingsForm>
          form={settingsForm}
          layout="vertical"
          disabled={settingsLoading}
          initialValues={defaultNotificationSettings()}
          onFinish={saveSettings}
        >
          <Form.Item name="in_app" label="站内通知" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="email" label="邮件通知" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="system" label="系统公告" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="team" label="企业通知" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="review" label="审核提醒" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="export" label="导出提醒" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Drawer>
    </main>
  );
}

function canManageNotifications(user: ApiUser): boolean {
  return ['admin', 'platform_admin', 'team_admin', 'owner'].includes(user.role) || user.permissions.includes('member:invite');
}

function describeTarget(item: NotificationPayload): string {
  if (item.target_type === 'role') return item.target_roles.join(' / ') || '按角色';
  if (item.target_type === 'member') return `${item.target_user_ids.length} 名成员`;
  if (item.target_type === 'task') return item.related_entity_id ? `任务 ${formatShortId(item.related_entity_id)}` : '指定任务相关成员';
  return '全企业';
}

function formatTime(value?: string | null): string {
  return formatApiDateTime(value);
}

function notificationSummaryFromItems(items: NotificationPayload[]): NotificationListResponse['summary'] {
  return {
    total: items.length,
    unread: items.filter((item) => item.status === 'unread').length,
    starred: items.filter((item) => item.is_starred).length,
    organization: items.filter(isOrganizationNotification).length,
    team: items.filter(isOrganizationNotification).length,
    task: items.filter((item) => item.notification_type === 'task').length,
    review: items.filter((item) => item.notification_type === 'review').length,
    export: items.filter((item) => item.notification_type === 'export').length,
    points: items.filter((item) => item.notification_type === 'points').length,
    security: items.filter((item) => item.notification_type === 'security').length,
    system: items.filter((item) => item.notification_type === 'system').length,
  };
}

function isOrganizationNotification(item: NotificationPayload): boolean {
  return item.notification_type === 'organization' || item.notification_type === 'team';
}

function isHandleableNotification(item: NotificationPayload): boolean {
  return !isOrganizationNotification(item) && !item.is_handled && !['revoked', 'expired', 'deleted'].includes(item.status);
}

function isHumanNotificationRecipient(member: TeamMember): boolean {
  return member.team_role !== 'agent' && !member.is_system_member;
}

function statusColor(status: string): string {
  if (status === 'unread') return 'blue';
  if (status === 'handled') return 'green';
  if (status === 'revoked') return 'red';
  return 'default';
}

function defaultNotificationSettings(): NotificationSettingsForm {
  return {
    in_app: true,
    email: true,
    system: true,
    team: true,
    review: true,
    export: true,
  };
}

function settingsFromProfile(settings?: Record<string, unknown>): NotificationSettingsForm {
  const defaults = defaultNotificationSettings();
  if (!settings) return defaults;
  return {
    in_app: typeof settings.in_app === 'boolean' ? settings.in_app : defaults.in_app,
    email: typeof settings.email === 'boolean' ? settings.email : defaults.email,
    system: typeof settings.system === 'boolean' ? settings.system : defaults.system,
    team: typeof settings.team === 'boolean' ? settings.team : defaults.team,
    review: typeof settings.review === 'boolean' ? settings.review : defaults.review,
    export: typeof settings.export === 'boolean' ? settings.export : defaults.export,
  };
}

function decorateNotificationColumns(
  columns: ColumnsType<NotificationPayload>,
  items: NotificationPayload[],
): ColumnsType<NotificationPayload> {
  return columns.map((column, index) => {
    if (index === 0) {
      return {
        ...column,
        key: column.key ?? 'title',
        sorter: (left, right) => (left.title ?? '').localeCompare(right.title ?? '', 'zh-CN'),
      };
    }

    if (index === 1) {
      return {
        ...column,
        key: column.key ?? 'notification_type',
        filters: buildTableFilterOptions(items.map((item) => String(typeLabels[item.notification_type] ?? item.notification_type))),
        filterSearch: true,
        onFilter: (value, item) => String(typeLabels[item.notification_type] ?? item.notification_type) === String(value),
      };
    }

    if (index === 2) {
      return {
        ...column,
        key: column.key ?? 'priority',
        filters: buildTableFilterOptions(items.map((item) => item.priority)),
        filterSearch: true,
        onFilter: (value, item) => item.priority === String(value),
      };
    }

    if (index === 3) {
      return {
        ...column,
        key: column.key ?? 'target_type',
        filters: buildTableFilterOptions(items.map((item) => describeTarget(item))),
        filterSearch: true,
        onFilter: (value, item) => describeTarget(item) === String(value),
      };
    }

    if (index === 4) {
      return {
        ...column,
        key: column.key ?? 'status',
        filters: buildTableFilterOptions(items.map((item) => String(statusLabels[item.status] ?? item.status))),
        filterSearch: true,
        onFilter: (value, item) => String(statusLabels[item.status] ?? item.status) === String(value),
      };
    }

    if (index === 5) {
      return {
        ...column,
        key: column.key ?? 'sender_name',
        sorter: (left, right) => (left.sender_name || '系统').localeCompare(right.sender_name || '系统', 'zh-CN'),
      };
    }

    if (index === 6) {
      return {
        ...column,
        key: column.key ?? 'created_at',
        sorter: (left, right) => compareDateTime(left.created_at, right.created_at),
      };
    }

    return column;
  });
}

function buildTableFilterOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Map(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value, { text: value, value }]),
    ).values(),
  );
}

function normalizeNotificationRelatedId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function compareDateTime(left?: string | null, right?: string | null) {
  const leftValue = left ? new Date(left).getTime() : 0;
  const rightValue = right ? new Date(right).getTime() : 0;
  return leftValue - rightValue;
}
