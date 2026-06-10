import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { XProvider } from '@ant-design/x';
import zhCNX from '@ant-design/x/locale/zh_CN';
import 'antd/dist/reset.css';
import './app/global.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorInfo: '#2563eb',
          colorSuccess: '#16a34a',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          colorText: '#172033',
          colorTextSecondary: '#667085',
          colorBorder: '#e5e7eb',
          colorBgLayout: '#f5f7fb',
          colorBgContainer: '#ffffff',
          borderRadius: 8,
          fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          controlHeight: 40,
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeightSM: 34,
            controlHeightLG: 46,
          },
          Card: {
            borderRadiusLG: 8,
          },
          Form: {
            itemMarginBottom: 16,
          },
          Layout: {
            headerBg: '#ffffff',
            bodyBg: '#f5f7fb',
            siderBg: '#ffffff',
          },
          Menu: {
            itemSelectedBg: '#eff6ff',
            itemSelectedColor: '#2563eb',
          },
          Tabs: {
            itemSelectedColor: '#2563eb',
            inkBarColor: '#2563eb',
          },
        },
      }}
    >
      <XProvider locale={{ ...zhCNX, ...zhCN }}>
        <AntApp>
          <App />
        </AntApp>
      </XProvider>
    </ConfigProvider>
  </StrictMode>,
);
