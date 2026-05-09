---
name: create-itdlupanel-ui
description: Tạo giao diện UI/UX cho panel quản trị server giống ITDLUPanel. Sử dụng skill này khi người dùng yêu cầu tạo trang, component, dashboard, hoặc bất kỳ giao diện admin panel nào cần có giao diện chuyên nghiệp kiểu ITDLUPanel.
---

# ITDLUPanel UI Creator

Skill này giúp tạo giao diện UI/UX chuyên nghiệp cho admin panel/server management dashboard, bắt chước phong cách thiết kế của **ITDLUPanel** - một panel quản trị server của Đại học Đà Lạt.

## Phong cách Thiết kế

**Chuyên nghiệp & Chức năng** — Giao diện sạch sẽ, hiệu quả cho quản trị viên hệ thống. Ưu tiên sự rõ ràng, mật độ thông tin, và thao tác nhanh hơn các yếu tố trang trí.

## Tech Stack

```
React 18+ + TypeScript
Vite + Rolldown (build)
Ant Design 5.x (UI components)
Tailwind CSS v4 (utility classes)
Recharts (charts)
@ant-design/icons + lucide-react (icons)
React hooks + Zustand (state)
react-i18next (i18n)
```

## Cấu trúc File

```
src/
├── index.css                 # Global styles + CSS variables
├── App.tsx                   # Root component + router
├── layouts/
│   └── MainLayout.tsx       # Sidebar + header + footer layout
├── pages/                    # Page components (folder = page name)
│   ├── Dashboard/
│   ├── Docker/
│   └── ...
├── components/               # Shared components
│   ├── Modal/
│   └── ...
├── hooks/
│   ├── usePalette.ts         # Theme-aware color palette
│   └── useIsMobile.ts        # Responsive detection
├── services/
│   └── api.ts                # API client (axios-based)
├── stores/                   # Zustand stores
│   ├── auth.ts
│   ├── theme.ts
│   ├── task.ts
│   └── settings.ts
├── i18n/
│   └── index.ts
└── types/
    └── index.ts
```

## Hệ thống Màu sắc

### CSS Variables (`index.css`)

```css
:root {
  --color-primary: #1565C0;
  --color-primary-light: #1E88E5;
  --color-primary-dark: #0D47A1;
  --color-secondary: #2E7D32;
  --color-accent: #0288D1;
  --color-sidebar: #1B2A4A;
  --color-sidebar-hover: #243656;
  --color-bg: #F5F7FA;
  --color-surface: #FFFFFF;
  --color-text: #1A1A2E;
  --color-text-secondary: #64748B;
  --color-success: #4CAF50;
  --color-warning: #FF9800;
  --color-error: #F44336;
}

body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--color-bg);
  color: var(--color-text);
}
```

### usePalette Hook

```typescript
// web/src/hooks/usePalette.ts
import { useThemeStore } from '@/stores/theme';

export interface Palette {
  card: string;
  cardBorder: string;
  headerBg: string;
  colHeaderBg: string;
  rowHover: string;
  rowAlt: string;
  text: string;
  textMuted: string;
  textDim: string;
  barTrack: string;
  expandBg: string;
  codeBg: string;
  inputBg: string;
  accent: string;
  green: string;
  greenDim: string;
  amber: string;
  amberDim: string;
  red: string;
  redDim: string;
  purple: string;
  cyan: string;
}

const darkPalette: Palette = {
  card: '#111827',
  cardBorder: '#1E293B',
  headerBg: '#0F172A',
  colHeaderBg: 'rgba(15,23,42,0.3)',
  rowHover: 'rgba(56,189,248,0.04)',
  rowAlt: 'rgba(15,23,42,0.5)',
  text: '#E2E8F0',
  textMuted: '#64748B',
  textDim: '#475569',
  barTrack: 'rgba(30,41,59,0.8)',
  expandBg: 'rgba(15,23,42,0.6)',
  codeBg: 'rgba(0,0,0,0.3)',
  inputBg: 'rgba(15,23,42,0.6)',
  accent: '#38BDF8',
  green: '#34D399',
  greenDim: '#059669',
  amber: '#FBBF24',
  amberDim: '#D97706',
  red: '#F87171',
  redDim: '#DC2626',
  purple: '#A78BFA',
  cyan: '#22D3EE',
};

const lightPalette: Palette = {
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  headerBg: '#F8FAFC',
  colHeaderBg: '#F1F5F9',
  rowHover: 'rgba(37,99,235,0.04)',
  rowAlt: '#F8FAFC',
  text: '#1E293B',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  barTrack: '#E2E8F0',
  expandBg: '#F1F5F9',
  codeBg: '#F8FAFC',
  inputBg: '#F1F5F9',
  accent: '#2563EB',
  green: '#16A34A',
  greenDim: '#15803D',
  amber: '#D97706',
  amberDim: '#B45309',
  red: '#DC2626',
  redDim: '#B91C1C',
  purple: '#7C3AED',
  cyan: '#0891B2',
};

export function usePalette(): { p: Palette; isDark: boolean } {
  const { mode } = useThemeStore();
  const isDark = mode === 'dark';
  return { p: isDark ? darkPalette : lightPalette, isDark };
}
```

