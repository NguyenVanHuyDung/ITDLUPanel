import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Tabs, Table, Tag, Progress, Button, Empty, Space, Tooltip, Typography } from 'antd';
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  EyeOutlined,
  DeleteOutlined,
  SyncOutlined,
  MinusCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/datetime';
import { useTaskStore, type TaskDetail } from '@/stores/task';
import { useThemeStore } from '@/stores/theme';
import { getSoftwareIcon } from '@/pages/AppStore/SoftwareIcons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

const statusIcon = (status: string) => {
  switch (status) {
    case 'running': return <SyncOutlined spin style={{ color: '#1565C0' }} />;
    case 'pending': return <ClockCircleOutlined style={{ color: '#faad14' }} />;
    case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    case 'failed': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    case 'cancelled': return <StopOutlined style={{ color: '#8c8c8c' }} />;
    default: return <ClockCircleOutlined />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'running': return 'processing';
    case 'pending': return 'warning';
    case 'completed': return 'success';
    case 'failed': return 'error';
    case 'cancelled': return 'default';
    default: return 'default';
  }
};

const formatTaskName = (name: string, type: string) => {
  if (type === 'extension_install' || type === 'extension_uninstall') {
    const [sw, exts] = name.split(':');
    const action = type === 'extension_install' ? 'Install' : 'Uninstall';
    return `${action} [${exts}] (${sw})`;
  }
  if (type === 'software_install') {
    const [sw, ver] = name.split(':');
    return `Install ${sw}${ver ? ` ${ver}` : ''}`;
  }
  if (type === 'software_uninstall') {
    return `Uninstall ${name}`;
  }
  // stack_install: name is JSON array like ["nginx","mysql","php"]
  if (type === 'stack_install') {
    try {
      const components: string[] = JSON.parse(name);
      if (Array.isArray(components)) {
        return `Stack Install (${components.map(c => c.split(':')[0]).join(' → ')})`;
      }
    } catch { /* fallback */ }
  }
  return name;
};

/* ────────────────────────────────────────────────────────────
 * Stack Install – per-component progress + inline log
 * ──────────────────────────────────────────────────────────── */

interface StackComponent {
  name: string;
  status: 'waiting' | 'installing' | 'installed' | 'skipped' | 'failed';
  progress: number;
  message: string;
}

function parseStackProgress(taskName: string, log: string): StackComponent[] {
  let components: string[];
  try {
    components = JSON.parse(taskName);
    if (!Array.isArray(components)) return [];
  } catch {
    return [];
  }

  const statuses: StackComponent[] = components.map(c => ({
    name: c.split(':')[0],
    status: 'waiting' as const,
    progress: 0,
    message: '',
  }));

  if (!log) return statuses;

  for (const line of log.split('\n').filter(Boolean)) {
    const m = line.match(/\[(\d+)\/\d+\]\s+(.*)/);
    if (!m) continue;
    const idx = parseInt(m[1]) - 1;
    const msg = m[2];
    if (idx < 0 || idx >= statuses.length) continue;

    if (/already installed|skipping/i.test(msg)) {
      statuses[idx] = { ...statuses[idx], status: 'skipped', progress: 100, message: msg };
    } else if (msg.includes('installed successfully')) {
      statuses[idx] = { ...statuses[idx], status: 'installed', progress: 100, message: msg };
    } else if (/[Ff]ailed/.test(msg)) {
      statuses[idx] = { ...statuses[idx], status: 'failed', message: msg };
    } else if (msg.includes('Installing')) {
      const pct = msg.match(/(\d+)%/);
      statuses[idx] = { ...statuses[idx], status: 'installing', progress: pct ? parseInt(pct[1]) : 0, message: msg };
    } else if (msg.includes('Starting')) {
      statuses[idx] = { ...statuses[idx], status: 'installing', progress: 0, message: msg };
    }
  }

  return statuses;
}

