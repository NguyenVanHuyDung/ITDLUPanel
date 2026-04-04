import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Typography, Drawer, Tooltip, Badge } from 'antd';
import {
  DashboardOutlined,
  GlobalOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  FolderOutlined,
  ContainerOutlined,
  MonitorOutlined,
  SafetyOutlined,
  FireOutlined,
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
  CloseOutlined,
  SunOutlined,
  MoonOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useTaskStore } from '@/stores/task';
import { useSettingsStore } from '@/stores/settings';
import { useTaskWebSocket } from '@/hooks/useTaskWebSocket';
import MessagesBox from '@/components/MessagesBox';
import api from '@/services/api';
import type { MenuProps } from 'antd';

const { Sider, Content } = Layout;
const { Text } = Typography;

import { useIsMobile } from '@/hooks/useIsMobile';

const SIDER_WIDTH = 250;
const SIDER_COLLAPSED = 80;

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
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemBrief | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore();
  const isDark = themeMode === 'dark';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { summary, setModalOpen } = useTaskStore();
  const taskCount = summary.running + summary.pending;

  // Connect WebSocket for real-time task updates
  useTaskWebSocket();

  // Load global settings (timezone, etc.)
  const { fetchSettings: fetchAppSettings } = useSettingsStore();
  useEffect(() => { fetchAppSettings(); }, [fetchAppSettings]);

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

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: t('sidebar.dashboard') },
    { key: '/websites', icon: <GlobalOutlined />, label: t('sidebar.websites') },
    { key: '/databases', icon: <DatabaseOutlined />, label: t('sidebar.databases') },
    { key: '/ftp', icon: <CloudServerOutlined />, label: t('sidebar.ftp') },
    { key: '/storage', icon: <CloudServerOutlined />, label: 'Storage' },
    { key: '/files', icon: <FolderOutlined />, label: t('sidebar.files') },
    { key: '/docker', icon: <ContainerOutlined />, label: t('sidebar.docker') },
    { key: '/monitor', icon: <MonitorOutlined />, label: t('sidebar.monitor') },
    { key: '/security', icon: <SafetyOutlined />, label: t('sidebar.security') },
    { key: '/firewall', icon: <FireOutlined />, label: 'Firewall' },
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

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
    if (isMobile) setMobileDrawerOpen(false);
  };

  const siderContent = (
    <>
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isMobile ? 'space-between' : (collapsed ? 'center' : 'flex-start'),
        padding: (isMobile || !collapsed) ? '0 20px' : '0',
        borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E8EDF2',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src="/favicon.svg"
            alt="ITDLUPanel"
            style={{
              width: collapsed && !isMobile ? 28 : 24,
              height: collapsed && !isMobile ? 28 : 24,
              flexShrink: 0,
            }}
          />
          {(!collapsed || isMobile) && (
            <Text strong style={{ color: isDark ? '#fff' : '#1A1A2E', fontSize: 18, marginLeft: 10 }}>
              ITDLUPanel
            </Text>
          )}
        </div>
        {isMobile && (
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setMobileDrawerOpen(false)}
            style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#64748B', fontSize: 16 }}
          />
        )}
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ background: 'transparent', borderRight: 0, ...(isDark ? { color: 'rgba(255,255,255,0.85)' } : {}) }}
        theme={isDark ? 'dark' : 'light'}
      />
    </>
  );

  const contentMarginLeft = isMobile ? 0 : (collapsed ? SIDER_COLLAPSED : SIDER_WIDTH);

  return (
    <Layout style={{ minHeight: '100vh', background: isDark ? '#0d1117' : '#F5F7FA' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={SIDER_WIDTH}
          breakpoint="lg"
          onBreakpoint={(broken) => setCollapsed(broken)}
          style={{
            background: isDark ? '#141821' : '#FFFFFF',
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 10,
            ...(isDark ? {} : { borderRight: '1px solid #E8EDF2' }),
          }}
        >
          {siderContent}
        </Sider>
      )}

      {/* Mobile sidebar drawer */}
      {isMobile && (
        <Drawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          placement="left"
          width={SIDER_WIDTH}
          closable={false}
          styles={{ body: { padding: 0, background: isDark ? '#141821' : '#FFFFFF' } }}
          style={{ zIndex: 1001 }}
        >
          {siderContent}
        </Drawer>
      )}

      <Layout style={{
        marginLeft: contentMarginLeft,
        transition: 'margin-left 0.2s',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: isDark ? '#0d1117' : '#F5F7FA',
      }}>
        {/* ── Unified Header Bar ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1E88E5 100%)',
          padding: isMobile ? '0 10px' : '0 20px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fff',
          fontSize: isMobile ? 11 : 13,
          position: 'sticky',
          top: 0,
          zIndex: 9,
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}>
          {/* Left: hamburger + system info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, minWidth: 0 }}>
            <Button
              type="text"
              icon={isMobile ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
              onClick={() => isMobile ? setMobileDrawerOpen(true) : setCollapsed(!collapsed)}
              style={{ fontSize: 16, color: '#fff', flexShrink: 0 }}
            />
            {sysInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 14, overflow: 'hidden' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <DesktopOutlined style={{ fontSize: 12, opacity: 0.85 }} />
                  <strong style={{ fontSize: isMobile ? 12 : 13 }}>{sysInfo.hostname}</strong>
                </span>
                {!isMobile && (
                  <>
                    <span style={{ opacity: 0.4 }}>|</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9, whiteSpace: 'nowrap' }}>
                      <ClusterOutlined style={{ fontSize: 11 }} />
                      {sysInfo.os}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9, whiteSpace: 'nowrap' }}>
                      <CodeOutlined style={{ fontSize: 11 }} />
                      {sysInfo.kernel}
                    </span>
                  </>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9, flexShrink: 0 }}>
                  <FieldTimeOutlined style={{ fontSize: 11 }} />
                  {formatUptime(sysInfo.uptime)}
                </span>
              </div>
            )}
          </div>

          {/* Right: tasks + language + user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, flexShrink: 0 }}>
            <Tooltip title={t('task.messages_box')}>
              <Badge count={taskCount} size="small" offset={[-2, 2]}
                style={{ backgroundColor: taskCount > 0 ? '#52c41a' : undefined }}
              >
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  onClick={() => setModalOpen(true)}
                  size="small"
                  style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}
                />
              </Badge>
            </Tooltip>
            <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                size="small"
                style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}
              />
            </Tooltip>
            <Dropdown menu={{ items: languageItems, onClick: ({ key }) => i18n.changeLanguage(key) }}>
              <Button type="text" icon={<TranslationOutlined />} size="small"
                style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}
              >
                {i18n.language === 'vi' ? '🇻🇳' : '🇺🇸'}
              </Button>
            </Dropdown>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
                {!isMobile && <Text style={{ color: '#fff' }}>{user?.username ?? 'Admin'}</Text>}
              </Space>
            </Dropdown>
          </div>
        </div>
        <Content style={{ margin: isMobile ? 8 : 24, flex: 1 }}>
          <Outlet />
        </Content>
        {/* ── Footer ── */}
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '12px 8px' : '16px 24px',
          fontSize: isMobile ? 11 : 12,
          color: isDark ? '#8b949e' : '#94A3B8',
          borderTop: isDark ? '1px solid #30363d' : '1px solid #E8EDF2',
          background: isDark ? '#161b22' : '#FAFBFC',
        }}>
          <span>© {new Date().getFullYear()} </span>
          <a href="https://dlu.edu.vn" target="_blank" rel="noreferrer" style={{ color: '#1565C0', fontWeight: 500 }}>
            Đại học Đà Lạt
          </a>
          <span> — ITDLUPanel v{sysInfo?.panel_version || '1.0.0'}</span>
          {!isMobile && (
            <>
              <span style={{ margin: '0 8px', color: '#CBD5E1' }}>|</span>
              <span>Powered by Go + React</span>
            </>
          )}
        </div>
        <MessagesBox />
      </Layout>
    </Layout>
  );
}
