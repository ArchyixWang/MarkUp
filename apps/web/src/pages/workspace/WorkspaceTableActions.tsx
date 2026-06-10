import type { ReactNode } from 'react';
import { Button, Dropdown, Modal, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

type ConfirmOptions = {
  title: string;
  content?: ReactNode;
  okText?: string;
  cancelText?: string;
};

export type WorkspaceTableAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void | Promise<void>;
  confirm?: ConfirmOptions;
};

type WorkspaceTableActionsProps = {
  visible?: WorkspaceTableAction[];
  menu?: WorkspaceTableAction[];
  className?: string;
  moreAriaLabel?: string;
};

function runAction(action: WorkspaceTableAction) {
  if (action.disabled || !action.onClick) return;
  if (!action.confirm) {
    void action.onClick();
    return;
  }

  Modal.confirm({
    title: action.confirm.title,
    content: action.confirm.content,
    okText: action.confirm.okText ?? (action.danger ? '确认' : '确定'),
    cancelText: action.confirm.cancelText ?? '取消',
    centered: true,
    okButtonProps: action.danger ? { danger: true } : undefined,
    onOk: () => action.onClick?.(),
  });
}

export function WorkspaceTableActions({
  visible = [],
  menu = [],
  className,
  moreAriaLabel = '更多操作',
}: WorkspaceTableActionsProps) {
  const menuItems: MenuProps['items'] = menu.map((action) => ({
    key: action.key,
    label: action.label,
    icon: action.icon,
    danger: action.danger,
    disabled: action.disabled,
  }));
  const rootClassName = ['row-actions', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      {visible.map((action) => (
        <Tooltip title={action.label} key={action.key}>
          <Button
            aria-label={action.label}
            autoInsertSpace={false}
            danger={action.danger}
            disabled={action.disabled}
            icon={action.icon ?? <MoreOutlined />}
            loading={action.loading}
            size="small"
            type="text"
            onClick={() => runAction(action)}
          />
        </Tooltip>
      ))}
      {menu.length ? (
        <Dropdown
          classNames={{ root: 'workspace-action-dropdown' }}
          placement="bottomRight"
          getPopupContainer={() => document.body}
          menu={{
            items: menuItems,
            onClick: ({ key }) => {
              const action = menu.find((item) => item.key === key);
              if (action) runAction(action);
            },
          }}
        >
          <Button
            aria-label={moreAriaLabel}
            autoInsertSpace={false}
            icon={<MoreOutlined />}
            size="small"
            type="text"
          />
        </Dropdown>
      ) : null}
    </div>
  );
}
