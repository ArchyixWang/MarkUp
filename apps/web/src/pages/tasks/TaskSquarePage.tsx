import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button, Card, Checkbox, Drawer, Empty, Input, InputNumber, Pagination, Popover, Segmented, Select, Spin, Steps, Tag, notification } from 'antd';
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Filter,
  Flame,
  Grid2X2,
  List,
  Search,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import { isLabelerSession, isTeamLabelerUser } from '../../app/workspaceAccess';
import type { AuthSession } from '../../stores/authStore';
import type { PublicTask, TaskQualification, TaskQualificationCheckPayload } from '../../types/api';
import { ApiClientError } from '../../services/apiClient';
import { checkTaskQualification, claimTaskBundle, getMyLabelingTasks, getPublicTasks } from '../../services/taskService';
import './TaskSquarePage.css';

type QuickFilter = 'all' | 'recommended' | 'highReward' | 'deadlineSoon' | 'easyStart' | 'new';
type SortMode = 'recommended' | 'unitDesc' | 'deadlineAsc' | 'newest' | 'availableDesc';
type UnitRange = 'all' | 'under3' | '3to5' | '6plus';
type DeadlineRange = 'all' | 'within7' | 'within14' | 'later';
type TeamFilter = 'all' | 'verified' | 'unverified';
type ViewMode = 'card' | 'list';
type FilterPopoverId = 'category' | 'difficulty' | 'qualification' | 'unit' | 'more';
type PageSize = 6 | 12 | 24;
type TagTone = 'neutral' | 'brand' | 'warning' | 'danger' | 'success' | 'info';
type ClaimStep = 0 | 1 | 2;

const categoryLabels: Record<PublicTask['category'], string> = {
  text: '文本',
  image: '图像',
  audio: '音频',
  multimodal: '多模态',
};

const difficultyLabels: Record<PublicTask['difficulty'], string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const statusLabels: Record<PublicTask['status'], string> = {
  open: '可接单',
  in_progress: '进行中',
  closed: '已关闭',
};

const qualificationLabels: Record<TaskQualification, string> = {
  none: '无需资质',
  law: '法律资质',
  medical: '医疗资质',
  finance: '金融资质',
  code: '代码能力',
  autonomous_driving: '自动驾驶',
  audio: '语音经验',
  fact_check: '事实核查',
};

const quickFilters: Array<{ id: QuickFilter; label: string; icon: typeof Sparkles }> = [
  { id: 'all', label: '全部', icon: SlidersHorizontal },
  { id: 'recommended', label: '推荐', icon: Sparkles },
  { id: 'highReward', label: '单价高', icon: Flame },
  { id: 'deadlineSoon', label: '即将截止', icon: CalendarClock },
  { id: 'easyStart', label: '低门槛', icon: Sparkles },
  { id: 'new', label: '新发布', icon: Timer },
];

const unitRangeLabels: Record<UnitRange, string> = {
  all: '全部',
  under3: '3 以下',
  '3to5': '3-5',
  '6plus': '6 以上',
};

const deadlineRangeLabels: Record<DeadlineRange, string> = {
  all: '全部',
  within7: '7 天内',
  within14: '14 天内',
  later: '更晚',
};

const teamFilterLabels: Record<TeamFilter, string> = {
  all: '全部',
  verified: '认证企业',
  unverified: '普通企业',
};

const sortModeLabels: Record<SortMode, string> = {
  recommended: '综合推荐',
  unitDesc: '单价最高',
  deadlineAsc: '截止最近',
  newest: '最新发布',
  availableDesc: '可分配最多',
};

const pageSizeOptions: PageSize[] = [6, 12, 24];

interface TaskSquarePageProps {
  session: AuthSession | null;
  onOpenLogin: (mode: 'login' | 'register') => void;
  onClaimedTask?: (taskId: string) => void;
}

