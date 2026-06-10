import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, DoorOpen, PenLine, UsersRound } from 'lucide-react';
import { Alert } from 'antd';
import { AgentAvatar } from '../../components/agent/AgentAvatar';
import { Button, Tag } from '../../components/ui';
import { persistSession, type AuthSession } from '../../stores/authStore';
import { ApiClientError } from '../../services/apiClient';
import { clearAuthReturnTarget } from '../../services/appLink';
import { completeOnboardingRequest, type OnboardingPayload } from '../../services/onboardingService';
import './OnboardingPage.css';

type OnboardingPath = 'entry' | 'requester' | 'labeler' | 'new-org' | 'join-org';

const pathCopy: Record<OnboardingPath, { kicker: string; title: string; description: string }> = {
  entry: {
    kicker: '账号设置',
    title: '选择你在 MarkUp 中的工作方式',
    description: '先确定身份，系统会为你打开对应的工作台入口和权限。',
  },
  requester: {
    kicker: '组织设置',
    title: '连接你的企业工作空间',
    description: '你可以创建新的企业空间，也可以通过邀请码加入已有团队。',
  },
  labeler: {
    kicker: '标注员资料',
    title: '完善标注员资料',
    description: '补充擅长领域和可接任务类型，便于后续参与任务流转。',
  },
  'new-org': {
    kicker: '创建组织',
    title: '创建企业空间',
    description: '填写基础资料后，你可以发布任务、管理成员并推进数据交付。',
  },
  'join-org': {
    kicker: '加入组织',
    title: '通过邀请码加入企业',
    description: '输入团队提供的邀请码，完成后进入对应企业工作台。',
  },
};

const guideSteps = [
  { label: '选择身份', description: '需求方或标注员' },
  { label: '补充资料', description: '完善能力或企业信息' },
  { label: '进入工作台', description: '开始发布、领取或协作' },
];

interface OnboardingPageProps {
  session?: AuthSession;
  onComplete?: (session: AuthSession) => void;
  onOpenAuth?: (mode: 'login' | 'register', returnTarget?: string) => void;
  inviteEntryPath?: string;
}

