import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Anchor, Button, Collapse, Empty, Input, Segmented, Space, Tag, Typography } from 'antd';
import {
  AuditOutlined,
  BellOutlined,
  BookOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  LeftOutlined,
  LoginOutlined,
  OrderedListOutlined,
  QuestionCircleOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SlidersOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import helpContent from './helpContent.json';
import './HelpPage.css';

type AudienceId = 'labeler' | 'owner' | 'reviewer' | 'team_admin';
type HelpStatus = 'available';

interface HelpItem {
  label?: string;
  text: string;
  status?: HelpStatus;
}

interface HelpEntry {
  title: string;
  body?: string[];
  listType?: 'ordered' | 'unordered';
  items?: HelpItem[];
  status?: HelpStatus;
  search_keywords?: string[];
}

interface HelpModule {
  id: string;
  title: string;
  summary: string;
  status: HelpStatus;
  audiences: AudienceId[];
  tags: string[];
  entries: HelpEntry[];
}

interface HelpGroup {
  id: string;
  title: string;
  module_ids: string[];
}

interface HelpFaq {
  q: string;
  a: string;
  audiences: AudienceId[];
  tags: string[];
  status: HelpStatus;
}

interface HelpContent {
  meta: {
    title: string;
    subtitle: string;
    updated_at: string;
  };
  audiences: Array<{ id: AudienceId; title: string }>;
  aliases: Record<string, string>;
  groups: HelpGroup[];
  modules: HelpModule[];
  faqs: HelpFaq[];
}

interface HelpPageEntry {
  id: string;
  title: string;
  summary: string;
  status: HelpStatus;
  audiences: AudienceId[];
  module: HelpModule;
  faqs?: HelpFaq[];
}

interface SearchResult {
  id: string;
  pageId: string;
  targetId?: string;
  eyebrow: string;
  title: string;
  excerpt: string;
  status: HelpStatus;
}

const content = helpContent as HelpContent;
const mainModuleCount = content.modules.filter((module) => module.id !== 'faq').length;

const statusLabels: Record<HelpStatus, { label: string; color: string }> = {
  available: { label: '可用', color: 'blue' },
};

const moduleIcons: Record<string, ReactNode> = {
  'public-account': <LoginOutlined />,
  'roles-permissions': <SafetyCertificateOutlined />,
  'task-market': <OrderedListOutlined />,
  'annotation-workbench': <UserOutlined />,
  'labeler-growth': <SafetyCertificateOutlined />,
  'enterprise-dashboard': <TeamOutlined />,
  datasets: <DatabaseOutlined />,
  templates: <SlidersOutlined />,
  'task-production': <TeamOutlined />,
  'task-management': <OrderedListOutlined />,
  'ai-review': <RobotOutlined />,
  'manual-review': <FileDoneOutlined />,
  'export-audit': <AuditOutlined />,
  'enterprise-governance': <SettingOutlined />,
  'notifications-inbox': <BellOutlined />,
  faq: <QuestionCircleOutlined />,
};

const guideCards = [
  {
    moduleId: 'task-market',
    title: '任务领取',
    meta: '任务广场 / 资质检查',
    icon: <OrderedListOutlined />,
  },
  {
    moduleId: 'datasets',
    title: '数据集管理',
    meta: '导入 / 多模态',
    icon: <DatabaseOutlined />,
  },
  {
    moduleId: 'templates',
    title: '模板搭建',
    meta: 'Designer / Renderer',
    icon: <SlidersOutlined />,
  },
  {
    moduleId: 'task-production',
    title: '任务发布',
    meta: 'readiness / 审批',
    icon: <TeamOutlined />,
  },
  {
    moduleId: 'annotation-workbench',
    title: '标注作答',
    meta: '草稿 / 提交 / 打回',
    icon: <UserOutlined />,
  },
  {
    moduleId: 'ai-review',
    title: 'AI 与审核',
    meta: '预审 / 人工终审',
    icon: <RobotOutlined />,
  },
  {
    moduleId: 'enterprise-governance',
    title: '企业资源',
    meta: '成员 / 钱包 / Provider',
    icon: <SettingOutlined />,
  },
];

const audienceLabelMap = Object.fromEntries(content.audiences.map((item) => [item.id, item.title])) as Record<AudienceId, string>;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function itemText(item: HelpItem) {
  return `${item.label ?? ''} ${item.text} ${item.status ? statusLabels[item.status].label : ''}`;
}

function entryText(entry: HelpEntry) {
  return [
    entry.title,
    ...(entry.body ?? []),
    ...(entry.items ?? []).map(itemText),
    ...(entry.search_keywords ?? []),
    entry.status ? statusLabels[entry.status].label : '',
  ].join(' ');
}

function faqText(faq: HelpFaq) {
  return [faq.q, faq.a, ...(faq.tags ?? []), statusLabels[faq.status].label].join(' ');
}

function moduleText(module: HelpModule, faqs: HelpFaq[]) {
  return [
    module.title,
    module.summary,
    ...(module.tags ?? []),
    ...(module.entries ?? []).map(entryText),
    ...(module.id === 'faq' ? faqs.map(faqText) : []),
  ].join(' ');
}

function matchesAudience(audiences: AudienceId[], activeAudience: string) {
  return activeAudience === 'all' || audiences.includes(activeAudience as AudienceId);
}

function queryTerms(query: string) {
  const compact = query.replace(/\s+/g, '');
  if (/^[\u4e00-\u9fa5]+$/.test(compact) && compact.length >= 4) {
    const terms: string[] = [];
    for (let index = 0; index < compact.length; index += 2) {
      terms.push(compact.slice(index, index + 2));
    }
    return terms;
  }
  return query.split(/\s+/).filter(Boolean);
}

function matchesQuery(text: string, query: string) {
  if (!query) return true;
  const normalizedText = normalize(text);
  if (normalizedText.includes(query)) return true;
  return queryTerms(query).every((term) => normalizedText.includes(term));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTerms(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const terms = [trimmed, ...trimmed.split(/\s+/), ...queryTerms(trimmed)].map((term) => term.trim()).filter(Boolean);
  return Array.from(new Set(terms)).sort((first, second) => second.length - first.length);
}

function highlightText(text: string, query: string): ReactNode {
  const terms = highlightTerms(query);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, index) => (
    index % 2 === 1
      ? <mark className="help-search-highlight" key={`${part}-${index}`}>{part}</mark>
      : part
  ));
}

