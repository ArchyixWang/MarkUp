import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { EnhancedTable } from '../../components/ui/EnhancedTable';
import type { DescriptionsProps } from 'antd';
import type { ApiUser, TeamCreateRequest, TeamDetail, TeamVerificationRequest, UploadPayload } from '../../types/api';
import { ApiClientError, authenticatedFetch, getApiBaseUrl } from '../../services/apiClient';
import { getAdminOverview, getTeamDetail, submitTeamVerification, updateTeam, uploadFile } from '../../services/workspaceService';
import { formatApiDate, formatApiDateTime } from '../../utils/dateTime';
import type { OperationLogFilters } from './OperationLogsPage';
import { WorkspaceLoading } from './WorkspaceLoading';
import { WorkspaceTableActions } from './WorkspaceTableActions';

interface OrganizationProfilePageProps {
  user: ApiUser;
  readonly?: boolean;
  onOpenPeople?: (role?: string) => void;
  onOpenResources?: () => void;
  onOpenLogs?: (filters?: OperationLogFilters) => void;
}

type TeamFormValues = TeamCreateRequest;
type VerificationFormValues = Omit<TeamVerificationRequest, 'verification_materials'> & {
  verification_materials: string[];
};

const emptyForm: TeamFormValues = {
  company_name: '',
  industry: '',
  contact_phone: '',
  website: '',
  address: '',
  description: '',
  logo_url: '',
  billing_info: {
    invoice_type: 'special',
    invoice_title: '',
    tax_number: '',
    invoice_address: '',
    invoice_phone: '',
    bank_name: '',
    bank_account: '',
    invoice_email: '',
    invoice_remark: '',
  },
  mailing_info: {
    recipient_name: '',
    recipient_phone: '',
    region: '',
    detail_address: '',
    postal_code: '',
    address_alias: '',
    is_default: true,
  },
};

const verificationLabels: Record<string, string> = {
  unverified: '未认证',
  pending_review: '审核中',
  verified: '已认证',
  rejected: '待补件',
};

const verificationColors: Record<string, string> = {
  unverified: 'default',
  pending_review: 'orange',
  verified: 'green',
  rejected: 'red',
};

