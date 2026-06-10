import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformApp } from './PlatformApp';

vi.mock('@ant-design/charts', () => ({
  Area: ({ data }: { data: Array<{ date_label: string }> }) => (
    <div data-testid="settlement-trend-chart">
      {data.map((item) => <span key={item.date_label}>{item.date_label}</span>)}
    </div>
  ),
}));

function apiResponse(data: unknown) {
  return new Response(
    JSON.stringify({
      code: 0,
      message: 'success',
      data,
      request_id: 'req-test',
      timestamp: '2026-05-31T00:00:00Z',
    }),
    { status: 200 },
  );
}

function paginated(items: unknown[], page = 1, pageSize = 10) {
  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total: items.length,
      total_pages: 1,
    },
  };
}

describe('PlatformApp providers page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders only platform providers and supports draft connection test in drawer', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation((input) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'http://localhost');
      if (url.pathname === '/api/v1/ai-resources/configs') {
        return Promise.resolve(apiResponse({
          items: [
            {
              provider_id: 'platform-provider-1',
              provider_name: '平台法务助手',
              route_name: '平台默认法务路由',
              provider_kind: 'OpenAI',
              provider: 'OpenAI',
              scope: 'platform',
              is_platform_default: true,
              team_can_manage: true,
              api_base: 'https://api.openai.com/v1',
              api_key_configured: true,
              model_id: 'gpt-4.1-mini',
              default_model: 'gpt-4.1-mini',
              models: ['gpt-4.1-mini'],
              pricing: {
                input_price_per_million: 2.5,
                output_price_per_million: 8.5,
                cache_hit_price_per_million: 0.5,
              },
              capabilities: ['text'],
              runtime_config: { temperature: 0, max_output_tokens: 2048, timeout_ms: 15000 },
              status: 'enabled',
              last_test_status: 'success',
              last_test_at: '2026-05-31T00:00:00Z',
              last_test_latency_ms: 123,
              last_request_id: 'req-platform-1',
            },
            {
              provider_id: 'team-provider-1',
              route_name: '企业自有路由',
              provider_kind: 'OpenAI Compatible',
              provider: 'OpenAI Compatible',
              scope: 'team',
              is_platform_default: false,
              team_can_manage: true,
              api_base: 'https://team.example.com/v1',
              api_key_configured: true,
              model_id: 'team-model',
              default_model: 'team-model',
              models: ['team-model'],
              pricing: {
                input_price_per_million: 1,
                output_price_per_million: 2,
                cache_hit_price_per_million: 0,
              },
              capabilities: ['text'],
              runtime_config: { temperature: 0, max_output_tokens: 512, timeout_ms: 5000 },
              status: 'enabled',
            },
          ],
        }));
      }
      if (url.pathname === '/api/v1/ai-resources/configs/test-draft') {
        return Promise.resolve(apiResponse({
          route_name: '平台新路由',
          provider_kind: 'OpenAI',
          model: 'gpt-4.1-mini',
          latency_ms: 188,
          status: 'success',
          request_id: 'req-draft-test',
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<PlatformApp page="providers" />);

    expect((await screen.findAllByText('平台法务助手')).length).toBeGreaterThan(0);
    expect(screen.queryByText('企业自有路由')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /新增 Provider/ }));
    const drawer = await screen.findByRole('dialog', { name: /新增平台 Provider/ });

    await user.type(within(drawer).getByLabelText('配置名称'), '平台新路由');
    await user.type(within(drawer).getByLabelText(/模型 ID|接入点 \/ 模型 ID/), 'gpt-4.1-mini');
    await user.click(within(drawer).getByRole('button', { name: /测试连接/ }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/ai-resources/configs/test-draft',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
    expect(await screen.findByText(/连接测试成功/)).toBeInTheDocument();
  });
});

