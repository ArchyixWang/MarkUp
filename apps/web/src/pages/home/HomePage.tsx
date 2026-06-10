import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Download,
  FileJson,
  GitBranch,
  Image as ImageIcon,
  MessageSquareText,
  SearchCheck,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { AgentAvatar } from '../../components/agent/AgentAvatar';
import type { AuthSession } from '../../stores/authStore';
import { useTypingPlaceholder } from '../workspace/TemplateAiAssistant/useTypingPlaceholder';
import './HomePage.css';

gsap.registerPlugin(useGSAP, ScrollTrigger);

interface HomePageProps {
  onOpenLogin: (mode: 'login' | 'register') => void;
  session?: AuthSession | null;
}

const stats = [
  { value: 'AI 全链路', label: '从任务生成到质量复核，让 AI 参与数据生产全过程' },
  { value: '多模态生产', label: '文本、图像、音频、视频统一进入标注链路' },
  { value: '质量协同', label: 'AI 给建议，人来判断，复核守住交付质量' },
  { value: '全程追溯', label: '结果、记录、日志完整保留，交付后也能回看依据' },
];

const featureSections = [
  {
    kicker: 'AI 工作流',
    title: 'AI 贯穿数据标注全链路',
    description: '从任务设计、模板生成、发布配置到 AI 预审，MarkUp 让智能能力贯穿数据生产，而不是停留在单点工具。',
    icon: WandSparkles,
    points: ['任务设计更快启动', '发布配置更少断点', '预审建议进入复核链路'],
    mock: ['AI：生成模板字段', 'AI：补全发布配置', 'AI：输出预审建议'],
  },
  {
    kicker: 'Multimodal',
    title: '多模态任务统一生产',
    description: '文本、图像、音频、视频都可以进入同一套任务链路，从样本组织、在线标注到质量复核保持一致体验。',
    icon: GitBranch,
    points: ['多类型样本统一进入', '标注与复核同链路', '交付格式按任务生成'],
    mock: ['文本 / 图像 / 音频 / 视频', '标注：领取 / 提交', '复核：AI 建议 / 人工确认'],
  },
  {
    kicker: 'Traceability',
    title: '从标注到交付全程可追溯',
    description: '每次提交、预审、复核和导出都沉淀为可回看的质量依据，让数据交付不只是结果文件，更是一条可信链路。',
    icon: FileJson,
    points: ['复核记录随结果保留', '关键操作有迹可循', '交付后仍可复查'],
    mock: ['result.jsonl', 'review_records: true', 'audit logs: available'],
  },
];

const scenarios = [
  {
    title: 'AI 贯穿标注生产',
    tags: '任务设计 | 模板生成 | 预审复核',
    icon: ImageIcon,
    tone: 'blue',
    examples: ['从任务设计到预审复核', 'AI 不只停留在对话框里', '让任务启动更快', '让质量判断更有依据'],
  },
  {
    title: '多模态数据统一生产',
    tags: '文本 | 图像 | 音频 | 视频',
    icon: MessageSquareText,
    tone: 'violet',
    examples: ['多类型样本进入同一链路', '统一标注、复核和导出', '减少跨工具切换', '让数据生产更连续'],
  },
  {
    title: 'AI 预审辅助质量判断',
    tags: '建议 | 风险 | 复核重点',
    icon: ShieldCheck,
    tone: 'orange',
    examples: ['AI 输出建议和风险提示', '帮助定位复核样本', '辅助 Reviewer 更快判断', '让审核更有依据'],
  },
  {
    title: '人工复核守住质量',
    tags: '标注者 | 审核者 | 质量确认',
    icon: SearchCheck,
    tone: 'rose',
    examples: ['标注者完成判断', '审核者确认结果', '通过与打回有记录', '让数据交付更可信'],
  },
  {
    title: '任务协作持续流转',
    tags: '发布 | 领取 | 提交 | 审核',
    icon: ClipboardList,
    tone: 'green',
    examples: ['任务发布后进入广场', '标注员领取并提交', '审核状态持续推进', '团队协作更清晰'],
  },
  {
    title: '交付结果有迹可循',
    tags: '导出 | 记录 | 日志',
    icon: Download,
    tone: 'cyan',
    examples: ['结果、记录、日志完整保留', '导出后仍能回看依据', '复核记录随结果交付', '让数据质量可复查'],
  },
];

const feedback = [
  'AI 参与模板、发布和预审，不只停留在聊天入口',
  '文本、图片、音频、视频可以进入同一套标注任务',
  'AI 建议与人工复核结合，保留质量判断依据',
  '任务发布、领取、提交、审核状态持续流转',
  '结果导出可携带复核记录，便于后续复查',
  '操作日志按权限查看，关键动作有迹可循',
];