function renderStatusTag(status: HelpStatus) {
  const statusMeta = statusLabels[status];
  return <Tag color={statusMeta.color}>{statusMeta.label}</Tag>;
}

function entryId(moduleId: string, entry: HelpEntry, index: number) {
  const slug = entry.title.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
  return `help-entry-${moduleId}-${slug || index}`;
}

function resolvePageId(pageId: string) {
  return content.aliases[pageId] ?? pageId;
}

function firstSentence(value: string) {
  return value.split(/[。！？!?]/)[0]?.trim() || value;
}

function entryExcerpt(entry: HelpEntry) {
  return entry.body?.[0] ?? entry.items?.[0]?.text ?? entry.title;
}

function HelpEntryBlock({ moduleId, entry, index, query }: { moduleId: string; entry: HelpEntry; index: number; query: string }) {
  const currentEntryId = entryId(moduleId, entry, index);
  const ListTag = entry.listType === 'ordered' ? 'ol' : 'ul';
  const listItems = entry.items ?? [];

  return (
    <section className="help-topic" id={currentEntryId} aria-labelledby={`${currentEntryId}-title`}>
      <div className="help-topic-title">
        <Typography.Title id={`${currentEntryId}-title`} level={3}>{highlightText(entry.title, query)}</Typography.Title>
        {entry.status ? renderStatusTag(entry.status) : null}
      </div>
      {entry.body?.map((paragraph) => (
        <Typography.Paragraph key={paragraph}>{highlightText(paragraph, query)}</Typography.Paragraph>
      ))}
      {listItems.length ? (
        <ListTag className={entry.listType === 'ordered' ? 'help-steps' : 'help-bullets'}>
          {listItems.map((item, itemIndex) => (
            <li key={`${item.label ?? ''}${item.text}`}>
              <span className="help-list-marker" aria-hidden="true">
                {entry.listType === 'ordered' ? itemIndex + 1 : <CheckCircleOutlined />}
              </span>
              <span className="help-list-content">
                {item.label ? <strong>{highlightText(item.label, query)}</strong> : null}
                <span>{highlightText(item.text, query)}</span>
                {item.status ? <span className="help-inline-status">{renderStatusTag(item.status)}</span> : null}
              </span>
            </li>
          ))}
        </ListTag>
      ) : null}
    </section>
  );
}

