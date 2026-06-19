import { useState, useEffect, type ReactNode } from 'react';
import { List, Tag, Space, Progress, Typography, Empty, Tooltip, Button } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  SyncOutlined, DeleteOutlined, CloudServerOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import { formatDateTime } from '@/lib/datetime';

const { Text } = Typography;

interface BackupUpload {
  id: number;
  backup_id: number;
  storage_id: number;
  storage_type: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  bytes_uploaded: number;
  bytes_total: number;
  progress_pct: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

const STATUS_ICON: Record<string, ReactNode> = {
  pending: <ClockCircleOutlined style={{ color: '#999' }} />,
  uploading: <SyncOutlined spin style={{ color: '#1677ff' }} />,
  completed: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  failed: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
  cancelled: <CloseCircleOutlined style={{ color: '#faad14' }} />,
};

function formatBytes(b: number): string {
  if (!b) return '0 B';
  const u = 1024;
  const e = Math.min(Math.floor(Math.log(b) / Math.log(u)), 4);
  return `${(b / Math.pow(u, e)).toFixed(1)} ${['B', 'KB', 'MB', 'GB', 'TB'][e]}`;
}

interface Props {
  backupId: number;
  refreshKey?: number; // bump to force reload from parent
  onCancel?: (uploadId: number) => Promise<void>;
}

/**
 * BackupUploadsList — shows the audit trail of every cloud upload
 * attempt for a given backup. Used in backup detail panels / modals.
 *
 * Polling: while any row is in `pending` or `uploading`, the list
 * refreshes every 2s. Otherwise it stays still.
 */
export function BackupUploadsList({ backupId, refreshKey = 0, onCancel }: Props) {
  const [uploads, setUploads] = useState<BackupUpload[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<ApiResponse<BackupUpload[]>>(`/backups/${backupId}/uploads`);
      setUploads(data.data || []);
    } catch (err) {
      console.warn('failed to load uploads', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backupId, refreshKey]);

  useEffect(() => {
    const hasInflight = uploads.some(
      (u) => u.status === 'pending' || u.status === 'uploading',
    );
    if (!hasInflight) return;
    const t = window.setInterval(load, 2000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads]);

  if (!loading && uploads.length === 0) {
    return <Empty description="No cloud uploads yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <List
      loading={loading}
      dataSource={uploads}
      renderItem={(u) => {
        const inFlight = u.status === 'pending' || u.status === 'uploading';
        return (
          <List.Item
            actions={
              inFlight && onCancel
                ? [<Button key="cancel" type="link" danger icon={<DeleteOutlined />} onClick={() => onCancel(u.id)}>Cancel</Button>]
                : []
            }
          >
            <List.Item.Meta
              avatar={STATUS_ICON[u.status]}
              title={
                <Space>
                  <CloudServerOutlined />
                  <Text strong style={{ textTransform: 'uppercase' }}>{u.storage_type}</Text>
                  <Tag color={u.status === 'completed' ? 'success' : u.status === 'failed' ? 'error' : 'processing'}>
                    {u.status}
                  </Tag>
                </Space>
              }
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Progress
                    percent={Math.round(u.progress_pct)}
                    size="small"
                    status={u.status === 'failed' ? 'exception' : u.status === 'completed' ? 'success' : 'active'}
                    showInfo
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatBytes(u.bytes_uploaded)} / {formatBytes(u.bytes_total)}
                    {u.started_at && <> · started {formatDateTime(u.started_at)}</>}
                    {u.completed_at && <> · finished {formatDateTime(u.completed_at)}</>}
                  </Text>
                  {u.error_message && (
                    <Tooltip title={u.error_message}>
                      <Text type="danger" style={{ fontSize: 12 }} ellipsis>
                        {u.error_message}
                      </Text>
                    </Tooltip>
                  )}
                </Space>
              }
            />
          </List.Item>
        );
      }}
    />
  );
}
