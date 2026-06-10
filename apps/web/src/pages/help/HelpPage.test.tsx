import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { HelpPage } from './HelpPage';
import helpContent from './helpContent.json';

function expectHighlightedText(text: string) {
  expect(Array.from(document.querySelectorAll('.help-search-highlight')).some((node) => node.textContent === text)).toBe(true);
}

function moduleDirectory() {
  return screen.getByRole('navigation', { name: '手册模块目录' });
}

describe('HelpPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/help');
  });

  it('renders the module-first help center shell', () => {
    render(<HelpPage />);

    expect(screen.getByRole('heading', { name: 'MarkUp 帮助中心' })).toBeInTheDocument();
    expect(screen.getByRole('search', { name: '帮助手册搜索' })).toBeInTheDocument();
    const startGrid = screen.getByLabelText('常用手册入口');
    expect(within(startGrid).getByRole('button', { name: /任务领取/ })).toBeInTheDocument();
    expect(within(startGrid).getByRole('button', { name: /任务发布/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '公开入口与账号体系' })).toBeInTheDocument();
    expect(screen.queryByText(/全部文档/)).not.toBeInTheDocument();
    expect(screen.queryByText(/个文档页/)).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '手册分页' })).toBeInTheDocument();
    expect(document.querySelector('.help-pagination-nav .ant-pagination')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '手册模块目录' })).toBeInTheDocument();
    expect(screen.getByText('标注员工作')).toBeInTheDocument();
    expect(screen.getByText('企业数据生产')).toBeInTheDocument();
    expect(screen.getByText('治理、通知与排查')).toBeInTheDocument();
  });

  it('filters modules by audience', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    await user.click(screen.getAllByText('标注员')[0]);

    const directory = moduleDirectory();
    expect(within(directory).getByRole('button', { name: /任务广场/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /标注作答/ })).toBeInTheDocument();
    expect(within(directory).queryByRole('button', { name: /任务发布与分发/ })).not.toBeInTheDocument();

    await user.click(within(directory).getByRole('button', { name: /标注作答/ }));
    expect(screen.getByRole('heading', { name: '标注作答工作台' })).toBeInTheDocument();
    expect(screen.getAllByText(/草稿/).length).toBeGreaterThan(0);
  });

  it('jumps from guide cards to module pages', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    await user.click(screen.getByRole('button', { name: /AI 与审核/ }));

    expect(window.location.hash).toBe('#ai-review');
    expect(screen.getByRole('heading', { name: 'AI 辅助与 AI 预审' })).toBeInTheDocument();
  });

  it('keeps old help hashes compatible with new modules', async () => {
    render(<HelpPage />);

    await act(async () => {
      window.location.hash = '#dataset-template-guide';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '公开入口与账号体系' })).not.toBeInTheDocument();

    await act(async () => {
      window.location.hash = '#owner-guide';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByRole('heading', { name: '任务发布与分发' })).toBeInTheDocument();

    await act(async () => {
      window.location.hash = '#troubleshooting';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByRole('heading', { name: '常见失败与排查' })).toBeInTheDocument();
  });

  it('shows search results, filters the module directory, and highlights matched keywords', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    const search = screen.getByPlaceholderText('搜索任务领取、Manifest、LLMComponent、AI 钱包、导出失败...');
    await user.type(search, 'Manifest');

    expect(screen.getByRole('region', { name: '搜索结果' })).toBeInTheDocument();
    expect(screen.getByText(/个匹配项/)).toBeInTheDocument();

    const directory = moduleDirectory();
    expect(within(directory).getByRole('button', { name: /数据集管理/ })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: /模板搭建/ })).toBeInTheDocument();

    await user.click(within(directory).getByRole('button', { name: /数据集管理/ }));
    expect(screen.getByRole('heading', { name: '数据集管理' })).toBeInTheDocument();
    expect(document.body.textContent).toContain('Manifest JSONL');
    expect(document.body.textContent).toContain('media_schema');
    expect(document.body.textContent).toContain('context_schema');
    expectHighlightedText('Manifest');

    await user.clear(search);
    await user.type(search, 'AI 钱包');
    const aiWalletDirectory = moduleDirectory();
    await user.click(within(aiWalletDirectory).getByRole('button', { name: /企业治理、成员、钱包与资源/ }));
    expect(screen.getByRole('heading', { name: '企业治理、成员、钱包与资源' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 钱包和 Provider' })).toBeInTheDocument();
    expectHighlightedText('AI 钱包');
  });

  it('documents image mask annotation and the unique-account permission model', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    const serialized = JSON.stringify(helpContent);
    expect(serialized).toContain('账号身份唯一');
    expect(serialized).not.toContain('身份切换');
    expect(serialized).not.toContain('建设中');

    const search = screen.getByPlaceholderText('搜索任务领取、Manifest、LLMComponent、AI 钱包、导出失败...');
    await user.type(search, '图片 Mask');

    const directory = moduleDirectory();
    await user.click(within(directory).getByRole('button', { name: /标注作答/ }));

    expect(screen.getByRole('heading', { name: '使用图片 Mask 标注组件' })).toBeInTheDocument();
    expect(document.body.textContent).toContain('ImageMaskAnnotation');
    expect(document.body.textContent).toContain('source_field');
    expect(document.body.textContent).toContain('image_url');
    expectHighlightedText('图片 Mask');
  });

  it('shows an empty state when no module or faq matches', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    const search = screen.getByPlaceholderText('搜索任务领取、Manifest、LLMComponent、AI 钱包、导出失败...');
    await user.type(search, '不存在的帮助手册条目');

    expect(screen.getByText('没有找到匹配的帮助手册内容')).toBeInTheDocument();
    expect(screen.getByText('没有找到匹配项，请换一个关键词。')).toBeInTheDocument();
  });

  it('renders faq answers and searches faq content', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    const search = screen.getByPlaceholderText('搜索任务领取、Manifest、LLMComponent、AI 钱包、导出失败...');
    await user.type(search, 'onboarding');
    await user.click(within(moduleDirectory()).getByRole('button', { name: /常见问题/ }));

    const faq = document.querySelector('.help-faq');
    expect(faq).not.toBeNull();
    await user.click(within(faq as HTMLElement).getByRole('button', { name: /注册后为什么还要进入 onboarding/ }));

    expect(document.body.textContent).toContain('注册只创建通用账号');
    expect(screen.getByRole('button', { name: /为什么我不能领取任务/ })).toBeInTheDocument();
    expectHighlightedText('onboarding');
    expect(screen.getByRole('heading', { name: '常见问题' })).toBeInTheDocument();
  });
});