export function OrganizationProfilePage({ user, readonly = false }: OrganizationProfilePageProps) {
  const [form] = Form.useForm<TeamFormValues>();
  const [verificationForm] = Form.useForm<VerificationFormValues>();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [materialsDrawerOpen, setMaterialsDrawerOpen] = useState(false);
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationUploading, setVerificationUploading] = useState(false);
  const [verificationUploads, setVerificationUploads] = useState<UploadPayload[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const showErrorRef = useRef<(content: string) => void>(() => undefined);
  const watchedLogoUrl = Form.useWatch('logo_url', form);
  const currentLogoUrl = watchedLogoUrl || team?.logo_url || null;
  const resolvedLogoUrl = useProtectedAssetUrl(currentLogoUrl, team?.team_id ?? null);
  const scopedTeamId = user.team_id || user.default_team_id || undefined;

  const canEdit = useMemo(
    () =>
      !readonly && (
      ['admin', 'team_admin', 'owner', 'platform_admin'].includes(user.role) ||
      user.permissions.includes('team:update') ||
      user.permissions.includes('team:manage')
      ),
    [readonly, user.permissions, user.role],
  );

  const dismissMessage = useCallback(() => {
    messageApi.destroy('organization-page-feedback');
  }, [messageApi]);

  const showSuccess = useCallback((content: string) => {
    setError(null);
    messageApi.open({
      key: 'organization-page-feedback',
      type: 'success',
      content,
      duration: 2.5,
    });
  }, [messageApi]);

  const showInlineError = useCallback((content: string) => {
    setError(content);
    dismissMessage();
  }, [dismissMessage]);

  const showToastError = useCallback((content: string) => {
    setError(null);
    messageApi.open({
      key: 'organization-page-feedback',
      type: 'error',
      content,
      duration: 3.5,
    });
  }, [messageApi]);

  useEffect(() => {
    showErrorRef.current = showInlineError;
  }, [showInlineError]);

  const loadTeam = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    dismissMessage();

    try {
      const currentTeam = readonly && scopedTeamId
        ? await getTeamDetail(scopedTeamId)
        : (await getAdminOverview()).teams[0] ?? null;
      setTeam(currentTeam);
      form.setFieldsValue(teamToForm(currentTeam));
      setDirty(false);
      setEditing(false);
    } catch (err) {
      showInlineError(err instanceof ApiClientError ? err.message : '企业信息加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const teamRequest = readonly && scopedTeamId
      ? getTeamDetail(scopedTeamId)
      : getAdminOverview().then((overview) => overview.teams[0] ?? null);

    void teamRequest
      .then((currentTeam) => {
        if (!active) {
          return;
        }

        setTeam(currentTeam);
        form.setFieldsValue(teamToForm(currentTeam));
        setDirty(false);
        setEditing(false);
        setError(null);
      })
      .catch((err) => {
        if (!active) {
          return;
        }

        showErrorRef.current(err instanceof ApiClientError ? err.message : '企业信息加载失败');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [form, readonly, scopedTeamId]);

  const resetEditing = () => {
    if (!team) {
      return;
    }

    form.setFieldsValue(teamToForm(team));
    setDirty(false);
    setEditing(false);
  };

  const openVerificationModal = () => {
    if (!team) {
      return;
    }

    verificationForm.setFieldsValue({
      legal_name: team.legal_name || team.company_name || '',
      registration_number: team.registration_number || '',
      verification_contact: team.verification_contact || '',
      verification_phone: team.verification_phone || team.contact_phone || '',
      verification_materials: team.verification_materials || [],
    });
    setVerificationUploads(
      (team.verification_materials || []).map((url, index) => ({
        file_id: `existing-${index}`,
        team_id: team.team_id,
        url,
        filename: materialNameFromUrl(url, index),
        content_type: 'application/octet-stream',
        category: 'verification',
        size: 0,
      })),
    );
    setVerificationOpen(true);
  };

  const submit = async (values: TeamFormValues) => {
    if (!team || !canEdit) {
      return;
    }

    const confirmed = await confirmSensitiveChange(team, values);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);
    dismissMessage();

    try {
      const updated = await updateTeam(team.team_id, sanitizeTeamPayload(values));
      setTeam(updated);
      form.setFieldsValue(teamToForm(updated));
      setDirty(false);
      setEditing(false);
      showSuccess('企业信息已保存');
    } catch (err) {
      showToastError(err instanceof ApiClientError ? err.message : '企业信息保存失败');
    } finally {
      setSaving(false);
    }
  };

  const submitVerification = async (values: VerificationFormValues) => {
    if (!team || !canEdit) {
      return;
    }

    setVerificationSaving(true);
    setError(null);
    dismissMessage();

    try {
      const updated = await submitTeamVerification(team.team_id, {
        legal_name: values.legal_name.trim(),
        registration_number: values.registration_number.trim(),
        verification_contact: values.verification_contact.trim(),
        verification_phone: values.verification_phone.trim(),
        verification_materials: verificationUploads.map((item) => item.url),
      });
      setTeam(updated);
      setVerificationOpen(false);
      showSuccess('企业认证已提交，等待平台审核');
    } catch (err) {
      showToastError(err instanceof ApiClientError ? err.message : '企业认证提交失败');
    } finally {
      setVerificationSaving(false);
    }
  };

  const uploadVerificationMaterial = async (file: File) => {
    if (!team || !canEdit) {
      return false;
    }
    if (!isPdfVerificationFile(file)) {
      showToastError('认证材料仅支持 PDF 文件。');
      return Upload.LIST_IGNORE;
    }

    setVerificationUploading(true);
    setError(null);
    dismissMessage();

    try {
      const uploaded = await uploadFile(team.team_id, file, 'verification');
      const nextUploads = [...verificationUploads, uploaded];
      setVerificationUploads(nextUploads);
      verificationForm.setFieldValue('verification_materials', nextUploads.map((item) => item.url));
      verificationForm.validateFields(['verification_materials']).catch(() => undefined);
      showSuccess(`认证材料已上传：${uploaded.filename}`);
    } catch (err) {
      showToastError(err instanceof ApiClientError ? err.message : '认证材料上传失败');
    } finally {
      setVerificationUploading(false);
    }

    return false;
  };

  const removeVerificationMaterial = (fileId: string) => {
    const nextUploads = verificationUploads.filter((item) => item.file_id !== fileId);
    setVerificationUploads(nextUploads);
    verificationForm.setFieldValue('verification_materials', nextUploads.map((item) => item.url));
    verificationForm.validateFields(['verification_materials']).catch(() => undefined);
  };

  const openTeamAsset = async (url: string | null | undefined, failureMessage: string) => {
    if (!team?.team_id || !url) {
      showToastError(failureMessage);
      return;
    }

    try {
      await openProtectedMaterial(url, team.team_id);
    } catch {
      showToastError(failureMessage);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!team || !canEdit) {
      return false;
    }

    if (!isImageLogoFile(file)) {
      showToastError('Logo 仅支持 JPG、PNG 或 GIF 图片。');
      return Upload.LIST_IGNORE;
    }

    setLogoUploading(true);
    setError(null);
    dismissMessage();

    try {
      const uploaded = await uploadFile(team.team_id, file, 'image');
      form.setFieldValue('logo_url', uploaded.url);
      setDirty(true);
      showSuccess(`Logo 已上传：${uploaded.filename}，请保存修改后生效`);
    } catch (err) {
      showToastError(err instanceof ApiClientError ? err.message : 'Logo 上传失败');
    } finally {
      setLogoUploading(false);
    }

    return false;
  };

  if (loading) {
    return (
      <main className="workspace-content organization-profile-page workspace-loading-page">
        <WorkspaceLoading tip="正在加载企业信息" />
      </main>
    );
  }

  if (!team) {
    return (
      <main className="workspace-content organization-profile-page">
        {contextHolder}
        <section className="page-heading">
          <div>
            <p className="section-kicker">Organization</p>
            <h1>企业信息</h1>
          </div>
        </section>
        {error && <Alert className="organization-inline-alert" type="error" showIcon title={error} />}
        <Empty description="请先完成企业企业配置" />
      </main>
    );
  }

  const verificationStatus = team.verification_status || 'unverified';
  const verificationLabel = verificationLabels[verificationStatus] ?? verificationStatus;
  const verificationItems: DescriptionsProps['items'] = [
    {
      key: 'status',
      label: '认证状态',
      children: <Tag color={verificationColors[verificationStatus]}>{verificationLabel}</Tag>,
    },
    {
      key: 'submitted-at',
      label: '最近提交时间',
      children: formatApiDateTime(team.verification_submitted_at),
    },
    {
      key: 'legal-name',
      label: '企业主体名称',
      children: displayValue(team.legal_name),
    },
    {
      key: 'registration-number',
      label: '统一社会信用代码',
      children: displayValue(team.registration_number),
    },
    {
      key: 'contact',
      label: '认证联系人',
      children: displayValue(team.verification_contact),
    },
    {
      key: 'phone',
      label: '联系电话',
      children: displayValue(team.verification_phone),
    },
    {
      key: 'materials',
      label: '材料数量',
      children: `${team.verification_materials?.length ?? 0} 份`,
    },
    {
      key: 'comment',
      label: '审核意见',
      children: displayValue(team.verification_review_comment),
    },
  ];

  const basicInfoItems: DescriptionsProps['items'] = [
    {
      key: 'industry',
      label: '行业',
      children: displayValue(team.industry),
    },
    {
      key: 'contact_phone',
      label: '联系电话',
      children: displayValue(team.contact_phone),
    },
    {
      key: 'website',
      label: '官网',
      children: renderLinkValue(team.website),
    },
    {
      key: 'address',
      label: '地址',
      children: displayValue(team.address),
    },
    {
      key: 'membership',
      label: '会员套餐',
      children: renderMembershipSummary(team),
    },
    {
      key: 'description',
      label: '企业简介',
      children: displayValue(team.description),
    },
  ];

  const billingItems: DescriptionsProps['items'] = [
    {
      key: 'invoice_type',
      label: '发票类型',
      children: renderInvoiceType(team.billing_info?.invoice_type),
    },
    {
      key: 'invoice_title',
      label: '发票抬头',
      children: displayValue(team.billing_info?.invoice_title),
    },
    {
      key: 'tax_number',
      label: '税号',
      children: displayValue(team.billing_info?.tax_number),
    },
    {
      key: 'invoice_address',
      label: '开票地址',
      children: displayValue(team.billing_info?.invoice_address),
    },
    {
      key: 'invoice_phone',
      label: '开票电话',
      children: displayValue(team.billing_info?.invoice_phone),
    },
    {
      key: 'bank_name',
      label: '开户行',
      children: displayValue(team.billing_info?.bank_name),
    },
    {
      key: 'bank_account',
      label: '银行账号',
      children: displayValue(team.billing_info?.bank_account),
    },
    {
      key: 'invoice_email',
      label: '开票邮箱',
      children: displayValue(team.billing_info?.invoice_email),
    },
    {
      key: 'invoice_remark',
      label: '备注',
      children: displayValue(team.billing_info?.invoice_remark),
    },
  ];

  const mailingItems: DescriptionsProps['items'] = [
    {
      key: 'recipient_name',
      label: '收件人',
      children: displayValue(team.mailing_info?.recipient_name),
    },
    {
      key: 'recipient_phone',
      label: '收件电话',
      children: displayValue(team.mailing_info?.recipient_phone),
    },
    {
      key: 'region',
      label: '所在地区',
      children: displayValue(team.mailing_info?.region),
    },
    {
      key: 'detail_address',
      label: '详细地址',
      children: displayValue(team.mailing_info?.detail_address),
    },
    {
      key: 'postal_code',
      label: '邮编',
      children: displayValue(team.mailing_info?.postal_code),
    },
    {
      key: 'address_alias',
      label: '地址别名',
      children: displayValue(team.mailing_info?.address_alias),
    },
    {
      key: 'is_default',
      label: '默认地址',
      children: team.mailing_info?.is_default ? '是' : '否',
    },
  ];

  return (
    <main className="workspace-content organization-profile-page workspace-fixed-page">
      {contextHolder}

      <section className="page-heading">
        <div>
          <p className="section-kicker">Organization</p>
          <h1>企业信息</h1>
        </div>
        <div className="page-actions">
          <Button onClick={() => void loadTeam(false)}>刷新</Button>
          {canEdit && !editing && (
            <Button type="primary" onClick={() => setEditing(true)}>
              编辑资料
            </Button>
          )}
          {canEdit && editing && (
            <>
              <Button onClick={resetEditing}>取消编辑</Button>
              <Button type="primary" disabled={!dirty} loading={saving} onClick={() => form.submit()}>
                保存修改
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="workspace-fixed-scroll-panel organization-scroll-region">
        {error && <Alert className="organization-inline-alert" type="error" showIcon title={error} />}
        {!canEdit && (
          <Alert className="organization-inline-alert" type="info" showIcon title="你当前只能查看企业资料，没有企业资料编辑权限。" />
        )}

        {editing ? (
          <Form<TeamFormValues>
            form={form}
            layout="vertical"
            initialValues={emptyForm}
            onValuesChange={() => setDirty(true)}
            onFinish={submit}
          >
            <section className="organization-layout-stack">
              <section className="organization-top-grid">
                <Card className="organization-panel organization-section-card" variant="borderless" title="基本信息">
                  <Row gutter={[16, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="company_name"
                        label="企业名称"
                        rules={[
                          { required: true, message: '请输入企业名称' },
                          { min: 2, message: '企业名称至少 2 个字符' },
                        ]}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="industry" label="行业">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="contact_phone" label="联系电话">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="website"
                        label="官网"
                        rules={[{ type: 'url', warningOnly: true, message: '请输入完整 URL' }]}
                      >
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item name="address" label="地址">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item name="description" label="企业简介">
                        <Input.TextArea rows={4} maxLength={500} showCount />
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item name="logo_url" hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item label="企业 Logo" extra="上传成功后会自动回填，点击保存修改后写入企业资料。">
                        <section className="organization-logo-editor">
                          {renderLogoPreview(currentLogoUrl, resolvedLogoUrl, () => void openTeamAsset(currentLogoUrl, '缁勭粐 Logo 鍔犺浇澶辫触'), true)}
                          <Upload
                            listType="picture"
                            maxCount={1}
                            showUploadList={false}
                            accept="image/jpeg,image/png,image/gif"
                            beforeUpload={(file) => uploadLogo(file)}
                            disabled={!canEdit || logoUploading}
                          >
                            <Button loading={logoUploading} disabled={!canEdit || logoUploading}>
                              上传 Logo
                            </Button>
                          </Upload>
                        </section>
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>

                {renderVerificationCard({
                  team,
                  verificationStatus,
                  verificationLabel,
                  verificationItems,
                  canEdit,
                  onOpenVerification: openVerificationModal,
                  onOpenMaterials: () => setMaterialsDrawerOpen(true),
                })}
              </section>

              <Card className="organization-panel organization-section-card" variant="borderless" title="开票信息">
                <Row gutter={[16, 0]}>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'invoice_type']} label="发票类型">
                      <Radio.Group>
                        <Radio.Button value="special">专票</Radio.Button>
                        <Radio.Button value="normal">普票</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'invoice_title']} label="发票抬头">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'tax_number']} label="税号">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name={['billing_info', 'invoice_email']}
                      label="开票邮箱"
                      rules={[{ type: 'email', warningOnly: true, message: '请输入正确的邮箱地址' }]}
                    >
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'invoice_phone']} label="开票电话">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'invoice_address']} label="开票地址">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'bank_name']} label="开户行">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['billing_info', 'bank_account']} label="银行账号">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Form.Item name={['billing_info', 'invoice_remark']} label="备注">
                      <Input.TextArea rows={3} maxLength={500} showCount />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card className="organization-panel organization-section-card" variant="borderless" title="邮寄信息">
                <Row gutter={[16, 0]}>
                  <Col xs={24} md={12}>
                    <Form.Item name={['mailing_info', 'recipient_name']} label="收件人">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['mailing_info', 'recipient_phone']} label="收件电话">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['mailing_info', 'region']} label="所在地区">
                      <Input placeholder="例如：上海市 浦东新区" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['mailing_info', 'postal_code']} label="邮编">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['mailing_info', 'address_alias']} label="地址别名">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name={['mailing_info', 'is_default']} label="默认地址">
                      <Radio.Group>
                        <Radio.Button value>是</Radio.Button>
                        <Radio.Button value={false}>否</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Form.Item name={['mailing_info', 'detail_address']} label="详细地址">
                      <Input.TextArea rows={3} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </section>
          </Form>
        ) : (
          <section className="organization-layout-stack">
            <section className="organization-top-grid">
              {renderReadonlyBasicCard(team.company_name, currentLogoUrl, resolvedLogoUrl, basicInfoItems, () => void openTeamAsset(currentLogoUrl, '缁勭粐 Logo 鍔犺浇澶辫触'))}
              {renderVerificationCard({
                team,
                verificationStatus,
                verificationLabel,
                verificationItems,
                canEdit,
                onOpenVerification: openVerificationModal,
                onOpenMaterials: () => setMaterialsDrawerOpen(true),
              })}
            </section>
            {renderReadonlyInfoCard({
              title: '开票信息',
              description: '维护默认开票资料，用于对公结算与票据流转。',
              spotlightLabel: '发票抬头',
              spotlightValue: displayValue(team.billing_info?.invoice_title),
              items: billingItems,
            })}
            {renderReadonlyInfoCard({
              title: '邮寄信息',
              description: '维护默认邮寄资料，用于纸质材料与票据寄送。',
              spotlightLabel: '默认收件人',
              spotlightValue: displayValue(team.mailing_info?.recipient_name),
              items: mailingItems,
            })}
          </section>
        )}
      </section>

      <Modal
        title="提交企业认证"
        open={verificationOpen}
        okText="提交认证"
        confirmLoading={verificationSaving}
        onCancel={() => setVerificationOpen(false)}
        onOk={() => verificationForm.submit()}
      >
        <Alert
          className="organization-inline-alert"
          type="info"
          showIcon
          title="认证信息提交后进入平台审核"
        />
        <Form<VerificationFormValues> form={verificationForm} layout="vertical" onFinish={submitVerification}>
          <Form.Item
            name="legal_name"
            label="企业主体名称"
            rules={[
              { required: true, message: '请输入企业主体名称' },
              { min: 2, message: '企业主体名称至少 2 个字符' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="registration_number"
            label="统一社会信用代码"
            rules={[
              { required: true, message: '请输入统一社会信用代码' },
              { min: 4, message: '统一社会信用代码至少 4 个字符' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="verification_contact" label="认证联系人" rules={[{ required: true, message: '请输入认证联系人' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="verification_phone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}>
            <Input />
          </Form.Item>

          <Form.Item label="上传认证材料">
            <Upload
              accept=".pdf,application/pdf"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => uploadVerificationMaterial(file)}
              disabled={!canEdit || verificationUploading}
            >
              <Button loading={verificationUploading}>上传材料文件</Button>
            </Upload>
          </Form.Item>
          <Space direction="vertical" size={8} style={{ width: '100%' }} aria-label="已上传认证材料列表">
            {verificationUploads.length ? verificationUploads.map((item) => (
              <Card size="small" key={item.file_id}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Space direction="vertical" size={2}>
                    <Typography.Text strong>{item.filename}</Typography.Text>
                    <Typography.Text type="secondary">
                      {item.size ? `${Math.max(1, Math.round(item.size / 1024))} KB` : '已上传材料'}
                    </Typography.Text>
                  </Space>
                  <Space>
                    <Button type="link" onClick={() => void openTeamAsset(item.url, '认证材料打开失败')}>查看</Button>
                    <Button type="link" danger onClick={() => removeVerificationMaterial(item.file_id)}>移除</Button>
                  </Space>
                </Space>
              </Card>
            )) : (
              <Typography.Text type="secondary">暂未上传认证材料</Typography.Text>
            )}
          </Space>
        </Form>
      </Modal>

      <Drawer title="认证材料" size="large" open={materialsDrawerOpen} onClose={() => setMaterialsDrawerOpen(false)}>
        <Alert
          className="organization-inline-alert"
          type="info"
          showIcon
          title="当前展示已提交的认证材料文件"
          description="企业认证材料已通过上传接口保存。点击“查看文件”会访问当前材料的下载地址，并按当前登录态完成权限校验。"
        />
        <EnhancedTable
          rowKey="url"
          dataSource={(team.verification_materials || []).map((url, index) => ({
            index: index + 1,
            name: materialNameFromUrl(url, index),
            url,
          }))}
          pagination={false}
          locale={{ emptyText: '暂无认证材料' }}
          columns={[
            { title: '序号', dataIndex: 'index', width: 80 },
            { title: '材料名称', dataIndex: 'name', width: 180 },
            {
              title: '访问地址',
              dataIndex: 'url',
              render: (url: string) => (
                <Typography.Text copyable ellipsis={{ tooltip: url }}>
                  {url}
                </Typography.Text>
              ),
            },
            {
              title: '操作',
              key: 'actions',
              width: 92,
              className: 'workspace-table-action-cell',
              render: (_, record) => (
                <WorkspaceTableActions
                  visible={[{ key: 'view', label: '查看文件', icon: <EyeOutlined />, onClick: () => void openTeamAsset(record.url, '认证材料打开失败') }]}
                />
              ),
            },
          ]}
        />
      </Drawer>
    </main>
  );
}

async function openProtectedMaterial(url: string, teamId: string) {
  if (/^https?:\/\//i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const response = await authenticatedFetch(materialApiPath(url), {
    headers: { 'X-Team-ID': teamId },
  });
  if (!response.ok) {
    throw new Error('认证材料打开失败');
  }

  const filename = filenameFromDisposition(response.headers.get('Content-Disposition')) || filenameFromUrl(url) || 'download';
  downloadBlob(await response.blob(), filename);
}

function materialApiPath(url: string): string {
  const apiBase = getApiBaseUrl();
  if (url.startsWith(apiBase)) return url.slice(apiBase.length) || '/';
  if (url.startsWith('/api/v1')) return url.slice('/api/v1'.length) || '/';
  return url;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const asciiMatch = header.match(/filename="([^"]+)"/i) || header.match(/filename=([^;]+)/i);
  return asciiMatch?.[1]?.trim() || null;
}

function filenameFromUrl(url: string): string | null {
  const cleaned = url.split('?')[0]?.split('#')[0] || '';
  const name = cleaned.split('/').filter(Boolean).at(-1);
  return name ? decodeURIComponent(name) : null;
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof URL === 'undefined' || !URL.createObjectURL) return;
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

function useProtectedAssetUrl(url: string | null | undefined, teamId: string | null): string | null {
  const [resolvedAsset, setResolvedAsset] = useState<{ source: string; value: string | null }>({
    source: '',
    value: null,
  });
  const directUrl = url && (!teamId || /^https?:\/\//i.test(url) || url.startsWith('data:')) ? url : null;
  const protectedPath = url && !directUrl ? materialApiPath(url) : null;

  useEffect(() => {
    if (!url || directUrl || !protectedPath) return;
    if (!teamId) return;

    let active = true;
    let blobUrl: string | null = null;

    void authenticatedFetch(protectedPath, {
      headers: { 'X-Team-ID': teamId },
    })
      .then(async (response) => {
        if (!response.ok || !active) {
          return;
        }
        blobUrl = window.URL.createObjectURL(await response.blob());
        if (active) {
          setResolvedAsset({ source: protectedPath, value: blobUrl });
        }
      })
      .catch(() => {
        if (active) {
          setResolvedAsset({ source: protectedPath, value: url });
        }
      });

    return () => {
      active = false;
      if (blobUrl) {
        window.URL.revokeObjectURL(blobUrl);
      }
    };
  }, [directUrl, protectedPath, teamId, url]);

  if (!url) return null;
  if (directUrl) return directUrl;
  return resolvedAsset.source === protectedPath ? resolvedAsset.value : null;
}

function renderReadonlyInfoCard({
  title,
  description,
  spotlightLabel,
  spotlightValue,
  items,
}: {
  title: string;
  description: string;
  spotlightLabel: string;
  spotlightValue: React.ReactNode;
  items: DescriptionsProps['items'];
}) {
  return (
    <Card className="organization-panel organization-section-card organization-readonly-card" variant="borderless" title={title}>
      <section className="organization-subsection-hero">
        <div className="organization-subsection-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="organization-readonly-chip">
          <span>{spotlightLabel}</span>
          <strong>{spotlightValue || '-'}</strong>
        </div>
      </section>
      <Descriptions className="organization-readonly-descriptions" size="small" column={2} items={items} />
    </Card>
  );
}

function renderReadonlyBasicCard(
  companyName: string | null | undefined,
  logoUrl: string | null | undefined,
  previewUrl: string | null | undefined,
  items: DescriptionsProps['items'],
  onOpenLogo?: () => void,
) {
  return (
    <Card className="organization-panel organization-section-card organization-readonly-card" variant="borderless" title="基本信息">
      <section className="organization-basic-hero">
        <div className="organization-basic-hero-content">
          <span className="organization-readonly-primary-label">企业名称</span>
          <strong className="organization-basic-company-name">{displayValue(companyName)}</strong>
          <p>维护企业名称、对外联系方式、官网与办公地址。</p>
        </div>
        {renderLogoPreview(logoUrl, previewUrl, onOpenLogo, true)}
      </section>
      <section className="organization-readonly-list">
        <Descriptions className="organization-readonly-descriptions" size="small" column={2} items={items} />
      </section>
    </Card>
  );
}

function renderVerificationCard({
  team,
  verificationStatus,
  verificationLabel,
  verificationItems,
  canEdit,
  onOpenVerification,
  onOpenMaterials,
}: {
  team: TeamDetail;
  verificationStatus: string;
  verificationLabel: string;
  verificationItems: DescriptionsProps['items'];
  canEdit: boolean;
  onOpenVerification: () => void;
  onOpenMaterials: () => void;
}) {
  return (
    <Card
      className="organization-panel organization-section-card organization-verification-card"
      variant="borderless"
      title="企业认证"
      extra={<Tag color={verificationColors[verificationStatus]}>{verificationLabel}</Tag>}
    >
      {renderVerificationAlert(verificationStatus, team)}
      <Descriptions className="organization-verification-descriptions" size="small" column={2} items={verificationItems} />
      <Space wrap>
        <Button type="primary" disabled={!canEdit} onClick={onOpenVerification}>
          {verificationStatus === 'pending_review'
            ? '编辑认证信息'
            : verificationStatus === 'rejected'
              ? '补件并重新提交'
              : '提交认证'}
        </Button>
        <Button disabled={(team.verification_materials || []).length === 0} onClick={onOpenMaterials}>
          查看材料
        </Button>
      </Space>
    </Card>
  );
}

function renderVerificationAlert(verificationStatus: string, team: TeamDetail) {
  if (verificationStatus === 'pending_review') {
    return (
      <Alert
        className="organization-inline-alert"
        type="info"
        showIcon
        title="企业认证审核中"
        description="平台运营审核完成后会回写认证状态和审核意见。"
      />
    );
  }

  if (verificationStatus === 'rejected') {
    return (
      <Alert
        className="organization-inline-alert"
        type="error"
        showIcon
        title="企业认证待补件"
        description={team.verification_review_comment || '请修正主体信息或材料后重新提交。'}
      />
    );
  }

  if (verificationStatus === 'verified') {
    return (
      <Alert
        className="organization-inline-alert"
        type="success"
        showIcon
        title="企业已认证"
        description="当前企业认证状态正常。"
      />
    );
  }

  return (
    <Alert
      className="organization-inline-alert"
      type="warning"
      showIcon
      title="企业尚未认证"
      description="提交企业主体信息和材料后，状态会进入审核中。"
    />
  );
}

function renderLogoPreview(
  logoUrl?: string | null,
  previewUrl?: string | null,
  onOpenLogo?: () => void,
  compact = false,
) {
  const size = compact ? 84 : 104;

  if (!logoUrl) {
    return (
      <div className={`organization-logo-preview ${compact ? 'is-compact' : ''}`}>
        <div className="organization-logo-fallback">企业 Logo</div>
      </div>
    );
  }

  return (
    <div className={`organization-logo-preview ${compact ? 'is-compact' : ''}`}>
      <Image width={size} height={size} src={previewUrl || logoUrl} alt="企业 Logo" />
      {onOpenLogo ? (
        <Typography.Link
          role="button"
          onClick={(event) => {
            event.preventDefault();
            onOpenLogo();
          }}
        >
          查看原图
        </Typography.Link>
      ) : (
        <Typography.Link href={logoUrl} target="_blank" rel="noreferrer">
          查看原图
        </Typography.Link>
      )}
    </div>
  );
}

function renderLinkValue(value?: string | null) {
  if (!value) {
    return '-';
  }

  return (
    <Typography.Link href={value} target="_blank" rel="noreferrer">
      {value}
    </Typography.Link>
  );
}

function renderInvoiceType(value?: string | null) {
  if (value === 'special') {
    return '专票';
  }
  if (value === 'normal') {
    return '普票';
  }
  return displayValue(value);
}

function renderMembershipSummary(team: TeamDetail) {
  const membership = team.membership;
  const effectivePlan = membership?.effective_plan || membership?.current_plan || 'free';

  return (
    <Space wrap size={[8, 4]}>
      <Tag color={getMembershipColor(effectivePlan)}>{getMembershipLabel(effectivePlan)}</Tag>
      <Typography.Text type="secondary">
        {membership?.expires_at ? `到期时间：${formatApiDate(membership.expires_at)}` : '长期有效'}
      </Typography.Text>
      {membership?.status === 'expired' ? <Tag color="red">已到期，按 Free 额度执行</Tag> : null}
      {membership?.next_plan ? <Tag color="gold">已预约降级到 {getMembershipLabel(membership.next_plan)}</Tag> : null}
    </Space>
  );
}

function getMembershipLabel(plan?: string | null) {
  const labels: Record<string, string> = {
    free: 'Free',
    basic: 'Basic',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };
  return labels[(plan || 'free').toLowerCase()] || 'Free';
}

function getMembershipColor(plan?: string | null) {
  const colors: Record<string, string> = {
    free: 'default',
    basic: 'blue',
    pro: 'purple',
    enterprise: 'gold',
  };
  return colors[(plan || 'free').toLowerCase()] || 'default';
}

function displayValue(value?: string | null) {
  return value && value.trim() ? value : '-';
}

function teamToForm(team: TeamDetail | null): TeamFormValues {
  if (!team) {
    return emptyForm;
  }

  return {
    company_name: team.company_name || '',
    industry: team.industry || '',
    contact_phone: team.contact_phone || '',
    website: team.website || '',
    address: team.address || '',
    description: team.description || '',
    logo_url: team.logo_url || '',
    billing_info: {
      invoice_type: team.billing_info?.invoice_type || 'special',
      invoice_title: team.billing_info?.invoice_title || '',
      tax_number: team.billing_info?.tax_number || '',
      invoice_address: team.billing_info?.invoice_address || '',
      invoice_phone: team.billing_info?.invoice_phone || '',
      bank_name: team.billing_info?.bank_name || '',
      bank_account: team.billing_info?.bank_account || '',
      invoice_email: team.billing_info?.invoice_email || '',
      invoice_remark: team.billing_info?.invoice_remark || '',
    },
    mailing_info: {
      recipient_name: team.mailing_info?.recipient_name || '',
      recipient_phone: team.mailing_info?.recipient_phone || '',
      region: team.mailing_info?.region || '',
      detail_address: team.mailing_info?.detail_address || '',
      postal_code: team.mailing_info?.postal_code || '',
      address_alias: team.mailing_info?.address_alias || '',
      is_default: team.mailing_info?.is_default ?? true,
    },
  };
}

function sanitizeTeamPayload(values: TeamFormValues): TeamFormValues {
  return {
    company_name: values.company_name.trim(),
    industry: normalizeOptionalText(values.industry),
    contact_phone: normalizeOptionalText(values.contact_phone),
    website: normalizeOptionalText(values.website),
    address: normalizeOptionalText(values.address),
    description: normalizeOptionalText(values.description),
    logo_url: normalizeOptionalText(values.logo_url),
    billing_info: {
      invoice_type: normalizeOptionalText(values.billing_info?.invoice_type),
      invoice_title: normalizeOptionalText(values.billing_info?.invoice_title),
      tax_number: normalizeOptionalText(values.billing_info?.tax_number),
      invoice_address: normalizeOptionalText(values.billing_info?.invoice_address),
      invoice_phone: normalizeOptionalText(values.billing_info?.invoice_phone),
      bank_name: normalizeOptionalText(values.billing_info?.bank_name),
      bank_account: normalizeOptionalText(values.billing_info?.bank_account),
      invoice_email: normalizeOptionalEmail(values.billing_info?.invoice_email),
      invoice_remark: normalizeOptionalText(values.billing_info?.invoice_remark),
    },
    mailing_info: {
      recipient_name: normalizeOptionalText(values.mailing_info?.recipient_name),
      recipient_phone: normalizeOptionalText(values.mailing_info?.recipient_phone),
      region: normalizeOptionalText(values.mailing_info?.region),
      detail_address: normalizeOptionalText(values.mailing_info?.detail_address),
      postal_code: normalizeOptionalText(values.mailing_info?.postal_code),
      address_alias: normalizeOptionalText(values.mailing_info?.address_alias),
      is_default: values.mailing_info?.is_default ?? true,
    },
  };
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isPdfVerificationFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') && file.type === 'application/pdf';
}

function normalizeOptionalEmail(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isImageLogoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return /\.(png|jpe?g|gif)$/.test(name) && ['image/png', 'image/jpeg', 'image/gif'].includes(type);
}

function confirmSensitiveChange(team: TeamDetail, values: TeamFormValues): Promise<boolean> {
  if (values.company_name.trim() === team.company_name) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    Modal.confirm({
      title: '确认修改企业名称？',
      content: '企业名称属于认证敏感信息。企业认证接口接入后，修改主体信息可能需要重新认证。',
      okText: '确认修改',
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function materialNameFromUrl(url: string, index: number): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) || '');
    return name || `认证材料 ${index + 1}`;
  } catch {
    const name = decodeURIComponent(url.split('/').filter(Boolean).at(-1) || '');
    return name || `认证材料 ${index + 1}`;
  }
}
