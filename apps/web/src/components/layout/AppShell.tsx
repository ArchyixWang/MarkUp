import { useMemo, useState, type ReactNode } from 'react';
import { Breadcrumb, Button, Drawer, Layout, Menu, Spin, Tooltip, Watermark } from 'antd';
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { SiteNav } from './SiteNav';
import type { AuthSession } from '../../stores/authStore';
import './AppShell.css';

export interface AppShellNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  active: boolean;
  onSelect: () => void;
}

export interface AppShellNavGroup {
  id: string;
  label: string;
  items: AppShellNavItem[];
}

export interface AppShellBreadcrumbItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  parentKey?: string;
  parentLabel?: ReactNode;
  parentOnClick?: () => void;
  loading?: boolean;
  title?: string;
}

interface AppShellProps {
  session: AuthSession | null;
  onOpenLogin: (mode: 'login' | 'register') => void;
  onLogout: () => void;
  workspaceNav?: AppShellNavGroup[];
  workspaceBreadcrumbs?: AppShellBreadcrumbItem[];
  children: ReactNode;
}

export function AppShell({ session, onOpenLogin, onLogout, workspaceNav, workspaceBreadcrumbs, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const hasWorkspaceNav = Boolean(workspaceNav?.some((group) => group.items.length));
  const flatWorkspaceItems = useMemo(() => workspaceNav?.flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label }))) ?? [], [workspaceNav]);
  const activeWorkspaceItem = flatWorkspaceItems.find((item) => item.active);
  const selectedKey = activeWorkspaceItem?.id;
  const selectedKeys = useMemo(() => (selectedKey ? [selectedKey] : []), [selectedKey]);
  const watermarkUserId = session?.user.user_id;
  const workspaceWatermarkContent = useMemo(
    () => (watermarkUserId ? buildWorkspaceWatermarkContent(watermarkUserId) : []),
    [watermarkUserId],
  );
  const workspaceMenuGroups = useMemo(() => workspaceNav?.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map(toMenuItem),
  })) ?? [], [workspaceNav]);
  const workspaceMobileMenuItems = useMemo(() => workspaceNav?.map((group) => ({
    type: 'group' as const,
    key: group.id,
    label: group.label,
    children: group.items.map((item) => ({
      ...toMenuItem(item),
      onClick: () => {
        item.onSelect();
        setMobileNavOpen(false);
      },
    })),
  })) ?? [], [workspaceNav]);
  const shellClassName = [
    'app-shell',
    hasWorkspaceNav ? 'app-shell--workspace' : '',
    hasWorkspaceNav && workspaceBreadcrumbs?.length ? 'app-shell--workspace-breadcrumbs' : '',
    sidebarCollapsed ? 'app-shell--sidebar-collapsed' : '',
  ].filter(Boolean).join(' ');
  const workspaceBody = (
    <>
      {hasWorkspaceNav && (
        <>
          <Layout.Sider className="app-shell-sidebar" width={232} collapsedWidth={72} collapsed={sidebarCollapsed} trigger={null} theme="light">
            <div className="app-shell-sidebar-header">
              {!sidebarCollapsed && (
                <div className="app-shell-sidebar-title">
                  <span>Workspace</span>
                  <strong>工作台</strong>
                </div>
              )}
              <Tooltip title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'} placement="right">
                <Button
                  type="text"
                  className="app-shell-sidebar-collapse"
                  icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  aria-label={sidebarCollapsed ? '展开工作台侧栏' : '收起工作台侧栏'}
                  onClick={() => setSidebarCollapsed((current) => !current)}
                />
              </Tooltip>
            </div>
            <div className="app-shell-side-groups" aria-label="工作台导航">
              {workspaceMenuGroups.map((group) => (
                <section className="app-shell-side-group" key={group.id}>
                  {sidebarCollapsed ? <div className="app-shell-side-divider" aria-hidden="true" /> : <div className="app-shell-side-group-title">{group.label}</div>}
                  <Menu
                    className="app-shell-side-menu"
                    mode="inline"
                    inlineCollapsed={sidebarCollapsed}
                    selectedKeys={selectedKeys}
                    items={group.items}
                  />
                </section>
              ))}
            </div>
          </Layout.Sider>
          <div className="app-shell-mobile-nav" aria-label="工作台移动端导航">
            <Button
              type="text"
              className="app-shell-mobile-nav-trigger"
              icon={<MenuOutlined />}
              aria-label="打开工作台菜单"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              工作台菜单
            </Button>
            <div className="app-shell-mobile-current" title={String(activeWorkspaceItem?.label ?? '工作台')}>
              <span>{activeWorkspaceItem?.groupLabel ?? '工作台'}</span>
              <strong>{activeWorkspaceItem?.label ?? '工作台'}</strong>
            </div>
          </div>
          <Drawer
            aria-label="工作台导航"
            className="app-shell-mobile-drawer"
            title="工作台导航"
            placement="left"
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
          >
            <Menu
              className="app-shell-mobile-menu"
              mode="inline"
              selectedKeys={selectedKeys}
              items={workspaceMobileMenuItems}
            />
          </Drawer>
        </>
      )}
      <Layout.Content className="app-shell-main">
        {children}
      </Layout.Content>
    </>
  );
  const content = hasWorkspaceNav && session ? (
    <>
      <div className="app-shell-workspace-watermark" data-watermark-content={workspaceWatermarkContent.join('\n')} aria-hidden="true">
        <Watermark
          className="app-shell-workspace-watermark-tile"
          content={workspaceWatermarkContent}
          gap={[96, 72]}
          rotate={-12}
          font={{ color: 'rgba(23, 32, 51, 0.055)', fontSize: 12, fontWeight: 600 }}
        >
          <div className="app-shell-workspace-watermark-plane" />
        </Watermark>
      </div>
      {workspaceBreadcrumbs?.length ? (
        <WorkspaceBreadcrumbs items={workspaceBreadcrumbs} />
      ) : null}
      {workspaceBody}
    </>
  ) : workspaceBody;

  const shell = (
    <Layout className={shellClassName}>
      <SiteNav session={session} onOpenLogin={onOpenLogin} onLogout={onLogout} />
      {content}
    </Layout>
  );

  return shell;
}