## Layout Patterns

### 1. Main Layout (Sidebar + Header + Footer)

```tsx
// layouts/MainLayout.tsx
import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, Avatar, Space, Typography, Drawer, Tooltip, Badge } from 'antd';
import {
  DashboardOutlined, GlobalOutlined, DatabaseOutlined, FolderOutlined,
  ContainerOutlined, MonitorOutlined, SafetyOutlined, SettingOutlined,
  UserOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  TranslationOutlined, DesktopOutlined, CodeOutlined, FieldTimeOutlined,
  BellOutlined, SunOutlined, MoonOutlined, CloseOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useTaskStore } from '@/stores/task';
import { useSettingsStore } from '@/stores/settings';
import { useIsMobile } from '@/hooks/useIsMobile';
import MessagesBox from '@/components/MessagesBox';

const SIDER_WIDTH = 250;

export default function MainLayout() {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const { mode: themeMode, toggle: toggleTheme } = useThemeStore();
  const isDark = themeMode === 'dark';
  const { summary, setModalOpen } = useTaskStore();
  const taskCount = summary.running + summary.pending;

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: t('sidebar.dashboard') },
    { key: '/websites', icon: <GlobalOutlined />, label: t('sidebar.websites') },
    { key: '/databases', icon: <DatabaseOutlined />, label: t('sidebar.databases') },
    { key: '/files', icon: <FolderOutlined />, label: t('sidebar.files') },
    { key: '/docker', icon: <ContainerOutlined />, label: t('sidebar.docker') },
    { key: '/monitor', icon: <MonitorOutlined />, label: t('sidebar.monitor') },
    { key: '/security', icon: <SafetyOutlined />, label: t('sidebar.security') },
    { key: '/settings', icon: <SettingOutlined />, label: t('sidebar.settings') },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: isDark ? '#0d1117' : '#F5F7FA' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Layout.Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={SIDER_WIDTH}
          style={{
            background: isDark ? '#141821' : '#FFFFFF',
            overflow: 'auto', height: '100vh',
            position: 'fixed', left: 0, top: 0, bottom: 0,
            zIndex: 10,
            borderRight: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #E8EDF2',
          }}
        >
          {/* Logo */}
          <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E8EDF2' }}>
            <img src="/favicon.svg" alt="Logo" style={{ width: 24, height: 24 }} />
            {!collapsed && <span style={{ marginLeft: 10, fontWeight: 600, color: isDark ? '#fff' : '#1A1A2E', fontSize: 18 }}>ITDLUPanel</span>}
          </div>
          <Menu mode="inline" selectedKeys={[location.pathname]} items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ background: 'transparent', borderRight: 0 }}
            theme={isDark ? 'dark' : 'light'} />
        </Layout.Sider>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer open={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} placement="left" width={SIDER_WIDTH}
          styles={{ body: { padding: 0, background: isDark ? '#141821' : '#FFFFFF' } }}>
          {/* Logo + Menu same as desktop */}
        </Drawer>
      )}

      <Layout style={{
        marginLeft: isMobile ? 0 : (collapsed ? 80 : SIDER_WIDTH),
        transition: 'margin-left 0.2s', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        background: isDark ? '#0d1117' : '#F5F7FA',
      }}>
        {/* Header - Blue gradient */}
        <div style={{
          background: 'linear-gradient(135deg, #0D47A1 0%, #1565C0 50%, #1E88E5 100%)',
          padding: '0 20px', height: 48, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', color: '#fff', fontSize: 13,
          position: 'sticky', top: 0, zIndex: 9, boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)} style={{ fontSize: 16, color: '#fff' }} />
            <span>Server Name</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge count={taskCount} size="small">
              <Button type="text" icon={<BellOutlined />} onClick={() => setModalOpen(true)} style={{ color: 'rgba(255,255,255,0.9)' }} />
            </Badge>
            <Button type="text" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} style={{ color: 'rgba(255,255,255,0.9)' }} />
            <Dropdown menu={{ items: userMenuItems }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
                <span style={{ color: '#fff' }}>{user?.username}</span>
              </Space>
            </Dropdown>
          </div>
        </div>

        <Content style={{ margin: 24, flex: 1 }}>
          <Outlet />
        </Content>

        {/* Footer */}
        <div style={{
          textAlign: 'center', padding: '16px 24px', fontSize: 12,
          color: isDark ? '#8b949e' : '#94A3B8',
          borderTop: isDark ? '1px solid #30363d' : '1px solid #E8EDF2',
          background: isDark ? '#161b22' : '#FAFBFC',
        }}>
          © {new Date().getFullYear()} Đại học Đà Lạt — ITDLUPanel
        </div>
        <MessagesBox />
      </Layout>
    </Layout>
  );
}
```

