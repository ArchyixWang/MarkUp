import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LabelerDashboardPage } from './LabelerDashboardPage';
import { getAdminOverview, getPersonalLabelerDashboard, getTeamLabelerDashboard } from '../../services/workspaceService';
import type { ApiUser, PersonalLabelerDashboardPayload, TeamLabelerDashboardPayload } from '../../types/api';

vi.mock('../../services/workspaceService', () => ({
  getAdminOverview: vi.fn(),
  getTeamLabelerDashboard: vi.fn(),
  getPersonalLabelerDashboard: vi.fn(),
}));

const labelerUser: ApiUser = {
  user_id: 'labeler-1',
  username: 'labeler01',
  display_name: 'Labeler One',
  email: 'labeler@example.com',
  role: 'labeler',
  permissions: ['team:read', 'label:read', 'label:write'],
  default_team_id: 'team-fallback',
  team_id: 'team-fallback',
  team_role: 'labeler',
};

const baseLabeling = {
  total_tasks: 1,
  active_tasks: 1,
  total_questions: 4,
  pending_questions: 2,
  submitted_questions: 1,
  approved_questions: 1,
  rejected_questions: 0,
  completion_percent: 50,
  status_distribution: [{ label: 'Pending', value: 2 }],
  submission_distribution: [{ label: 'Submitted', value: 1 }],
};

const baseQuality = {
  approval_rate: 80,
  rework_rate: 10,
  pending_review: 1,
  reviewed: 3,
  accuracy_rate: 80,
};

const summaryCards = [
  { key: 'assigned', label: 'Assigned Projects', value: 1, status: 'processing' },
  { key: 'pending', label: 'Pending Items', value: 2, status: 'warning' },
];

const baseTask = {
  task: {
    task_id: 'task-1',
    title: 'Company Project',
    description: 'Project description',
    rich_content: null,
    tags: [],
    category: 'text',
    difficulty: 'easy',
    deadline: null,
    reward_rule: { mode: 'item', points_per_item: 5 },
    template_id: 'template-1',
    status: 'published',
    template_version_id: 'template-1:v1',
    stats: { total: 4, claimed: 2, submitted: 1, approved: 1, rejected: 0 },
  },
  progress: {
    total: 4,
    submitted: 1,
    rejected: 0,
    remaining: 2,
    percent: 50,
  },
  latest_question_id: 'question-1',
  last_updated_at: '2026-06-01T00:00:00Z',
  task_submitted: false,
  needs_revision: false,
};

function teamDashboard(overrides: Partial<TeamLabelerDashboardPayload> = {}): TeamLabelerDashboardPayload {
  return {
    viewer_role: 'team_labeler',
    team: { team_id: 'team-fallback', company_name: 'Fallback Team' },
    profile: { user_id: 'labeler-1', username: 'labeler01', display_name: 'Labeler One' },
    summary_cards: summaryCards,
    todo_items: [],
    labeling: baseLabeling,
    quality: baseQuality,
    recent_tasks: [baseTask],
    recent_records: [],
    notifications: [],
    shortcuts: [],
    generated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function personalDashboard(overrides: Partial<PersonalLabelerDashboardPayload> = {}): PersonalLabelerDashboardPayload {
  return {
    viewer_role: 'personal_labeler',
    profile: { user_id: 'labeler-1', username: 'labeler01', display_name: 'Labeler One', reputation_score: 98 },
    summary_cards: [{ key: 'available', label: 'Available Items', value: 2, status: 'processing' }],
    todo_items: [],
    labeling: baseLabeling,
    quality: baseQuality,
    points: {
      wallet: {
        total_points: 100,
        available_points: 80,
        level: 'bronze',
        updated_at: '2026-06-01T00:00:00Z',
      },
      recent_items: [],
    },
    certifications: { items: [] },
    recent_tasks: [],
    recent_records: [],
    recommended_tasks: [],
    shortcuts: [],
    generated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('LabelerDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('falls back to the session team id when admin overview omits teams', async () => {
    vi.mocked(getAdminOverview).mockResolvedValue({ default_team_id: null } as never);
    vi.mocked(getTeamLabelerDashboard).mockResolvedValue(teamDashboard());

    render(
      <LabelerDashboardPage
        user={labelerUser}
        teamLabeler
        onNavigate={vi.fn()}
        onOpenLabelingTask={vi.fn()}
      />,
    );

    await waitFor(() => expect(getTeamLabelerDashboard).toHaveBeenCalledWith('team-fallback'));
    expect(await screen.findByText('Assigned Projects')).toBeInTheDocument();
  });

  it('renders a team labeler dashboard when list fields are omitted', async () => {
    vi.mocked(getAdminOverview).mockResolvedValue({ default_team_id: 'team-fallback', teams: [], team_count: 0, notifications: [] });
    vi.mocked(getTeamLabelerDashboard).mockResolvedValue({
      ...teamDashboard(),
      recent_tasks: undefined,
      recent_records: undefined,
      notifications: undefined,
      shortcuts: undefined,
      todo_items: undefined,
    } as unknown as TeamLabelerDashboardPayload);

    render(
      <LabelerDashboardPage
        user={labelerUser}
        teamLabeler
        onNavigate={vi.fn()}
        onOpenLabelingTask={vi.fn()}
      />,
    );

    expect(await screen.findByText('Assigned Projects')).toBeInTheDocument();
    expect(screen.getByText('Pending Items')).toBeInTheDocument();
  });

  it('renders a personal labeler dashboard when growth fields are omitted', async () => {
    vi.mocked(getPersonalLabelerDashboard).mockResolvedValue({
      ...personalDashboard(),
      points: undefined,
      certifications: undefined,
      recommended_tasks: undefined,
      shortcuts: undefined,
      todo_items: undefined,
    } as unknown as PersonalLabelerDashboardPayload);

    render(
      <LabelerDashboardPage
        user={labelerUser}
        teamLabeler={false}
        onNavigate={vi.fn()}
        onOpenLabelingTask={vi.fn()}
      />,
    );

    expect(await screen.findByText('Available Items')).toBeInTheDocument();
  });
});