function StackInstallCard({ task }: { task: TaskDetail }) {
  const isDark = useThemeStore((s) => s.mode === 'dark');
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const fetchTaskLog = useTaskStore((s) => s.fetchTaskLog);
  const logRef = useRef<HTMLPreElement>(null);
  const [log, setLog] = useState(task.log || '');

  // Poll log for running tasks (WS may not always include full log)
  useEffect(() => {
    if (task.log) { setLog(task.log); return; }
    if (task.status !== 'running' && task.status !== 'pending') return;
    let alive = true;
    const poll = async () => {
      const content = await fetchTaskLog(task.id);
      if (alive) setLog(content);
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, [task.id, task.status, task.progress, task.log, fetchTaskLog]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const components = parseStackProgress(task.name, log);
  if (components.length === 0) return null;

  const doneCount = components.filter(c => c.status === 'installed' || c.status === 'skipped').length;

  const compInfo = (s: StackComponent['status']) => {
    switch (s) {
      case 'installed': return { icon: <CheckCircleOutlined />, color: '#52c41a', label: 'Installed' };
      case 'installing': return { icon: <LoadingOutlined />, color: '#1565C0', label: 'Installing' };
      case 'skipped':   return { icon: <MinusCircleOutlined />, color: '#8c8c8c', label: 'Skipped' };
      case 'failed':    return { icon: <CloseCircleOutlined />, color: '#ff4d4f', label: 'Failed' };
      default:          return { icon: <ClockCircleOutlined />, color: isDark ? '#555' : '#bbb', label: 'Waiting' };
    }
  };

  return (
    <div style={{ padding: '14px 16px', borderBottom: isDark ? '1px solid #30363d' : '1px solid #f0f0f0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Space size={8}>
          <ThunderboltOutlined style={{ color: '#1565C0', fontSize: 16 }} />
          <Text strong style={{ fontSize: 14 }}>Stack Installation</Text>
          <Tag color="processing" style={{ fontSize: 11 }}>{doneCount}/{components.length}</Tag>
          {task.duration && <Text type="secondary" style={{ fontSize: 11 }}>{task.duration}</Text>}
        </Space>
        <Tooltip title="Cancel">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => cancelTask(task.id)} />
        </Tooltip>
      </div>

      {/* Per-component rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {components.map((comp, i) => {
          const info = compInfo(comp.status);
          const isActive = comp.status === 'installing';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '5px 8px',
                borderRadius: 6,
                background: isActive
                  ? (isDark ? 'rgba(21,101,192,0.1)' : 'rgba(21,101,192,0.04)')
                  : 'transparent',
                border: isActive
                  ? `1px solid ${isDark ? 'rgba(21,101,192,0.3)' : 'rgba(21,101,192,0.15)'}`
                  : '1px solid transparent',
                transition: 'all 0.3s',
              }}
            >
              {/* Software icon (scaled to 20px) */}
              <div style={{ width: 20, height: 20, flexShrink: 0, overflow: 'hidden' }}>
                <div style={{ transform: 'scale(0.625)', transformOrigin: 'top left' }}>
                  {getSoftwareIcon(comp.name)}
                </div>
              </div>

              {/* Name */}
              <Text style={{
                fontSize: 13,
                fontWeight: 600,
                width: 100,
                flexShrink: 0,
                opacity: comp.status === 'waiting' ? 0.4 : 1,
              }}>
                {comp.name}
              </Text>

              {/* Progress bar or status label */}
              {isActive ? (
                <div style={{ flex: 1 }}>
                  <Progress
                    percent={comp.progress}
                    size="small"
                    status="active"
                    strokeColor="#1565C0"
                  />
                </div>
              ) : (
                <Space size={4} style={{ flex: 1 }}>
                  <span style={{ color: info.color, fontSize: 13 }}>{info.icon}</span>
                  <Text style={{ fontSize: 12, color: info.color }}>{info.label}</Text>
                </Space>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress */}
      <Progress
        percent={task.progress}
        size="small"
        status={task.status === 'running' ? 'active' : 'normal'}
        strokeColor="#1565C0"
        style={{ marginBottom: 8 }}
      />

      {/* Real-time execution log */}
      <pre
        ref={logRef}
        style={{
          margin: 0,
          padding: 10,
          background: isDark ? '#0d1117' : '#1a1a2e',
          color: '#c9d1d9',
          fontSize: 11,
          lineHeight: 1.5,
          maxHeight: 120,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
        }}
      >
        {log || 'Waiting to start…'}
      </pre>
    </div>
  );
}

function TaskListTab() {
  const { t } = useTranslation();
  const tasks = useTaskStore((s) => s.tasks);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const isDark = useThemeStore((s) => s.mode === 'dark');

  const activeTasks = Object.values(tasks)
    .filter((t) => t.status === 'running' || t.status === 'pending')
    .sort((a, b) => b.id - a.id);

  if (activeTasks.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('task.no_tasks')}
        style={{ padding: '40px 0' }}
      />
    );
  }

  return (
    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
      {activeTasks.map((task) =>
        task.type === 'stack_install' ? (
          <StackInstallCard key={task.id} task={task} />
        ) : (
        <div
          key={task.id}
          style={{
            padding: '12px 16px',
            borderBottom: isDark ? '1px solid #30363d' : '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              {statusIcon(task.status)}
              <Text strong style={{ fontSize: 13 }}>
                {formatTaskName(task.name, task.type)}
              </Text>
              <Tag color={statusColor(task.status)} style={{ fontSize: 11 }}>
                {t(`common.${task.status}`)}
              </Tag>
            </Space>
            <Tooltip title={t('common.cancel')}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => cancelTask(task.id)}
              />
            </Tooltip>
          </div>
          <Progress
            percent={task.progress}
            size="small"
            status={task.status === 'running' ? 'active' : 'normal'}
            strokeColor={task.status === 'running' ? '#1565C0' : undefined}
          />
          {task.duration && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('task.elapsed')}: {task.duration}
            </Text>
          )}
        </div>
        )
      )}
    </div>
  );
}

function MessageListTab() {
  const { t } = useTranslation();
  const { setActiveTab, setSelectedTaskId, fetchAllTasks } = useTaskStore();
  const [messages, setMessages] = useState<TaskDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const loadMessages = useCallback(async (p: number) => {
    setLoading(true);
    const result = await fetchAllTasks(p, 15);
    setMessages(result.tasks.filter((t: TaskDetail) =>
      t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
    ));
    setTotal(result.total);
    setLoading(false);
  }, [fetchAllTasks]);

  useEffect(() => { loadMessages(page); }, [page, loadMessages]);

  const handleViewLog = (taskId: number) => {
    setSelectedTaskId(taskId);
    setActiveTab('log');
  };

  const columns: ColumnsType<TaskDetail> = [
    {
      title: '',
      dataIndex: 'status',
      width: 36,
      render: (status: string) => statusIcon(status),
    },
    {
      title: t('common.name'),
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, record) => formatTaskName(name, record.type),
    },
    {
      title: t('task.creation_time'),
      dataIndex: 'created_at',
      width: 160,
      render: (v: string) => v ? formatDateTime(v) : '-',
    },
    {
      title: t('task.time_consumption'),
      dataIndex: 'duration',
      width: 110,
      render: (v: string) => v || '-',
    },
    {
      title: t('common.actions'),
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewLog(record.id)}
        >
          {t('task.detail')}
        </Button>
      ),
    },
  ];

  return (
    <Table<TaskDetail>
      columns={columns}
      dataSource={messages}
      rowKey="id"
      loading={loading}
      size="small"
      pagination={{
        current: page,
        total,
        pageSize: 15,
        onChange: setPage,
        showSizeChanger: false,
        size: 'small',
      }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('task.no_messages')} /> }}
    />
  );
}

