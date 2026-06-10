import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const loginResponse = {
  code: 0,
  message: '登录成功',
  data: {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 1800,
    token_type: 'Bearer',
    user: {
      user_id: '64a1234567890abcdef12345',
      username: 'labeler01',
      display_name: 'Labeler One',
      email: 'labeler@example.com',
      role: 'labeler',
      email_verified: true,
      permissions: ['label:read', 'label:write'],
    },
  },
  request_id: 'req-1',
  timestamp: '2026-05-23T00:00:00Z',
};

const pendingLoginResponse = {
  ...loginResponse,
  data: {
    ...loginResponse.data,
    user: {
      ...loginResponse.data.user,
      username: 'newuser',
      display_name: '新用户',
      email: 'owner@example.com',
      role: 'pending',
      permissions: [],
    },
  },
};

const sendCodeResponse = {
  code: 0,
  message: '验证码已发送',
  data: { email: 'la***@example.com', expire_in_seconds: 600 },
  request_id: 'req-code',
  timestamp: '2026-05-23T00:00:00Z',
};

const oauthChoiceResponse = {
  code: 0,
  message: 'OAuth 登录成功',
  data: {
    needs_account_link: true,
    provider: 'github',
    suggested_username: 'github-user',
    suggested_email: 'github-user@example.com',
    email_verified_by_provider: true,
    has_matching_user: false,
    bind_ticket: 'oauth-bind-ticket',
  },
  request_id: 'req-oauth-choice',
  timestamp: '2026-05-29T00:00:00Z',
};

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits credentials to backend login API and persists token payload', async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(loginResponse), { status: 200 }));

    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByLabelText('邮箱或登录账号'), 'labeler@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ account: 'labeler@example.com', password: 'SecurePass123!' }),
      }),
    );
    expect(window.localStorage.getItem('markup_access_token')).toBe('access-token');
    expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ username: 'labeler01', display_name: 'Labeler One' }));
    expect(await screen.findByText(/已登录：Labeler One/)).toBeInTheDocument();
  });

  it('shows backend error message and does not persist tokens when login fails', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 40103,
          message: '账号或密码错误',
          detail: null,
          request_id: 'req-2',
          timestamp: '2026-05-23T00:00:00Z',
        }),
        { status: 401 },
      ),
    );

    render(<LoginPage />);

    await user.type(screen.getByLabelText('邮箱或登录账号'), 'labeler@example.com');
    await user.type(screen.getByLabelText('密码'), 'WrongPass123!');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误');
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
  });

  it('keeps submit disabled until minimum account and password requirements are met', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const submit = screen.getByRole('button', { name: /登\s*录/ });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(await screen.findByText('请输入邮箱或登录账号')).toBeInTheDocument();
    expect(screen.getByText('请输入密码')).toBeInTheDocument();
  });

  it('toggles password visibility on the login form', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText('密码');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('uses session storage instead of local storage when remember me is disabled', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(loginResponse), { status: 200 }));

    render(<LoginPage />);

    await user.type(screen.getByLabelText('邮箱或登录账号'), 'labeler@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByLabelText('保持登录状态'));
    await user.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem('markup_access_token')).toBeNull();
    expect(window.sessionStorage.getItem('markup_access_token')).toBe('access-token');
  });

  it('registers a pending account and logs in automatically after accepting terms', async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(sendCodeResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...sendCodeResponse, message: '注册成功', data: { user_id: 'u1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pendingLoginResponse), { status: 200 }));

    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    expect(screen.queryByLabelText('账号角色')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('显示名'), '新用户');
    await user.type(screen.getByLabelText('登录账号'), 'newuser');
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: /发验证码/ }));
    expect(await screen.findByText(/验证码已发送至/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /60s/ })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: '邮箱验证码' }), '123456');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole('button', { name: /注册账号/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/auth/email/send-code', expect.objectContaining({ body: JSON.stringify({ email: 'owner@example.com', purpose: 'register' }) }));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/register',
      expect.objectContaining({
        body: JSON.stringify({ display_name: '新用户', username: 'newuser', email: 'owner@example.com', password: 'SecurePass123!', role: 'pending', email_code: '123456' }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/v1/auth/login', expect.objectContaining({ body: JSON.stringify({ account: 'owner@example.com', password: 'SecurePass123!' }) }));
    expect(window.localStorage.getItem('markup_access_token')).toBe('access-token');
    expect(JSON.parse(window.localStorage.getItem('markup_user') || '{}')).toMatchObject({ role: 'pending' });
    expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'pending' }));
  });

  it('shows a friendly validation message when login account is invalid', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByLabelText('显示名'), '新用户');
    await user.type(screen.getByLabelText('登录账号'), 'BadAccount');
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'labeler04@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.type(screen.getByRole('textbox', { name: '邮箱验证码' }), '123456');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole('button', { name: /注册账号/ }));

    expect(
      await screen.findByText((content) => content.includes('登录账号需为 4-32 位，字母开头，仅支持小写字母、数字和下划线')),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a validation message when register submit is clicked before accepting terms', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByLabelText('显示名'), '审核员一号');
    await user.type(screen.getByLabelText('登录账号'), 'reviewer01');
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'reviewer@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');

    const submit = screen.getByRole('button', { name: /注册账号/ });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(await screen.findByText('请先阅读并同意用户协议与隐私政策')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    expect(submit).toBeEnabled();
  });

  it('shows a validation message when login submit is clicked before accepting terms', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('邮箱或登录账号'), 'labeler@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByText('请先阅读并同意用户协议与隐私政策')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a specific register password-strength message before submitting', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByLabelText('显示名'), '标注员二号');
    await user.type(screen.getByLabelText('登录账号'), 'labeler02');
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'labeler02@example.com');
    await user.type(screen.getByLabelText('密码'), 'password');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole('button', { name: /注册账号/ }));

    expect(await screen.findByText('密码必须同时包含大小写字母')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows backend validation detail instead of the generic validation title', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 40001,
          message: '参数校验失败',
          detail: [{ field: 'body.password', message: 'Value error, 密码必须包含字母、数字和特殊字符中的至少三类' }],
          request_id: 'req-validation',
          timestamp: '2026-05-26T00:00:00Z',
        }),
        { status: 400 },
      ),
    );

    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByLabelText('显示名'), '标注员三号');
    await user.type(screen.getByLabelText('登录账号'), 'labeler03');
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'labeler03@example.com');
    await user.type(screen.getByRole('textbox', { name: '邮箱验证码' }), '123456');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    await user.click(screen.getByRole('button', { name: /注册账号/ }));

    expect(
      await screen.findByText((content) =>
        content.includes('密码必须包含字母、数字和特殊字符中的至少三类'),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('参数校验失败')).not.toBeInTheDocument();
  });

  it('shows a validation message when register code is requested without a valid email', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    const sendCodeButton = screen.getByRole('button', { name: /发验证码/ });
    expect(sendCodeButton).toBeEnabled();

    await user.click(sendCodeButton);
    expect(await screen.findByText('请输入有效邮箱')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts register code countdown when backend reports frequent sending', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 42201,
          message: '验证码发送过于频繁',
          detail: null,
          request_id: 'req-frequent',
          timestamp: '2026-05-27T00:00:00Z',
        }),
        { status: 422 },
      ),
    );

    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: /发验证码/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('验证码发送过于频繁');
    expect(screen.getByRole('button', { name: /60s/ })).toBeDisabled();
  });

  it('opens policy dialogs and closes them from the document footer', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));
    await user.click(screen.getByRole('button', { name: '用户协议' }));
    expect(screen.getByRole('dialog', { name: 'MarkUp 用户协议' })).toBeInTheDocument();
    expect(screen.getByText(/账号与权限/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '我已阅读，关闭窗口' }));
    expect(screen.queryByRole('dialog', { name: 'MarkUp 用户协议' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '隐私政策' }));
    expect(screen.getByRole('dialog', { name: 'MarkUp 隐私政策' })).toBeInTheDocument();
    expect(screen.getByText(/Cookie 与本地存储/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '我已阅读，关闭窗口' }));
    expect(screen.queryByRole('dialog', { name: 'MarkUp 隐私政策' })).not.toBeInTheDocument();
  });

  it('sends reset password code and resets password', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...sendCodeResponse, data: { email: 'la***@example.com', expire_in_seconds: 600 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...sendCodeResponse, message: '密码重置成功', data: null }), { status: 200 }));

    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: '忘记密码' }));
    await user.type(screen.getByRole('textbox', { name: '注册邮箱' }), 'labeler@example.com');
    await user.click(screen.getByRole('button', { name: /发验证码/ }));
    expect(await screen.findByText(/重置验证码已发送至/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '邮箱验证码' }), '123456');
    await user.type(screen.getByLabelText('新密码'), 'NewSecurePass123!');
    await user.click(screen.getByRole('button', { name: /重置密码/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/auth/email/send-code', expect.objectContaining({ body: JSON.stringify({ email: 'labeler@example.com', purpose: 'reset_password' }) }));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/password/reset',
      expect.objectContaining({
        body: JSON.stringify({ email: 'labeler@example.com', email_code: '123456', new_password: 'NewSecurePass123!' }),
      }),
    );
    expect(await screen.findByText('密码已重置，请使用新密码登录')).toBeInTheDocument();
  });

  it('renders icon-only OAuth entries for GitHub, Google and Hugging Face', () => {
    render(<LoginPage />);

    expect(screen.getByRole('link', { name: 'GitHub 登录' })).toHaveAttribute('href', '/api/v1/auth/oauth/github/start');
    expect(screen.getByRole('link', { name: 'Google 登录' })).toHaveAttribute('href', '/api/v1/auth/oauth/google/start');
    expect(screen.getByRole('link', { name: 'Hugging Face 登录' })).toHaveAttribute('href', '/api/v1/auth/oauth/huggingface/start');
    expect(screen.queryByText('飞书登录')).not.toBeInTheDocument();
  });

  it('passes redirect_after_login to OAuth start links when continuation is provided', () => {
    render(<LoginPage redirectAfterLogin="/onboarding?organization_action=join&invite_code=TM-INV-123" />);

    expect(screen.getByRole('link', { name: 'GitHub 登录' })).toHaveAttribute(
      'href',
      '/api/v1/auth/oauth/github/start?redirect_after_login=%2Fonboarding%3Forganization_action%3Djoin%26invite_code%3DTM-INV-123',
    );
  });

  it('shows explicit OAuth account choice instead of auto-creating a user on first authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(oauthChoiceResponse), { status: 200 }));

    render(<LoginPage overlayMode oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'bind' }} />);

    expect(await screen.findByRole('tab', { name: '绑定已有账号' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '注册新账号' })).toBeInTheDocument();
    expect(screen.queryByText('选择方式')).not.toBeInTheDocument();
    expect(screen.queryByText('第三方平台')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /继续GitHub授权/ })).not.toBeInTheDocument();
  });

  it('auto logs in immediately when oauth callback exchanges to an existing linked account', async () => {
    const onLoginSuccess = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(loginResponse), { status: 200 }));

    render(<LoginPage overlayMode onLoginSuccess={onLoginSuccess} oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'bind' }} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/oauth/exchange',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ ticket: 'oauth-ticket' }),
      }),
    );
    expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ username: 'labeler01', display_name: 'Labeler One' }));
    expect(screen.queryByRole('button', { name: /继续GitHub授权/ })).not.toBeInTheDocument();
  });

  it('links an existing MarkUp account after first OAuth authorization', async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(oauthChoiceResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(loginResponse), { status: 200 }));

    render(<LoginPage overlayMode onLoginSuccess={onLoginSuccess} oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'bind' }} />);

    await screen.findByRole('tab', { name: '绑定已有账号' });
    await user.type(screen.getByLabelText('现有账号'), 'labeler@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: '绑定并进入' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/oauth/link-account',
      expect.objectContaining({
        body: JSON.stringify({
          ticket: 'oauth-bind-ticket',
          account: 'labeler@example.com',
          password: 'SecurePass123!',
        }),
      }),
    );
    expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ username: 'labeler01', display_name: 'Labeler One' }));
  });

  it('shows the backend conflict error when the target account already bound the same provider', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(oauthChoiceResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40901,
        message: '当前账号已绑定该平台的其他第三方账号',
        detail: null,
        request_id: 'req-oauth-conflict',
        timestamp: '2026-05-31T00:00:00Z',
      }), { status: 409 }));

    render(<LoginPage overlayMode oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'bind' }} />);

    await screen.findByRole('tab', { name: '绑定已有账号' });
    await user.type(screen.getByLabelText('现有账号'), 'labeler@example.com');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: '绑定并进入' }));

    expect(await screen.findByText('当前账号已绑定该平台的其他第三方账号')).toBeInTheDocument();
  });

  it('registers a new pending account after first OAuth authorization and keeps onboarding behavior', async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(oauthChoiceResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pendingLoginResponse), { status: 200 }));

    render(<LoginPage overlayMode onLoginSuccess={onLoginSuccess} oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'bind' }} />);

    await user.click(await screen.findByRole('tab', { name: '注册新账号' }));
    await user.clear(screen.getByLabelText('显示名'));
    await user.type(screen.getByLabelText('显示名'), 'GitHub新用户');
    await user.clear(screen.getByLabelText('登录账号'));
    await user.type(screen.getByLabelText('登录账号'), 'github_new_user');
    await user.type(screen.getByLabelText('密码'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: '创建账号并继续' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/oauth/register-account',
      expect.objectContaining({
        body: JSON.stringify({
          ticket: 'oauth-bind-ticket',
          display_name: 'GitHub新用户',
          username: 'github_new_user',
          email: undefined,
          email_code: undefined,
          password: 'SecurePass123!',
          role: 'pending',
        }),
      }),
    );
    expect(onLoginSuccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'pending' }));
  });

  it('shows a readonly trusted email in OAuth register mode when provider email is verified', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(oauthChoiceResponse), { status: 200 }));

    render(<LoginPage overlayMode oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'register' }} />);

    const trustedEmail = await screen.findByDisplayValue('github-user@example.com');
    expect(trustedEmail).toBeDisabled();
  });

  it('shows email code fields in OAuth register mode when provider did not return a trusted email', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ...oauthChoiceResponse,
      data: {
        ...oauthChoiceResponse.data,
        suggested_email: null,
        email_verified_by_provider: false,
      },
    }), { status: 200 }));

    render(<LoginPage overlayMode oauthContext={{ ticket: 'oauth-ticket', provider: 'github', initialMode: 'register' }} />);

    expect(await screen.findByRole('textbox', { name: '邮箱' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '邮箱验证码' })).toBeInTheDocument();
  });
});
