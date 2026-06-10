import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Space,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { Rule } from 'antd/es/form';
import { normalizeAppRelativePath } from '../../services/appLink';
import {
  bindOAuthEmail,
  exchangeOAuthTicket,
  linkOAuthAccount,
  login,
  register,
  registerOAuthAccount,
  resetPassword,
  sendEmailCode,
} from '../../services/authService';
import { ApiClientError } from '../../services/apiClient';
import { clearAllStoredSessions, persistSession } from '../../stores/authStore';
import type { ApiUser, LoginPayload, OAuthAccountChoicePayload, OAuthEmailBindingPayload } from '../../types/api';
import { OAuthProviderIcon } from '../../components/auth/OAuthProviderIcon';
import './LoginPage.css';

interface LoginPageProps {
  onLoginSuccess?: (user: ApiUser) => void;
  overlayMode?: boolean;
  initialMode?: 'login' | 'register';
  onClose?: () => void;
  redirectAfterLogin?: string;
  oauthContext?: {
    ticket: string;
    provider?: string;
    initialMode?: 'bind' | 'register';
  };
}

type AuthMode = 'login' | 'register' | 'forgot-password' | 'oauth-callback';
type PolicyModalKind = 'terms' | 'privacy';
type CodePurpose = 'register' | 'reset_password' | 'bind_email';
type OAuthTabMode = 'bind' | 'register' | 'bind-email';
type AuthFieldError = { name: string; errors: string[] };

const CODE_RESEND_SECONDS = 60;

interface PolicySection {
  title: string;
  body: string[];
}

const roleLabels: Record<string, string> = {
  labeler: '标注员',
  reviewer: '审核员',
  owner: '任务负责人',
  admin: '企业管理员',
  team_admin: '企业管理员',
  platform_admin: '平台管理员',
  agent: 'AI 资源管理员',
  pending: '待分流账号',
};

const providerLabels: Record<string, string> = {
  github: 'GitHub',
  google: 'Google',
  huggingface: 'Hugging Face',
};

const usernamePattern = /^[a-z][a-z0-9_]{3,31}$/;

const oauthProviders: Array<{ key: 'github' | 'google' | 'huggingface'; href: string }> = [
  { key: 'github', href: '/auth/oauth/github/start' },
  { key: 'google', href: '/auth/oauth/google/start' },
  { key: 'huggingface', href: '/auth/oauth/huggingface/start' },
];

const heroProofs = [
  {
    title: '动态模板',
    description: '同一份 Schema 同时服务模板搭建、在线标注与质量回放。',
    badge: 'Schema',
  },
  {
    title: 'AI 预审闭环',
    description: '提交后自动进入预审队列，把问题尽量拦在人工复核之前。',
    badge: 'AI 问答',
  },
  {
    title: '全链路可追溯',
    description: '从任务、草稿、审核到导出，关键操作都有状态和记录。',
    badge: 'Audit',
  },
];

function validateRegisterPassword(password: string): string | null {
  if (password.length < 8) return '请输入至少 8 位密码';
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!(hasLower && hasUpper)) return '密码必须同时包含大小写字母';
  if ([hasLower || hasUpper, hasDigit, hasSymbol].filter(Boolean).length < 3) {
    return '密码必须包含字母、数字和特殊字符中的至少三类';
  }
  return null;
}

const registerPasswordRule: Rule = {
  validator: async (_, value?: string) => {
    const error = validateRegisterPassword(value ?? '');
    if (error) {
      throw new Error(error);
    }
  },
};

function hasControlCharacter(value: string) {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

const displayNameRule: Rule = {
  validator: async (_, value?: string) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new Error('请输入显示名');
    }
    if (normalized.length > 32) {
      throw new Error('显示名不能超过 32 个字符');
    }
    if (hasControlCharacter(normalized)) {
      throw new Error('显示名不能包含控制字符');
    }
  },
};

const usernameRule: Rule = {
  validator: async (_, value?: string) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new Error('请输入登录账号');
    }
    if (!usernamePattern.test(normalized)) {
      throw new Error('登录账号需为 4-32 位，字母开头，仅支持小写字母、数字和下划线');
    }
  },
};

function normalizeSuggestedUsername(value?: string | null) {
  const lowered = String(value ?? '').trim().toLowerCase();
  const filtered = lowered.replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '');
  if (!filtered) return '';
  if (filtered.length >= 4) return filtered.slice(0, 32);
  return `${filtered}user`.slice(0, 32);
}

function buildOAuthProviderHref(apiBaseUrl: string, providerHref: string, redirectAfterLogin?: string) {
  const suffix = normalizeAppRelativePath(redirectAfterLogin ?? '');
  if (!suffix) {
    return `${apiBaseUrl}${providerHref}`;
  }
  const url = new URL(`${apiBaseUrl}${providerHref}`, window.location.origin);
  url.searchParams.set('redirect_after_login', suffix);
  return `${url.pathname}${url.search}`;
}

const registerRules: Record<string, Rule[]> = {
  display_name: [
    { required: true, message: '请输入显示名' },
    displayNameRule,
  ],
  username: [
    { required: true, message: '请输入登录账号' },
    usernameRule,
  ],
  email: [
    { required: true, message: '请输入邮箱' },
    { type: 'email', message: '请输入有效邮箱' },
  ],
  email_code: [{ required: true, message: '请输入邮箱验证码' }],
  password: [
    { required: true, message: '请输入密码' },
    registerPasswordRule,
  ],
  accepted_terms: [
    {
      validator: async (_, value?: boolean) => {
        if (!value) {
          throw new Error('请先阅读并同意用户协议与隐私政策');
        }
      },
    },
  ],
};

const policyDocuments: Record<
  PolicyModalKind,
  { title: string; updatedAt: string; intro: string; sections: PolicySection[] }
