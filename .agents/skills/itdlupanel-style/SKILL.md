---
name: itdlupanel-design-system
description: ITDLU Panel Design System - Professional Admin Panel UI with Ant Design + Tailwind CSS. Use this skill when creating admin panels, dashboards, server management interfaces, or any project requiring a similar professional look to ITDLUPanel.
---

# ITDLUPanel Design System

Design system for professional admin panels inspired by ITDLUPanel - a server management dashboard with React, Ant Design, and Tailwind CSS v4.

## Design Philosophy

**Professional & Functional** - Clean, efficient interfaces for power users and system administrators. Prioritizes clarity, information density, and quick actions over decorative elements.

## Technology Stack

- **Frontend**: React 18+ with TypeScript
- **Build Tool**: Vite + Rolldown
- **UI Framework**: Ant Design 5.x
- **Styling**: Tailwind CSS v4 (CSS-first config) + inline styles for component-specific values
- **Charts**: Recharts
- **Icons**: @ant-design/icons + lucide-react
- **State**: React hooks + Context
- **i18n**: react-i18next

## Color System

### CSS Variables (index.css)

```css
:root {
  --color-primary: #1565C0;        /* Deep blue - primary actions */
  --color-primary-light: #1E88E5;
  --color-primary-dark: #0D47A1;
  --color-secondary: #2E7D32;      /* Green - success/positive */
  --color-secondary-light: #43A047;
  --color-accent: #0288D1;         /* Cyan - highlights */
  --color-sidebar: #1B2A4A;        /* Dark navy - sidebar bg */
  --color-sidebar-hover: #243656;  /* Sidebar hover state */
  --color-bg: #F5F7FA;             /* Light gray - page bg */
  --color-surface: #FFFFFF;         /* Cards/panels */
  --color-text: #1A1A2E;           /* Primary text */
  --color-text-secondary: #64748B;  /* Muted text */
  --color-success: #4CAF50;
  --color-warning: #FF9800;
  --color-error: #F44336;
}

[data-theme="dark"] {
  --color-bg: #0D1117;
  --color-surface: #161B22;
  --color-text: #E6EDF3;
  --color-text-secondary: #8B949E;
  --color-sidebar: #010409;
  --cardBorder: rgba(255,255,255,0.1);
}
```

## Typography

```css
/* Base font */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Override monospace globally */
code, pre, kbd, samp {
  font-family: 'Inter', sans-serif !important;
}

/* Google Fonts */
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

## Layout Patterns

### 1. Main Layout Structure

```tsx
// Layout with sidebar + content
<div style={{ display: 'flex', minHeight: '100vh' }}>
  {/* Sidebar */}
  <Layout.Sider 
    width={220}
    style={{ 
      background: '#1B2A4A',
      borderRight: '1px solid rgba(255,255,255,0.06)'
    }}
  >
    {/* Logo, Navigation */}
  </Layout.Sider>
  
  {/* Main content */}
  <Layout.Content style={{ 
    background: '#F5F7FA', 
    padding: 24,
    overflow: 'auto'
  }}>
    {/* Page content */}
  </Layout.Content>
</div>
```

### 2. Sidebar Navigation

```tsx
// Light mode sidebar with blue hover/active
.ant-menu-light .ant-menu-item:hover,
.ant-menu-light .ant-menu-item-active {
  background: #1565C0 !important;
  color: #fff !important;
}

.ant-menu-light .ant-menu-item-selected {
  background: #1565C0 !important;
  color: #fff !important;
}
```

### 3. Page Header Pattern

```tsx
<div style={{ marginBottom: 24 }}>
  <Title level={3} style={{ margin: 0, fontWeight: 600 }}>
    Page Title
  </Title>
  <Text type="secondary" style={{ fontSize: 14 }}>
    Page description or breadcrumb
  </Text>
</div>
```

## Component Patterns

### 1. Stat Card (Dashboard)

```tsx
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;       // Hex color
  trend?: { value: number; up: boolean };
  onClick?: () => void;
}

