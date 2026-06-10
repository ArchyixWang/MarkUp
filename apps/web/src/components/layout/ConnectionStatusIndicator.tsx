import { DisconnectOutlined, WifiOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useConnectivityStatus } from '../../services/connectivityStatus';

interface ConnectionStatusIndicatorProps {
  className?: string;
}

export function ConnectionStatusIndicator({ className }: ConnectionStatusIndicatorProps) {
  const status = useConnectivityStatus();
  const connected = status === 'connected';
  const label = connected ? '网络连接正常' : '连接失败';

  return (
    <Tooltip title={label}>
      <span
        className={['connection-status-indicator', connected ? 'is-connected' : 'is-disconnected', className]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        role="img"
      >
        {connected ? <WifiOutlined aria-hidden /> : <DisconnectOutlined aria-hidden />}
      </span>
    </Tooltip>
  );
}