> = {
  terms: {
    title: 'MarkUp 用户协议',
    updatedAt: '2026-06-09',
    intro:
      '欢迎使用 MarkUp（马克派）数据标注平台。本协议用于说明您注册、登录、加入企业空间、发布或领取标注任务、提交审核意见、使用 AI 辅助能力及导入导出数据时的基本权利义务。请您在使用平台前仔细阅读；如您不同意本协议，请停止注册或使用相关服务。正式上线前，运营主体名称、联系方式、争议解决条款和业务合同仍需由项目负责人或法务结合实际部署环境复核。',
    sections: [
      {
        title: '1. 协议范围与服务说明',
        body: [
          'MarkUp 面向数据标注、任务发布、人工审核、企业协作、积分结算、AI 预审和数据导出场景提供在线工具。平台功能包括账号注册登录、企业空间管理、模板配置、数据导入、在线标注、审核流转、质量统计、审计日志和通知等。',
          '本协议适用于平台 Web 端、API、工作台、任务广场、企业管理后台、资质认证页面以及平台后续上线的同类功能。若某项服务另有专项协议、任务协议或企业合同约定，专项约定与本协议不一致的，以专项约定为准。',
          '平台仍可能处于教学、演示、试运行或内测阶段，部分功能、接口、第三方登录、邮件通知、对象存储、AI 能力和计费结算能力可能根据项目进度、部署环境和合规要求调整。',
        ],
      },
      {
        title: '2. 账号与权限',
        body: [
          '您应使用本人真实、有效、可接收验证码的邮箱注册账号，并保证提交的用户名、展示名称、企业信息、资质材料和联系方式真实、准确、完整。因信息不真实、不完整或未及时更新导致的认证失败、任务限制或结算异常，由您自行承担。',
          '您应妥善保管密码、验证码、访问令牌、刷新令牌、企业邀请链接和第三方登录授权。任何通过您账号发生的操作，除非能证明非因您原因造成，均可能被视为您本人或您授权人员的行为。',
          '平台支持 Team Admin、Owner、Reviewer、Labeler、Platform Admin 等角色。不同角色拥有不同操作范围，您不得绕过权限控制访问、修改、导出、删除或披露未授权数据，不得冒用他人身份加入企业空间或领取任务。',
          '如发现账号被盗用、权限异常、企业成员误操作、验证码泄露或设备丢失，应立即修改密码，并及时联系企业管理员或平台维护人员冻结、移除或恢复相关权限。',
        ],
      },
      {
        title: '3. 用户内容与数据责任',
        body: [
          '您或您所属企业上传的数据集、题目、模板、标注答案、审核意见、提示词、附件、资质材料、协议文件和导出文件，应由上传者或所属企业确保来源合法、授权充分、内容合规，并确认拥有使用、处理、标注、审核、导出和交付的必要权利。',
          '您不得上传、分发、标注、审核或导出包含违法违规、侵权、恶意代码、未授权个人信息、超范围敏感个人信息、国家秘密、商业秘密泄露风险、暴力恐怖、色情低俗、仇恨歧视或其他违反适用法律法规及平台规则的内容。',
          '如任务数据包含个人信息、敏感个人信息、版权内容、未公开业务资料或企业保密资料，发布者应在发布前完成合法性评估、脱敏处理、权限控制和必要告知，并在任务协议中明确标注员的保密、使用和删除要求。',
          '因用户自行上传、分发、领取、标注、审核、下载或对外披露数据导致的第三方争议、监管风险或损失，应由对应用户或所属企业依法承担责任；平台将根据法律要求、企业合同和审计记录协助核查。',
        ],
      },
      {
        title: '4. 平台使用规范',
        body: [
          '您不得以爬虫、批量攻击、接口滥用、撞库、逆向工程、规避验证码、绕过访问控制、伪造身份、篡改请求、干扰系统稳定性或破坏数据完整性的方式使用平台。',
          '您不得恶意领取任务、批量提交低质量结果、伪造审核结论、操纵积分结算、绕过预算控制、破坏任务状态机、删除或篡改审计记录、规避导出限制，或利用脚本影响平台统计和结算。',
          '您应按照任务要求和标注规范提交结果。对于明显复制粘贴、与题目无关、恶意灌水、违反任务协议、泄露任务数据或经审核认定质量不达标的结果，平台或企业可驳回、要求返工、扣减积分、限制任务或采取其他管理措施。',
          '平台可基于安全、合规、系统稳定、项目管理、企业规则或争议处理需要，限制、暂停或终止异常账号、异常任务、异常导出和异常接口请求的部分或全部功能。',
        ],
      },
      {
        title: '5. AI 辅助能力与审核结果',
        body: [
          '平台可能提供 AI 预审、字段说明生成、评分矩阵生成、任务发布助手、模板助手、内容摘要或质量提示等辅助能力。AI 输出仅作为配置、审核或质检参考，不当然代表平台、企业或人工审核员的最终结论。',
          '使用 AI 能力时，您应避免输入无关敏感个人信息、商业秘密、密钥、密码、未授权数据或其他不适合提交给模型服务的内容。企业管理员或任务发布者应根据实际 Provider、模型服务和数据处理范围评估是否适合启用 AI 功能。',
          'AI 结果可能存在不准确、不完整、偏差或不适用于特定业务场景的情况。涉及任务发布、审核结论、质量扣分、人员管理、结算和对外交付的决定，应由具备权限的用户复核后作出。',
        ],
      },
      {
        title: '6. 知识产权与授权',
        body: [
          'MarkUp 的页面设计、源代码、接口文档、平台名称、架构设计、交互组件、系统组件、测试数据组织方式和相关文档，由项目企业或相关权利人依法享有权利。未经授权，您不得复制、改编、分发、出售、出租、反向工程或用于建设竞争性服务。',
          '您保留其依法拥有的原始数据、标注结果、审核意见、业务内容和企业资料权利。为向您和所属企业提供服务，您授权平台在必要范围内对相关内容进行存储、解析、展示、标注、审核、统计、导出、备份、安全审计、故障排查和质量改进。',
          '除非另有企业合同、任务协议或法律规定，平台不会因提供服务而取得您或企业上传数据的所有权。标注成果、交付物和知识产权归属以任务协议、企业合同或发布者配置为准。',
        ],
      },
      {
        title: '7. 积分、结算与审计',
        body: [
          '平台可能根据任务发布者配置、企业预算、审核状态、任务完成时限、返工结果、违规记录和质量评估计算积分、奖励、冻结、释放、扣减或提现资格。具体规则以任务页面、企业规则和平台当时展示的说明为准。',
          '为保障争议处理、财务核对和企业管理，平台会记录任务领取、提交、审核、打回、结算、预算变动、导出、登录和权限变更等关键操作日志。您理解并同意此类审计记录可在必要范围内用于安全排查、质量追溯、争议处理和合规留存。',
          '如因系统故障、异常操作、重复结算、作弊、违规提交或企业预算异常导致积分或余额显示错误，平台或企业可在核实后进行更正、冻结、撤回或补发。',
        ],
      },
      {
        title: '8. 服务变更、中断与责任限制',
        body: [
          '平台可能因版本迭代、维护升级、第三方服务异常、网络故障、浏览器兼容问题、AI Provider 限流、安全事件、不可抗力或法律监管要求出现短时不可用、功能调整、数据处理延迟或服务中断。',
          '项目企业会尽合理努力维护服务稳定性和数据安全，但在教学、演示、试运行或内测阶段，不承诺服务持续、无错误、完全满足所有生产环境要求或完全兼容所有设备和浏览器。',
          '在法律允许范围内，平台不对因用户违规使用、企业配置错误、第三方服务故障、用户自行导出或披露数据、不可抗力及非平台可控原因造成的间接损失、预期收益损失或数据使用争议承担责任。',
        ],
      },
      {
        title: '9. 违规处理与协议终止',
        body: [
          '如您违反本协议、隐私政策、任务协议、企业规则或适用法律法规，平台可根据情节采取提示整改、驳回认证、限制领取、限制导出、暂停结算、扣减积分、冻结账号、撤销资质、移出企业空间、保留审计日志、向企业管理员通报或依法追究责任等措施。',
          '如您不再使用平台，可根据实际部署规则申请注销账号或退出企业空间。账号注销或权限移除后，与审计、结算、争议处理、备份恢复和合规留存相关的信息可能仍会在必要期限内保存。',
        ],
      },
      {
        title: '10. 协议更新与联系',
        body: [
          '本协议可能根据功能迭代、部署环境、运营主体、企业合同、法律法规和安全要求进行更新。涉及用户权利义务的重大变更，平台将通过页面提示、站内通知、邮件或文档更新等方式展示。',
          '如对协议内容、账号权限、任务规则、积分结算或数据处理有疑问，可通过项目维护渠道联系 MarkUp 项目企业或实际部署方。正式上线时应在本协议中补充明确的运营主体名称、注册地址、联系方式和投诉处理路径。',
        ],
      },
    ],
  },
  privacy: {
    title: 'MarkUp 隐私政策',
    updatedAt: '2026-06-09',
    intro:
      'MarkUp（马克派）重视个人信息与业务数据安全。本政策说明平台在账号注册、登录验证、企业协作、资质认证、任务发布、数据标注、人工审核、AI 预审、积分结算、导出和安全审计过程中如何收集、使用、保存、共享和保护相关信息，以及您可以如何行使访问、更正、删除、撤回同意和注销等权利。正式上线前，个人信息处理者名称、联系方式、第三方服务清单、保存期限和跨境处理情况仍需结合实际部署环境补充确认。',
    sections: [
      {
        title: '1. 我们收集和处理的信息',
        body: [
          '账号与身份信息：用户名、展示名称、邮箱、密码哈希、邮箱验证码哈希、账号状态、头像、角色、权限、登录时间、第三方登录标识及账号绑定状态。',
          '企业与协作信息：企业名称、企业资料、团队成员、成员角色、邀请记录、权限配置、预算申请、资源配置、任务分配、操作记录和通知状态。',
          '资质与认证信息：真实姓名、学历或院校信息、职业领域、机构、职务、注册编号、认证材料、补充材料、审核状态、驳回原因和用户协议勾选记录。请勿上传与认证无关的身份证号、住址、银行账户、健康信息等敏感信息。',
          '业务内容信息：任务标题、描述、标签、模板、字段映射、数据集、题目、上传文件、标注答案、草稿、审核意见、AI 预审配置和结果、导出配置、导出文件、任务协议和领取记录。',
          '设备与日志信息：IP 地址、浏览器和设备信息、访问时间、接口请求、错误日志、安全审计日志、性能诊断信息、登录失败记录、导出记录和权限变更记录。',
          '本地存储信息：为维持登录状态、记住会话和改善体验，平台可能在浏览器本地保存访问令牌、刷新令牌、用户基础信息、偏好设置或临时状态。',
        ],
      },
      {
        title: '2. 我们如何使用信息',
        body: [
          '用于完成注册登录、邮箱验证、忘记密码、第三方登录、账号绑定、企业邀请、角色权限校验、会话安全管理和账号异常处理。',
          '用于支持任务发布、模板配置、数据导入、在线标注、草稿保存、人工审核、AI 预审、质量统计、积分结算、提现申请、任务领取和领取后跳转工作台。',
          '用于完成资质认证、材料审核、职业能力匹配、任务分发限制、认证状态展示和认证争议处理。',
          '用于保障平台安全、排查故障、防止作弊和滥用、审计关键操作、处理用户反馈、改进产品功能、优化交互体验和进行必要的数据备份。',
          '用于遵守适用法律法规、监管要求、司法或行政机关依法提出的请求，以及企业合同、审计、财务核对和争议处理需要。',
        ],
      },
      {
        title: '3. 数据共享与委托处理',
        body: [
          '平台不会出售用户个人信息。为提供服务，可能在必要范围内调用邮件发送服务、OAuth 登录服务、对象存储、日志分析、AI 模型服务、支付或结算支持服务、云服务器、数据库和部署基础设施。',
          '涉及第三方服务或委托处理时，平台将尽量遵循最小必要原则，仅传递实现功能所需的信息，并要求相关服务在合理安全和保密范围内处理数据。正式上线前，应在本政策或附录中列明第三方服务名称、处理目的、处理信息类型和联系方式。',
          '企业内 Team Admin、Owner、Reviewer 等角色可根据权限查看与企业成员、任务发布、任务审核、预算结算、操作日志和导出相关的信息。Labeler 通常只能访问其领取任务和自身账号相关信息。',
          '如因合并、分立、转让、重组、破产清算或实际运营主体变更需要转移个人信息，平台将要求新的处理者继续受本政策约束，或在变更后重新向用户告知。',
          '在法律法规、监管要求、司法程序、安全事件处置或维护平台、企业、用户合法权益所必需时，平台可能依法披露必要信息。',
        ],
      },
      {
        title: '4. AI 服务与自动化处理',
        body: [
          '平台的 AI 预审、字段说明生成、评分矩阵生成、任务发布助手和模板助手可能会处理任务描述、字段样例、模板信息、审核规则、部分截断预览值或用户输入的提示词。平台会尽量避免向 AI 服务传输与功能无关的完整大文件、未绑定素材或无关敏感个人信息。',
          'AI 输出用于辅助配置、审核和质检，不应作为完全自动化的最终决策依据。涉及用户权益、任务结算、资质认证、违规处理或对外交付的结论，应由具备权限的人员复核。',
          '如企业接入自有 AI Provider，企业管理员应自行确认模型服务的合规性、数据处理范围、日志保留策略、跨境传输风险和保密义务。',
        ],
      },
      {
        title: '5. 敏感信息与业务保密',
        body: [
          '除非任务、认证或法律要求确有必要，请勿上传身份证件号码、精确定位、健康信息、财务账户、生物识别信息、未成年人信息、密钥、密码、商业秘密、国家秘密或其他高度敏感信息。',
          '如任务数据不可避免包含个人信息或敏感个人信息，发布者应在上传前完成合法授权、最小化、脱敏、权限隔离、任务协议提示和必要的安全评估；标注员和审核员仅可在完成任务所需范围内访问和使用，不得另行保存、复制、传播或用于其他目的。',
          '平台可能提供文件解析、预览、导出和审计能力。用户应在导出、下载、截图、复制或分享前确认有权进行该操作，并遵守企业保密要求和任务协议。',
        ],
      },
      {
        title: '6. 数据安全措施',
        body: [
          '平台采用密码哈希、验证码哈希、访问令牌、刷新令牌、角色权限校验、企业作用域隔离、审计日志、导出限制、HTTPS 部署建议、最小权限原则和必要的备份恢复机制保护账号和业务数据。',
          '平台会根据安全需要记录登录、权限、导出、任务领取、审核、结算、配置变更等关键事件，以便识别异常访问、排查故障、处理争议和追溯安全事件。',
          '任何互联网服务都无法保证绝对安全。若您发现安全漏洞、账号异常、数据泄露风险、误授权或异常导出，应立即通过项目维护渠道反馈，并及时修改密码、退出登录或联系企业管理员处理。',
        ],
      },
      {
        title: '7. Cookie 与本地存储',
        body: [
          '平台可能使用浏览器本地存储、会话存储或类似技术保存访问令牌、刷新令牌、用户信息、页面状态、界面偏好或临时草稿，以维持登录状态、减少重复输入并提升使用体验。',
          '您可通过退出登录、清理浏览器数据、关闭保持登录状态或更换设备来减少本地保存的信息。清理本地数据可能导致需要重新登录、部分偏好丢失或未保存状态无法恢复。',
        ],
      },
      {
        title: '8. 数据保存、删除与备份',
        body: [
          '平台会在实现服务目的、满足审计追溯、财务核对、争议处理、安全合规、备份恢复和企业管理所需期间保存相关信息。具体保存期限应由实际部署方根据业务合同、法律法规和系统配置确定。',
          '当信息不再为实现处理目的所必要，且不属于审计、备份、争议处理、合规留存或法律法规要求保留范围时，平台将根据实际部署规则删除、匿名化或停止继续处理。',
          '因备份、归档、日志留存和系统容灾机制，已删除的信息可能不会立即从备份系统中清除，但平台会限制其继续被主动访问和用于日常业务。',
        ],
      },
      {
        title: '9. 您的权利',
        body: [
          '在适用规则允许的范围内，您可请求访问、复制、更正、补充、删除您的个人信息，撤回同意，限制或拒绝部分处理，申请注销账号，退出企业空间，或请求说明个人信息处理规则。',
          '部分信息与企业任务、审计日志、结算记录、争议处理、权限管理或合规留存相关，可能需要由企业管理员、平台维护人员或实际部署方核验身份、确认权限和评估数据状态后处理。',
          '撤回同意或删除必要信息后，您可能无法继续使用依赖该信息的功能，例如账号登录、邮箱验证、资质认证、任务领取、积分结算、导出或企业协作。',
        ],
      },
      {
        title: '10. 未成年人保护',
        body: [
          '平台主要面向企业协作、教学实践和数据生产场景，不主动面向未成年人提供服务。未成年人不应在未取得监护人同意和学校或组织授权的情况下注册、上传资料或参与任务。',
          '如平台发现误收集未成年人个人信息，或监护人认为平台处理了未成年人信息，可通过项目维护渠道联系实际部署方核验并处理。',
        ],
      },
      {
        title: '11. 跨境、部署与企业控制',
        body: [
          'MarkUp 可能被部署在不同企业、学校、实验环境或云服务环境中。不同部署环境的服务器区域、第三方服务、AI Provider、对象存储、日志系统和数据备份策略可能不同。',
          '如实际部署涉及跨境提供个人信息、境外 AI 服务、境外云基础设施或国际协作项目，部署方应按照适用法律法规和企业规则完成必要评估、告知和授权，并在正式隐私政策中补充说明。',
        ],
      },
      {
        title: '12. 政策更新与联系',
        body: [
          '本政策可能随产品功能、数据处理流程、第三方服务、部署环境、运营主体和合规要求变化更新。涉及用户权利的重大变更，平台将通过页面提示、站内通知、邮件或文档更新等方式展示。',
          '如对个人信息处理、数据安全、账号注销、权限管理、第三方服务或政策内容有疑问，可通过项目维护渠道联系 MarkUp 项目企业或实际部署方。正式上线时应在本政策中补充明确的个人信息处理者名称、注册地址、联系方式、投诉处理路径和第三方服务清单。',
        ],
      },
    ],
  },
};