function StatCard({ title, value, icon, color, trend, onClick }: StatCardProps) {
  return (
    <Card 
      hoverable={!!onClick}
      onClick={onClick}
      style={{ 
        borderRadius: 12,
        border: '1px solid #E8EDF2'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Tag color={color} style={{ fontSize: 20, border: 'none' }}>
            {icon}
          </Tag>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#64748B' }}>{title}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1A1A2E' }}>
            {value}
          </div>
        </div>
      </div>
    </Card>
  );
}
```

### 2. Section Card

```tsx
function SectionCard({ title, icon, actions, children }: {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card 
      style={{ borderRadius: 12, border: '1px solid #E8EDF2' }}
      styles={{ body: { padding: 0 } }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #E8EDF2',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#FAFBFC'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        </div>
        {actions}
      </div>
      {/* Content */}
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </Card>
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
};

function StatusBadge({ status }: { status: string }) {
  const style = statusColors[status] || statusColors.stopped;
  return (
    <Tag style={{ 
      background: style.bg, 
      color: style.color,
      border: 'none',
      borderRadius: 4,
      fontWeight: 500
    }}>
      {status.toUpperCase()}
    </Tag>
  );
}
```

### 4. Action Button Group

```tsx
function ActionButtons({ onEdit, onDelete, onView }: ActionButtonsProps) {
  return (
    <Space size={4}>
      <Button size="small" icon={<EyeOutlined />} onClick={onView} />
      <Button size="small" icon={<EditOutlined />} onClick={onEdit} />
      <Popconfirm
        title="Delete this item?"
        onConfirm={onDelete}
      >
        <Button size="small" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </Space>
  );
}
```

### 5. Responsive Grid

```tsx
// Dashboard grid
<div style={{ 
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 16
}}>
  {stats.map(stat => <StatCard {...stat} />)}
</div>

// Table toolbar
<div className="responsive-toolbar" style={{
  display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center'
}}>
  <Input.Search placeholder="Search..." style={{ width: 250 }} />
  <Select options={options} style={{ width: 150 }} />
  <Button type="primary" icon={<PlusOutlined />}>Add New</Button>
</div>
```

## Data Table Patterns

```tsx
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

## Form Patterns

```tsx
<Form
  layout="vertical"
  form={form}
  style={{ maxWidth: 500 }}
>
  <Form.Item
    label="Name"
    name="name"
    rules={[{ required: true, message: 'Name is required' }]}
  >
    <Input placeholder="Enter name" />
  </Form.Item>
  
  <Form.Item label="Description" name="description">
    <Input.TextArea rows={3} placeholder="Description..." />
  </Form.Item>
  
  <Form.Item>
    <Space>
      <Button type="primary" htmlType="submit">Save</Button>
      <Button onClick={() => form.resetFields()}>Cancel</Button>
    </Space>
  </Form.Item>
</Form>
```

## Modal Patterns

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
  <Form form={form} layout="vertical">
    {/* Form content */}
  </Form>
</Modal>
```

## Dark Mode Implementation

```tsx
// usePalette hook
function usePalette() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  
  return {
    isDark,
    p: {
      bg: isDark ? '#0D1117' : '#F5F7FA',
      card: isDark ? '#161B22' : '#FFFFFF',
      cardBorder: isDark ? 'rgba(255,255,255,0.1)' : '#E8EDF2',
      text: isDark ? '#E6EDF3' : '#1A1A2E',
      textMuted: isDark ? '#8B949E' : '#64748B',
      headerBg: isDark ? '#21262D' : '#FAFBFC',
      accent: '#1565C0',
      green: '#52C41A',
      red: '#FF4D4F',
      amber: '#FAAD14',
      purple: '#722ED1',
      cyan: '#13C2C2',
    }
  };
}
```

## Responsive Breakpoints

```css
/* Mobile: ≤768px */
@media (max-width: 768px) {
  .ant-card-body { padding: 12px !important; }
  .ant-table { font-size: 12px; }
  .ant-modal { max-width: calc(100vw - 16px) !important; }
}

/* Small phone: ≤480px */
@media (max-width: 480px) {
  .ant-table { font-size: 11px; }
  .ant-btn { font-size: 12px; }
  .ant-table-thead > tr > th,
  .ant-table-tbody > tr > td { padding: 8px 4px !important; }
}
```

## Key Design Decisions

1. **Ant Design + Custom Styles**: Use Ant Design components as base, override with custom styles for brand consistency
2. **Inline Styles for Components**: Use `usePalette()` hook for theme-aware values instead of CSS classes
3. **Card-based Layout**: Information organized in cards with consistent padding (16px) and border-radius (12px)
4. **Blue Primary Actions**: #1565C0 for primary buttons and active states
5. **Sidebar**: Dark (#1B2A4A) with light text, blue hover/active states
6. **Typography Scale**: 
   - Page titles: 18-20px, fontWeight 600
   - Section headers: 14px, fontWeight 600
   - Body text: 13-14px
   - Muted text: 12px, color secondary

## File Structure

```
src/
├── index.css                 # Global styles + CSS variables + Tailwind import
├── App.tsx                   # Root component with theme provider
├── main.tsx                  # Entry point
├── pages/                    # Page components
│   ├── Dashboard/
│   ├── Docker/
│   ├── Databases/
│   └── ...
├── components/              # Shared components
│   ├── Modal/
│   └── ...
├── hooks/
│   ├── usePalette.ts         # Theme-aware color palette
│   └── useIsMobile.ts        # Responsive detection
├── services/
│   └── api.ts                # API client
├── stores/                   # State management
├── i18n/                     # Translations
└── types/
    └── index.ts              # TypeScript interfaces
```

## Quick Start Template

```tsx
// NewPage.tsx
import { Card, Table, Button, Space, Input, Select } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function NewPage() {
  const { p } = usePalette();
  const isMobile = useIsMobile();
  
  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 600 }}>Page Title</h2>
          <p style={{ margin: '4px 0 0', color: p.textMuted }}>Page description</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />}>
          Add New
        </Button>
      </div>
      
      {/* Toolbar */}
      <div className="responsive-toolbar" style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Search..." style={{ width: 250 }} />
        <Select placeholder="Filter" style={{ width: 150 }} />
        <Button icon={<ReloadOutlined />}>Refresh</Button>
      </div>
      
      {/* Table */}
      <Card style={{ borderRadius: 12, border: `1px solid ${p.cardBorder}` }}>
        <Table dataSource={data} columns={columns} />
      </Card>
    </div>
  );
}
```

## Common Patterns Checklist

- [ ] Use `usePalette()` hook for all color values
- [ ] Use `useIsMobile()` for responsive layouts
- [ ] Wrap tables in Card with `borderRadius: 12`
- [ ] Use `responsive-toolbar` class for toolbar spacing
- [ ] Add `data-theme="dark"` to body for dark mode
- [ ] Use Ant Design icons from `@ant-design/icons`
- [ ] Follow the color system (primary: #1565C0, etc.)
- [ ] Add loading states for async operations
- [ ] Use Popconfirm before destructive actions
- [ ] Implement proper error handling with message.error()
