import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Drawer, Empty, Input, Modal, Popconfirm, Space, Tabs, Tag, notification } from 'antd';
import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, MailOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { ApiClientError } from '../../services/apiClient';
import { batchUpdateMyNotificationState, listMyNotifications, markAllMyNotificationsRead, updateMyNotificationState, type NotificationStateAction } from '../../services/workspaceService';
import type { NotificationListResponse, NotificationPayload } from '../../types/api';
import { WorkspaceLoading } from './WorkspaceLoading';
import { WorkspaceSummaryStrip } from './WorkspaceListPrimitives';
import { formatInboxTime, inboxPriorityColors, inboxStatusLabels, inboxSummaryFromItems, inboxTypeLabels, isHandleableInboxItem } from './personalInboxHelpers';
import { fixedTablePagination } from './workspaceListHelpers';
import { WorkspaceTableActions } from './WorkspaceTableActions';
import { WorkspaceEntityReference } from './workspaceDisplay';

type InboxTabKey = 'all' | 'unread' | 'starred' | `type:${string}`;

export function PersonalInboxPage() {
  const [noticeApi, noticeContext] = notification.useNotification();
  const [activeTab, setActiveTab] = useState<InboxTabKey>('all');
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [selected, setSelected] = useState<NotificationPayload | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedItems = useMemo(() => {
    const items = data?.items ?? [];
    if (activeTab === 'starred') return items.filter((item) => item.is_starred);
    return items;
  }, [activeTab, data?.items]);

  const selectedNotifications = useMemo(
    () => displayedItems.filter((item) => selectedRowKeys.includes(item.notification_id)),
    [displayedItems, selectedRowKeys],
  );

  const overviewItems = useMemo(() => [
    { key: 'all', label: '全部消息', value: data?.summary.total ?? data?.pagination.total ?? 0 },
    { key: 'unread', label: '未读消息', value: data?.summary.unread ?? 0 },
    { key: 'starred', label: '星标消息', value: data?.summary.starred ?? 0 },
    ...(data?.type_options ?? []).map((option) => ({
      key: option.key,
      label: option.label,
      value: option.count,
    })),
  ], [data?.pagination.total, data?.summary.starred, data?.summary.total, data?.summary.unread, data?.type_options]);

  const tabItems = useMemo(() => [
    { key: 'all', label: '全部消息' },
    { key: 'unread', label: `未读 ${data?.summary.unread ?? 0}` },
    { key: 'starred', label: `星标 ${data?.summary.starred ?? 0}` },
    ...(data?.type_options ?? []).map((option) => ({
      key: `type:${option.key}`,
      label: `${option.label} ${option.count}`,
    })),
  ], [data?.summary.starred, data?.summary.unread, data?.type_options]);

  const notifySuccess = (content: string) => {
    noticeApi.success({
      key: 'personal-inbox-feedback',
      message: content,
      placement: 'topRight',
    });
  };

  const loadInbox = async (nextTab = activeTab, silent = false) => {
    if (silent) {
      setTableLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await listMyNotifications({
        notification_type: notificationTypeForTab(nextTab),
        status: nextTab === 'unread' ? 'unread' : undefined,
        keyword,
        page_size: 100,
      });
      setData(response);
      setSelectedRowKeys([]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '个人信箱加载失败');
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInbox('all');
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeTab = (key: string) => {
    const nextTab = key as InboxTabKey;
    setActiveTab(nextTab);
    void loadInbox(nextTab, true);
  };

  const replaceItem = (updated: NotificationPayload) => {
    setData((current) => {
      if (!current) return current;
      const nextItems = updated.is_deleted
        ? current.items.filter((item) => item.notification_id !== updated.notification_id)
        : current.items.map((item) => (item.notification_id === updated.notification_id ? updated : item));
      return { ...current, items: nextItems, summary: inboxSummaryFromItems(nextItems) };
    });
    setSelected((current) => (current?.notification_id === updated.notification_id ? (updated.is_deleted ? null : updated) : current));
  };

  const updateItemState = async (item: NotificationPayload, action: NotificationStateAction, successText: string) => {
    const updated = await updateMyNotificationState(item.notification_id, action);
    replaceItem(updated);
    notifySuccess(successText);
  };

  const batchUpdateSelected = async (action: NotificationStateAction) => {
    if (!selectedNotifications.length) return;
    if (action === 'delete') {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '删除选中的个人消息？',
          content: '删除只会从你的个人信箱移除，不影响企业公告或其他接收人。',
          okText: '删除',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    setBatchLoading(true);
    setError(null);
    try {
      const result = await batchUpdateMyNotificationState(selectedNotifications.map((item) => item.notification_id), action);
      notifySuccess(`已更新 ${result.updated_count} 条消息，跳过 ${result.skipped_count} 条`);
      await loadInbox(activeTab, true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '批量更新失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const markAllRead = async () => {
    const result = await markAllMyNotificationsRead();
    notifySuccess(`已标记 ${result.updated} 条消息为已读`);
    await loadInbox(activeTab, true);
  };

  if (loading) {
    return <main className="workspace-content personal-inbox-page workspace-loading-page"><WorkspaceLoading tip="正在加载个人信箱" /></main>;
  }

  return (
    <>
      {noticeContext}
      <main className="workspace-content personal-inbox-page production-list-page workspace-fixed-page">
      <section className="page-heading">
        <div>
          <p className="section-kicker">Inbox</p>
          <h1>个人信箱</h1>
          <p>查看分发给你的企业通知、审核提醒、导出提醒和系统公告。</p>
        </div>
        <div className="page-actions">
          <Button onClick={() => void loadInbox(activeTab, true)}>刷新</Button>
          <Button type="primary" onClick={() => void markAllRead()}>全部标为已读</Button>
        </div>
      </section>

      <WorkspaceSummaryStrip ariaLabel="个人信箱概览" items={overviewItems} />

      {error && <Alert className="inline-message-ant" type="error" showIcon closable onClose={() => setError(null)} message={error} action={<Button size="small" onClick={() => void loadInbox(activeTab, true)}>重试</Button>} />}

      <div className="production-filter-bar workspace-fixed-toolbar">
        <Input.Search
          className="production-filter-search"
          aria-label="搜索个人信箱"
          allowClear
          placeholder="搜索标题、正文、发送人"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onSearch={() => void loadInbox(activeTab, true)}
        />
      </div>

      <section className="workspace-table-panel production-table-shell workspace-fixed-table-panel">
        <Tabs activeKey={activeTab} onChange={changeTab} items={[
          ...tabItems,
        ]} />
        {selectedNotifications.length > 0 && (
          <Alert
            className="inline-message-ant"
            type="info"
            showIcon
            title={`已选择 ${selectedNotifications.length} 条消息`}
            description="批量操作只影响你自己的阅读、星标或删除状态。"
            action={(
              <Space wrap>
                <Button loading={batchLoading} onClick={() => void batchUpdateSelected('read')}>标为已读</Button>
                <Button loading={batchLoading} onClick={() => void batchUpdateSelected('unread')}>标为未读</Button>
                <Button loading={batchLoading} onClick={() => void batchUpdateSelected('star')}>星标</Button>
                <Button loading={batchLoading} onClick={() => void batchUpdateSelected('unstar')}>取消星标</Button>
                <Button loading={batchLoading} danger icon={<DeleteOutlined />} onClick={() => void batchUpdateSelected('delete')}>删除</Button>
                <Button disabled={batchLoading} onClick={() => setSelectedRowKeys([])}>取消选择</Button>
              </Space>
            )}
          />
        )}
        <EnhancedTable
          className="workspace-fixed-table"
          rowKey="notification_id"
          loading={tableLoading}
          dataSource={displayedItems}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys.map(String)),
            getCheckboxProps: (record) => ({ disabled: record.status === 'revoked' }),
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无个人消息" /> }}
          pagination={fixedTablePagination(displayedItems.length)}
          scroll={{ y: 'calc(var(--workspace-table-body-height) - 156px)' }}
          tableLayout="fixed"
          columns={[
            {
              title: '',
              width: 56,
              render: (_, item) => (
                <Button
                  aria-label={item.is_starred ? '取消星标' : '星标'}
                  type="text"
                  icon={item.is_starred ? <StarFilled /> : <StarOutlined />}
                  onClick={() => void updateItemState(item, item.is_starred ? 'unstar' : 'star', item.is_starred ? '已取消星标' : '已星标')}
                />
              ),
            },
            {
              title: '消息',
              dataIndex: 'title',
              render: (_, item) => (
                <button type="button" className="link-button table-title-button" onClick={() => setSelected(item)}>
                  {!item.is_read && <Badge status="processing" />}
                  <span>{item.title}</span>
                  <small>{item.content}</small>
                </button>
              ),
            },
            { title: '类型', width: 110, dataIndex: 'notification_type', render: (value) => inboxTypeLabels[String(value)] ?? value },
            { title: '来源', width: 140, dataIndex: 'source_team_name', render: (value) => value || '系统' },
            { title: '优先级', width: 92, dataIndex: 'priority', render: (value) => <Tag color={inboxPriorityColors[String(value)]}>{String(value)}</Tag> },
            { title: '状态', width: 92, dataIndex: 'status', render: (value) => <Tag color={statusColor(String(value))}>{inboxStatusLabels[String(value)] ?? value}</Tag> },
            { title: '时间', width: 170, dataIndex: 'created_at', render: formatInboxTime },
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
                    ...(isHandleableInboxItem(item) && !item.is_handled && item.status !== 'revoked'
                      ? [{ key: 'handled', label: '设为已处理', icon: <CheckCircleOutlined />, onClick: () => void updateItemState(item, 'handled', '提醒已设为已处理') }]
                      : []),
                  ]}
                  menu={[
                    {
                      key: item.is_read ? 'unread' : 'read',
                      label: item.is_read ? '标为未读' : '标为已读',
                      icon: <MailOutlined />,
                      onClick: () => void updateItemState(item, item.is_read ? 'unread' : 'read', item.is_read ? '消息已标为未读' : '消息已标为已读'),
                    },
                    {
                      key: 'delete',
                      label: '删除消息',
                      icon: <DeleteOutlined />,
                      danger: true,
                      onClick: () => void updateItemState(item, 'delete', '消息已删除'),
                      confirm: { title: '删除这条个人消息？', content: '只会从你的个人信箱移除。', okText: '删除' },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </section>

      <Drawer title="消息详情" open={Boolean(selected)} onClose={() => setSelected(null)} width={560}>
        {selected && (
          <div className="detail-drawer-content">
            <Space size={8} wrap>
              <Tag>{inboxTypeLabels[selected.notification_type] ?? selected.notification_type}</Tag>
              <Tag color={inboxPriorityColors[selected.priority]}>{selected.priority}</Tag>
              <Tag color={statusColor(selected.status)}>{inboxStatusLabels[selected.status] ?? selected.status}</Tag>
              {selected.is_starred && <Tag color="gold">已星标</Tag>}
            </Space>
            <h2>{selected.title}</h2>
            <p>{selected.content}</p>
            <dl>
              <dt>来源</dt><dd>{selected.source_team_name || '系统'}</dd>
              <dt>发送人</dt><dd>{selected.sender_name || '系统'}</dd>
              <dt>时间</dt><dd>{formatInboxTime(selected.created_at)}</dd>
              <dt>关联对象</dt><dd><WorkspaceEntityReference type={selected.related_entity_type} id={selected.related_entity_id} /></dd>
              {renderMetadataRows(selected.metadata)}
            </dl>
            <Space wrap>
              {selected.action_url && <Button type="primary" href={selected.action_url}>前往处理</Button>}
              <Button icon={selected.is_starred ? <StarFilled /> : <StarOutlined />} onClick={() => void updateItemState(selected, selected.is_starred ? 'unstar' : 'star', selected.is_starred ? '已取消星标' : '已星标')}>
                {selected.is_starred ? '取消星标' : '星标'}
              </Button>
              <Button onClick={() => void updateItemState(selected, selected.is_read ? 'unread' : 'read', selected.is_read ? '消息已标为未读' : '消息已标为已读')}>
                {selected.is_read ? '标为未读' : '标为已读'}
              </Button>
              {isHandleableInboxItem(selected) && (
                <Button onClick={() => void updateItemState(selected, selected.is_handled ? 'unhandled' : 'handled', selected.is_handled ? '提醒已设为未处理' : '提醒已设为已处理')}>
                  {selected.is_handled ? '设为未处理' : '设为已处理'}
                </Button>
              )}
              <Popconfirm title="删除这条个人消息？" description="只会从你的个人信箱移除。" okText="删除" cancelText="取消" onConfirm={() => void updateItemState(selected, 'delete', '消息已删除')}>
                <Button danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </Space>
          </div>
        )}
      </Drawer>
      </main>
    </>
  );
}

function notificationTypeForTab(tab: InboxTabKey): string | undefined {
  if (tab.startsWith('type:')) return tab.slice(5);
  return undefined;
}

function statusColor(status: string): string {
  if (status === 'unread') return 'blue';
  if (status === 'handled') return 'green';
  if (status === 'revoked') return 'red';
  return 'default';
}

function metadataText(metadata: NotificationPayload['metadata'], key: string): string | null {
  if (!metadata || !(key in metadata)) return null;
  const value = metadata[key];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function renderMetadataRows(metadata: NotificationPayload['metadata']) {
  const metadataStatus = metadataText(metadata, 'status');
  const metadataError = metadataText(metadata, 'error');
  return (
    <>
      {metadataStatus && <><dt>业务状态</dt><dd>{metadataStatus}</dd></>}
      {metadataError && <><dt>失败原因</dt><dd>{metadataError}</dd></>}
    </>
  );
}
