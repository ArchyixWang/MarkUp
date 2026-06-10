import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskSquarePage } from './TaskSquarePage';
import type { AuthSession } from '../../stores/authStore';

const taskResponse = {
  code: 0,
  message: 'ok',
  data: {
    items: [
      {
        task_id: 'task-1',
        title: '真实接口任务',
        category: 'text',
        description: '来自后端接口的任务',
        unit_points: 3,
        bundle_options: [50, 100],
        available_items: 120,
        deadline: '2026-06-15',
        difficulty: 'medium',
        tags: ['文本'],
        status: 'open',
        owner_team_name: '真实企业',
        estimated_minutes: 45,
        published_at: '2026-05-27',
        priority: 'recommended',
        team_verified: true,
        deliverable: '按要求交付',
        qualification_required: 'none',
        review_notes: '按规则复核',
      },
    ],
    pagination: { page: 1, page_size: 6, total: 1, total_pages: 1 },
  },
  request_id: 'req-task',
  timestamp: '2026-05-27T00:00:00Z',
};

const labelerSession: AuthSession = {
  accessToken: 'labeler-token',
  refreshToken: 'refresh-token',
  user: {
    user_id: 'labeler-1',
    username: 'labeler01',
    email: 'labeler@example.com',
    role: 'labeler',
    email_verified: true,
    permissions: ['label:read', 'label:write', 'submission:submit'],
  },
};

const smallRemainderTaskResponse = {
  ...taskResponse,
  data: {
    ...taskResponse.data,
    items: [{
      ...taskResponse.data.items[0],
      bundle_options: [50, 100, 200],
      available_items: 10,
    }],
  },
};

const agreementTaskResponse = {
  ...taskResponse,
  data: {
    ...taskResponse.data,
    items: [{
      ...taskResponse.data.items[0],
      agreement_config: {
        required: true,
        use_default_template: true,
        text: '领取前请确认保密、质量和按时提交要求。',
        file_name: null,
      },
    }],
  },
};