function daysUntil(date?: string | null, deadlineMode?: string | null): number | null {
  if (deadlineMode === 'long_term' || !date) return null;
  const day = new Date(`${date}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((day.getTime() - today.getTime()) / 86_400_000);
}

function deadlineText(task: PublicTask): string {
  const remainingDays = daysUntil(task.deadline, task.deadline_mode);
  if (remainingDays === null) return '长期有效';
  return remainingDays <= 0 ? '今日' : `${remainingDays} 天`;
}

function unitText(task: PublicTask): string {
  return `${task.unit_points} 积分/条`;
}

function bundleSummary(task: PublicTask): string {
  const bundles = normalizedBundleOptions(task);
  const visible = bundles.slice(0, 3).join(' / ');
  return bundles.length > 3 ? `可接 ${visible} 等` : `可接 ${visible} 条`;
}

function firstAvailableBundle(task: PublicTask): number {
  return normalizedBundleOptions(task)[0] ?? task.available_items;
}

function priorityTag(task: PublicTask) {
  if (task.priority === 'recommended') return <MarketTag tone="brand">推荐</MarketTag>;
  if (task.priority === 'urgent') return <MarketTag tone="danger">紧急</MarketTag>;
  if (task.priority === 'new') return <MarketTag tone="info">新发布</MarketTag>;
  return null;
}

function qualificationTone(qualification: TaskQualification): 'neutral' | 'brand' | 'warning' {
  if (qualification === 'none') return 'neutral';
  if (qualification === 'medical' || qualification === 'law') return 'warning';
  return 'brand';
}

export function TaskSquarePage({ session, onOpenLogin, onClaimedTask }: TaskSquarePageProps) {
  const initialKeyword = new URLSearchParams(window.location.search).get('keyword')?.trim() ?? '';
  const [keyword, setKeyword] = useState(initialKeyword);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [category, setCategory] = useState<PublicTask['category'] | 'all'>('all');
  const [difficulty, setDifficulty] = useState<PublicTask['difficulty'] | 'all'>('all');
  const [unitRange, setUnitRange] = useState<UnitRange>('all');
  const [deadlineRange, setDeadlineRange] = useState<DeadlineRange>('all');
  const [qualification, setQualification] = useState<TaskQualification | 'all'>('all');
  const [status, setStatus] = useState<PublicTask['status'] | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [selectedTag, setSelectedTag] = useState('all');
  const [tagQuery, setTagQuery] = useState('');
  const [openFilterPopover, setOpenFilterPopover] = useState<FilterPopoverId | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PublicTask | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<number | null>(null);
  const [customBundleInput, setCustomBundleInput] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [claimStep, setClaimStep] = useState<ClaimStep>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(6);
  const [tasks, setTasks] = useState<PublicTask[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [qualificationCheck, setQualificationCheck] = useState<TaskQualificationCheckPayload | null>(null);
  const [checkingQualification, setCheckingQualification] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [claimedTaskIds, setClaimedTaskIds] = useState<Set<string>>(() => new Set());
  const [noticeApi, noticeContext] = notification.useNotification();
  const isTeamLabeler = Boolean(session && isTeamLabelerUser(session.user));
  const sessionTeamId = session?.user.team_id || session?.user.default_team_id || undefined;
  const visibleQuickFilters = quickFilters;

  useEffect(() => {
    if (!quickFilters.some((filter) => filter.id === quickFilter)) setQuickFilter('all');
  }, [isTeamLabeler, quickFilter]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    tasks.forEach((task) => task.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return counts;
  }, [tasks]);

  const recommendedTags = useMemo(() => {
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 5)
      .map(([tag]) => tag);
  }, [tagCounts]);

  const tagOptions = useMemo(() => {
    const query = tagQuery.trim().toLowerCase();
    if (!query) return recommendedTags;
    return Array.from(tagCounts.keys())
      .filter((tag) => tag.toLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .slice(0, 8);
  }, [recommendedTags, tagCounts, tagQuery]);

  const hasActiveFilters =
    keyword.trim() ||
    quickFilter !== 'all' ||
    category !== 'all' ||
    difficulty !== 'all' ||
    unitRange !== 'all' ||
    deadlineRange !== 'all' ||
    qualification !== 'all' ||
    status !== 'all' ||
    teamFilter !== 'all' ||
    selectedTag !== 'all';

  const visibleSelectedTask = selectedTask && tasks.some((task) => task.task_id === selectedTask.task_id) ? selectedTask : null;
  const canUseLabelingActions = Boolean(session && isLabelerSession(session));
  const selectedTaskClaimed = visibleSelectedTask ? claimedTaskIds.has(visibleSelectedTask.task_id) : false;
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = totalItems === 0 ? 0 : pageStart + tasks.length - 1;
  const appliedFilters = [
    category !== 'all' ? { id: 'category', label: `类型: ${categoryLabels[category]}`, onClear: () => { setCategory('all'); setCurrentPage(1); } } : null,
    difficulty !== 'all' ? { id: 'difficulty', label: `难度: ${difficultyLabels[difficulty]}`, onClear: () => { setDifficulty('all'); setCurrentPage(1); } } : null,
    qualification !== 'all' ? { id: 'qualification', label: `资质: ${qualificationLabels[qualification]}`, onClear: () => { setQualification('all'); setCurrentPage(1); } } : null,
    unitRange !== 'all' ? { id: 'unit', label: `单价: ${unitRangeLabels[unitRange]}`, onClear: () => { setUnitRange('all'); setCurrentPage(1); } } : null,
    deadlineRange !== 'all' ? { id: 'deadline', label: `截止: ${deadlineRangeLabels[deadlineRange]}`, onClear: () => { setDeadlineRange('all'); setCurrentPage(1); } } : null,
    status !== 'all' ? { id: 'status', label: `状态: ${statusLabels[status]}`, onClear: () => { setStatus('all'); setCurrentPage(1); } } : null,
    teamFilter !== 'all' ? { id: 'team', label: `企业: ${teamFilterLabels[teamFilter]}`, onClear: () => { setTeamFilter('all'); setCurrentPage(1); } } : null,
    selectedTag !== 'all' ? { id: 'tag', label: `标签: ${selectedTag}`, onClear: () => { setSelectedTag('all'); setCurrentPage(1); } } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; onClear: () => void }>;

  const activeFilterCount = appliedFilters.length + (quickFilter !== 'all' ? 1 : 0);

  function resetFilters() {
    setKeyword('');
    setQuickFilter('all');
    setCategory('all');
    setDifficulty('all');
    setUnitRange('all');
    setDeadlineRange('all');
    setQualification('all');
    setStatus('all');
    setTeamFilter('all');
    setSelectedTag('all');
    setTagQuery('');
    setOpenFilterPopover(null);
    setCurrentPage(1);
  }

  function resetMoreFilters() {
    setDeadlineRange('all');
    setStatus('all');
    setTeamFilter('all');
    setSelectedTag('all');
    setTagQuery('');
    setCurrentPage(1);
  }

  function toggleFilterPopover(id: FilterPopoverId) {
    setOpenFilterPopover((current) => (current === id ? null : id));
  }

  function setFilterPopoverOpen(id: FilterPopoverId, open: boolean) {
    setOpenFilterPopover(open ? id : null);
  }

  function changeKeyword(value: string) {
    setKeyword(value);
    setCurrentPage(1);
  }

  function changeQuickFilter(value: QuickFilter) {
    setQuickFilter(value);
    setCurrentPage(1);
  }

  function changeSortMode(value: SortMode) {
    setSortMode(value);
    setCurrentPage(1);
  }

  function changePageSize(value: PageSize) {
    setPageSize(value);
    setCurrentPage(1);
  }

  const openTask = useCallback((task: PublicTask) => {
    setSelectedTask(task);
    setSelectedBundle(firstAvailableBundle(task));
    setCustomBundleInput('');
    setAgreementAccepted(false);
    setClaimStep(0);
    setAcceptError(null);
    setQualificationCheck(null);
  }, []);

  async function handleAccept() {
    if (!session) {
      onOpenLogin('login');
      return;
    }
    if (!canUseLabelingActions) {
      noticeApi.info({
        message: '请使用标注员账号领取任务',
        description: '企业工作台账号可以浏览任务市场，但接单和批注需要切换到标注员身份。',
        duration: 5,
        placement: 'topRight',
      });
      return;
    }
    if (!visibleSelectedTask || !selectedBundle) return;
    if (claimedTaskIds.has(visibleSelectedTask.task_id)) return;
    if (qualificationCheck && !qualificationCheck.eligible) {
      const basicInfoBlocker = qualificationCheck.failed_checks.find((item) => item.key === 'basic_info');
      const message = basicInfoBlocker
        ? '请先完成基础信息'
        : '暂不满足领取条件';
      const description = basicInfoBlocker
        ? '基础信息需填写完整并通过平台审核后，才可以接取任务。'
        : qualificationCheck.summary || '请查看领取资格检查项，补充对应材料后再试。';
      noticeApi.warning({ message, description, duration: 5, placement: 'topRight' });
      return;
    }
    const bundleError = validateBundleSize(visibleSelectedTask, selectedBundle);
    if (bundleError) {
      setAcceptError(bundleError);
      return;
    }
    const safeBundleSize = selectedBundle;
    if (visibleSelectedTask.agreement_config?.required && !agreementAccepted) {
      setClaimStep(1);
      setAcceptError('请先阅读并勾选同意任务用户协议');
      return;
    }
    setAcceptError(null);
    try {
      await claimTaskBundle(visibleSelectedTask.task_id, safeBundleSize, agreementAccepted, isTeamLabeler ? sessionTeamId : undefined);
      const claimedTaskId = visibleSelectedTask.task_id;
      setClaimedTaskIds((current) => new Set(current).add(claimedTaskId));
      closeDrawer();
      onClaimedTask?.(claimedTaskId);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 42203 && visibleSelectedTask) {
        const claimedTaskId = visibleSelectedTask.task_id;
        setClaimedTaskIds((current) => new Set(current).add(claimedTaskId));
        closeDrawer();
        onClaimedTask?.(claimedTaskId);
        return;
      }
      const errorMessage = err instanceof ApiClientError ? err.message : '接单失败，请稍后重试';
      noticeApi.error({
        message: errorMessage.includes('基础信息') ? '请先完成基础信息' : '接单失败',
        description: errorMessage.includes('基础信息') ? '请到工作台的基础信息页提交资料，待平台管理员审核通过后再接取任务。' : errorMessage,
        duration: 5,
        placement: 'topRight',
      });
      setAcceptError(errorMessage);
    }
  }

  function closeDrawer() {
    setSelectedTask(null);
    setSelectedBundle(null);
    setCustomBundleInput('');
    setAgreementAccepted(false);
    setClaimStep(0);
  }

  useEffect(() => {
    if (!visibleSelectedTask) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDrawer();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visibleSelectedTask]);

  useEffect(() => {
    if (!canUseLabelingActions) {
      const timer = window.setTimeout(() => setClaimedTaskIds(new Set()), 0);
      return () => window.clearTimeout(timer);
    }
    let ignore = false;
    void getMyLabelingTasks()
      .then((data) => {
        if (!ignore) setClaimedTaskIds(new Set(data.items.map((item) => item.task.task_id)));
      })
      .catch(() => {
        if (!ignore) setClaimedTaskIds(new Set());
      });
    return () => {
      ignore = true;
    };
  }, [canUseLabelingActions]);

  useEffect(() => {
    if (!initialKeyword) return;
    if (visibleSelectedTask) return;
    const matchedTask = tasks.find((task) => task.task_id === initialKeyword);
    if (matchedTask) openTask(matchedTask);
  }, [initialKeyword, openTask, tasks, visibleSelectedTask]);

  useEffect(() => {
    if (!visibleSelectedTask || !canUseLabelingActions) return undefined;
    if (claimedTaskIds.has(visibleSelectedTask.task_id)) {
      const timer = window.setTimeout(() => {
        setQualificationCheck(null);
        setCheckingQualification(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let ignore = false;
    const timer = window.setTimeout(() => {
      setCheckingQualification(true);
      setQualificationCheck(null);
      void checkTaskQualification(visibleSelectedTask.task_id, isTeamLabeler ? sessionTeamId : undefined)
        .then((data) => {
          if (!ignore) setQualificationCheck(data);
        })
        .catch((err) => {
          if (!ignore) setAcceptError(err instanceof ApiClientError ? err.message : '资质检查失败，请稍后重试');
        })
        .finally(() => {
          if (!ignore) setCheckingQualification(false);
        });
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [canUseLabelingActions, claimedTaskIds, isTeamLabeler, sessionTeamId, visibleSelectedTask]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (category !== 'all') params.set('category', category);
    if (difficulty !== 'all') params.set('difficulty', difficulty);
    if (qualification !== 'all') params.set('qualification_required', qualification);
    if (status !== 'all') params.set('status', status);
    if (teamFilter !== 'all') params.set('team_verified', teamFilter === 'verified' ? 'true' : 'false');
    if (selectedTag !== 'all') params.set('tag', selectedTag);
    if (unitRange !== 'all') params.set('unit_range', unitRange);
    if (deadlineRange !== 'all') params.set('deadline_range', deadlineRange);
    if (quickFilter !== 'all') params.set('quick_filter', quickFilter);
    params.set('sort', sortMode);
    params.set('page', String(currentPage));
    params.set('page_size', String(pageSize));

    let ignore = false;

    async function loadTasks() {
      setLoadingTasks(true);
      setTaskError(null);
      try {
        const data = await getPublicTasks(params, isTeamLabeler ? sessionTeamId : undefined);
        if (ignore) return;
        setTasks(data.items);
        setTotalItems(data.pagination.total);
        setTotalPages(Math.max(1, data.pagination.total_pages));
      } catch (err) {
        if (ignore) return;
        setTasks([]);
        setTotalItems(0);
        setTotalPages(1);
        setTaskError(err instanceof ApiClientError ? err.message : '任务列表加载失败');
      } finally {
        if (!ignore) setLoadingTasks(false);
      }
    }

    void loadTasks();

    return () => {
      ignore = true;
    };
  }, [category, currentPage, deadlineRange, difficulty, isTeamLabeler, keyword, pageSize, qualification, quickFilter, reloadKey, selectedTag, sessionTeamId, sortMode, status, teamFilter, unitRange]);

  return (
    <div className="task-square">
      {noticeContext}
      <section className="task-market-hero" aria-labelledby="task-market-title">
        <div className="task-market-copy">
          <p className="task-market-kicker">Task Marketplace</p>
          <h1 id="task-market-title">任务广场</h1>
        </div>
      </section>

      <section className="task-market-toolbar" aria-label="任务搜索和筛选">
        <div className="command-primary-row">
          <Input.Search
            className="command-search"
            aria-label="搜索任务、企业、标签或领域"
            placeholder="搜索任务、企业、标签或领域"
            value={keyword}
            allowClear
            size="large"
            onChange={(event) => changeKeyword(event.target.value)}
            onSearch={changeKeyword}
          />

          <div className="market-sort">
            <Select
              aria-label="排序"
              value={sortMode}
              onChange={(value) => changeSortMode(value)}
              options={(Object.keys(sortModeLabels) as SortMode[]).map((value) => ({ value, label: sortModeLabels[value] }))}
            />
          </div>

          <div className="view-toggle" aria-label="结果视图">
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                { value: 'card', icon: <Grid2X2 aria-hidden="true" /> },
                { value: 'list', icon: <List aria-hidden="true" /> },
              ]}
            />
          </div>

          <Button
            className={`mobile-filter-toggle${mobileFiltersOpen ? ' is-open' : ''}${activeFilterCount ? ' has-active-filters' : ''}`}
            type={mobileFiltersOpen ? 'primary' : 'default'}
            icon={<Filter aria-hidden="true" />}
            aria-expanded={mobileFiltersOpen}
            aria-controls="task-market-mobile-filters"
            onClick={() => {
              setMobileFiltersOpen((open) => !open);
              setOpenFilterPopover(null);
            }}
          >
            {mobileFiltersOpen ? '收起' : activeFilterCount ? `筛选 ${activeFilterCount}` : '筛选'}
          </Button>

          <div className="desktop-more-filter-trigger">
            <FilterTrigger
              title="更多筛选"
              open={openFilterPopover === 'more'}
              onOpenChange={(open) => setFilterPopoverOpen('more', open)}
              trigger={(
                <CompactFilterButton
                  label="更多"
                  value="筛选"
                  icon={<Filter aria-hidden="true" />}
                  active={openFilterPopover === 'more' || deadlineRange !== 'all' || status !== 'all' || teamFilter !== 'all' || selectedTag !== 'all'}
                  onClick={() => toggleFilterPopover('more')}
                />
              )}
            >
              <MoreFiltersPanel
                deadlineRange={deadlineRange}
                status={status}
                teamFilter={teamFilter}
                selectedTag={selectedTag}
                tagQuery={tagQuery}
                tagOptions={tagOptions}
                onDeadlineChange={(value) => { setDeadlineRange(value); setCurrentPage(1); }}
                onStatusChange={(value) => { setStatus(value); setCurrentPage(1); }}
                onTeamChange={(value) => { setTeamFilter(value); setCurrentPage(1); }}
                onTagQueryChange={setTagQuery}
                onTagChange={(value) => { setSelectedTag(value); setCurrentPage(1); }}
                onReset={resetMoreFilters}
                onClose={() => setOpenFilterPopover(null)}
              />
            </FilterTrigger>
          </div>

          <span className="toolbar-result-count">{loadingTasks ? '加载中' : `${totalItems} 个任务`}</span>
        </div>

        <div
          id="task-market-mobile-filters"
          className={`command-filter-row${mobileFiltersOpen ? ' is-open' : ''}`}
          aria-label="任务筛选"
        >
          <div className="mobile-filter-panel-head">
            <div className="market-sort mobile-sort">
              <Select
                aria-label="排序"
                value={sortMode}
                onChange={(value) => changeSortMode(value)}
                options={(Object.keys(sortModeLabels) as SortMode[]).map((value) => ({ value, label: sortModeLabels[value] }))}
              />
            </div>
            <FilterTrigger
              title="更多筛选"
              open={openFilterPopover === 'more'}
              onOpenChange={(open) => setFilterPopoverOpen('more', open)}
              trigger={(
                <CompactFilterButton
                  label="更多"
                  value="筛选"
                  icon={<Filter aria-hidden="true" />}
                  active={openFilterPopover === 'more' || deadlineRange !== 'all' || status !== 'all' || teamFilter !== 'all' || selectedTag !== 'all'}
                  onClick={() => toggleFilterPopover('more')}
                />
              )}
            >
              <MoreFiltersPanel
                deadlineRange={deadlineRange}
                status={status}
                teamFilter={teamFilter}
                selectedTag={selectedTag}
                tagQuery={tagQuery}
                tagOptions={tagOptions}
                onDeadlineChange={(value) => { setDeadlineRange(value); setCurrentPage(1); }}
                onStatusChange={(value) => { setStatus(value); setCurrentPage(1); }}
                onTeamChange={(value) => { setTeamFilter(value); setCurrentPage(1); }}
                onTagQueryChange={setTagQuery}
                onTagChange={(value) => { setSelectedTag(value); setCurrentPage(1); }}
                onReset={resetMoreFilters}
                onClose={() => setOpenFilterPopover(null)}
              />
            </FilterTrigger>
          </div>
          <div className="compact-filter-bar">
            <FilterTrigger
              title="任务类型"
              open={openFilterPopover === 'category'}
              onOpenChange={(open) => setFilterPopoverOpen('category', open)}
              trigger={<CompactFilterButton label="类型" value={category === 'all' ? '全部' : categoryLabels[category]} active={category !== 'all'} onClick={() => toggleFilterPopover('category')} />}
            >
              <FilterOption active={category === 'all'} onClick={() => { setCategory('all'); setCurrentPage(1); setOpenFilterPopover(null); }}>全部类型</FilterOption>
              {(['text', 'image', 'audio', 'multimodal'] as const).map((value) => (
                <FilterOption active={category === value} onClick={() => { setCategory(value); setCurrentPage(1); setOpenFilterPopover(null); }} key={value}>{categoryLabels[value]}</FilterOption>
              ))}
            </FilterTrigger>
            <FilterTrigger
              title="任务难度"
              open={openFilterPopover === 'difficulty'}
              onOpenChange={(open) => setFilterPopoverOpen('difficulty', open)}
              trigger={<CompactFilterButton label="难度" value={difficulty === 'all' ? '全部' : difficultyLabels[difficulty]} active={difficulty !== 'all'} onClick={() => toggleFilterPopover('difficulty')} />}
            >
              <FilterOption active={difficulty === 'all'} onClick={() => { setDifficulty('all'); setCurrentPage(1); setOpenFilterPopover(null); }}>全部难度</FilterOption>
              {(['easy', 'medium', 'hard'] as const).map((value) => (
                <FilterOption active={difficulty === value} onClick={() => { setDifficulty(value); setCurrentPage(1); setOpenFilterPopover(null); }} key={value}>{difficultyLabels[value]}</FilterOption>
              ))}
            </FilterTrigger>
            <FilterTrigger
              title="领域资质"
              open={openFilterPopover === 'qualification'}
              onOpenChange={(open) => setFilterPopoverOpen('qualification', open)}
              trigger={<CompactFilterButton label="资质" value={qualification === 'all' ? '全部' : qualificationLabels[qualification]} active={qualification !== 'all'} onClick={() => toggleFilterPopover('qualification')} />}
            >
              <FilterOption active={qualification === 'all'} onClick={() => { setQualification('all'); setCurrentPage(1); setOpenFilterPopover(null); }}>全部资质</FilterOption>
              {(Object.keys(qualificationLabels) as TaskQualification[]).map((value) => (
                <FilterOption active={qualification === value} onClick={() => { setQualification(value); setCurrentPage(1); setOpenFilterPopover(null); }} key={value}>{qualificationLabels[value]}</FilterOption>
              ))}
            </FilterTrigger>
            <FilterTrigger
              title="积分单价"
              open={openFilterPopover === 'unit'}
              onOpenChange={(open) => setFilterPopoverOpen('unit', open)}
              trigger={<CompactFilterButton label="单价" value={unitRangeLabels[unitRange]} active={unitRange !== 'all'} onClick={() => toggleFilterPopover('unit')} />}
            >
              {(Object.keys(unitRangeLabels) as UnitRange[]).map((value) => (
                <FilterOption active={unitRange === value} onClick={() => { setUnitRange(value); setCurrentPage(1); setOpenFilterPopover(null); }} key={value}>{unitRangeLabels[value]}</FilterOption>
              ))}
            </FilterTrigger>
          </div>

          <div className="quick-filter-strip" aria-label="快捷筛选">
            {visibleQuickFilters.map((filter) => {
              const Icon = filter.icon;
              return (
                <FilterChip active={quickFilter === filter.id} onClick={() => changeQuickFilter(filter.id)} key={filter.id}>
                  <Icon aria-hidden="true" />
                  {filter.label}
                </FilterChip>
              );
            })}
          </div>

          <AppliedFilterChips filters={appliedFilters} onClearAll={resetFilters} showClearAll={Boolean(hasActiveFilters)} />
        </div>

      </section>

      <main className={tasks.length === 0 || loadingTasks || taskError ? 'task-market-main task-market-main--empty' : 'task-market-main'}>
        {taskError ? (
          <MarketEmpty
            className="empty-state"
            title="任务列表加载失败"
            description={taskError}
            action={<Button onClick={() => { setCurrentPage(1); setReloadKey((key) => key + 1); }}>重新加载</Button>}
          />
        ) : loadingTasks ? (
          <div className="empty-state task-market-loading" role="status" aria-live="polite">
            <Spin size="large">
              <div className="task-market-loading-placeholder" aria-hidden="true" />
            </Spin>
          </div>
        ) : tasks.length === 0 ? (
          <MarketEmpty
            className="empty-state"
            title="没有符合条件的任务"
            description="调整关键词、快捷筛选或更多筛选后再试。"
            action={
              <div className="empty-state-actions">
                <Button onClick={resetFilters}>清空筛选</Button>
                <div className="empty-state-suggestions">
                  <span>试试热门分类：</span>
                  {(['text', 'image', 'audio'] as const).map((cat) => (
                    <Button size="small" key={cat} className="empty-suggestion-chip" onClick={() => { resetFilters(); setCategory(cat); }}>
                      {categoryLabels[cat]}
                    </Button>
                  ))}
                </div>
              </div>
            }
          />
        ) : viewMode === 'card' ? (
          <div className="task-grid">
            {tasks.map((task) => (
              <TaskCard task={task} onOpenDetails={() => openTask(task)} key={task.task_id} />
            ))}
          </div>
        ) : (
          <TaskListTable tasks={tasks} onOpenDetails={openTask} />
        )}
      </main>

      {totalItems > 0 && (
        <PaginationBar
          currentPage={safeCurrentPage}
          pageSize={pageSize}
          pageStart={pageStart}
          pageEnd={pageEnd}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={changePageSize}
        />
      )}

      {visibleSelectedTask && (
        <TaskDetailDrawer
          task={visibleSelectedTask}
          session={session}
          selectedBundle={selectedBundle}
          customBundleInput={customBundleInput}
          onBundleChange={setSelectedBundle}
          onCustomBundleInputChange={setCustomBundleInput}
          onAccept={handleAccept}
          agreementAccepted={agreementAccepted}
          onAgreementAcceptedChange={setAgreementAccepted}
          claimStep={claimStep}
          onClaimStepChange={setClaimStep}
          onLoginRequired={() => onOpenLogin('login')}
          acceptError={acceptError}
          qualificationCheck={qualificationCheck}
          checkingQualification={checkingQualification}
          alreadyClaimed={selectedTaskClaimed}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}

function MarketTag({ tone, children }: { tone: TagTone; children: ReactNode }) {
  const colorMap: Record<TagTone, string | undefined> = {
    neutral: undefined,
    brand: 'blue',
    warning: 'gold',
    danger: 'red',
    success: 'green',
    info: 'cyan',
  };
  return <Tag color={colorMap[tone]}>{children}</Tag>;
}

function MarketEmpty({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span className="market-empty-copy">{title}{description ? `，${description}` : ''}</span>}
      />
      {action}
    </div>
  );
}

function CompactFilterButton({
  label,
  value,
  active,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button type="default" className={active ? 'compact-filter active' : 'compact-filter'} onClick={onClick} aria-expanded={active}>
      {icon && <span className="compact-filter-icon">{icon}</span>}
      <span className="compact-filter-label">{label}</span>
      <strong>{value}</strong>
      <ChevronDown aria-hidden="true" />
    </Button>
  );
}

function AppliedFilterChips({
  filters,
  showClearAll,
  onClearAll,
}: {
  filters: Array<{ id: string; label: string; onClear: () => void }>;
  showClearAll: boolean;
  onClearAll: () => void;
}) {
  if (!showClearAll) {
    return <span className="applied-filter-placeholder">当前展示全部任务</span>;
  }

  return (
    <div className="applied-filter-strip" aria-label="已选筛选">
      {filters.map((filter) => (
        <Button size="small" className="applied-filter-chip" onClick={filter.onClear} key={filter.id}>
          {filter.label}
          <X aria-hidden="true" />
        </Button>
      ))}
      <Button size="small" type="link" className="clear-all-filter" onClick={onClearAll}>清空筛选</Button>
    </div>
  );
}

function FilterTrigger({ title, open, onOpenChange, trigger, children }: { title: string; open: boolean; onOpenChange: (open: boolean) => void; trigger: ReactNode; children: ReactNode }) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomLeft"
      title={title}
      content={<div className="filter-option-list">{children}</div>}
    >
      <span className="filter-trigger">{trigger}</span>
    </Popover>
  );
}

function FilterOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type={active ? 'primary' : 'text'} className={active ? 'filter-option active' : 'filter-option'} onClick={onClick}>
      <span>{children}</span>
      {active && <BadgeCheck aria-hidden="true" />}
    </Button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="default" className={active ? 'filter-chip active' : 'filter-chip'} onClick={onClick}>
      {children}
    </Button>
  );
}

function PaginationBar({
  currentPage,
  pageSize,
  pageStart,
  pageEnd,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  pageSize: PageSize;
  pageStart: number;
  pageEnd: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}) {
  return (
    <nav className="pagination-bar" aria-label="任务分页">
      <div className="pagination-range">
        第 <strong>{pageStart}-{pageEnd}</strong> 条 / 共 <strong>{totalItems}</strong> 条
      </div>
      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={totalItems}
        pageSizeOptions={pageSizeOptions.map(String)}
        showSizeChanger
        onChange={(page, nextPageSize) => {
          if (nextPageSize !== pageSize) onPageSizeChange(nextPageSize as PageSize);
          else onPageChange(page);
        }}
      />
    </nav>
  );
}

function MoreFiltersPanel({
  deadlineRange,
  status,
  teamFilter,
  selectedTag,
  tagQuery,
  tagOptions,
  onDeadlineChange,
  onStatusChange,
  onTeamChange,
  onTagQueryChange,
  onTagChange,
  onReset,
  onClose,
}: {
  deadlineRange: DeadlineRange;
  status: PublicTask['status'] | 'all';
  teamFilter: TeamFilter;
  selectedTag: string;
  tagQuery: string;
  tagOptions: string[];
  onDeadlineChange: (value: DeadlineRange) => void;
  onStatusChange: (value: PublicTask['status'] | 'all') => void;
  onTeamChange: (value: TeamFilter) => void;
  onTagQueryChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
      <div className="more-filter-panel" role="dialog" aria-label="更多筛选">
        <div className="more-filter-head">
          <strong>更多筛选</strong>
          <Button aria-label="关闭更多筛选" icon={<X aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="more-filter-grid">
          <div className="more-filter-group">
            <span>截止周期</span>
            <Segmented value={deadlineRange} onChange={(value) => onDeadlineChange(value as DeadlineRange)} options={(Object.keys(deadlineRangeLabels) as DeadlineRange[]).map((value) => ({ value, label: deadlineRangeLabels[value] }))} />
          </div>
          <div className="more-filter-group">
            <span>任务状态</span>
            <Segmented value={status} onChange={(value) => onStatusChange(value as PublicTask['status'] | 'all')} options={[{ value: 'all', label: '全部' }, ...(['open', 'in_progress', 'closed'] as const).map((value) => ({ value, label: statusLabels[value] }))]} />
          </div>
          <div className="more-filter-group">
            <span>企业类型</span>
            <Segmented value={teamFilter} onChange={(value) => onTeamChange(value as TeamFilter)} options={(Object.keys(teamFilterLabels) as TeamFilter[]).map((value) => ({ value, label: teamFilterLabels[value] }))} />
          </div>
        </div>
        <div className="tag-search-block">
          <span>标签搜索</span>
          <Input value={tagQuery} placeholder="输入标签关键词" allowClear onChange={(event) => onTagQueryChange(event.target.value)} />
          {selectedTag !== 'all' && (
            <Button size="small" className="selected-tag-row" onClick={() => onTagChange('all')}>
              已选: {selectedTag}
              <X aria-hidden="true" />
            </Button>
          )}
          <div className="tag-result-list">
            {tagOptions.length === 0 ? (
              <span className="tag-empty">没有匹配标签</span>
            ) : (
              tagOptions.map((tag) => (
                <Button type={selectedTag === tag ? 'primary' : 'text'} className={selectedTag === tag ? 'active' : ''} onClick={() => onTagChange(tag)} key={tag}>
                  {tag}
                </Button>
              ))
            )}
          </div>
        </div>
        <div className="more-filter-actions">
          <Button type="text" onClick={onReset}>清空更多条件</Button>
          <Button type="primary" onClick={onClose}>完成</Button>
        </div>
      </div>
  );
}

function TaskCard({
  task,
  onOpenDetails,
}: {
  task: PublicTask;
  onOpenDetails: () => void;
}) {
  const remainingDays = daysUntil(task.deadline, task.deadline_mode);

  return (
    <Card className="task-card" hoverable size="small" role="button" tabIndex={0} onClick={onOpenDetails} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpenDetails();
      }
    }}>
      <div className="task-card-topline">
        <div className="task-card-badges">
          <MarketTag tone={task.category === 'text' ? 'info' : task.category === 'image' ? 'success' : task.category === 'audio' ? 'warning' : 'brand'}>
            {categoryLabels[task.category]}
          </MarketTag>
          <MarketTag tone={task.difficulty === 'easy' ? 'success' : task.difficulty === 'medium' ? 'warning' : 'danger'}>
            {difficultyLabels[task.difficulty]}
          </MarketTag>
          {priorityTag(task)}
        </div>
        <span className="task-status">{statusLabels[task.status]}</span>
      </div>

      <div className="task-card-body">
        <h3>{task.title}</h3>
        <p>{task.description}</p>
        <div className="task-card-reward">
          <span className="task-reward-value">{task.unit_points} <small>积分/条</small></span>
          <span className="task-reward-bundle">{bundleSummary(task)}</span>
        </div>
      </div>

      <div className="task-team-line">
        <span><Building2 aria-hidden="true" /> {task.owner_team_name ?? '平台任务'}</span>
        {task.team_verified && <span className="verified-team"><BadgeCheck aria-hidden="true" /> 已认证</span>}
      </div>

      <div className="qualification-line">
        <span>资质要求</span>
        <MarketTag tone={qualificationTone(task.qualification_required)}>{qualificationLabels[task.qualification_required]}</MarketTag>
      </div>

      <div className="task-metrics" aria-label="任务关键指标">
        <span><strong className={remainingDays !== null && remainingDays <= 3 && remainingDays >= 0 ? 'deadline-urgent' : ''}>{remainingDays === null ? '长期有效' : remainingDays <= 0 ? '今日截止' : `${remainingDays} 天`}</strong><small>剩余周期</small></span>
        <span><strong>{task.estimated_minutes} 分钟</strong><small>预计耗时</small></span>
      </div>

      <div className="task-tags">
        {task.tags.slice(0, 3).map((tag) => <MarketTag tone="brand" key={tag}>{tag}</MarketTag>)}
        {task.tags.length > 3 && <span className="task-tags-overflow">+{task.tags.length - 3}</span>}
      </div>
    </Card>
  );
}

function TaskListTable({ tasks, onOpenDetails }: { tasks: PublicTask[]; onOpenDetails: (task: PublicTask) => void }) {
  return (
    <EnhancedTable<PublicTask>
      className="task-list-table"
      rowKey="task_id"
      dataSource={tasks}
      pagination={false}
      onRow={(task) => ({ onClick: () => onOpenDetails(task) })}
      columns={[
        {
          title: '任务',
          dataIndex: 'title',
          render: (_, task) => (
            <span className="list-task-title">
              <strong>{task.title}</strong>
              <small>{categoryLabels[task.category]} · {difficultyLabels[task.difficulty]}</small>
            </span>
          ),
        },
        { title: '积分/条', render: (_, task) => <strong>{unitText(task)}</strong> },
        { title: '可接包', render: (_, task) => bundleSummary(task) },
        { title: '资质', render: (_, task) => <MarketTag tone={qualificationTone(task.qualification_required)}>{qualificationLabels[task.qualification_required]}</MarketTag> },
        {
          title: '截止',
            render: (_, task) => {
              const remainingDays = daysUntil(task.deadline, task.deadline_mode);
              return <span className={remainingDays !== null && remainingDays <= 3 && remainingDays >= 0 ? 'deadline-urgent' : ''}>{deadlineText(task)}</span>;
            },
        },
        { title: '企业', render: (_, task) => task.owner_team_name ?? '平台任务' },
        {
          title: '进入',
          render: (_, task) => <Button type="link" onClick={(event) => { event.stopPropagation(); onOpenDetails(task); }}>打开</Button>,
        },
      ]}
    />
  );
}

function TaskDetailDrawer({
  task,
  session,
  selectedBundle,
  customBundleInput,
  onBundleChange,
  onCustomBundleInputChange,
  onAccept,
  agreementAccepted,
  onAgreementAcceptedChange,
  claimStep,
  onClaimStepChange,
  onLoginRequired,
  acceptError,
  qualificationCheck,
  checkingQualification,
  alreadyClaimed,
  onClose,
}: {
  task: PublicTask;
  session: AuthSession | null;
  selectedBundle: number | null;
  customBundleInput: string;
  onBundleChange: (bundle: number) => void;
  onCustomBundleInputChange: (value: string) => void;
  onAccept: () => void | Promise<void>;
  agreementAccepted: boolean;
  onAgreementAcceptedChange: (checked: boolean) => void;
  claimStep: ClaimStep;
  onClaimStepChange: (step: ClaimStep) => void;
  onLoginRequired: () => void;
  acceptError: string | null;
  qualificationCheck: TaskQualificationCheckPayload | null;
  checkingQualification: boolean;
  alreadyClaimed: boolean;
  onClose: () => void;
}) {
  const remainingDays = daysUntil(task.deadline, task.deadline_mode);
  const bundleOptions = normalizedBundleOptions(task);
  const bundleError = validateBundleSize(task, selectedBundle);
  const canAccept = alreadyClaimed || !bundleError;
  const customBundleActive = customBundleInput.trim().length > 0 && selectedBundle !== null && !bundleOptions.includes(selectedBundle);
  const agreementRequired = Boolean(task.agreement_config?.required);
  const effectiveStep = alreadyClaimed ? 0 : claimStep;
  const primaryDisabled =
    alreadyClaimed ||
    (effectiveStep === 1 && agreementRequired && !agreementAccepted) ||
    (effectiveStep === 2 && (!canAccept || checkingQualification));
  const primaryLabel = alreadyClaimed ? '已接取' : !session ? '登录后领取' : effectiveStep < 2 ? '下一步' : checkingQualification ? '检查中...' : '接单';

  function goNext() {
    if (!session) {
      onLoginRequired();
      return;
    }
    if (effectiveStep === 0) {
      onClaimStepChange(1);
      return;
    }
    if (effectiveStep === 1) {
      onClaimStepChange(2);
      return;
    }
    void onAccept();
  }

  return (
    <Drawer
      className="task-detail-drawer"
      rootClassName="task-detail-drawer-root"
      size="large"
      open
      title={task.title}
      onClose={onClose}
      extra={<MarketTag tone="brand">{categoryLabels[task.category]}</MarketTag>}
    >
        <Steps
          className="task-claim-steps"
          current={effectiveStep}
          size="small"
          items={[
            { title: '任务详情' },
            { title: '签署协议' },
            { title: '领取确认' },
          ]}
        />

        {effectiveStep === 0 && (
          <div className="drawer-step-panel agreement-step-panel">
            <div className="drawer-header">
              <div className="task-card-badges">
                <MarketTag tone="brand">{categoryLabels[task.category]}</MarketTag>
                <MarketTag tone={task.difficulty === 'easy' ? 'success' : task.difficulty === 'medium' ? 'warning' : 'danger'}>
                  {difficultyLabels[task.difficulty]}
                </MarketTag>
                <MarketTag tone={qualificationTone(task.qualification_required)}>{qualificationLabels[task.qualification_required]}</MarketTag>
                {priorityTag(task)}
              </div>
              <h2 id="task-detail-title">{task.title}</h2>
              <p>{task.description}</p>
            </div>

            <div className="drawer-metrics">
              <span><strong>{unitText(task)}</strong><small>积分单价</small></span>
              <span><strong>{task.available_items} 条</strong><small>可分配余量</small></span>
              <span><strong>{remainingDays === null ? '长期有效' : remainingDays <= 0 ? '今日截止' : `${remainingDays} 天`}</strong><small>剩余周期</small></span>
              <span><strong>{task.estimated_minutes} 分钟</strong><small>预计耗时</small></span>
            </div>

            {alreadyClaimed && <Alert type="success" showIcon title="已接取该任务" description="该任务已经在我的任务中，可以进入工作台继续批注。" />}
            <section className="drawer-section">
              <h3>交付说明</h3>
              <p>{task.deliverable}</p>
            </section>
            <section className="drawer-section">
              <h3>复核说明</h3>
              <p>{task.review_notes}</p>
            </section>
            {task.completion_hours ? (
              <section className="drawer-section">
                <h3>完成时限</h3>
                <p>领取后需在 {task.completion_hours} 小时内完成并提交。</p>
              </section>
            ) : null}
            <section className="drawer-section">
              <h3>领域资质</h3>
              <p>{qualificationLabels[task.qualification_required]}</p>
            </section>
            <section className="drawer-section">
              <h3>企业信息</h3>
              <p>{task.owner_team_name ?? '平台任务'}{task.team_verified ? ' · 已完成平台认证' : ' · 普通发布企业'}</p>
            </section>
            <section className="drawer-section">
              <h3>任务标签</h3>
              <div className="task-tags">
                {task.tags.map((tag) => <MarketTag tone="brand" key={tag}>{tag}</MarketTag>)}
              </div>
            </section>
          </div>
        )}

        {effectiveStep === 1 && (
          <div className="drawer-step-panel">
            {agreementRequired ? (
              <section className="drawer-section task-claim-agreement">
                <h3>任务用户协议</h3>
                <div className="task-claim-agreement-text">
                  {task.agreement_config?.text || (task.agreement_config?.file_name ? `协议文件：${task.agreement_config.file_name}` : '发布方要求接取任务前同意任务协议。')}
                </div>
                <Checkbox checked={agreementAccepted} onChange={(event) => onAgreementAcceptedChange(event.target.checked)}>
                  我已阅读并同意该任务用户协议
                </Checkbox>
                {!agreementAccepted && <Alert type="warning" showIcon title="勾选后继续" description="该任务要求先签署任务用户协议，签署后才可以进入领取确认。" />}
              </section>
            ) : (
              <Alert type="info" showIcon title="本任务无需额外签署协议" description="发布方未要求单独签署任务用户协议，可以直接进入领取确认。" />
            )}
          </div>
        )}

        {effectiveStep === 2 && (
          <div className="drawer-step-panel">
            <div className="claim-confirm-summary">
              <span><strong>{unitText(task)}</strong><small>积分单价</small></span>
              <span><strong>{task.available_items} 条</strong><small>当前余量</small></span>
              <span><strong>{agreementRequired ? '已签署' : '无需签署'}</strong><small>任务协议</small></span>
            </div>
            <section className="drawer-section">
              <h3>选择接单条数</h3>
              <div className="bundle-options">
                {bundleOptions.map((bundle) => (
                  <Button
                    className={selectedBundle === bundle ? 'bundle-option active' : 'bundle-option'}
                    disabled={bundle > task.available_items}
                    onClick={() => {
                      onBundleChange(bundle);
                      onCustomBundleInputChange('');
                    }}
                    key={bundle}
                  >
                    <strong>{bundle} 条</strong>
                    <small>{bundle * task.unit_points} 积分</small>
                  </Button>
                ))}
              </div>
              <div className={customBundleActive ? 'custom-bundle-field active' : 'custom-bundle-field'}>
                <span>自定义数量</span>
                <InputNumber
                  min={1}
                  step={1}
                  precision={0}
                  value={customBundleInput.trim() ? selectedBundle : null}
                  placeholder={`最多 ${task.available_items} 条`}
                  onChange={(value) => {
                    const next = value === null ? '' : String(value);
                    onCustomBundleInputChange(next);
                    onBundleChange(value !== null && Number.isInteger(value) ? value : 0);
                  }}
                />
              </div>
              {customBundleInput.trim() && bundleError ? <p className="bundle-error">{bundleError}</p> : null}
            </section>
            {session && (
              <section className="drawer-section">
                <h3>领取资格</h3>
                <Alert
                  type={qualificationCheck?.eligible ? 'success' : qualificationCheck ? 'warning' : 'info'}
                  showIcon
                  title={checkingQualification ? '正在检查领取资格' : qualificationCheck?.summary || '领取前检查任务资质'}
                  description={qualificationCheck && (
                    <ul className="qualification-check-list">
                      {qualificationCheck.checks.map((check) => (
                        <li key={check.key} className={check.passed ? 'passed' : 'blocked'}>
                          <strong>{check.label}</strong>
                          <span>{check.passed ? '已满足' : check.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                />
              </section>
            )}
            {acceptError && <Alert className="drawer-error" type="error" showIcon title={acceptError} role="alert" />}
          </div>
        )}

        <div className={effectiveStep === 0 ? 'drawer-actions single-action' : 'drawer-actions'}>
          {effectiveStep > 0 && (
            <Button onClick={() => onClaimStepChange((effectiveStep - 1) as ClaimStep)}>
              上一步
            </Button>
          )}
          <Button type="primary" icon={effectiveStep === 2 ? <Search /> : undefined} disabled={primaryDisabled} onClick={goNext}>
            {primaryLabel}
          </Button>
        </div>
    </Drawer>
  );
}

function normalizedBundleOptions(task: PublicTask): number[] {
  if (task.available_items <= 0) return [];
  const options = task.bundle_options.filter((bundle) => bundle > 0 && bundle <= task.available_items);
  return options.length ? options : [task.available_items];
}

function validateBundleSize(task: PublicTask, bundle: number | null): string | null {
  if (task.available_items <= 0) return '当前任务已无可领取题目。';
  if (!Number.isInteger(bundle) || !bundle || bundle <= 0) return '接单条数必须为大于 0 的整数。';
  if (bundle > task.available_items) return `接单条数不能超过剩余 ${task.available_items} 条。`;
  return null;
}