### 2. Sidebar Menu CSS (Ant Design overrides)

```css
/* Sidebar menu items — comfortable spacing */
.ant-layout-sider .ant-menu-item {
  height: 40px !important;
  line-height: 40px !important;
  margin: 2px 8px !important;
  padding: 0 12px !important;
  border-radius: 6px;
}

/* Light sidebar: hover → blue bg + white text */
.ant-menu-light .ant-menu-item:hover,
.ant-menu-light .ant-menu-item-active {
  background: #1565C0 !important;
  color: #fff !important;
}

/* Selected item → blue bg + white text */
.ant-menu-light .ant-menu-item-selected {
  background: #1565C0 !important;
  color: #fff !important;
}

.ant-menu-light .ant-menu-item .ant-menu-item-icon {
  color: #64748B;
}
```

## Component Patterns

### 1. Page Container (Card wrapper)

```tsx
function PageContainer({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { p, isDark } = usePalette();
  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg,
      }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{title}</span>
          {subtitle && <span style={{ fontSize: 12, color: p.textMuted, marginLeft: 8 }}>{subtitle}</span>}
        </div>
        {actions}
      </div>
      {/* Content */}
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  );
}
```

### 2. Tab Bar (Custom, not Ant Tabs)

```tsx
function TabBar({ tabs, activeTab, onChange }: {
  tabs: { key: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onChange: (key: string) => void;
}) {
  const { p } = usePalette();
  return (
    <div style={{
      padding: '8px 20px',
      borderBottom: `1px solid ${p.cardBorder}`,
      display: 'flex', gap: 4,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}>
      {tabs.map(tab => (
        <button key={tab.key} onClick={() => onChange(tab.key)} style={{
          padding: '6px 14px', borderRadius: 6,
          border: 'none', cursor: 'pointer',
          fontSize: 12.5, fontWeight: 500,
          background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
          color: activeTab === tab.key ? p.accent : p.textMuted,
          transition: 'all 0.15s',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  );
}
```

### 3. Status Badge

```tsx
const statusColors: Record<string, { bg: string; color: string }> = {
  running: { bg: '#E6F7E9', color: '#52C41A' },
  stopped: { bg: '#F5F5F5', color: '#8C8C8C' },
  error: { bg: '#FFF1F0', color: '#FF4D4F' },
  warning: { bg: '#FFFBE6', color: '#FAAD14' },
  active: { bg: '#E6F7E9', color: '#52C41A' },
  inactive: { bg: '#F5F5F5', color: '#8C8C8C' },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusColors[status] || statusColors.stopped;
  return (
    <span style={{
      background: style.bg, color: style.color,
      border: 'none', borderRadius: 4, fontWeight: 500,
      fontSize: 11, padding: '2px 8px',
    }}>
      {status.toUpperCase()}
    </span>
  );
}
```

### 4. Action Buttons (with Popconfirm for danger)

```tsx
import { Button, Space, Popconfirm } from 'antd';
import { EyeOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';

function ActionButtons({ onView, onEdit, onDelete, onReload }: ActionButtonsProps) {
  return (
    <Space size={4}>
      {onView && <Button size="small" icon={<EyeOutlined />} onClick={onView} />}
      {onEdit && <Button size="small" icon={<EditOutlined />} onClick={onEdit} />}
      {onReload && <Button size="small" icon={<ReloadOutlined />} onClick={onReload} />}
      {onDelete && (
        <Popconfirm title="Delete this item?" onConfirm={onDelete}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      )}
    </Space>
  );
}
```