function toMenuItem(item: AppShellNavItem) {
  return {
    key: item.id,
    icon: item.icon,
    label: item.label,
    onClick: item.onSelect,
  };
}

function buildWorkspaceWatermarkContent(userId: string): string[] {
  return [` ${userId} `];
}

function WorkspaceBreadcrumbs({ items }: { items: AppShellBreadcrumbItem[] }) {
  const visibleItems = useMemo(() => (items.length > 3 ? [items[0], ...items.slice(-2)] : items), [items]);
  const renderBreadcrumbContent = (item: AppShellBreadcrumbItem) => (
    <>
      {item.icon ? <span className="app-shell-breadcrumb-icon" aria-hidden="true">{item.icon}</span> : null}
      <span className="app-shell-breadcrumb-label">
        {item.loading ? <Spin aria-label="正在加载面包屑" size="small" /> : item.label}
      </span>
    </>
  );

  const breadcrumbItems = useMemo(() => (
    visibleItems.map((item) => ({
          key: item.key,
          title: item.onClick ? (
            <button
              type="button"
              className="app-shell-breadcrumb-link"
              title={item.title}
              onClick={item.onClick}
            >
              {renderBreadcrumbContent(item)}
            </button>
          ) : (
            <span className="app-shell-breadcrumb-text" title={item.title}>
              {renderBreadcrumbContent(item)}
            </span>
          ),
    }))
  ), [visibleItems]);

  return (
    <div className="app-shell-breadcrumb-row">
      <Breadcrumb
        className="app-shell-breadcrumb"
        items={breadcrumbItems}
      />
    </div>
  );
}