function isLoginPayload(
  payload: LoginPayload | OAuthEmailBindingPayload | OAuthAccountChoicePayload,
): payload is LoginPayload {
  return 'access_token' in payload;
}

function isOAuthAccountChoicePayload(
  payload: LoginPayload | OAuthEmailBindingPayload | OAuthAccountChoicePayload,
): payload is OAuthAccountChoicePayload {
  return 'needs_account_link' in payload && payload.needs_account_link === true;
}

export function LoginPage({
  oauthContext,
  initialMode: initialModeProp,
  ...props
}: LoginPageProps) {
  const resetKey = oauthContext?.ticket
    ? `oauth:${oauthContext.ticket}:${oauthContext.initialMode ?? 'bind'}`
    : `auth:${initialModeProp ?? 'login'}`;

  return <LoginPageContent key={resetKey} oauthContext={oauthContext} initialMode={initialModeProp} {...props} />;
}

function LoginPageContent({
  onLoginSuccess,
  overlayMode,
  initialMode: initialModeProp,
  onClose,
  redirectAfterLogin,
  oauthContext,
}: LoginPageProps) {
  const detectedMode: AuthMode = oauthContext?.ticket ? 'oauth-callback' : (initialModeProp ?? 'login');

  const [mode, setMode] = useState<AuthMode>(detectedMode);
  const [remember, setRemember] = useState(true);
  const [binding, setBinding] = useState<OAuthEmailBindingPayload | null>(null);
  const [oauthChoice, setOauthChoice] = useState<OAuthAccountChoicePayload | null>(null);
  const [oauthTabMode, setOauthTabMode] = useState<OAuthTabMode>(oauthContext?.initialMode ?? 'bind');
  const [loading, setLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCooldowns, setCodeCooldowns] = useState<Record<CodePurpose, number>>({
    register: 0,
    reset_password: 0,
    bind_email: 0,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [policyModal, setPolicyModal] = useState<PolicyModalKind | null>(null);
  const [loginForm] = Form.useForm<{ account: string; password: string; accepted_terms: boolean }>();
  const [registerForm] = Form.useForm<{
    display_name: string;
    username: string;
    email: string;
    email_code: string;
    password: string;
    accepted_terms: boolean;
  }>();
  const [resetForm] = Form.useForm<{
    email: string;
    email_code: string;
    new_password: string;
  }>();
  const [bindForm] = Form.useForm<{ email: string; email_code: string }>();
  const [oauthLinkForm] = Form.useForm<{ account: string; password: string }>();
  const [oauthRegisterForm] = Form.useForm<{
    display_name: string;
    username: string;
    email?: string;
    email_code?: string;
    password: string;
  }>();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const shouldAutoExchangeOAuth = Boolean(overlayMode && oauthContext?.ticket);

  useEffect(() => {
    if (!Object.values(codeCooldowns).some((seconds) => seconds > 0)) return undefined;
    const timer = window.setInterval(() => {
      setCodeCooldowns((current) => ({
        register: Math.max(0, current.register - 1),
        reset_password: Math.max(0, current.reset_password - 1),
        bind_email: Math.max(0, current.bind_email - 1),
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldowns]);

  const switchMode = (nextMode: AuthMode, options?: { preserveNotice?: boolean }) => {
    setMode(nextMode);
    setError(null);
    setCurrentUser(null);
    if (!options?.preserveNotice) {
      setNotice(null);
    }
    if (nextMode !== 'oauth-callback') {
      setBinding(null);
      setOauthChoice(null);
      setOauthTabMode('bind');
    }
  };

  const isAuthTabsVisible = mode !== 'forgot-password' && mode !== 'oauth-callback';
  const heroDescription = useMemo(() => {
    if (mode === 'register') {
      return '创建账号，开启AI辅助的数据标注之旅。';
    }
    if (mode === 'forgot-password') {
      return '使用邮箱验证码安全重置密码，再继续回到工作台。';
    }
    if (mode === 'oauth-callback') {
      return '选择一种接入方式后继续。';
    }
    return '使用邮箱、用户名或第三方账号进入 MarkUp 数据标注工作台。';
  }, [mode]);

  const providerLabel = providerLabels[oauthChoice?.provider ?? binding?.provider ?? oauthContext?.provider ?? ''] ?? '第三方';

  const headerTitle =
    mode === 'register'
      ? '创建 MarkUp 账号'
      : mode === 'forgot-password'
        ? '重置账号密码'
        : mode === 'oauth-callback'
          ? `连接 ${providerLabel} 账号`
          : '登录 MarkUp';

  const completeLogin = useCallback((payload: LoginPayload) => {
    clearAllStoredSessions();
    const session = persistSession(payload, remember ? window.localStorage : window.sessionStorage);
    setCurrentUser(session.user);
    onLoginSuccess?.(session.user);
  }, [onLoginSuccess, remember]);

  const startCodeCooldown = (purpose: CodePurpose) => {
    setCodeCooldowns((current) => ({ ...current, [purpose]: CODE_RESEND_SECONDS }));
  };

  const getCodeButtonLabel = (purpose: CodePurpose) => {
    if (codeLoading) return '发送中';
    if (codeCooldowns[purpose] > 0) return `${codeCooldowns[purpose]}s`;
    return '发验证码';
  };

  const shouldStartCooldownAfterError = (err: unknown) =>
    err instanceof ApiClientError && err.message.includes('验证码发送过于频繁');

  const applyFieldErrors = (
    form: Pick<FormInstance, 'setFields'>,
    fields: AuthFieldError[],
  ) => {
    form.setFields(fields as Parameters<FormInstance['setFields']>[0]);
  };

  const mapRegisterErrorToFields = (message: string): AuthFieldError[] | null => {
    if (message.includes('显示名')) return [{ name: 'display_name', errors: [message] }];
    if (message.includes('登录账号')) return [{ name: 'username', errors: [message] }];
    if (message.includes('邮箱验证码')) return [{ name: 'email_code', errors: [message] }];
    if (message.includes('邮箱')) return [{ name: 'email', errors: [message] }];
    if (message.includes('密码')) return [{ name: 'password', errors: [message] }];
    if (message.includes('协议') || message.includes('隐私')) {
      return [{ name: 'accepted_terms', errors: [message] }];
    }
    return null;
  };

  const handleLogin = async (values: { account: string; password: string }) => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const payload = await login({ account: values.account.trim(), password: values.password });
      completeLogin(payload);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRegisterCode = async () => {
    const email = registerForm.getFieldValue('email');
    if (!email || !String(email).includes('@')) {
      applyFieldErrors(registerForm, [{ name: 'email', errors: ['请输入有效邮箱'] }]);
      setError(null);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
    setCodeLoading(true);
    try {
      const data = await sendEmailCode({ email: String(email).trim(), purpose: 'register' });
      startCodeCooldown('register');
      setNotice(`验证码已发送至 ${data.email}，有效期 ${Math.round(data.expire_in_seconds / 60)} 分钟`);
    } catch (err) {
      if (shouldStartCooldownAfterError(err)) startCodeCooldown('register');
      setError(err instanceof ApiClientError ? err.message : '验证码发送失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleRegister = async (values: {
    display_name: string;
    username: string;
    email: string;
    email_code: string;
    password: string;
  }) => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await register({
        display_name: values.display_name.trim(),
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
        role: 'pending',
        email_code: values.email_code.trim(),
      });
      const payload = await login({ account: values.email.trim(), password: values.password });
      completeLogin(payload);
      setNotice('注册成功，正在进入账号设置');
      loginForm.setFieldsValue({ account: values.email.trim(), password: '' });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : '注册失败，请稍后重试';
      const fieldErrors = mapRegisterErrorToFields(message);
      if (fieldErrors) {
        applyFieldErrors(registerForm, fieldErrors);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetCode = async () => {
    const email = resetForm.getFieldValue('email');
    if (!email || !String(email).includes('@')) {
      applyFieldErrors(resetForm, [{ name: 'email', errors: ['请输入有效邮箱'] }]);
      setError(null);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
    setCodeLoading(true);
    try {
      const data = await sendEmailCode({ email: String(email).trim(), purpose: 'reset_password' });
      startCodeCooldown('reset_password');
      setNotice(`重置验证码已发送至 ${data.email}，有效期 ${Math.round(data.expire_in_seconds / 60)} 分钟`);
    } catch (err) {
      if (shouldStartCooldownAfterError(err)) startCodeCooldown('reset_password');
      setError(err instanceof ApiClientError ? err.message : '验证码发送失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleResetPassword = async (values: {
    email: string;
    email_code: string;
    new_password: string;
  }) => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await resetPassword({
        email: values.email.trim(),
        email_code: values.email_code.trim(),
        new_password: values.new_password,
      });
      setNotice('密码已重置，请使用新密码登录');
      loginForm.setFieldsValue({ account: values.email.trim(), password: '' });
      switchMode('login', { preserveNotice: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '密码重置失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthExchange = useCallback(async () => {
    if (!oauthContext?.ticket) {
      setError('OAuth 回调缺少 ticket');
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const payload = await exchangeOAuthTicket(oauthContext.ticket);
      if (isLoginPayload(payload)) {
        completeLogin(payload);
        setNotice(`${providerLabel}登录成功`);
      } else if (isOAuthAccountChoicePayload(payload)) {
        setOauthChoice(payload);
        setBinding(null);
        setOauthTabMode(payload.has_matching_user ? 'bind' : (oauthContext?.initialMode ?? 'bind'));
        oauthLinkForm.resetFields();
        oauthRegisterForm.setFieldsValue({
          display_name: payload.suggested_username || '',
          username: normalizeSuggestedUsername(payload.suggested_username),
          email: payload.suggested_email || '',
        });
        setNotice(`${providerLabels[payload.provider] ?? payload.provider} 首次授权需要先绑定已有账号或注册新账号`);
      } else {
        setBinding(payload);
        setOauthChoice(null);
        setOauthTabMode('bind-email');
        bindForm.resetFields();
        setNotice(`${providerLabels[payload.provider] ?? payload.provider}账号需要先补充邮箱`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'OAuth 登录失败');
    } finally {
      setLoading(false);
    }
  }, [bindForm, completeLogin, oauthContext, oauthLinkForm, oauthRegisterForm, providerLabel]);

  useEffect(() => {
    if (!shouldAutoExchangeOAuth) return;
    if (loading || oauthChoice || binding || currentUser) return;
    if (error === 'OAuth 回调缺少 ticket') return;
    const timer = window.setTimeout(() => {
      void handleOAuthExchange();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [binding, currentUser, error, handleOAuthExchange, loading, oauthChoice, shouldAutoExchangeOAuth]);

  const handleSendBindCode = async () => {
    const email = bindForm.getFieldValue('email');
    if (!email || !String(email).includes('@')) {
      applyFieldErrors(bindForm, [{ name: 'email', errors: ['请输入有效邮箱'] }]);
      setError(null);
      setNotice(null);
      return;
    }
    setError(null);
    setNotice(null);
    setCodeLoading(true);
    try {
      const data = await sendEmailCode({ email: String(email).trim(), purpose: 'bind_email' });
      startCodeCooldown('bind_email');
      setNotice(`绑定验证码已发送至 ${data.email}`);
    } catch (err) {
      if (shouldStartCooldownAfterError(err)) startCodeCooldown('bind_email');
      setError(err instanceof ApiClientError ? err.message : '验证码发送失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleBindEmail = async (values: { email: string; email_code: string }) => {
    if (!binding) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const payload = await bindOAuthEmail({
        ticket: binding.bind_ticket,
        email: values.email.trim(),
        email_code: values.email_code.trim(),
      });
      completeLogin(payload);
      setNotice('邮箱绑定成功，已登录');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '邮箱绑定失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLinkAccount = async (values: { account: string; password: string }) => {
    const ticket = oauthChoice?.bind_ticket;
    if (!ticket) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const payload = await linkOAuthAccount({
        ticket,
        account: values.account.trim(),
        password: values.password,
      });
      completeLogin(payload);
      setNotice('第三方账号已绑定，正在进入工作台');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '账号绑定失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthRegister = async (values: {
    display_name: string;
    username: string;
    email?: string;
    email_code?: string;
    password: string;
  }) => {
    const ticket = oauthChoice?.bind_ticket;
    if (!ticket) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const payload = await registerOAuthAccount({
        ticket,
        display_name: values.display_name.trim(),
        username: values.username.trim(),
        email: values.email?.trim() || undefined,
        email_code: values.email_code?.trim() || undefined,
        password: values.password,
        role: 'pending',
      });
      completeLogin(payload);
      setNotice('账号创建成功，正在进入身份选择');
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : '账号创建失败';
      const fieldErrors = mapRegisterErrorToFields(message);
      if (fieldErrors) {
        applyFieldErrors(oauthRegisterForm, fieldErrors);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const authPanelContent = (
    <>
      <AuthPanelHeader
        mode={mode}
        title={headerTitle}
        description={heroDescription}
        tabsVisible={isAuthTabsVisible}
        onTabChange={(key) => switchMode(key as AuthMode)}
      />
      <Feedback error={error} notice={notice} currentUser={currentUser} />
      {mode === 'login' && (
        <Form
          form={loginForm}
          layout="vertical"
          requiredMark={false}
          className="auth-form"
          initialValues={{ account: '', password: '', accepted_terms: false }}
          onFinish={handleLogin}
        >
          <Form.Item
            label="邮箱或登录账号"
            name="account"
            rules={[
              { required: true, message: '请输入邮箱或登录账号' },
              { min: 2, message: '请输入至少 2 个字符的账号' },
            ]}
          >
            <Input allowClear autoComplete="username" placeholder="邮箱或登录账号" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '请输入至少 8 位密码' },
            ]}
          >
            <Input.Password
              autoComplete="current-password"
              placeholder="至少 8 位密码"
              visibilityToggle
            />
          </Form.Item>
          <div className="auth-form-row">
            <Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)}>
              保持登录状态
            </Checkbox>
            <Button autoInsertSpace={false} type="link" className="auth-inline-link" onClick={() => switchMode('forgot-password')}>
              忘记密码
            </Button>
          </div>
          <Form.Item
            name="accepted_terms"
            valuePropName="checked"
            rules={registerRules.accepted_terms}
            className="auth-terms-item"
          >
            <Checkbox>
              我已阅读并同意
              <Button autoInsertSpace={false} type="link" className="inline-policy-button" onClick={() => setPolicyModal('terms')}>
                用户协议
              </Button>
              与
              <Button autoInsertSpace={false} type="link" className="inline-policy-button" onClick={() => setPolicyModal('privacy')}>
                隐私政策
              </Button>
            </Checkbox>
          </Form.Item>
          <Button autoInsertSpace={false} className="submit-button" type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form>
      )}
      {mode === 'register' && (
        <Form
          form={registerForm}
          layout="vertical"
          requiredMark={false}
          className="auth-form auth-form--register"
          initialValues={{ accepted_terms: false }}
          onFinish={handleRegister}
        >
          <Form.Item label="显示名" name="display_name" rules={registerRules.display_name}>
            <Input allowClear autoComplete="name" placeholder="张三" maxLength={32} />
          </Form.Item>
          <Form.Item label="登录账号" name="username" rules={registerRules.username}>
            <Input allowClear autoComplete="username" placeholder="markup_user01" maxLength={32} />
          </Form.Item>
          <EmailCodeField
            emailName="email"
            codeName="email_code"
            emailLabel="邮箱"
            emailPlaceholder="name@example.com"
            codeLabel="邮箱验证码"
            codePlaceholder="6 位验证码"
            rules={{
              email: registerRules.email,
              code: registerRules.email_code,
            }}
            buttonLabel={getCodeButtonLabel('register')}
            buttonDisabled={codeLoading || codeCooldowns.register > 0}
            onSendCode={handleSendRegisterCode}
          />
          <Form.Item label="密码" name="password" rules={registerRules.password}>
            <Input.Password
              autoComplete="new-password"
              placeholder="至少 8 位，包含大小写字母、数字和特殊字符"
              visibilityToggle
            />
          </Form.Item>
          <Form.Item
            name="accepted_terms"
            valuePropName="checked"
            rules={registerRules.accepted_terms}
            className="auth-terms-item"
          >
            <Checkbox>
              我已阅读并同意
              <Button autoInsertSpace={false} type="link" className="inline-policy-button" onClick={() => setPolicyModal('terms')}>
                用户协议
              </Button>
              与
              <Button autoInsertSpace={false} type="link" className="inline-policy-button" onClick={() => setPolicyModal('privacy')}>
                隐私政策
              </Button>
            </Checkbox>
          </Form.Item>
          <Button autoInsertSpace={false} className="submit-button" type="primary" htmlType="submit" loading={loading} block>
            注册账号
          </Button>
        </Form>
      )}
      {mode === 'forgot-password' && (
        <Form
          form={resetForm}
          layout="vertical"
          requiredMark={false}
          className="auth-form"
          onFinish={handleResetPassword}
        >
          <EmailCodeField
            emailName="email"
            codeName="email_code"
            emailLabel="注册邮箱"
            emailPlaceholder="name@example.com"
            codeLabel="邮箱验证码"
            codePlaceholder="6 位验证码"
            rules={{
              email: registerRules.email,
              code: registerRules.email_code,
            }}
            buttonLabel={getCodeButtonLabel('reset_password')}
            buttonDisabled={codeLoading || codeCooldowns.reset_password > 0}
            onSendCode={handleSendResetCode}
          />
          <Form.Item
            label="新密码"
            name="new_password"
            rules={[
              { required: true, message: '请输入新密码' },
              registerPasswordRule,
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder="至少 8 位，包含大小写字母、数字和特殊字符"
              visibilityToggle
            />
          </Form.Item>
          <div className="auth-actions-stack">
            <Button autoInsertSpace={false} className="submit-button" type="primary" htmlType="submit" loading={loading} block>
              重置密码
            </Button>
            <Button autoInsertSpace={false} block onClick={() => switchMode('login')}>
              返回登录
            </Button>
          </div>
        </Form>
      )}
      {mode === 'oauth-callback' && (
        <div className="auth-oauth-panel auth-oauth-panel--simple">
          {!binding && !oauthChoice ? (
            shouldAutoExchangeOAuth ? null : (
            <Button autoInsertSpace={false} className="submit-button" type="primary" onClick={handleOAuthExchange} loading={loading} block>
              {`继续${providerLabel}授权`}
            </Button>
            )
          ) : binding ? (
            <>
              <Typography.Text type="secondary" className="oauth-inline-caption">
                补充邮箱后继续
              </Typography.Text>
              <Form
                form={bindForm}
                layout="vertical"
                requiredMark={false}
                className="auth-form oauth-flow-form"
                onFinish={handleBindEmail}
              >
                <EmailCodeField
                  emailName="email"
                  codeName="email_code"
                  emailLabel="绑定邮箱"
                  emailPlaceholder="name@example.com"
                  codeLabel="邮箱验证码"
                  codePlaceholder="6 位验证码"
                  rules={{
                    email: registerRules.email,
                    code: registerRules.email_code,
                  }}
                  buttonLabel={getCodeButtonLabel('bind_email')}
                  buttonDisabled={codeLoading || codeCooldowns.bind_email > 0}
                  onSendCode={handleSendBindCode}
                />
                <Button autoInsertSpace={false} className="submit-button" type="primary" htmlType="submit" loading={loading} block>
                  绑定并进入
                </Button>
              </Form>
            </>
          ) : (
            <>
              <Tabs
                activeKey={oauthTabMode}
                onChange={(key) => setOauthTabMode(key as OAuthTabMode)}
                className="auth-tabs oauth-auth-tabs"
                items={[
                  { key: 'bind', label: '绑定已有账号' },
                  { key: 'register', label: '注册新账号' },
                ]}
              />
              <div className="oauth-panel-body">
                {oauthTabMode === 'bind' ? (
                  <Form
                    form={oauthLinkForm}
                    layout="vertical"
                    requiredMark={false}
                    className="auth-form oauth-flow-form"
                    onFinish={handleOAuthLinkAccount}
                  >
                    <Form.Item
                      label="现有账号"
                      name="account"
                      rules={[
                        { required: true, message: '请输入已有账号或邮箱' },
                        { min: 2, message: '请输入至少 2 个字符的账号' },
                      ]}
                    >
                      <Input allowClear autoComplete="username" placeholder="邮箱或登录账号" />
                    </Form.Item>
                    <Form.Item
                      label="密码"
                      name="password"
                      rules={[
                        { required: true, message: '请输入密码' },
                        { min: 8, message: '请输入至少 8 位密码' },
                      ]}
                    >
                      <Input.Password autoComplete="current-password" placeholder="已有 MarkUp 账号密码" visibilityToggle />
                    </Form.Item>
                    <Button autoInsertSpace={false} className="submit-button" type="primary" htmlType="submit" loading={loading} block>
                      绑定并进入
                    </Button>
                  </Form>
                ) : (
                  <Form
                    form={oauthRegisterForm}
                    layout="vertical"
                    requiredMark={false}
                    className="auth-form auth-form--register oauth-flow-form"
                    onFinish={handleOAuthRegister}
                  >
                    <Form.Item label="显示名" name="display_name" rules={registerRules.display_name}>
                      <Input allowClear autoComplete="name" placeholder="张三" maxLength={32} />
                    </Form.Item>
                    <Form.Item label="登录账号" name="username" rules={registerRules.username}>
                      <Input allowClear autoComplete="username" placeholder="markup_user01" maxLength={32} />
                    </Form.Item>
                    {oauthChoice?.email_verified_by_provider ? (
                      <Form.Item label={`${providerLabel} 邮箱`}>
                        <Input value={oauthChoice.suggested_email ?? ''} disabled />
                      </Form.Item>
                    ) : (
                      <EmailCodeField
                        emailName="email"
                        codeName="email_code"
                        emailLabel="邮箱"
                        emailPlaceholder="name@example.com"
                        codeLabel="邮箱验证码"
                        codePlaceholder="6 位验证码"
                        rules={{
                          email: registerRules.email,
                          code: registerRules.email_code,
                        }}
                        buttonLabel={getCodeButtonLabel('bind_email')}
                        buttonDisabled={codeLoading || codeCooldowns.bind_email > 0}
                        onSendCode={handleSendBindCode}
                      />
                    )}
                    <Form.Item label="密码" name="password" rules={registerRules.password}>
                      <Input.Password
                        autoComplete="new-password"
                        placeholder="至少 8 位，包含大小写字母、数字和特殊字符"
                        visibilityToggle
                      />
                    </Form.Item>
                    <Button autoInsertSpace={false} className="submit-button" type="primary" htmlType="submit" loading={loading} block>
                      创建账号并继续
                    </Button>
                  </Form>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {isAuthTabsVisible && (
        <>
          <div className="oauth-divider">
            <span>或使用第三方账号</span>
          </div>
          <div className="oauth-actions">
            {oauthProviders.map((provider) => (
              <Tooltip key={provider.key} title={providerLabels[provider.key]}>
                <Button
                  autoInsertSpace={false}
                  type="default"
                  shape="circle"
                  size="large"
                  href={buildOAuthProviderHref(apiBaseUrl, provider.href, redirectAfterLogin)}
                  className="oauth-button oauth-button--icon"
                  aria-label={`${providerLabels[provider.key]} 登录`}
                  icon={<OAuthProviderIcon provider={provider.key} />}
                />
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </>
  );

  if (overlayMode) {
    return (
      <>
        <Modal
          open
          centered
          width={620}
          footer={null}
          onCancel={onClose}
          className="login-overlay-modal"
          destroyOnHidden
        >
          <section className={`login-card login-card--overlay${mode === 'oauth-callback' ? ' login-card--oauth-overlay' : ''}`} aria-label="认证面板">
            {authPanelContent}
          </section>
        </Modal>
        {policyModal && <PolicyModal kind={policyModal} onClose={() => setPolicyModal(null)} />}
      </>
    );
  }

  return (
    <>
      <main className="login-shell">
        <AuthHero />
        <section className="login-card">
          {authPanelContent}
        </section>
      </main>
      {policyModal && <PolicyModal kind={policyModal} onClose={() => setPolicyModal(null)} />}
    </>
  );
}

function AuthHero() {
  return (
    <section className="login-hero" aria-label="MarkUp 平台介绍">
      <div className="hero-pill">MarkUp 马克派</div>
      <Typography.Title level={1} className="hero-title">
        把高质量标注数据，稳定交付给 AI 训练链路。
      </Typography.Title>
      <Typography.Paragraph className="hero-copy">
        从任务发布、数据导入、模板配置、在线标注到 AI 预审与人工复核，MarkUp 为企业提供一套面向数据生产的可追溯工作台。
      </Typography.Paragraph>
      <div className="hero-highlights">
        <div className="hero-highlight">
          <strong>任务发布</strong>
          <span>模板、数据集、审核标准统一配置</span>
        </div>
        <div className="hero-highlight">
          <strong>在线协作</strong>
          <span>标注、审核、AI 预审分工清晰</span>
        </div>
        <div className="hero-highlight">
          <strong>数据交付</strong>
          <span>导出、审计与状态流转全链路留痕</span>
        </div>
      </div>
      <div className="hero-proof-grid" aria-label="平台核心能力">
        {heroProofs.map((proof) => (
          <article className="hero-proof-card" key={proof.title}>
            <span className="hero-proof-badge">{proof.badge}</span>
            <h3>{proof.title}</h3>
            <p>{proof.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AuthPanelHeader({
  mode,
  title,
  description,
  tabsVisible,
  onTabChange,
}: {
  mode: AuthMode;
  title: string;
  description: string;
  tabsVisible: boolean;
  onTabChange: (key: string) => void;
}) {
  return (
    <div className="auth-panel-header">
      <span className="eyebrow">Welcome to MarkUp</span>
      <Typography.Title level={2}>{title}</Typography.Title>
      <Typography.Paragraph>{description}</Typography.Paragraph>
      {tabsVisible && (
        <Tabs
          activeKey={mode}
          onChange={onTabChange}
          className="auth-tabs"
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />
      )}
    </div>
  );
}

function EmailCodeField({
  emailName,
  codeName,
  emailLabel,
  emailPlaceholder,
  codeLabel,
  codePlaceholder,
  rules,
  buttonLabel,
  buttonDisabled,
  onSendCode,
}: {
  emailName: string;
  codeName: string;
  emailLabel: string;
  emailPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  rules: { email: Rule[]; code: Rule[] };
  buttonLabel: string;
  buttonDisabled: boolean;
  onSendCode: () => void;
}) {
  return (
    <>
      <Form.Item label={emailLabel} name={emailName} rules={rules.email}>
        <Space.Compact block>
          <Input
            aria-label={emailLabel}
            allowClear
            autoComplete="email"
            placeholder={emailPlaceholder}
          />
          <Button autoInsertSpace={false} onClick={onSendCode} disabled={buttonDisabled}>
            {buttonLabel}
          </Button>
        </Space.Compact>
      </Form.Item>
      <Form.Item label={codeLabel} name={codeName} rules={rules.code}>
        <Input aria-label={codeLabel} inputMode="numeric" placeholder={codePlaceholder} />
      </Form.Item>
    </>
  );
}

function PolicyModal({ kind, onClose }: { kind: PolicyModalKind; onClose: () => void }) {
  const document = policyDocuments[kind];

  return (
    <Modal
      open
      title={document.title}
      width={760}
      onCancel={onClose}
      footer={
        <div className="policy-modal-footer">
          <Button autoInsertSpace={false} type="primary" onClick={onClose}>
            我已阅读，关闭窗口
          </Button>
        </div>
      }
      className="policy-modal-shell"
    >
      <section className="policy-modal" aria-labelledby="policy-modal-title">
        <div className="policy-modal-heading">
          <span className="eyebrow">Legal</span>
          <h3 id="policy-modal-title">{document.title}</h3>
          <p>更新日期：{document.updatedAt}</p>
        </div>
        <div className="policy-modal-content">
          <p className="policy-intro">{document.intro}</p>
          {document.sections.map((section) => (
            <section className="policy-section" key={section.title}>
              <h4>{section.title}</h4>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </section>
    </Modal>
  );
}

function Feedback({
  error,
  notice,
  currentUser,
}: {
  error: string | null;
  notice: string | null;
  currentUser: ApiUser | null;
}) {
  if (!error && !notice && !currentUser) {
    return null;
  }

  return (
    <div className="auth-feedback">
      {error && <Alert className="auth-alert" type="error" showIcon description={error} role="alert" />}
      {notice && <Alert className="auth-alert" type="info" showIcon description={notice} role="status" />}
      {currentUser && (
        <Alert
          className="auth-alert"
          type="success"
          showIcon
          description={`已登录：${currentUser.display_name || currentUser.email || 'MarkUp 用户'}（${roleLabels[currentUser.role] ?? currentUser.role}）`}
          role="status"
        />
      )}
    </div>
  );
}