describe('PlatformApp operations pages', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders overview amounts as points without repeated exchange wording', async () => {
    vi.mocked(fetch).mockResolvedValue(apiResponse({
      summary: {
        total_commission_points: 1200,
        month_commission_points: 300,
        pending_payment_count: 2,
        pending_payment_points: 80,
        pending_team_verifications: 1,
        pending_certifications: 3,
      },
      commission_setting: {
        commission_rate_bps: 1000,
        commission_rate_percent: 10,
        unit_hint: '1 积分 = 1 元',
      },
      settlement_trend: [
        { date: '2026-05-31', commission_points: 30, commission_yuan: 30 },
      ],
      recent_settlements: [
        {
          ledger_id: 'recent-ledger-1',
          team_id: 'team-1',
          team_name: '最近企业',
          labeler_name: '标注员乙',
          reward_points: 100,
          amount_points: 10,
          commission_rate_bps: 1000,
          status: 'completed',
          created_at: '2026-05-31T00:00:00Z',
        },
      ],
      pending_payments: [],
      unit_hint: '1 积分 = 1 元',
    }));

    render(<PlatformApp page="overview" />);

    expect(await screen.findByRole('heading', { name: '经营总览' })).toBeInTheDocument();
    expect(await screen.findByText('累计服务费')).toBeInTheDocument();
    expect(screen.getByText('1,200 积分')).toBeInTheDocument();
    expect(screen.getAllByText('30 积分').length).toBeGreaterThan(0);
    expect(screen.getByTestId('settlement-trend-chart')).toBeInTheDocument();
    expect(screen.getByText('运营待办')).toBeInTheDocument();
    expect(screen.getByText('企业认证').closest('a')).toHaveAttribute('href', '/platform?page=verification');
    expect(screen.getByText('资质审核').closest('a')).toHaveAttribute('href', '/platform?page=verification');
    expect(screen.getByText('最近企业')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '查看全部' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('待处理提现')).not.toBeInTheDocument();
    expect(screen.queryByText(/1 积分 = 1 元/)).not.toBeInTheDocument();
  });

  it('submits settlement filters through real query params', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(apiResponse(paginated([
      {
        ledger_id: 'ledger-1',
        team_id: 'team-1',
        team_name: '筛选企业',
        labeler_name: '标注员甲',
        reward_points: 100,
        amount_points: 10,
        commission_rate_bps: 1000,
        status: 'completed',
        created_at: '2026-05-31T00:00:00Z',
      },
    ]))));

    render(<PlatformApp page="settlements" />);

    expect(await screen.findByText('筛选企业')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('企业 / 标注员 / 来源 ID'), '筛选企业');
    await user.type(screen.getByPlaceholderText('企业 ID'), 'team-1');
    await user.click(screen.getByRole('button', { name: /筛\s*选/ }));

    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(urls.some((url) => (
        url.includes('/api/v1/platform/settlements')
        && url.includes('keyword=')
        && url.includes('team_id=team-1')
      ))).toBe(true);
    });
  });

  it('shows team verification materials and closes details after approval', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/platform/teams/verification-queue') {
        return Promise.resolve(apiResponse(paginated([
          {
            team_id: 'team-verify-1',
            company_name: '待审企业',
            verification_status: 'pending_review',
            legal_name: '待审主体',
            registration_number: '913000000000000000',
            verification_contact: '张三',
            verification_phone: '13800000000',
            verification_materials: [{
              file_id: 'upload-license-1',
              filename: 'business-license.pdf',
              content_type: 'application/pdf',
              size: 2048,
            }],
            verification_submitted_at: '2026-05-31T00:00:00Z',
          },
        ])));
      }
      if (url.pathname === '/api/v1/platform/teams/team-verify-1/verification/review') {
        return Promise.resolve(apiResponse({
          team_id: 'team-verify-1',
          company_name: '待审企业',
          verification_status: 'verified',
        }));
      }
      return Promise.resolve(apiResponse(paginated([])));
    });

    render(<PlatformApp page="verification" />);

    await user.click(await screen.findByText('待审企业'));
    await screen.findByText('企业认证详情');

    expect(screen.getAllByText('待审主体').length).toBeGreaterThan(1);
    expect(screen.getByText('business-license.pdf')).toBeInTheDocument();
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /查\s*看/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /通\s*过/ }).length).toBeGreaterThan(0);

    const drawer = screen.getByText('企业认证详情').closest('.ant-drawer') as HTMLElement;
    expect(drawer).toBeTruthy();
    await user.click(within(drawer).getByRole('button', { name: /通\s*过/ }));
    const modalTitle = await screen.findByText('通过企业认证');
    const modal = modalTitle.closest('.ant-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    await user.click(within(modal).getByRole('button', { name: /通\s*过/ }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/platform/teams/team-verify-1/verification/review',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('企业认证详情')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('待审企业')).toBeInTheDocument();
  });

  it('shows certification documents and closes details after approval', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/platform/teams/verification-queue') {
        return Promise.resolve(apiResponse(paginated([])));
      }
      if (url.pathname === '/api/v1/platform/certifications/review-queue') {
        return Promise.resolve(apiResponse(paginated([
          {
            cert_id: 'cert-review-1',
            cert_category: 'education',
            cert_type: 'degree',
            cert_name: '本科学历认证',
            status: 'pending_review',
            provider: null,
            submitted_data: { school: '测试大学', degree: '本科' },
            documents: [{
              file_id: 'profile-doc-1',
              name: 'degree-proof.png',
              content_type: 'image/png',
              size: 4096,
            }],
            created_at: '2026-05-31T00:00:00Z',
            user: {
              user_id: 'user-cert-1',
              username: 'labeler1',
              display_name: '李四',
              email: 'labeler@example.com',
              role: 'labeler',
              status: 'active',
            },
          },
        ])));
      }
      if (url.pathname === '/api/v1/platform/certifications/cert-review-1/review') {
        return Promise.resolve(apiResponse({
          cert_id: 'cert-review-1',
          status: 'approved',
        }));
      }
      return Promise.resolve(apiResponse(paginated([])));
    });

    render(<PlatformApp page="verification" />);

    await user.click(await screen.findByRole('tab', { name: '标注员资质' }));
    await user.click(await screen.findByText('李四'));
    await screen.findByText('资质审核详情');

    expect(screen.getByText('degree-proof.png')).toBeInTheDocument();
    expect(screen.getByText('image/png')).toBeInTheDocument();
    expect(screen.queryByText(/"file_id"/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /查\s*看/ })).toBeInTheDocument();

    const drawer = screen.getByText('资质审核详情').closest('.ant-drawer') as HTMLElement;
    expect(drawer).toBeTruthy();
    await user.click(within(drawer).getByRole('button', { name: /通\s*过/ }));
    const modalTitle = await screen.findByText('通过资质认证');
    const modal = modalTitle.closest('.ant-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    await user.click(within(modal).getByRole('button', { name: /通\s*过/ }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/platform/certifications/cert-review-1/review',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('资质审核详情')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('李四')).toBeInTheDocument();
  });

  it('saves commission setting as basis points', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/platform/settings/commission' && init?.method === 'PUT') {
        return Promise.resolve(apiResponse({
          commission_rate_bps: JSON.parse(String(init.body)).commission_rate_bps,
          commission_rate_percent: 12.5,
          unit_hint: '1 积分 = 1 元',
        }));
      }
      if (url.pathname === '/api/v1/platform/settings/commission') {
        return Promise.resolve(apiResponse({
          commission_rate_bps: 1000,
          commission_rate_percent: 10,
          unit_hint: '1 积分 = 1 元',
        }));
      }
      if (url.pathname === '/api/v1/platform/settings/agent-embedding') {
        return Promise.resolve(apiResponse({
          api_base: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          api_key_configured: true,
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<PlatformApp page="settings" />);

    const input = await screen.findByLabelText('平台服务费率');
    await user.clear(input);
    await user.type(input, '12.5');
    await user.click(screen.getByRole('button', { name: /保存服务费设置/ }));

    await waitFor(() => {
      const saveCall = vi.mocked(fetch).mock.calls.find(([inputUrl, init]) => (
        String(inputUrl).includes('/platform/settings/commission') && init?.method === 'PUT'
      ));
      expect(saveCall?.[1]).toEqual(expect.objectContaining({
        body: JSON.stringify({ commission_rate_bps: 1250 }),
      }));
    });
  });

  it('saves embedding setting without overwriting an existing key with blank input', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/platform/settings/commission') {
        return Promise.resolve(apiResponse({
          commission_rate_bps: 1000,
          commission_rate_percent: 10,
          unit_hint: '1 积分 = 1 元',
        }));
      }
      if (url.pathname === '/api/v1/platform/settings/agent-embedding' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        return Promise.resolve(apiResponse({
          api_base: body.api_base,
          model: body.model,
          api_key_configured: true,
        }));
      }
      if (url.pathname === '/api/v1/platform/settings/agent-embedding') {
        return Promise.resolve(apiResponse({
          api_base: 'https://old-embeddings.example/v1',
          model: 'old-embedding-model',
          api_key_configured: true,
        }));
      }
      return Promise.resolve(apiResponse(null));
    });

    render(<PlatformApp page="settings" />);

    const apiBaseInput = await screen.findByLabelText('Embedding API Base');
    await user.clear(apiBaseInput);
    await user.type(apiBaseInput, 'https://embeddings.example/v1');
    const modelInput = screen.getByLabelText('Embedding 模型');
    await user.clear(modelInput);
    await user.type(modelInput, 'bge-m3');
    await user.click(screen.getByRole('button', { name: /保存 Embedding 配置/ }));

    await waitFor(() => {
      const saveCall = vi.mocked(fetch).mock.calls.find(([inputUrl, init]) => (
        String(inputUrl).includes('/platform/settings/agent-embedding') && init?.method === 'PUT'
      ));
      expect(saveCall?.[1]).toEqual(expect.objectContaining({
        body: JSON.stringify({
          api_base: 'https://embeddings.example/v1',
          model: 'bge-m3',
        }),
      }));
    });
    expect(screen.getByText('Key 已配置')).toBeInTheDocument();
    expect(screen.getByLabelText('Embedding API Base')).toHaveValue('https://embeddings.example/v1');
    expect(screen.getByLabelText('Embedding 模型')).toHaveValue('bge-m3');
  });
});