describe('TaskSquarePage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/tasks');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(taskResponse), { status: 200 })));
  });

  it('loads tasks from the public task API', async () => {
    render(<TaskSquarePage session={null} onOpenLogin={vi.fn()} />);

    expect(await screen.findByText('真实接口任务')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/labels/tasks?'), expect.any(Object));
    });
  });

  it('prefills the search keyword from an assigned task link', async () => {
    window.history.replaceState({}, '', '/tasks?keyword=task-1');

    render(<TaskSquarePage session={null} onOpenLogin={vi.fn()} />);

    expect(screen.getByPlaceholderText('搜索任务、企业、标签或领域')).toHaveValue('task-1');
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('keyword=task-1'), expect.any(Object));
    });
  });

  it('opens labeling workbench after a task is claimed', async () => {
    const user = userEvent.setup();
    const onClaimedTask = vi.fn();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/my-tasks') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            items: [],
            summary: { total_tasks: 0, active_tasks: 0, submitted_questions: 0, pending_questions: 0, rejected_questions: 0 },
          },
          request_id: 'req-my-tasks',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/qualification-check') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            task_id: 'task-1',
            eligible: true,
            qualification_required: 'none',
            checks: [
              { key: 'domain', label: '领域资质', required: 'none', actual: 'approved', passed: true, message: '无需领域资质' },
            ],
            failed_checks: [],
            summary: '满足领取条件',
          },
          request_id: 'req-check',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/claim' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ bundle_size: 50, agreement_accepted: false });
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: { task_id: 'task-1', bundle_size: 50, claimed_items: 50, remaining_items: 70 },
          request_id: 'req-claim',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      return new Response(JSON.stringify(taskResponse), { status: 200 });
    });

    render(<TaskSquarePage session={labelerSession} onOpenLogin={vi.fn()} onClaimedTask={onClaimedTask} />);

    await user.click(await screen.findByText('真实接口任务'));
    expect(screen.getByRole('dialog').querySelector('.drawer-step-panel')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('本任务无需额外签署协议')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('满足领取条件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '接单' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/labels/tasks/task-1/claim'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(onClaimedTask).toHaveBeenCalledWith('task-1');
    });
  });

  it('requires a task agreement signature as the second claim step', async () => {
    const user = userEvent.setup();
    const onClaimedTask = vi.fn();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/my-tasks') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            items: [],
            summary: { total_tasks: 0, active_tasks: 0, submitted_questions: 0, pending_questions: 0, rejected_questions: 0 },
          },
          request_id: 'req-my-tasks',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/qualification-check') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            task_id: 'task-1',
            eligible: true,
            qualification_required: 'none',
            checks: [{ key: 'domain', label: '领域资质', required: 'none', actual: 'approved', passed: true, message: '无需领域资质' }],
            failed_checks: [],
            summary: '满足领取条件',
          },
          request_id: 'req-check',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/claim' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ bundle_size: 50, agreement_accepted: true });
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: { task_id: 'task-1', bundle_size: 50, claimed_items: 50, remaining_items: 70 },
          request_id: 'req-claim',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      return new Response(JSON.stringify(agreementTaskResponse), { status: 200 });
    });

    render(<TaskSquarePage session={labelerSession} onOpenLogin={vi.fn()} onClaimedTask={onClaimedTask} />);

    await user.click(await screen.findByText('真实接口任务'));
    await user.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('领取前请确认保密、质量和按时提交要求。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/labels/tasks/task-1/claim'),
      expect.objectContaining({ method: 'POST' }),
    );

    await user.click(screen.getByRole('checkbox', { name: '我已阅读并同意该任务用户协议' }));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('满足领取条件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '接单' }));

    await waitFor(() => expect(onClaimedTask).toHaveBeenCalledWith('task-1'));
  });

  it('marks an already claimed marketplace task as claimed', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/my-tasks') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            items: [
              {
                task: { task_id: 'task-1' },
                progress: { total: 50, submitted: 0, rejected: 0, remaining: 50, percent: 0 },
                latest_question_id: 'question-1',
                last_updated_at: '2026-05-29T00:00:00Z',
              },
            ],
            summary: { total_tasks: 1, active_tasks: 1, submitted_questions: 0, pending_questions: 50, rejected_questions: 0 },
          },
          request_id: 'req-my-tasks',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      return new Response(JSON.stringify(taskResponse), { status: 200 });
    });

    render(<TaskSquarePage session={labelerSession} onOpenLogin={vi.fn()} />);

    await user.click(await screen.findByText('真实接口任务'));
    const claimedButton = await screen.findByRole('button', { name: '已接取' });

    expect(claimedButton).toBeDisabled();
    expect(screen.getByText('已接取该任务')).toBeInTheDocument();
  });

  it('claims a custom item count when preset bundles are larger than the task remainder', async () => {
    const user = userEvent.setup();
    const onClaimedTask = vi.fn();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/my-tasks') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            items: [],
            summary: { total_tasks: 0, active_tasks: 0, submitted_questions: 0, pending_questions: 0, rejected_questions: 0 },
          },
          request_id: 'req-my-tasks',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/qualification-check') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            task_id: 'task-1',
            eligible: true,
            qualification_required: 'none',
            checks: [{ key: 'domain', label: '领域资质', required: 'none', actual: 'approved', passed: true, message: '无需领域资质' }],
            failed_checks: [],
            summary: '满足领取条件',
          },
          request_id: 'req-check',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/claim' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ bundle_size: 8, agreement_accepted: false });
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: { task_id: 'task-1', bundle_size: 8, claimed_items: 8, remaining_items: 2 },
          request_id: 'req-claim',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      return new Response(JSON.stringify(smallRemainderTaskResponse), { status: 200 });
    });

    render(<TaskSquarePage session={labelerSession} onOpenLogin={vi.fn()} onClaimedTask={onClaimedTask} />);

    await user.click(await screen.findByText('真实接口任务'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('本任务无需额外签署协议')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(within(await screen.findByRole('dialog')).getByRole('button', { name: /10 条/ })).toBeInTheDocument();
    await user.type(await screen.findByPlaceholderText('最多 10 条'), '8');
    await user.click(screen.getByRole('button', { name: '接单' }));

    await waitFor(() => expect(onClaimedTask).toHaveBeenCalledWith('task-1'));
  });

  it('blocks invalid custom claim counts before requesting the API', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/labels/my-tasks') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            items: [],
            summary: { total_tasks: 0, active_tasks: 0, submitted_questions: 0, pending_questions: 0, rejected_questions: 0 },
          },
          request_id: 'req-my-tasks',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      if (url.pathname === '/api/v1/labels/tasks/task-1/qualification-check') {
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            task_id: 'task-1',
            eligible: true,
            qualification_required: 'none',
            checks: [{ key: 'domain', label: '领域资质', required: 'none', actual: 'approved', passed: true, message: '无需领域资质' }],
            failed_checks: [],
            summary: '满足领取条件',
          },
          request_id: 'req-check',
          timestamp: '2026-05-29T00:00:00Z',
        }), { status: 200 });
      }
      return new Response(JSON.stringify(smallRemainderTaskResponse), { status: 200 });
    });

    render(<TaskSquarePage session={labelerSession} onOpenLogin={vi.fn()} />);

    await user.click(await screen.findByText('真实接口任务'));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('本任务无需额外签署协议')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await user.type(await screen.findByPlaceholderText('最多 10 条'), '11');

    expect(await screen.findByText('接单条数不能超过剩余 10 条。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '接单' })).toBeDisabled();
  });
});
