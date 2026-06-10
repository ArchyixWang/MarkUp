# 平台运营 `/platform`

平台运营接口服务 MarkUp 平台方，不使用企业作用域，不要求 `X-Team-ID`。除资质审核聚合入口可由全局 `certification:review` 访问外，其余接口需要全局 `platform:manage`；通过 `X-Team-ID` 企业成员记录授予的团队自定义权限不会提升为平台运营权限。

财务口径沿用企业工作台：`1 积分 = 1 元`。接口金额字段使用整数积分存储和传输，`amount_yuan / commission_yuan / unit_hint` 仅作为兼容字段保留；当前平台工作台界面默认只展示积分，不重复展示换算关系，不新增汇率或币种模型。

## 经营总览

- `GET /api/v1/platform/workbench`：返回平台累计服务费、近 30 天服务费、待审企业、待审资质、近 30 天结算趋势和最近结算；支付相关字段仅为历史兼容，不作为当前平台运营待办展示。
- `settlement_trend` 按自然日返回近 30 天 `commission_points / commission_yuan`，两者同值，用于平台总览趋势展示。

## 结算流水

- `GET /api/v1/platform/settlements`：平台服务费流水，支持 `page`、`page_size`、`team_id`、`status`、`keyword`、`start_date`、`end_date`。
- 人工审核通过并成功发放标注奖励后，后端按当前服务费率写入 `commission_income` 流水。
- 服务费计算：`ceil(reward_points * commission_rate_bps / 10000)`。
- 流水以 `transaction_type=commission_income + source_type=submission_review + source_id=submission_id` 幂等。

## 支付记录兼容

- `POST /api/v1/profile/points/withdraw`：标注员积分提现当前为即时完成；余额足够时立即扣减 `points_wallets.available_points`，写负向 `points_ledger`，并保留一条 `platform_payment_requests.status=approved` 记录用于审计和历史查询。
- `GET /api/v1/platform/payment-requests`：历史支付记录查询接口，支持 `status`、`owner_type`、`keyword`、`start_date`、`end_date`、分页；当前平台工作台不提供人工“提现处理”页面。
- `POST /api/v1/platform/payment-requests/{request_id}/review`：仅用于兼容历史 `pending` 支付单或运维补偿场景，不属于当前前端主路径。

请求体：

```json
{
  "decision": "approved",
  "comment": "资料完整"
}
```

企业积分钱包提现和标注员积分提现都按当前自动通过口径处理：余额满足即完成扣减并写流水，不进入平台人工审核队列。兼容历史待处理单时，平台批准仍会按 owner 类型扣减对应钱包并写流水；拒绝不会扣减余额。

## 企业认证

- `GET /api/v1/platform/teams/verification-queue`：企业认证审核队列，支持 `page`、`page_size`、`status`、`keyword`、`start_date`、`end_date`。
- `POST /api/v1/platform/teams/{team_id}/verification/review`：通过或拒绝企业认证。

通过后企业 `verification_status=verified`；拒绝后为 `rejected`，并保留审核备注。

## 标注员资质

- `GET /api/v1/platform/certifications/review-queue`：平台资质审核队列，参数兼容 `/profile/certifications/review-queue`。
- `POST /api/v1/platform/certifications/{cert_id}/review`：平台资质审核，复用现有资质审核规则。

## 平台规则

- `GET /api/v1/platform/settings/commission`：读取平台服务费率，默认 `commission_rate_bps=1000`。
- `PUT /api/v1/platform/settings/commission`：更新平台服务费率。
- `GET /api/v1/platform/settings/agent-embedding`：读取平台问答 Agent 的 Embedding 配置，只返回 `api_base`、`model`、`api_key_configured` 和更新时间，不回显密钥。
- `PUT /api/v1/platform/settings/agent-embedding`：更新平台问答 Agent 的 Embedding 配置。首次配置或当前没有任何已保存/环境变量密钥时必须提供 `api_key`；已有 Key 时 `api_key` 留空表示保留旧 Key。`model` 会去除首尾空格，空白模型会被拒绝。

请求体：

```json
{
  "commission_rate_bps": 1000
}
```

Embedding 请求体：

```json
{
  "api_base": "https://api.openai.com/v1",
  "model": "text-embedding-3-small",
  "api_key": "sk-..."
}
```