function HelpModuleBlock({ page, query }: { page: HelpPageEntry; query: string }) {
  return (
    <article className="help-article" id={page.id} aria-labelledby={`${page.id}-title`}>
      <header className="help-article-header">
        <div className="help-article-icon" aria-hidden="true">{moduleIcons[page.id] ?? <BookOutlined />}</div>
        <div>
          <Space className="help-article-meta" size={[6, 6]} wrap>
            {renderStatusTag(page.status)}
            {page.audiences.map((audience) => <Tag key={audience}>{audienceLabelMap[audience]}</Tag>)}
          </Space>
          <Typography.Title id={`${page.id}-title`} level={2}>{highlightText(page.title, query)}</Typography.Title>
          <Typography.Paragraph>{highlightText(page.summary, query)}</Typography.Paragraph>
        </div>
      </header>

      <div className="help-article-body">
        {page.module.entries.map((entry, index) => (
          <HelpEntryBlock entry={entry} index={index} key={entry.title} moduleId={page.id} query={query} />
        ))}
      </div>
    </article>
  );
}

function HelpFaqBlock({ page, query }: { page: HelpPageEntry; query: string }) {
  const faqs = page.faqs ?? [];

  return (
    <article className="help-article help-faq-article" id="faq" aria-labelledby="faq-title">
      <header className="help-article-header">
        <div className="help-article-icon" aria-hidden="true"><QuestionCircleOutlined /></div>
        <div>
          <Space className="help-article-meta" size={[6, 6]} wrap>
            {renderStatusTag('available')}
            {page.audiences.map((audience) => <Tag key={audience}>{audienceLabelMap[audience]}</Tag>)}
          </Space>
          <Typography.Title id="faq-title" level={2}>{highlightText(page.title, query)}</Typography.Title>
          <Typography.Paragraph>{highlightText(page.summary, query)}</Typography.Paragraph>
        </div>
      </header>
      <Collapse
        className="help-faq"
        items={faqs.map((faq, index) => ({
          key: faq.q,
          label: (
            <Space size={8} wrap>
              <span>{highlightText(faq.q, query)}</span>
              {renderStatusTag(faq.status)}
            </Space>
          ),
          children: (
            <div id={`help-faq-${index}`}>
              <Typography.Paragraph>{highlightText(faq.a, query)}</Typography.Paragraph>
              <Space size={[4, 4]} wrap>
                {faq.audiences.map((audience) => <Tag key={audience}>{audienceLabelMap[audience]}</Tag>)}
                {faq.tags.map((tag) => <Tag key={tag} color="blue">{highlightText(tag, query)}</Tag>)}
              </Space>
            </div>
          ),
        }))}
      />
    </article>
  );
}

function SearchResultsBlock({
  results,
  query,
  onSelect,
}: {
  results: SearchResult[];
  query: string;
  onSelect: (pageId: string, targetId?: string) => void;
}) {
  if (!query.trim()) return null;

  return (
    <section className="help-search-results" aria-label="搜索结果">
      <div className="help-search-results-header">
        <Typography.Text strong>搜索结果</Typography.Text>
        <Tag>{results.length} 个匹配项</Tag>
      </div>
      {results.length ? (
        <div className="help-search-result-list">
          {results.map((result) => (
            <button
              className="help-search-result-item"
              key={result.id}
              type="button"
              onClick={() => onSelect(result.pageId, result.targetId)}
            >
              <span>
                <Typography.Text className="help-search-result-eyebrow">{result.eyebrow}</Typography.Text>
                <strong>{highlightText(result.title, query)}</strong>
                <em>{highlightText(result.excerpt, query)}</em>
              </span>
              {renderStatusTag(result.status)}
            </button>
          ))}
        </div>
      ) : (
        <Typography.Text type="secondary">没有找到匹配项，请换一个关键词。</Typography.Text>
      )}
    </section>
  );
}

