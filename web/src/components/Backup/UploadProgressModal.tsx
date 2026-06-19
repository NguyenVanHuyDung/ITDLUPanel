import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Progress, Alert, Space, Button, Typography, Tag, message } from 'antd';
import { CloudUploadOutlined, CloseCircleOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

interface CloudStorage {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  config: string;
}

interface Props {
  open: boolean;
  backupId: number | null;
  backupName: string;
  storages: CloudStorage[];
  onClose: () => void;
  onCompleted?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(b: number): string {
  if (!b) return '0 B';
  const u = 1024;
  const e = Math.min(Math.floor(Math.log(b) / Math.log(u)), 4);
  return `${(b / Math.pow(u, e)).toFixed(1)} ${['B', 'KB', 'MB', 'GB', 'TB'][e]}`;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  uploading: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * UploadProgressModal — opens a single cloud storage upload and shows a
 * real-time progress bar. Polls every 1.5s while the upload is in
 * flight. Auto-closes on success after a 1.2s celebration pause.
 *
 * The component is intentionally self-contained: it doesn't subscribe
 * to a global store, so callers can mount it from anywhere (the
 * Websites list, the Cron page, etc.) without touching shared state.
 */
export function UploadProgressModal({ open, backupId, backupName, storages, onClose, onCompleted }: Props) {
  const [storageId, setStorageId] = useState<number | null>(null);
  const [uploading, setUploading] = useState<BackupUpload | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Active (non-terminal) cloud storages only. We hide inactive
  // connections from the picker because uploads to them would just fail.
  const activeStorages = storages.filter((s) => s.is_active && s.type !== 'ftp');

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setUploading(null);
      setStorageId(null);
    }
  }, [open]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((uploadId: number) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await api.get<ApiResponse<BackupUpload>>(`/backups/uploads/${uploadId}`);
        const u = data.data;
        setUploading(u);
        if (u.status === 'completed' || u.status === 'failed' || u.status === 'cancelled') {
          stopPolling();
          if (u.status === 'completed') {
            message.success('Upload to cloud completed');
            window.setTimeout(() => {
              onCompleted?.();
              onClose();
            }, 1200);
          } else if (u.status === 'failed') {
            message.error('Upload failed: ' + (u.error_message || 'unknown'));
          }
        }
      } catch (err) {
        // Network blip — keep polling. Only stop on terminal status.
        console.warn('upload poll failed', err);
      }
    }, 1500);
  }, [onClose, onCompleted, stopPolling]);

  const startUpload = async () => {
    if (!storageId || !backupId) return;
    setStarting(true);
    try {
      const { data } = await api.post<ApiResponse<BackupUpload>>(
        `/backups/${backupId}/upload`,
        { storage_id: storageId },
      );
      setUploading(data.data);
      startPolling(data.data.id);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to start upload');
    } finally {
      setStarting(false);
    }
  };

  const cancelUpload = async () => {
    if (!uploading) return;
    try {
      await api.delete(`/backups/uploads/${uploading.id}`);
      message.info('Upload cancelled');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Cancel failed');
    }
  };

  const inFlight = uploading && (uploading.status === 'pending' || uploading.status === 'uploading');
  const terminal = uploading && !inFlight;

  return (
    <Modal
      open={open}
      title={
        <Space>
          <CloudUploadOutlined />
          <span>Upload to cloud</span>
        </Space>
      }
      onCancel={inFlight ? undefined : onClose}
      closable={!inFlight}
      maskClosable={!inFlight}
      footer={null}
      destroyOnClose
      width={520}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">
          Backup: <Text strong>{backupName}</Text>
        </Text>

        {!uploading && (
          <>
            {activeStorages.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message="No active cloud storage"
                description="Configure a Google Drive, S3, or OneDrive connection in Storage first."
              />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Select destination:</Text>
                {activeStorages.map((s) => (
                  <Button
                    key={s.id}
                    block
                    type={storageId === s.id ? 'primary' : 'default'}
                    onClick={() => setStorageId(s.id)}
                  >
                    {s.name} <Tag style={{ marginLeft: 8 }}>{s.type}</Tag>
                  </Button>
                ))}
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  disabled={!storageId}
                  loading={starting}
                  onClick={startUpload}
                  block
                >
                  Start upload
                </Button>
              </Space>
            )}
          </>
        )}

        {uploading && (
          <>
            <div>
              <Text>Status:&nbsp;</Text>
              <Tag color={STATUS_COLOR[uploading.status]} style={{ textTransform: 'uppercase' }}>
                {uploading.status}
              </Tag>
            </div>
            <Progress
              percent={Math.round(uploading.progress_pct)}
              status={
                uploading.status === 'failed' ? 'exception' :
                uploading.status === 'completed' ? 'success' :
                'active'
              }
              strokeWidth={12}
            />
            <Space>
              <Text type="secondary">
                {formatBytes(uploading.bytes_uploaded)} / {formatBytes(uploading.bytes_total)}
              </Text>
            </Space>
            {uploading.status === 'failed' && uploading.error_message && (
              <Alert type="error" showIcon message="Upload failed" description={uploading.error_message} />
            )}
            {inFlight && (
              <Button danger icon={<CloseCircleOutlined />} onClick={cancelUpload} block>
                Cancel upload
              </Button>
            )}
            {terminal && (
              <Button
                type="primary"
                icon={uploading.status === 'completed' ? <CheckCircleOutlined /> : <SyncOutlined />}
                onClick={onClose}
                block
              >
                {uploading.status === 'completed' ? 'Done' : 'Close'}
              </Button>
            )}
          </>
        )}
      </Space>
    </Modal>
  );
}