export function OnboardingPage({ session, onComplete, onOpenAuth, inviteEntryPath }: OnboardingPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteCodeFromSearch = searchParams.get('invite_code')?.trim() ?? '';
  const inviteJoinRequested = searchParams.get('organization_action') === 'join' && Boolean(inviteCodeFromSearch);
  const isAuthenticated = Boolean(session && onComplete);
  const [path, setPath] = useState<OnboardingPath>(() => (isAuthenticated && inviteJoinRequested ? 'join-org' : 'entry'));
  const displayName = session?.user.display_name?.trim() || session?.user.username || session?.user.email || 'MarkUp 用户';
  const [labelerForm, setLabelerForm] = useState({
    domains: '文本分类, 图像标注',
    qualification: '无需资质',
    taskTypes: '文本 / 图像',
    experience: '',
  });
  const [orgForm, setOrgForm] = useState({
    companyName: '',
    industry: '',
    contactName: displayName,
    contactPhone: '',
    businessDescription: '',
    website: '',
    address: '',
  });
  const [inviteCodeDraft, setInviteCodeDraft] = useState(() => ({
    source: inviteCodeFromSearch,
    value: inviteCodeFromSearch,
  }));
  const inviteCode = inviteCodeDraft.source === inviteCodeFromSearch ? inviteCodeDraft.value : inviteCodeFromSearch;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicInvitePath = useMemo(() => {
    if (inviteEntryPath) return inviteEntryPath;
    return inviteCodeFromSearch
      ? `/onboarding?organization_action=join&invite_code=${encodeURIComponent(inviteCodeFromSearch)}`
      : '/onboarding';
  }, [inviteCodeFromSearch, inviteEntryPath]);

  useEffect(() => {
    if (!isAuthenticated || !inviteJoinRequested) return;
    const timer = window.setTimeout(() => setPath('join-org'), 0);
    return () => window.clearTimeout(timer);
  }, [inviteJoinRequested, isAuthenticated]);

  function updateInviteCode(value: string) {
    setInviteCodeDraft({ source: inviteCodeFromSearch, value });
  }

  async function finish(payload: OnboardingPayload) {
    if (!session || !onComplete) return;
    setLoading(true);
    setError(null);
    try {
      const loginPayload = await completeOnboardingRequest(payload);
      const updatedSession = persistSession(loginPayload);
      if ('organization_action' in payload && payload.organization_action === 'join') {
        clearAuthReturnTarget();
      }
      onComplete(updatedSession);
      navigate(updatedSession.user.role === 'pending' ? '/onboarding' : '/workspace', { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '账号设置提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  function submitLabeler(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void finish({
      identity: 'labeler',
      labeler_profile: {
        domains: labelerForm.domains,
        qualification: labelerForm.qualification,
        task_types: labelerForm.taskTypes,
        experience: labelerForm.experience,
      },
    });
  }

  function submitNewOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void finish({
      identity: 'requester',
      organization_action: 'create',
      organization_profile: {
        company_name: orgForm.companyName,
        industry: orgForm.industry,
        contact_name: orgForm.contactName,
        contact_phone: orgForm.contactPhone,
        business_description: orgForm.businessDescription,
        website: orgForm.website,
        address: orgForm.address,
      },
    });
  }

  function submitJoinOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void finish({
      identity: 'requester',
      organization_action: 'join',
      invite_code: inviteCode.trim(),
    });
  }

  if (!isAuthenticated) {
    return (
      <OnboardingShell
        statusLabel="需先认证"
        statusValue={inviteCodeFromSearch || '待填写邀请码'}
        statusIcon={<DoorOpen aria-hidden="true" />}
        guideTitle="继续加入企业空间"
        guideDescription="邀请码已准备好。登录或注册后，MarkUp 会带你回到这里完成加入。"
        activeStep={0}
      >
        <section className="onboarding-public-invite">
          <div className="onboarding-panel-head">
            <p className="section-label">Organization invite</p>
            <h2>通过企业邀请码加入</h2>
            <p>完成认证后继续加入企业，邀请码会自动带入。</p>
          </div>
          <div className="onboarding-public-invite__card">
            <FormHeading
              icon={<DoorOpen />}
              title="先完成账号认证"
              description="登录已有账号，或注册一个新账号后加入企业空间。"
            />
            <div className="onboarding-invite-code">
              <span>企业邀请码</span>
              <strong>{inviteCodeFromSearch || '待填写邀请码'}</strong>
            </div>
            <div className="form-actions onboarding-public-invite__actions">
              <Button variant="ghost" onClick={() => onOpenAuth?.('register', publicInvitePath)}>注册后加入</Button>
              <Button onClick={() => onOpenAuth?.('login', publicInvitePath)}>登录后加入</Button>
            </div>
          </div>
        </section>
      </OnboardingShell>
    );
  }

  const currentCopy = pathCopy[path];
  const activeStep = path === 'labeler' || path === 'new-org' || path === 'join-org' ? 1 : 0;

  return (
    <OnboardingShell
      statusLabel="待分流"
      statusValue={displayName}
      statusIcon={<BadgeCheck aria-hidden="true" />}
      guideTitle="完成账号初始化"
      guideDescription="只需要几步，MarkUp 就能为你匹配合适的工作台入口。"
      activeStep={activeStep}
    >
      <section className="onboarding-main-panel">
        <div className="onboarding-panel-head">
          <p className="section-label">{currentCopy.kicker}</p>
          <h2>{currentCopy.title}</h2>
          <p>{currentCopy.description}</p>
        </div>

        {path === 'entry' && (
          <section className="onboarding-choice-grid" aria-label="选择账号类型">
            <ChoiceCard
              icon={<Building2 aria-hidden="true" />}
              title="我是需求方"
              description="发布任务、管理团队、跟进审核和数据交付。"
              meta="适合企业、团队和项目负责人"
              onClick={() => setPath('requester')}
            />
            <ChoiceCard
              icon={<PenLine aria-hidden="true" />}
              title="我是标注员"
              description="领取任务、完成标注、积累能力资料。"
              meta="适合个人 Labeler 和数据协作者"
              onClick={() => setPath('labeler')}
            />
          </section>
        )}

        {path === 'requester' && (
          <section className="onboarding-choice-wrap">
            <div className="onboarding-choice-grid" aria-label="选择企业方式">
              <ChoiceCard
                icon={<UsersRound aria-hidden="true" />}
                title="登记新公司 / 企业"
                description="创建企业空间，用于发布任务、管理成员和交付数据。"
                meta="我是企业创建者或负责人"
                onClick={() => setPath('new-org')}
              />
              <ChoiceCard
                icon={<DoorOpen aria-hidden="true" />}
                title="加入公司 / 企业"
                description="填写企业邀请码，进入已有团队协作空间。"
                meta="我已经拿到团队邀请码"
                onClick={() => setPath('join-org')}
              />
            </div>
            <Button variant="ghost" onClick={() => setPath('entry')}>返回身份选择</Button>
          </section>
        )}

        {path === 'labeler' && (
          <form className="onboarding-form" onSubmit={submitLabeler}>
            <FormHeading icon={<PenLine />} title="标注员资料设置" description="这些信息会帮助你更快进入合适的标注任务。" />
            <label>擅长领域<input value={labelerForm.domains} onChange={(event) => setLabelerForm({ ...labelerForm, domains: event.target.value })} required /></label>
            <label>资质方向<input value={labelerForm.qualification} onChange={(event) => setLabelerForm({ ...labelerForm, qualification: event.target.value })} required /></label>
            <label>可接任务类型<input value={labelerForm.taskTypes} onChange={(event) => setLabelerForm({ ...labelerForm, taskTypes: event.target.value })} required /></label>
            <label className="form-span"><FieldLabel label="经验说明" optional /><textarea aria-label="经验说明" value={labelerForm.experience} onChange={(event) => setLabelerForm({ ...labelerForm, experience: event.target.value })} placeholder="例如标注经验、行业背景、可投入时间" /></label>
            <div className="form-actions form-span">
              <Button variant="ghost" onClick={() => setPath('entry')}>返回</Button>
              <Button type="submit" disabled={loading}>{loading ? '提交中...' : '完成并进入工作台'}</Button>
            </div>
            <OnboardingErrorAlert error={error} />
          </form>
        )}

        {path === 'new-org' && (
          <form className="onboarding-form" onSubmit={submitNewOrg}>
            <FormHeading icon={<Building2 />} title="公司 / 企业信息完善" description="创建企业空间后，你可以继续配置团队和任务。" />
            <label>公司 / 企业名称<input value={orgForm.companyName} onChange={(event) => setOrgForm({ ...orgForm, companyName: event.target.value })} required minLength={2} /></label>
            <label>行业领域<input value={orgForm.industry} onChange={(event) => setOrgForm({ ...orgForm, industry: event.target.value })} required /></label>
            <label>联系人姓名<input value={orgForm.contactName} onChange={(event) => setOrgForm({ ...orgForm, contactName: event.target.value })} required /></label>
            <label>联系电话<input value={orgForm.contactPhone} onChange={(event) => setOrgForm({ ...orgForm, contactPhone: event.target.value })} required /></label>
            <label><FieldLabel label="官网" optional /><input aria-label="官网" value={orgForm.website} onChange={(event) => setOrgForm({ ...orgForm, website: event.target.value })} /></label>
            <label><FieldLabel label="地址" optional /><input aria-label="地址" value={orgForm.address} onChange={(event) => setOrgForm({ ...orgForm, address: event.target.value })} /></label>
            <label className="form-span">业务说明<textarea value={orgForm.businessDescription} onChange={(event) => setOrgForm({ ...orgForm, businessDescription: event.target.value })} required placeholder="说明你的数据需求、任务类型或企业背景" /></label>
            <div className="form-actions form-span">
              <Button variant="ghost" onClick={() => setPath('requester')}>返回</Button>
              <Button type="submit" disabled={loading}>{loading ? '提交中...' : '完成企业登记'}</Button>
            </div>
            <OnboardingErrorAlert error={error} />
          </form>
        )}

        {path === 'join-org' && (
          <form className="onboarding-form compact" onSubmit={submitJoinOrg}>
            <FormHeading icon={<DoorOpen />} title="通过邀请码加入企业" description="邀请码由企业管理员提供，提交后会进入对应团队。" />
            <label className="form-span">企业邀请码<input value={inviteCode} onChange={(event) => updateInviteCode(event.target.value)} required minLength={4} placeholder="例如 TM-INV-2026" /></label>
            <div className="form-actions form-span">
              <Button variant="ghost" onClick={() => setPath('requester')}>返回</Button>
              <Button type="submit" disabled={loading}>{loading ? '提交中...' : '加入并进入工作台'}</Button>
            </div>
            <OnboardingErrorAlert error={error} />
          </form>
        )}
      </section>
    </OnboardingShell>
  );
}

