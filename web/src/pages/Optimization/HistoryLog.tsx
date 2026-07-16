import { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Space, Empty } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import api from '@/services/api';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

interface HistoryItem {
  id: number;
  mode: string;
  optimization_type: string;
  parameter: string;
  old_value: string;
  new_value: string;
  reason: string;
  auto_applied: boolean;
  created_at: string;
}

export default function HistoryLog() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const resp = await api.get('/optimization/history');
      setHistory(resp.data.data.history || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const columns = [
    {
      title: t('optimization.time', 'Time'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => formatDate(text),
    },
    {
      title: t('optimization.mode', 'Mode'),
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode: string) => (
        <Tag color={mode === 'adaptive' ? 'blue' : 'green'}>
          {mode}
        </Tag>
      ),
    },
    {
      title: t('optimization.type', 'Type'),
      dataIndex: 'optimization_type',
      key: 'optimization_type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'mariadb' ? 'purple' : 'cyan'}>
          {type}
        </Tag>
      ),
    },
    {
      title: t('optimization.parameter', 'Parameter'),
      dataIndex: 'parameter',
      key: 'parameter',
      width: 180,
      render: (text: string) => <Text code>{text}</Text>,
    },
    {
      title: t('optimization.change', 'Change'),
      key: 'change',
      render: (_: any, record: HistoryItem) => (
        <Space>
          <Text delete type="secondary">{record.old_value || '-'}</Text>
          <span style={{ color: '#52c41a' }}>→</span>
          <Text strong type="success">{record.new_value || '-'}</Text>
        </Space>
      ),
    },
    {
      title: t('optimization.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: t('optimization.applied', 'Applied'),
      dataIndex: 'auto_applied',
      key: 'auto_applied',
      width: 100,
      render: (autoApplied: boolean) => (
        <Tag color={autoApplied ? 'processing' : 'default'}>
          {autoApplied ? 'Auto' : 'Manual'}
        </Tag>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <HistoryOutlined />
          {t('optimization.optimizationHistory', 'Optimization History')}
        </Space>
      }
    >
      {history.length === 0 ? (
        <Empty
          description={t('optimization.noHistory', 'No optimization history yet')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Table
          dataSource={history}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} items`,
          }}
        />
      )}
    </Card>
  );
}