### 5. Responsive Toolbar

```tsx
<div className="responsive-toolbar" style={{
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
}}>
  <Input.Search placeholder="Search..." style={{ width: 250 }} />
  <Select options={options} style={{ width: 150 }} />
  <Button type="primary" icon={<PlusOutlined />}>Add New</Button>
  <Button icon={<ReloadOutlined />}>Refresh</Button>
</div>
```

### 6. Data Table

```tsx
import { Table, Tag } from 'antd';

<Table
  dataSource={data}
  rowKey="id"
  pagination={{ pageSize: 10, showSizeChanger: true }}
  columns={[
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <StatusBadge status={status} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => <ActionButtons {...record} />,
    },
  ]}
/>
```

### 7. Stat Cards (Grid)

```tsx
<Row gutter={16}>
  <Col xs={12} sm={6}>
    <Card style={{ borderRadius: 12, border: `1px solid ${p.cardBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${p.accent}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: p.accent, fontSize: 20,
        }}>
          <CloudServerOutlined />
        </div>
        <div>
          <div style={{ fontSize: 13, color: p.textMuted }}>Total Sites</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: p.text }}>{count}</div>
        </div>
      </div>
    </Card>
  </Col>
</Row>
```

### 8. Modal Form Pattern

```tsx
<Modal
  title="Modal Title"
  open={open}
  onCancel={onClose}
  footer={[
    <Button key="cancel" onClick={onClose}>Cancel</Button>,
    <Button key="submit" type="primary" onClick={handleSubmit}>Submit</Button>,
  ]}
  width={600}
>
  <Form layout="vertical" form={form}>
    <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Required' }]}>
      <Input placeholder="Enter name" />
    </Form.Item>
    <Form.Item label="Description" name="description">
      <Input.TextArea rows={3} placeholder="Description..." />
    </Form.Item>
  </Form>
</Modal>
```

### 9. Alert/Notice (Not Installed / Not Running)

```tsx
import { Alert } from 'antd';
import { DownloadOutlined, SettingOutlined, LoadingOutlined } from '@ant-design/icons';