export function HelpPage() {
  const [activeAudience, setActiveAudience] = useState('all');
  const [queryValue, setQueryValue] = useState('');
  const [activePageId, setActivePageId] = useState(() => {
    const hash = typeof window === 'undefined' ? '' : window.location.hash.replace('#', '');
    return resolvePageId(hash || content.modules[0]?.id || 'faq');
  });
  const query = normalize(queryValue);
  const highlightQuery = queryValue.trim();

  const audienceFaqs = useMemo(
    () => content.faqs.filter((faq) => matchesAudience(faq.audiences, activeAudience)),
    [activeAudience],
  );
  const visiblePages = useMemo<HelpPageEntry[]>(() => (
    content.modules
      .filter((module) => matchesAudience(module.audiences, activeAudience))
      .filter((module) => matchesQuery(moduleText(module, audienceFaqs), query))
      .map((module) => ({
        id: module.id,
        title: module.title,
        summary: module.summary,
        status: module.status,
        audiences: module.audiences,
        module,
        faqs: module.id === 'faq' ? audienceFaqs : undefined,
      }))
  ), [activeAudience, audienceFaqs, query]);
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!query) return [];
    const results: SearchResult[] = [];

    content.modules
      .filter((module) => matchesAudience(module.audiences, activeAudience))
      .forEach((module) => {
        const moduleMatches = matchesQuery([module.title, module.summary, ...module.tags].join(' '), query);
        if (moduleMatches) {
          results.push({
            id: `${module.id}-module`,
            pageId: module.id,
            eyebrow: '模块',
            title: module.title,
            excerpt: module.summary,
            status: module.status,
          });
        }

        module.entries.forEach((entry, index) => {
          if (!matchesQuery(entryText(entry), query)) return;
          results.push({
            id: `${module.id}-${index}`,
            pageId: module.id,
            targetId: entryId(module.id, entry, index),
            eyebrow: module.title,
            title: entry.title,
            excerpt: firstSentence(entryExcerpt(entry)),
            status: entry.status ?? module.status,
          });
        });

        if (module.id === 'faq') {
          audienceFaqs.forEach((faq, index) => {
            if (!matchesQuery(faqText(faq), query)) return;
            results.push({
              id: `faq-${index}`,
              pageId: 'faq',
              targetId: `help-faq-${index}`,
              eyebrow: '常见问题',
              title: faq.q,
              excerpt: firstSentence(faq.a),
              status: faq.status,
            });
          });
        }
      });

    return results;
  }, [activeAudience, audienceFaqs, query]);
  const activePageIndex = Math.max(0, visiblePages.findIndex((page) => page.id === activePageId));
  const activePage = visiblePages[activePageIndex];
  const previousPage = activePageIndex > 0 ? visiblePages[activePageIndex - 1] : undefined;
  const nextPage = activePageIndex < visiblePages.length - 1 ? visiblePages[activePageIndex + 1] : undefined;
  const pageTocItems = activePage?.id === 'faq'
    ? [{ key: 'faq-title', href: '#faq-title', title: activePage.title }]
    : activePage
      ? [
        {
          key: `${activePage.id}-title`,
          href: `#${activePage.id}-title`,
          title: activePage.title,
        },
        ...activePage.module.entries.map((entry, index) => {
          const currentEntryId = entryId(activePage.id, entry, index);
          return {
            key: currentEntryId,
            href: `#${currentEntryId}`,
            title: entry.title,
          };
        }),
      ]
      : [];
  const audienceOptions = [
    { value: 'all', label: '全部' },
    ...content.audiences.map((item) => ({ value: item.id, label: item.title })),
  ];
  const visiblePageIds = new Set(visiblePages.map((page) => page.id));
  const visibleGroups = content.groups
    .map((group) => ({
      ...group,
      modules: group.module_ids
        .map((moduleId) => visiblePages.find((page) => page.id === moduleId))
        .filter(Boolean) as HelpPageEntry[],
    }))
    .filter((group) => group.modules.length);

  useEffect(() => {
    if (visiblePages.length && !visiblePageIds.has(activePageId)) {
      setActivePageId(visiblePages[0].id);
    }
  }, [activePageId, visiblePageIds, visiblePages]);

  useEffect(() => {
    function syncPageFromHash() {
      const pageIdFromHash = window.location.hash.replace('#', '');
      if (pageIdFromHash) {
        setActivePageId(resolvePageId(pageIdFromHash));
      }
    }

    window.addEventListener('hashchange', syncPageFromHash);
    return () => window.removeEventListener('hashchange', syncPageFromHash);
  }, []);

  function selectHelpPage(pageId: string, targetId?: string) {
    const resolvedPageId = resolvePageId(pageId);
    setActivePageId(resolvedPageId);
    if (window.location.hash !== `#${resolvedPageId}`) {
      window.history.replaceState(null, '', `#${resolvedPageId}`);
    }
    if (!navigator.userAgent.includes('jsdom')) {
      window.setTimeout(() => {
        document.getElementById(targetId || resolvedPageId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  return (
    <main className="help-page">
      <section className="help-doc-hero" aria-labelledby="help-title">
        <div className="help-doc-hero-inner">
          <div className="help-doc-intro">
            <Space size={8} className="help-kicker">
              <BookOutlined />
              <span>用户帮助中心</span>
            </Space>
            <Typography.Title id="help-title" level={1}>{content.meta.title}</Typography.Title>
            <Typography.Paragraph className="help-hero-subtitle">{content.meta.subtitle}</Typography.Paragraph>
            <Space size={[8, 8]} wrap className="help-hero-tags">
              <Tag>最后更新：{content.meta.updated_at}</Tag>
              <Tag>{mainModuleCount} 个主模块 + FAQ</Tag>
            </Space>
          </div>
          <div className="help-search-panel" role="search" aria-label="帮助手册搜索">
            <Typography.Text strong>搜索手册</Typography.Text>
            <Input.Search
              className="help-search"
              size="large"
              allowClear
              value={queryValue}
              enterButton="搜索"
              prefix={<SearchOutlined />}
              placeholder="搜索任务领取、Manifest、LLMComponent、AI 钱包、导出失败..."
              onChange={(event) => setQueryValue(event.target.value)}
              onSearch={setQueryValue}
            />
          </div>
        </div>
      </section>

      <section className="help-start-grid" aria-label="常用手册入口">
        {guideCards.map((card) => (
          <button className="help-start-card" type="button" key={card.moduleId} onClick={() => selectHelpPage(card.moduleId)}>
            <span className="help-start-icon" aria-hidden="true">{card.icon}</span>
            <span>
              <strong>{card.title}</strong>
              <em>{card.meta}</em>
            </span>
          </button>
        ))}
      </section>

      <div className="help-mobile-controls">
        <Segmented
          block
          value={activeAudience}
          options={audienceOptions}
          onChange={(value) => setActiveAudience(String(value))}
        />
      </div>

      <div className="help-doc-layout">
        <aside className="help-doc-sidebar" aria-label="帮助手册目录">
          <nav className="help-sidebar-block help-page-list" aria-label="手册模块目录">
            <Typography.Text className="help-sidebar-eyebrow">模块</Typography.Text>
            {visibleGroups.length ? (
              <div className="help-page-list-groups">
                {visibleGroups.map((group) => (
                  <div className="help-page-list-group" key={group.id}>
                    <Typography.Text className="help-page-list-group-title">{group.title}</Typography.Text>
                    <div className="help-page-list-items">
                      {group.modules.map((item) => (
                        <button
                          className={item.id === activePage?.id ? 'help-page-list-item is-active' : 'help-page-list-item'}
                          key={item.id}
                          type="button"
                          onClick={() => selectHelpPage(item.id)}
                        >
                          <span>{item.title}</span>
                          <em>{item.module.entries.length || (item.id === 'faq' ? audienceFaqs.length : 0)}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary">暂无匹配模块</Typography.Text>
            )}
          </nav>
        </aside>

        <div className="help-doc-content">
          <SearchResultsBlock results={searchResults} query={highlightQuery} onSelect={selectHelpPage} />

          {activePage ? (
            <>
              {activePage.id === 'faq' ? (
                <HelpFaqBlock page={activePage} query={highlightQuery} />
              ) : (
                <HelpModuleBlock page={activePage} query={highlightQuery} />
              )}

              <nav className="help-pagination-nav" aria-label="手册分页">
                <Button
                  disabled={!previousPage}
                  icon={<LeftOutlined />}
                  title={previousPage ? previousPage.title : '上一页'}
                  onClick={() => previousPage && selectHelpPage(previousPage.id)}
                >
                  {previousPage ? previousPage.title : '上一页'}
                </Button>
                <Button
                  disabled={!nextPage}
                  icon={<RightOutlined />}
                  iconPlacement="end"
                  title={nextPage ? nextPage.title : '下一页'}
                  onClick={() => nextPage && selectHelpPage(nextPage.id)}
                >
                  {nextPage ? nextPage.title : '下一页'}
                </Button>
              </nav>
            </>
          ) : (
            <Empty
              className="help-empty"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没有找到匹配的帮助手册内容"
            />
          )}
        </div>

        <aside className="help-page-toc" aria-label="本页目录">
          <div className="help-sidebar-block">
            <Typography.Text className="help-sidebar-eyebrow">本页目录</Typography.Text>
            {pageTocItems.length ? <Anchor affix={false} targetOffset={84} items={pageTocItems} /> : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
