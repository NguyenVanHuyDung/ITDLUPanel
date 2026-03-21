import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  GlobalOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  FolderOutlined,
  ContainerOutlined,
  MonitorOutlined,
  SafetyOutlined,
  FileTextOutlined,
  CodeOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TranslationOutlined,
  DesktopOutlined,
  ClusterOutlined,
  FieldTimeOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';
import type { MenuProps } from 'antd';

const { Sider, Content } = Layout;
const { Text } = Typography;

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

interface SystemBrief {
  hostname: string;
  os: string;
  kernel: string;
  uptime: number;
  panel_version: string;
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemBrief | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSysInfo = useCallback(async () => {
    try {
      const { data: resp } = await api.get('/dashboard');
      const d = resp.data;
      setSysInfo({
        hostname: d.system.hostname,
        os: d.system.os,
        kernel: d.system.kernel,
        uptime: d.system.uptime,
        panel_version: d.system.panel_version,
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchSysInfo();
    intervalRef.current = setInterval(fetchSysInfo, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchSysInfo]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: t('sidebar.dashboard') },
    { key: '/websites', icon: <GlobalOutlined />, label: t('sidebar.websites') },
    { key: '/databases', icon: <DatabaseOutlined />, label: t('sidebar.databases') },
    { key: '/ftp', icon: <CloudServerOutlined />, label: t('sidebar.ftp') },
    { key: '/files', icon: <FolderOutlined />, label: t('sidebar.files') },
    { key: '/docker', icon: <ContainerOutlined />, label: t('sidebar.docker') },
    { key: '/monitor', icon: <MonitorOutlined />, label: t('sidebar.monitor') },
    { key: '/security', icon: <SafetyOutlined />, label: t('sidebar.security') },
    { key: '/logs', icon: <FileTextOutlined />, label: t('sidebar.logs') },
    { key: '/terminal', icon: <CodeOutlined />, label: t('sidebar.terminal') },
    { key: '/cron', icon: <ClockCircleOutlined />, label: t('sidebar.cron') },
    { key: '/appstore', icon: <AppstoreOutlined />, label: t('sidebar.appstore') },
    { type: 'divider' as const },
    { key: '/settings', icon: <SettingOutlined />, label: t('sidebar.settings') },
    { key: '/users', icon: <UserOutlined />, label: t('sidebar.users') },
  ];

  const languageItems: MenuProps['items'] = [
    { key: 'en', label: '🇺🇸 English' },
    { key: 'vi', label: '🇻🇳 Tiếng Việt' },
  ];

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', icon: <UserOutlined />, label: t('auth.profile') },
    { key: 'settings', icon: <SettingOutlined />, label: t('settings.title') },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: t('auth.logout'), danger: true },
  ];

  const handleUserMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') handleLogout();
    else if (key === 'settings') navigate('/settings');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{
          background: '#1B2A4A',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span style={{ fontSize: collapsed ? 24 : 20, lineHeight: 1 }}>🎓</span>
          {!collapsed && (
            <Text strong style={{ color: '#fff', fontSize: 18, marginLeft: 10 }}>
              ITDLUPanel
            </Text>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            borderRight: 0,
            color: 'rgba(255,255,255,0.85)',
          }}
          theme="dark"
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'margin-left 0.2s' }}>
        {/* ── System Info Header Bar ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1E88E5 100%)',
          padding: '8px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#fff', fontSize: 13, flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {sysInfo && (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <DesktopOutlined style={{ fontSize: 13, opacity: 0.85 }} />
                  <strong>{sysInfo.hostname}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  <ClusterOutlined style={{ fontSize: 12 }} />
                  {sysInfo.os}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  <CodeOutlined style={{ fontSize: 12 }} />
                  {sysInfo.kernel}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  <FieldTimeOutlined style={{ fontSize: 12 }} />
                  Uptime: {formatUptime(sysInfo.uptime)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  <TagOutlined style={{ fontSize: 12 }} />
                  v{sysInfo.panel_version}
                </span>
              </>
            )}
          </div>
        </div>
        {/* ── Action Header ── */}
        <div style={{
          background: '#fff',
          padding: '0 24px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          position: 'sticky',
          top: 0,
          zIndex: 9,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />
          <Space size="middle">
            <Dropdown menu={{ items: languageItems, onClick: ({ key }) => i18n.changeLanguage(key) }}>
              <Button type="text" icon={<TranslationOutlined />} size="small">
                {i18n.language === 'vi' ? '🇻🇳' : '🇺🇸'}
              </Button>
            </Dropdown>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1565C0' }} />
                <Text>{user?.username ?? 'Admin'}</Text>
              </Space>
            </Dropdown>
          </Space>
        </div>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
