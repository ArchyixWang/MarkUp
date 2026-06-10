import {
  CrownOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { Button, Card, Space, Tag } from 'antd';
import './SolutionsPage.css';

interface SolutionsPageProps {
  onOpenLogin: (mode: 'login' | 'register') => void;
}

const planRows = [
  {
    key: 'free',
    plan: 'Free',
    fee: '0',
    caption: '试运行',
    fit: '先用小团队试跑导入、模板和交付。',
    members: '3 人',
    tasks: '3 个',
    storage: '3 GB',
    cta: '免费开始',
  },
  {
    key: 'basic',
    plan: 'Basic',
    fee: '999',
    caption: '小团队',
    fit: '适合刚开始稳定发布任务的小团队。',
    members: '10 人',
    tasks: '5 个',
    storage: '20 GB',
    cta: '创建企业账号',
  },
  {
    key: 'pro',
    plan: 'Pro',
    fee: '3,999',
    caption: '推荐生产档',
    fit: '适合已经进入常态生产的企业团队。',
    members: '50 人',
    tasks: '30 个',
    storage: '500 GB',
    cta: '创建企业账号',
    recommended: true,
  },
  {
    key: 'enterprise',
    plan: 'Enterprise',
    fee: '19,999',
    caption: '规模化组织',
    fit: '适合多团队并行、任务和数据量持续增长。',
    members: '300 人',
    tasks: '200 个',
    storage: '2 TB',
    cta: '创建企业账号',
  },
  {
    key: 'more',
    plan: 'More',
    fee: '定制',
    caption: '定制方案',
    fit: '适合需要私有化、SLA 或专属容量的团队。',
    members: '定制',
    tasks: '定制',
    storage: '定制',
    cta: '联系平台定制',
  },
];

const planFacts = [
  { label: '试运行', value: 'Free', desc: '先验证是否适合团队流程' },
  { label: '正式生产', value: 'Pro', desc: '多数团队从这一档开始稳定交付' },
  { label: '定制扩展', value: 'More', desc: '容量、部署和服务边界单独确认' },
];

export function SolutionsPage({ onOpenLogin }: SolutionsPageProps) {
  const openRegister = () => onOpenLogin('register');

  return (
    <main className="solutions-page">
      <section className="solutions-pricing-hero">
        <div className="solutions-pricing-hero-copy">
          <span className="solutions-kicker">MarkUp Plans</span>
          <h1>按团队阶段选择套餐</h1>
          <p>先看当前成员规模、活跃任务数量和数据集容量，再选择合适的团队方案。</p>
          <Space size={12} wrap>
            <Button type="primary" size="large" icon={<RocketOutlined />} onClick={openRegister}>
              创建企业账号
            </Button>
          </Space>
        </div>

        <div className="solutions-plan-snapshot" aria-label="套餐摘要">
          <div className="solutions-snapshot-head">
            <span>Free / Basic / Pro / Enterprise / More</span>
            <strong>从试运行到规模化</strong>
          </div>
          <div className="solutions-snapshot-list">
            {planFacts.map((item) => (
              <div key={item.label} className="solutions-snapshot-row">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="solutions-plans-section" id="solutions-pricing">
        <div className="solutions-section-head">
          <div className="solutions-section-marker">
            <span>01</span>
            <strong>Plans</strong>
          </div>
          <h2>套餐一览</h2>
          <p>五档方案按团队阶段展开，Pro 作为进入正式生产后的默认推荐档。</p>
        </div>

        <div className="solutions-plan-grid">
          {planRows.map((item) => (
            <Card key={item.key} className={`solutions-plan-card is-${item.key} ${item.recommended ? 'is-recommended' : ''}`}>
              <div className="solutions-plan-head">
                <div>
                  <strong>{item.plan}</strong>
                  <span>{item.caption}</span>
                </div>
                {item.recommended ? <Tag color="blue" icon={<CrownOutlined />}>推荐</Tag> : null}
              </div>

              <div className="solutions-plan-price">
                <b>{item.fee}</b>
                <span>{item.key === 'more' ? '按方案确认' : '元 / 年'}</span>
              </div>

              <p className="solutions-plan-fit">{item.fit}</p>

              <ul>
                <li>成员上限：{item.members}</li>
                <li>活跃生产任务：{item.tasks}</li>
                <li>数据集存储：{item.storage}</li>
              </ul>

              <Button
                block
                type={item.recommended ? 'primary' : 'default'}
                onClick={openRegister}
              >
                {item.cta}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <section className="solutions-final-cta">
        <div>
          <div className="solutions-final-marker">MarkUp Plans</div>
          <h2>从合适的一档开始</h2>
          <p>创建企业账号后，在工作台里查看并管理团队会员方案。</p>
        </div>
        <Button type="primary" size="large" icon={<RocketOutlined />} onClick={openRegister}>
          创建企业账号
        </Button>
      </section>
    </main>
  );
}
