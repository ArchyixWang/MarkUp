import { Link } from 'react-router-dom';
import { Layout } from 'antd';
import './PublicFooter.css';

const footerLinks = [
  { label: '首页', to: '/' },
  { label: '任务广场', to: '/tasks' },
  { label: '解决方案', to: '/solutions' },
  { label: '帮助文档', to: '/help' },
];

export function PublicFooter() {
  return (
    <Layout.Footer className="public-footer">
      <div className="public-footer-inner">
        <div className="public-footer-brand">
          <strong>MarkUp 马克派</strong>
          <span>面向团队协作的数据标注生产平台</span>
        </div>
        <nav className="public-footer-links" aria-label="站点页脚导航">
          {footerLinks.map((item) => (
            <Link to={item.to} key={item.to}>{item.label}</Link>
          ))}
        </nav>
        <div className="public-footer-meta">
          <span>© 2026 MarkUp</span>
          <span>数据生产 · AI 预审 · 人工复核 · 多格式导出</span>
        </div>
      </div>
    </Layout.Footer>
  );
}