function OnboardingShell({
  statusLabel,
  statusValue,
  statusIcon,
  guideTitle,
  guideDescription,
  activeStep,
  children,
}: {
  statusLabel: string;
  statusValue: string;
  statusIcon: ReactNode;
  guideTitle: string;
  guideDescription: string;
  activeStep: number;
  children: ReactNode;
}) {
  return (
    <main className="onboarding-page">
      <div className="onboarding-layout">
        <aside className="onboarding-guide" aria-label="Onboarding 引导">
          <div className="onboarding-brand">
            <img src="/color_logo.svg" alt="MarkUp" />
          </div>
          <div className="onboarding-guide-copy">
            <p className="section-label">Welcome</p>
            <h1>{guideTitle}</h1>
            <p>{guideDescription}</p>
          </div>
          <ol className="onboarding-steps" aria-label="Onboarding 进度">
            {guideSteps.map((step, index) => (
              <li className={index < activeStep ? 'is-done' : index === activeStep ? 'is-current' : undefined} key={step.label}>
                <span>{index < activeStep ? <CheckCircle2 size={15} aria-hidden="true" /> : index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </div>
              </li>
            ))}
          </ol>
          <div className="onboarding-guide-footer">
            <div className="onboarding-agent-card">
              <AgentAvatar size={40} motion="idle" />
              <div>
                <span>MarkUp 引导</span>
                <strong>正在为你准备入口</strong>
              </div>
            </div>
            <div className="onboarding-user">
              {statusIcon}
              <span>{statusValue}</span>
              <Tag tone="warning">{statusLabel}</Tag>
            </div>
          </div>
        </aside>
        <div className="onboarding-workspace">
          {children}
        </div>
      </div>
    </main>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  meta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="onboarding-choice" onClick={onClick}>
      <span className="onboarding-choice-icon">{icon}</span>
      <span className="onboarding-choice-copy">
        <strong>{title}</strong>
        <span>{description}</span>
        <small>{meta}</small>
      </span>
      <ArrowRight className="onboarding-choice-arrow" size={20} aria-hidden="true" />
    </button>
  );
}

function FormHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="onboarding-form-heading form-span">
      <div className="onboarding-form-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function FieldLabel({ label, optional = false }: { label: string; optional?: boolean }) {
  return (
    <span className="onboarding-field-label">
      <span>{label}</span>
      {optional ? <em aria-hidden="true">选填</em> : null}
    </span>
  );
}

function OnboardingErrorAlert({ error }: { error: string | null }) {
  if (!error) return null;
  return <Alert className="form-span onboarding-error-alert" type="error" showIcon message={error} />;
}