const homeTypingHints = [
  '让 AI 生成多模态标注模板',
  '把文本、图像、音频和视频接入同一任务',
  '用 AI 预审辅助定位复核重点',
  '让标注结果带着质量依据交付',
  '导出结果时保留复核记录和日志',
];

export function HomePage({ onOpenLogin, session = null }: HomePageProps) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLElement | null>(null);
  const [aiInputPaused, setAiInputPaused] = useState(false);
  const isLoggedIn = Boolean(session);
  const typingText = useTypingPlaceholder(aiInputPaused, {
    hints: homeTypingHints,
    completeHoldMs: 1_600,
    emptyPauseMs: 700,
  });

  useEffect(() => {
    const updateNavSurface = () => {
      document.body.classList.toggle('home-nav-scrolled', window.scrollY > 8);
    };

    document.body.classList.add('home-transparent-nav');
    updateNavSurface();
    window.addEventListener('scroll', updateNavSurface, { passive: true });
    window.addEventListener('resize', updateNavSurface);

    return () => {
      window.removeEventListener('scroll', updateNavSurface);
      window.removeEventListener('resize', updateNavSurface);
      document.body.classList.remove('home-transparent-nav', 'home-nav-scrolled');
    };
  }, []);

  const startPublishing = () => {
    if (isLoggedIn) {
      navigate('/workspace?page=publish-task');
      return;
    }
    onOpenLogin('register');
  };

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (reduceMotion) {
      gsap.set([
        '.home-hero-logo',
        '.home-hero-title',
        '.home-hero-lead',
        '.home-hero-actions',
        '.home-ai-showcase-bar',
        '.home-stat',
        '.home-ai-assist',
        '.home-info-card',
        '.home-scenario-card',
        '.home-feedback-row',
        '.home-final-cta',
      ], {
        autoAlpha: 1,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        clipPath: 'inset(0% 0% 0% 0%)',
      });
      return undefined;
    }

    const introTl = gsap.timeline({ defaults: { duration: 0.72, ease: 'power3.out' } });
    introTl
      .addLabel('hero')
      .from('.home-hero-logo, .home-hero-title, .home-hero-lead', {
        y: 28,
        opacity: 0,
        stagger: 0.08,
      }, 'hero')
      .from('.home-hero-actions', { y: 20, opacity: 0 }, 'hero+=0.24')
      .from('.home-ai-showcase-bar', { opacity: 0, y: 18 }, 'hero+=0.34');

    const revealTriggers = ScrollTrigger.batch('.home-stat, .home-ai-assist, .home-info-card, .home-scenario-card, .home-final-cta', {
      start: 'top 84%',
      once: true,
      onEnter: (items: Element[]) => {
        gsap.from(items, {
          autoAlpha: 0,
          y: 24,
          scale: 0.98,
          duration: 0.56,
          stagger: 0.06,
          ease: 'power2.out',
          overwrite: true,
        });
      },
    });

    const scenarioTrack = root.querySelector<HTMLElement>('.home-scenario-track-wrap');
    const scenarioTl = gsap.timeline({ repeat: -1, defaults: { ease: 'none' } });
    scenarioTl
      .addLabel('scenario:flow')
      .to('.home-scenario-grid', { xPercent: -50, duration: 56 }, 'scenario:flow');

    const pauseScenarioForFocus = () => scenarioTl.pause();
    const resumeScenarioAfterFocus = () => scenarioTl.play();
    scenarioTrack?.addEventListener('focusin', pauseScenarioForFocus);
    scenarioTrack?.addEventListener('focusout', resumeScenarioAfterFocus);

    const marqueeTl = gsap.timeline({ repeat: -1, defaults: { ease: 'none' } });
    marqueeTl.to('.home-feedback-track', { xPercent: -50, duration: 26 });

    return () => {
      introTl.kill();
      scenarioTl.kill();
      marqueeTl.kill();
      scenarioTrack?.removeEventListener('focusin', pauseScenarioForFocus);
      scenarioTrack?.removeEventListener('focusout', resumeScenarioAfterFocus);
      revealTriggers.forEach((trigger) => trigger.kill());
    };
  }, { scope: rootRef });

  return (
    <main ref={rootRef} className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-bg" aria-hidden="true">
          <span className="home-hero-ring home-hero-ring--outer" />
          <span className="home-hero-ring home-hero-ring--inner" />
          <span className="home-hero-glow" />
        </div>

        <div className="home-hero-center">
          <img className="home-hero-logo" src="/white_logo.svg" alt="" aria-hidden="true" />
          <h1 id="home-title" className="home-hero-title"><span className="home-hero-title-en">AI</span> 开启数据标注新时代</h1>
          <p className="home-hero-lead">让每一份数据，都有智能、有质量、有迹可循。</p>
          <div className="home-hero-actions" aria-label="首页操作">
            <button className="home-btn home-btn--light" type="button" onClick={startPublishing}>
              开始发布任务 <ArrowRight size={18} />
            </button>
            <button className="home-btn home-btn--outline-light" type="button" onClick={() => navigate('/tasks')}>
              浏览任务广场
            </button>
          </div>

          <div
            className="home-ai-showcase-bar"
            aria-label="MarkUp AI 对话展示条"
            onMouseEnter={() => setAiInputPaused(true)}
            onMouseLeave={() => setAiInputPaused(false)}
          >
            <button type="button" className="home-ai-showcase-avatar" aria-label="MarkUp AI" onClick={startPublishing}>
              <AgentAvatar size={60} motion="idle" />
            </button>
            <div className="home-ai-template-copy" aria-hidden="true">
              <div className="home-ai-template-typing">
                <span>{typingText}</span>
                <i />
              </div>
            </div>
            <button type="button" className="home-ai-template-submit" aria-label="进入 AI 标注链路" onClick={startPublishing}>
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </section>

      <section className="home-scenarios" aria-labelledby="home-scenarios-title">
        <div className="home-section-title home-section-title--center">
          <h2 id="home-scenarios-title">AI 数据标注，从任务到交付全链路提速</h2>
          <p>MarkUp 将 AI、多模态数据和质量追溯放进同一套标注生产流程。</p>
        </div>
        <div
          className="home-scenario-track-wrap"
          aria-label="数据标注场景横向列表"
        >
          <div className="home-scenario-grid">
            {[0, 1].map((loopIndex) => (
              <div className="home-scenario-loop" aria-hidden={loopIndex === 1 ? 'true' : undefined} key={loopIndex}>
                {scenarios.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article className={`home-scenario-card home-scenario-card--${item.tone}`} key={`${item.title}-${loopIndex}`}>
                      <span className="home-scenario-icon"><Icon size={30} /></span>
                      <h3>{item.title}</h3>
                      <p>{item.tags}</p>
                      <ul>
                        {item.examples.map((example) => (
                          <li key={example}>
                            {example}
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-ai-assist" aria-labelledby="home-ai-assist-title">
        <div className="home-ai-assist-inner">
          <div className="home-ai-assist-copy">
            <span>Labeler experience</span>
            <h2 id="home-ai-assist-title">AI 辅助标注，不止在后台</h2>
            <p>AI 提供任务上下文和预审建议，标注者专注判断，审核者把关质量。每一次标注，都成为可复核的数据生产环节。</p>
          </div>
          <div className="home-ai-assist-steps" aria-label="AI 辅助标注流程">
            <div>
              <strong>AI 给上下文</strong>
              <span>任务说明、字段规则、预审建议</span>
            </div>
            <div>
              <strong>标注者做判断</strong>
              <span>按模板完成多模态样本标注</span>
            </div>
            <div>
              <strong>复核守质量</strong>
              <span>审核者确认通过、打回和记录保留</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-stats" aria-label="MarkUp 平台摘要">
        <div className="home-stats-inner">
          {stats.map((item) => (
            <div className="home-stat" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="home-info" aria-labelledby="home-info-title">
        <div className="home-section-title">
          <span>Platform strengths</span>
          <h2 id="home-info-title">AI、多模态与追溯能力，共同构成 MarkUp 的标注生产力</h2>
        </div>
        <div className="home-info-list">
          {featureSections.map((item, index) => {
            const Icon = item.icon;
            return (
              <article className="home-info-card" key={item.title}>
                <div className="home-info-copy">
                  <span className="home-kicker">{item.kicker}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <ul>
                    {item.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </div>
                <div className="home-info-mock" aria-label={`${item.title} 产品片段`}>
                  <Icon size={28} />
                  <div>
                    <small>Step 0{index + 1}</small>
                    {item.mock.map((line) => <span key={line}>{line}</span>)}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-feedback" aria-label="平台能力摘要">
        <div className="home-feedback-row">
          <div className="home-feedback-track">
            {[...feedback, ...feedback].map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="home-final-cta" aria-label="开始使用 MarkUp">
        <div>
          <span>Start production</span>
          <h2>开启你的 AI 数据标注链路</h2>
          <p>从多模态任务发布到结果交付，用 MarkUp 构建更智能、更可追溯的数据生产流程。</p>
        </div>
        <div className="home-final-actions">
          <button className="home-btn home-btn--primary" type="button" onClick={startPublishing}>
            开始发布任务 <ArrowRight size={18} />
          </button>
          <button className="home-btn home-btn--secondary" type="button" onClick={() => navigate('/tasks')}>
            浏览任务广场
          </button>
        </div>
        <BarChart3 className="home-final-mark" size={120} aria-hidden="true" />
      </section>
    </main>
  );
}