function NotInstalledAlert({ onInstall, installing }: {
  onInstall: () => void;
  installing: boolean;
}) {
  const { p } = usePalette();
  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${p.cardBorder}`,
        background: p.headerBg,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Page Title</span>
      </div>
      <div style={{ padding: 16 }}>
        <Alert
          message="Not installed"
          description="Please install to use this feature."
          type="warning"
          showIcon
          action={
            <Button onClick={onInstall} disabled={installing} style={{
              background: p.accent, color: '#fff', border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {installing ? <LoadingOutlined /> : <DownloadOutlined />}
              {installing ? 'Installing...' : 'Install'}
            </Button>
          }
        />
      </div>
    </div>
  );
}
```

## SVG Icon Set (Custom inline SVGs)

```tsx
// Custom inline SVG icons - these match the ITDLUPanel dashboard style
const DashIcon = {
  Server: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <circle cx="6" cy="6.5" r="1" fill={color} stroke="none" />
      <circle cx="6" cy="17.5" r="1" fill={color} stroke="none" />
      <line x1="10" y1="6.5" x2="18" y2="6.5" />
      <line x1="10" y1="17.5" x2="18" y2="17.5" />
    </svg>
  ),
  Disk: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 3v4h10V3" />
      <rect x="8" y="12" width="8" height="5" rx="1" />
      <line x1="15" y1="5" x2="15" y2="5.01" strokeWidth="2" />
    </svg>
  ),
  Chart: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="12" width="4" height="9" rx="1" fill={`${color}30`} />
      <rect x="10" y="7" width="4" height="14" rx="1" fill={`${color}30`} />
      <rect x="17" y="3" width="4" height="18" rx="1" fill={`${color}30`} />
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="7" width="4" height="14" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  ),
  Shield: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={`${color}12`} />
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Globe: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <ellipse cx="12" cy="12" rx="4" ry="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  ),
  Database: ({ color, size = 18 }: { color: string; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3" fill={`${color}15`} />
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5" />
      <path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" />
    </svg>
  ),
};
```

## API Service Pattern

```typescript
// services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

## Full Page Example: Docker Page

```tsx
// pages/Docker/index.tsx
import { useState, useEffect, useCallback } from 'react';
import { message, Alert } from 'antd';
import {
  ReloadOutlined, CloudServerOutlined, FileImageOutlined,
  DownloadOutlined, AppstoreOutlined, DashboardOutlined,
  CloudDownloadOutlined, ApartmentOutlined,
  DatabaseOutlined, BuildOutlined, SafetyOutlined, SettingOutlined,
  LoadingOutlined, ClearOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePalette } from '@/hooks/usePalette';
import api from '@/services/api';

interface DockerInfo {
  installed: boolean;
  running?: boolean;
  info?: {
    server_version: string;
    containers: number;
    running: number;
    images: number;
  };
}

export default function Docker() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [activeTab, setActiveTab] = useState('overview');
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [installing, setInstalling] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const { data } = await api.get('/docker/info');
      setDockerInfo(data.data);
    } catch {
      setDockerInfo({ installed: false, running: false });
    } finally {
      setLoadingInfo(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      await api.post('/software/install', { name: 'docker', version: 'stable' });
      message.info('Docker installation started');
    } catch {
      message.error('Failed to start installation');
    } finally {
      setInstalling(false);
    }
  }, []);

  const tabDefs = [
    { key: 'overview',    label: 'Overview',     icon: <DashboardOutlined /> },
    { key: 'containers',  label: 'Container',    icon: <CloudServerOutlined /> },
    { key: 'cloud-image', label: 'Cloud Image',  icon: <CloudDownloadOutlined /> },
    { key: 'local-image', label: 'Local Image',  icon: <FileImageOutlined /> },
    { key: 'compose',     label: 'Compose',      icon: <BuildOutlined /> },
    { key: 'network',    label: 'Network',      icon: <ApartmentOutlined /> },
    { key: 'volume',     label: 'Volume',        icon: <DatabaseOutlined /> },
    { key: 'settings',   label: 'Settings',     icon: <SettingOutlined /> },
    { key: 'cleanup',    label: 'Cleanup',       icon: <ClearOutlined /> },
  ];

  const isInstalled = dockerInfo?.installed ?? false;
  const isRunning = dockerInfo?.running ?? false;
  const info = dockerInfo?.info;

  if (!isInstalled && !loadingInfo) {
    return (
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${p.cardBorder}`, background: p.headerBg }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.docker')}</span>
        </div>
        <div style={{ padding: 16 }}>
          <Alert
            message={t('docker.not_installed')}
            description={t('docker.not_installed_desc')}
            type="warning"
            showIcon
            action={
              <button onClick={handleInstall} disabled={installing} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: installing ? 'not-allowed' : 'pointer',
                background: installing ? p.cardBorder : p.accent, color: '#fff', fontSize: 13, fontWeight: 500,
              }}>
                {installing ? <LoadingOutlined /> : <DownloadOutlined />} {installing ? 'Installing...' : 'Install'}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: p.card, borderRadius: 12,
      border: `1px solid ${p.cardBorder}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.headerBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>{t('sidebar.docker')}</span>
          {info && (
            <>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: `${p.accent}15`, color: p.accent }}>
                v{info.server_version}
              </span>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: `${p.green}15`, color: p.green }}>
                {info.containers} containers
              </span>
            </>
          )}
        </div>
        <button onClick={fetchInfo} style={{
          padding: '5px 14px', borderRadius: 6, border: `1px solid ${p.cardBorder}`,
          background: 'transparent', color: p.textMuted, fontSize: 12, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <ReloadOutlined /> Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div style={{
        padding: '8px 20px', borderBottom: `1px solid ${p.cardBorder}`,
        display: 'flex', gap: 4, overflowX: 'auto',
      }}>
        {tabDefs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 500,
            background: activeTab === tab.key ? `${p.accent}15` : 'transparent',
            color: activeTab === tab.key ? p.accent : p.textMuted,
            transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center',
            gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {activeTab === 'overview' && <div>Overview content</div>}
        {activeTab === 'containers' && <div>Container list</div>}
        {/* ... other tabs */}
      </div>
    </div>
  );
}
```

## Full Page Example: Settings Page

```tsx
// pages/Settings/index.tsx
import { useState, useCallback } from 'react';
import { Card, Form, Input, Switch, Button, Select, message, Divider } from 'antd';
import { SaveOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useSettingsStore } from '@/stores/settings';
import api from '@/services/api';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { p, isDark } = usePalette();
  const { fetchSettings: refreshSettings, panelName, hiddenMenuKeys } = useSettingsStore();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.put('/settings', values);
      await refreshSettings();
      message.success('Settings saved');
    } catch {
      message.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [refreshSettings]);

  return (
    <div>
      {/* General Settings */}
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`, marginBottom: 16,
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>General Settings</span>
        </div>
        <div style={{ padding: 16 }}>
          <Form layout="vertical" form={form} onFinish={handleSave} style={{ maxWidth: 500 }}>
            <Form.Item label="Panel Name" name="panelName" initialValue={panelName}
              rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="My Panel" />
            </Form.Item>
            <Form.Item label="Language" name="language" initialValue={i18n.language}>
              <Select options={[
                { value: 'en', label: 'English' },
                { value: 'vi', label: 'Tiếng Việt' },
              ]} />
            </Form.Item>
            <Divider style={{ margin: '16px 0' }} />
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                Save Changes
              </Button>
            </Form.Item>
          </Form>
        </div>
      </div>

      {/* Security Settings */}
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Security</span>
        </div>
        <div style={{ padding: 16 }}>
          {/* Security form content */}
        </div>
      </div>
    </div>
  );
}
```

## Checklist Design

Khi tạo UI mới cho ITDLUPanel, luôn đảm bảo:

- [ ] Dùng `usePalette()` hook cho tất cả giá trị màu sắc
- [ ] Dùng `useIsMobile()` cho responsive layouts
- [ ] Wrap content trong `div` với `background: p.card, borderRadius: 12, border: 1px solid p.cardBorder`
- [ ] Header bar với `background: p.headerBg` và `borderBottom: 1px solid p.cardBorder`
- [ ] Tab bar custom (button-based) thay vì Ant Tabs (mặc dù cả hai đều OK)
- [ ] Dùng `className="responsive-toolbar"` cho toolbar spacing
- [ ] Font Inter cho body, JetBrains Mono cho code/terminal
- [ ] Sidebar: white text on blue hover (light mode)
- [ ] Header: gradient blue `linear-gradient(135deg, #0D47A1, #1565C0, #1E88E5)`
- [ ] Dùng Ant Design icons từ `@ant-design/icons`
- [ ] Thêm loading states cho async operations
- [ ] Dùng `Popconfirm` trước các action nguy hiểm (delete)
- [ ] Error handling với `message.error()`
- [ ] API calls qua `src/services/api.ts`
- [ ] Dark mode support: luôn test cả light và dark theme
- [ ] Custom inline SVG icons cho dashboard stats (thay vì emoji)
- [ ] Pagination với `showSizeChanger` cho tables lớn

## Responsive Breakpoints

```css
/* Tablet ≤768px */
@media (max-width: 768px) {
  .ant-card-body { padding: 12px !important; }
  .ant-table { font-size: 12px; }
  .ant-modal { max-width: calc(100vw - 16px) !important; }
  .recharts-responsive-container { min-height: 160px; }
}

/* Small phone ≤480px */
@media (max-width: 480px) {
  .ant-table { font-size: 11px; }
  .ant-btn { font-size: 12px; }
  .responsive-toolbar { flex-direction: column; align-items: stretch; }
  .responsive-toolbar > * { width: 100%; }
}
```

## Quick Start Template

```tsx
// pages/NewPage/index.tsx
import { useState, useCallback } from 'react';
import { Card, Table, Button, Space, Input, Select, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import api from '@/services/api';

export default function NewPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get('/endpoint');
      setData(resp.data);
    } catch {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: string) => <StatusBadge status={v} /> },
    { title: 'Actions', key: 'actions', render: () => <ActionButtons /> },
  ];

  return (
    <div>
      {/* Container */}
      <div style={{
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${p.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: p.headerBg,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: p.text }}>Page Title</span>
          <Button type="primary" icon={<PlusOutlined />} size="small">Add New</Button>
        </div>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${p.cardBorder}` }}
          className="responsive-toolbar">
          <Input.Search placeholder="Search..." style={{ width: 250 }} />
          <Select options={[]} style={{ width: 150 }} placeholder="Filter" />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
        </div>

        {/* Content */}
        <div style={{ padding: 16 }}>
          <Table dataSource={data} columns={columns} loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: true }} />
        </div>
      </div>
    </div>
  );
}
```
