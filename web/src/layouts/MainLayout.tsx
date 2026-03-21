import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Typography, Drawer } from 'antd';
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
  CloseOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';
import type { MenuProps } from 'antd';

const { Sider, Content } = Layout;
const { Text } = Typography;

const MOBILE_BREAKPOINT = 768;
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
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

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

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
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: collapsed && !isMobile ? 24 : 20, lineHeight: 1 }}>🎓</span>
          {(!collapsed || isMobile) && (
            <Text strong style={{ color: '#fff', fontSize: 18, marginLeft: 10 }}>
              ITDLUPanel
            </Text>
          )}
        </div>
        {isMobile && (
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setMobileDrawerOpen(false)}
            style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16 }}
          />
        )}
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ background: 'transparent', borderRight: 0, color: 'rgba(255,255,255,0.85)' }}
        theme="dark"
      />
    </>
  );

  const contentMarginLeft = isMobile ? 0 : (collapsed ? SIDER_COLLAPSED : SIDER_WIDTH);

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
          styles={{ body: { padding: 0, background: '#1B2A4A' } }}
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
      }}>
        {/* ── System Info Header Bar ── */}
        <div className="sys-info-bar" style={{
          background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1E88E5 100%)',
          padding: isMobile ? '6px 12px' : '8px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#fff', fontSize: isMobile ? 11 : 13, flexWrap: 'wrap', gap: isMobile ? 4 : 8,
          minHeight: isMobile ? 28 : 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16, flexWrap: 'wrap' }}>
            {sysInfo && (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <DesktopOutlined style={{ fontSize: isMobile ? 11 : 13, opacity: 0.85 }} />
                  <strong>{sysInfo.hostname}</strong>
                </span>
                {!isMobile && (
                  <>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                      <ClusterOutlined style={{ fontSize: 12 }} />
                      {sysInfo.os}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                      <CodeOutlined style={{ fontSize: 12 }} />
                      {sysInfo.kernel}
                    </span>
                  </>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  <FieldTimeOutlined style={{ fontSize: isMobile ? 10 : 12 }} />
                  {formatUptime(sysInfo.uptime)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.9 }}>
                  <TagOutlined style={{ fontSize: isMobile ? 10 : 12 }} />
                  v{sysInfo.panel_version}
                </span>
              </>
            )}
          </div>
        </div>
        {/* ── Action Header ── */}
        <div style={{
          background: '#fff',
          padding: isMobile ? '0 12px' : '0 24px',
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
            icon={isMobile ? <MenuUnfoldOutlined /> : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)}
            onClick={() => isMobile ? setMobileDrawerOpen(true) : setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />
          <Space size={isMobile ? 'small' : 'middle'}>
            <Dropdown menu={{ items: languageItems, onClick: ({ key }) => i18n.changeLanguage(key) }}>
              <Button type="text" icon={<TranslationOutlined />} size="small">
                {i18n.language === 'vi' ? '🇻🇳' : '🇺🇸'}
              </Button>
            </Dropdown>
            <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1565C0' }} />
                {!isMobile && <Text>{user?.username ?? 'Admin'}</Text>}
              </Space>
            </Dropdown>
          </Space>
        </div>
        <Content style={{ margin: isMobile ? 8 : 24, flex: 1 }}>
          <Outlet />
        </Content>
        {/* ── Footer ── */}
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '12px 8px' : '16px 24px',
          fontSize: isMobile ? 11 : 12,
          color: '#94A3B8',
          borderTop: '1px solid #E8EDF2',
          background: '#FAFBFC',
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
      </Layout>
    </Layout>
  );
}
