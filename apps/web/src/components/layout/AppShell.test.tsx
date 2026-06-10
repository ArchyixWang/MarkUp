import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import type { AuthSession } from '../../stores/authStore';

const session: AuthSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'u1',
    username: 'owner01',
    email: 'owner@example.com',
    role: 'owner',
    permissions: ['team:manage'],
  },
};

describe('AppShell', () => {
  it('renders shell-level Watermark and fixed breadcrumbs outside workspace content', () => {
    render(
      <MemoryRouter>
        <AppShell
          session={session}
          workspaceNav={[{ id: 'home', label: '主页面', items: [{ id: 'dashboard', label: '工作台', active: true, onSelect: vi.fn() }] }]}
          workspaceBreadcrumbs={[
            { key: 'workspace', label: '工作台', icon: <span data-testid="workspace-icon" /> },
            { key: 'datasets', label: '数据集管理' },
          ]}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
        >
          <main>Workspace content</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(document.querySelector('.app-shell-workspace-watermark')).toBeInTheDocument();
    expect(document.querySelector('.app-shell-workspace-watermark-plane')).toBeInTheDocument();
    expect(document.querySelector('.app-shell-main .app-shell-workspace-watermark')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell-sidebar .app-shell-workspace-watermark')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell-main .app-shell-breadcrumb-row')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell-sidebar')).toBeInTheDocument();
    expect(document.querySelector('.app-shell-workspace-watermark')?.getAttribute('data-watermark-content')?.trim()).toBe('u1');
    expect(screen.getByText('数据集管理')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-icon')).toBeInTheDocument();
  });

  it('keeps the workspace watermark at shell scope when the sidebar is collapsed', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppShell
          session={session}
          workspaceNav={[{ id: 'home', label: '主页面', items: [{ id: 'dashboard', label: '工作台', active: true, onSelect: vi.fn() }] }]}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
        >
          <main>Workspace content</main>
        </AppShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '收起工作台侧栏' }));

    expect(document.querySelector('.app-shell--sidebar-collapsed .app-shell-workspace-watermark')).toBeInTheDocument();
    expect(document.querySelector('.app-shell-main .app-shell-workspace-watermark')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell-sidebar .app-shell-workspace-watermark')).not.toBeInTheDocument();
  });

  it('renders clickable and dynamic workspace breadcrumbs', async () => {
    const user = userEvent.setup();
    const onRootClick = vi.fn();
    const onParentClick = vi.fn();
    render(
      <MemoryRouter>
        <AppShell
          session={session}
          workspaceNav={[{ id: 'production', label: '数据生产', items: [{ id: 'datasets', label: '数据集管理', active: true, onSelect: vi.fn() }] }]}
          workspaceBreadcrumbs={[
            { key: 'workspace', label: '工作台', onClick: onRootClick },
            { key: 'datasets', label: '数据集管理', onClick: onParentClick },
            { key: 'dataset-name', label: '情感语料-v2', title: '情感语料-v2' },
          ]}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
        >
          <main>Workspace content</main>
        </AppShell>
      </MemoryRouter>,
    );

    await user.click(document.querySelector('.app-shell-breadcrumb-link') as HTMLElement);
    expect(onRootClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '数据集管理' }));
    expect(onParentClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('情感语料-v2')).toBeInTheDocument();
  });

  it('shows loading indicator for dynamic breadcrumb tail', () => {
    render(
      <MemoryRouter>
        <AppShell
          session={session}
          workspaceNav={[{ id: 'production', label: '数据生产', items: [{ id: 'datasets', label: '数据集管理', active: true, onSelect: vi.fn() }] }]}
          workspaceBreadcrumbs={[
            { key: 'workspace', label: '工作台' },
            { key: 'datasets', label: '数据集管理' },
            { key: 'dataset-name', label: '数据集详情', loading: true },
          ]}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
        >
          <main>Workspace content</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('正在加载面包屑')).toBeInTheDocument();
  });

  it('collapses sidebar and hides workspace title', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppShell
          session={session}
          workspaceNav={[{ id: 'home', label: '主页面', items: [{ id: 'dashboard', label: '主页面', active: true, onSelect: vi.fn() }] }]}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
        >
          <main>Workspace content</main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('工作台').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '收起工作台侧栏' }));

    expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell-sidebar .app-shell-side-group-title')).not.toBeInTheDocument();
    expect(document.querySelector('.app-shell-side-divider')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开工作台侧栏' })).toBeInTheDocument();
  });

  it('opens workspace navigation from the compact mobile drawer trigger', async () => {
    const user = userEvent.setup();
    const onSelectDatasets = vi.fn();
    render(
      <MemoryRouter>
        <AppShell
          session={session}
          workspaceNav={[
            { id: 'home', label: '主页面', items: [{ id: 'dashboard', label: '主页面', active: false, onSelect: vi.fn() }] },
            { id: 'production', label: '数据生产', items: [{ id: 'datasets', label: '数据集管理', active: true, onSelect: onSelectDatasets }] },
          ]}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
        >
          <main>Workspace content</main>
        </AppShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '打开工作台菜单' }));
    const dialog = screen.getByRole('dialog', { name: '工作台导航' });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('menuitem', { name: /数据集管理/ }));
    expect(onSelectDatasets).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '工作台导航' })).not.toBeInTheDocument());
  });
});
