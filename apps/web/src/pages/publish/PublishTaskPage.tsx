import { Bot, Building2, ClipboardList, FileJson, GitBranch, PenLine, SearchCheck, ShieldCheck, UserCheck } from 'lucide-react';
import { Button, Card, Tag } from '../../components/ui';
import './PublishTaskPage.css';

interface PublishTaskPageProps {
  onOpenLogin: (mode: 'login' | 'register') => void;
}

const pipelineSteps = [
  {
    icon: ClipboardList,
    title: '创建任务与配置模板',
    desc: 'Owner 创建标注任务，使用可视化模板设计器配置标注表单，支持文本、图像、音频等多种数据类型。',
    features: ['动态表单设计器', '11 种控件类型', 'Schema 版本管理', '数据集导入'],
  },
  {
    icon: PenLine,
    title: '标注员认领与在线标注',
    desc: '标注员在任务广场浏览并认领任务，在工作台完成标注，支持草稿自动保存与提交前校验。',
    features: ['任务市场', '在线标注工作台', '草稿自动保存', '提交校验'],
  },
  {
    icon: Bot,
    title: 'AI 自动预审',
    desc: '提交后自动触发 LLM 质检，对标注结果进行结构化评分与问题定位，过滤低质量数据。',
    features: ['LLM 结构化评分', '问题自动定位', '异步队列处理', '成本追踪'],
  },
  {
    icon: SearchCheck,
    title: '多阶段人工复核',
    desc: 'Reviewer 对 AI 预审结果进行人工确认，支持初审、复审、终审多阶段流程，可批量操作与退回修改。',
    features: ['多阶段审核', '批量操作', '差异对比视图', '退回修改'],
  },
  {
    icon: FileJson,
    title: '数据导出与交付',
    desc: '审核通过的数据支持多格式异步导出，附带完整审计轨迹，满足 AI 训练数据的合规要求。',
    features: ['JSON / JSONL / CSV / Excel', '字段自定义映射', '审计轨迹附带', '下载历史记录'],
  },
];

const roles = [
  { icon: Building2, title: '企业管理员', desc: '管理企业成员、分配角色权限、查看平台整体数据概览。' },
  { icon: GitBranch, title: 'Owner（任务负责人）', desc: '创建任务、配置模板、导入数据集、监控标注进度与质量。' },
  { icon: PenLine, title: '标注员', desc: '在任务广场认领任务，在工作台完成标注并提交。' },
  { icon: UserCheck, title: '审核员', desc: '对标注结果进行人工复核，确保数据质量达标后放行导出。' },
];

export function PublishTaskPage({ onOpenLogin }: PublishTaskPageProps) {
  return (
    <div className="publish-page">
      <div className="publish-hero">
        <div className="section-label">发布任务</div>
        <h1>从任务创建到数据交付的完整闭环</h1>
        <p>MarkUp 提供端到端的数据标注工作流，Owner 发布任务，标注员完成标注，AI 预审 + 人工复核保障质量，最终导出高质量训练数据集。</p>
      </div>

      <section className="pipeline">
        <div className="pipeline-steps">
          {pipelineSteps.map((step, i) => (
            <div className="pipeline-step" key={i}>
              <div className="pipeline-step-num">
                <span className="step-icon"><step.icon aria-hidden="true" /></span>
                <span className="step-index">STEP {i + 1}</span>
              </div>
              <Card className="pipeline-step-body">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                <div className="step-features">
                  {step.features.map(f => <Tag tone="brand" key={f}>{f}</Tag>)}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </section>

      <section className="roles-section">
        <div className="roles-inner">
          <div className="section-label">角色分工</div>
          <h2>清晰的角色与权限体系</h2>
          <div className="roles-grid">
            {roles.map(r => (
              <Card as="article" className="role-card" key={r.title}>
                <div className="role-icon"><r.icon aria-hidden="true" /></div>
                <h3>{r.title}</h3>
                <p>{r.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="publish-cta">
        <div className="publish-cta-inner">
          <h2>准备好发布你的第一个任务了吗？</h2>
          <p>注册企业管理员账号，立即开始配置标注任务。</p>
          <Button variant="secondary" icon={<ShieldCheck />} onClick={() => onOpenLogin('register')}>立即注册开始发布</Button>
        </div>
      </section>
    </div>
  );
}
