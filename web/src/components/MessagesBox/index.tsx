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
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTaskStore, type TaskDetail } from '@/stores/task';
import { useThemeStore } from '@/stores/theme';
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
  return name;
};

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
    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      {activeTasks.map((task) => (
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
      ))}
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
      render: (v: string) => v ? new Date(v).toLocaleString() : '-',
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