function ExecutionLogTab() {
  const { t } = useTranslation();
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTaskLog = useTaskStore((s) => s.fetchTaskLog);
  const isDark = useThemeStore((s) => s.mode === 'dark');

  const [log, setLog] = useState('');
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLog = useCallback(async () => {
    if (!selectedTaskId) return;
    setLoading(true);
    const content = await fetchTaskLog(selectedTaskId);
    setLog(content);
    setLoading(false);
  }, [selectedTaskId, fetchTaskLog]);

  useEffect(() => {
    if (!selectedTaskId) { setLog(''); return; }
    loadLog();

    const task = tasks[selectedTaskId];
    if (task && (task.status === 'running' || task.status === 'pending')) {
      pollRef.current = setInterval(loadLog, 2000);
    }

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [selectedTaskId, loadLog, tasks]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  if (!selectedTaskId) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('task.select_task_log')}
        style={{ padding: '40px 0' }}
      />
    );
  }

  const selectedTask = tasks[selectedTaskId];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 400 }}>
      {selectedTask && (
        <div style={{
          padding: '8px 12px',
          borderBottom: isDark ? '1px solid #30363d' : '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {statusIcon(selectedTask.status)}
          <Text strong style={{ fontSize: 13 }}>
            {formatTaskName(selectedTask.name, selectedTask.type)}
          </Text>
          <Tag color={statusColor(selectedTask.status)} style={{ fontSize: 11 }}>
            {t(`common.${selectedTask.status}`)}
          </Tag>
          {selectedTask.duration && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
              {selectedTask.duration}
            </Text>
          )}
        </div>
      )}
      <pre
        ref={logRef}
        style={{
          flex: 1,
          margin: 0,
          padding: 12,
          background: isDark ? '#0d1117' : '#1a1a2e',
          color: '#e0e0e0',
          fontSize: 12,
          lineHeight: 1.6,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          borderRadius: '0 0 6px 6px',
        }}
      >
        {loading && !log ? `${t('common.loading')}\n` : ''}
        {log || t('task.waiting_start')}
      </pre>
    </div>
  );
}

export default function MessagesBox() {
  const { t } = useTranslation();
  const isDark = useThemeStore((s) => s.mode === 'dark');
  const { modalOpen, setModalOpen, activeTab, setActiveTab, summary } = useTaskStore();

  const tabItems = [
    {
      key: 'tasks',
      label: `${t('task.task_list')} (${summary.running + summary.pending})`,
      children: <TaskListTab />,
    },
    {
      key: 'messages',
      label: `${t('task.message_list')} (${summary.completed + summary.failed})`,
      children: <MessageListTab />,
    },
    {
      key: 'log',
      label: t('task.execution_log'),
      children: <ExecutionLogTab />,
    },
  ];

  return (
    <Modal
      open={modalOpen}
      onCancel={() => setModalOpen(false)}
      footer={null}
      title={t('task.messages_box')}
      width={720}
      destroyOnClose={false}
      styles={{
        body: { padding: '0 4px 4px', minHeight: 460 },
        header: {
          background: isDark ? '#141821' : undefined,
          borderBottom: isDark ? '1px solid #30363d' : undefined,
        },
        wrapper: {
          background: isDark ? '#141821' : undefined,
        },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'tasks' | 'messages' | 'log')}
        items={tabItems}
        size="small"
        style={{ minHeight: 440 }}
      />
    </Modal>
  );
}
