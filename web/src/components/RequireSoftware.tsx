import { useState, useEffect, useCallback } from 'react';
import { Result, Button, Space, Tag, Spin, message, Modal, Select, Typography } from 'antd';
import { DownloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '@/stores/task';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

interface AvailableSW {
  name: string;
  display_name: string;
  type: string;
  installed: boolean;
  versions: string[];
}

interface InstalledSW {
  name: string;
  display_name: string;
  version: string;
  type: string;
  status: number;
}

interface Props {
  /** Software types to check, e.g. ['webserver'] or ['database'] */
  softwareTypes: string[];
  /** Human-readable label shown in the prompt, e.g. "Web Server (Nginx/Apache)" */
  label: string;
  /** The actual page content rendered when at least one matching software is installed */
  children: React.ReactNode;
}

export default function RequireSoftware({ softwareTypes, label, children }: Props) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [hasRequired, setHasRequired] = useState(false);
  const [availableOptions, setAvailableOptions] = useState<AvailableSW[]>([]);

  // Install modal state
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installTarget, setInstallTarget] = useState<AvailableSW | null>(null);
  const [installVersion, setInstallVersion] = useState('');
  const [installing, setInstalling] = useState(false);

  // Global task store
  const { addTask, setModalOpen: openTaskModal, setActiveTab: setTaskTab, tasks } = useTaskStore();

  const checkSoftware = useCallback(async () => {
    setChecking(true);
    try {
      const { data } = await api.get<ApiResponse<{ installed: InstalledSW[] | null; available: AvailableSW[] }>>('/software');
      const installed = data.data?.installed ?? [];
      const available = data.data?.available ?? [];

      const hasInstalled = installed.some(sw => softwareTypes.includes(sw.type));
      setHasRequired(hasInstalled);

      if (!hasInstalled) {
        setAvailableOptions(available.filter(sw => softwareTypes.includes(sw.type)));
      }
    } catch {
      setHasRequired(false);
    } finally {
      setChecking(false);
    }
  }, [softwareTypes]);

  useEffect(() => { checkSoftware(); }, [checkSoftware]);

  // Re-check software when a task completes
  useEffect(() => {
    const completedTasks = Object.values(tasks).filter(
      (t) => t.type === 'software_install' && t.status === 'completed'
    );
    if (completedTasks.length > 0 && !hasRequired) {
      checkSoftware();
    }
  }, [tasks, hasRequired, checkSoftware]);

  const handleInstall = async () => {
    if (!installTarget) return;
    setInstalling(true);
    try {
      const { data } = await api.post<ApiResponse<{ task_id: number }>>('/software/install', {
        name: installTarget.name,
        version: installVersion,
      });
      const taskId = data.data?.task_id;
      if (taskId) {
        addTask({
          id: taskId,
          name: `${installTarget.name}:${installVersion}`,
          type: 'software_install',
          status: 'running',
          progress: 0,
          created_at: new Date().toISOString(),
        });
        openTaskModal(true);
        setTaskTab('tasks');
        message.info(`Installation of ${installTarget.display_name} started`);
        setInstallModalOpen(false);
      } else {
        message.success(`${installTarget.display_name} installed`);
        setInstallModalOpen(false);
        checkSoftware();
      }
    } catch {
      message.error(t('common.error'));
    } finally {
      setInstalling(false);
    }
  };

  if (checking) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" tip="Checking software requirements..." />
      </div>
    );
  }

  if (!hasRequired) {
    return (
      <>
        <Result
          icon={<WarningOutlined style={{ color: '#faad14' }} />}
          title={`${label} Not Installed`}
          subTitle={`You need to install ${label.toLowerCase()} before using this feature. Choose one of the available options below to get started.`}
          extra={
            <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 500 }}>
              {availableOptions.length > 0 ? (
                availableOptions.map(sw => (
                  <Button
                    key={sw.name}
                    type="primary"
                    size="large"
                    icon={<DownloadOutlined />}
                    block
                    onClick={() => {
                      setInstallTarget(sw);
                      setInstallVersion(sw.versions[sw.versions.length - 1] ?? '');
                      setInstallModalOpen(true);
                    }}
                  >
                    Install {sw.display_name}
                    <Tag style={{ marginLeft: 8 }}>{sw.versions.join(', ')}</Tag>
                  </Button>
                ))
              ) : (
                <Typography.Text type="secondary">
                  No installable options found. Please install manually or check the App Store.
                </Typography.Text>
              )}
            </Space>
          }
        />

        <Modal
          title={<><DownloadOutlined /> Install {installTarget?.display_name}</>}
          open={installModalOpen}
          onCancel={() => { if (!installing) setInstallModalOpen(false); }}
          footer={[
            <Button key="cancel" onClick={() => setInstallModalOpen(false)}>{t('common.cancel')}</Button>,
            <Button key="install" type="primary" loading={installing} onClick={handleInstall}>
              {t('common.install')}
            </Button>,
          ]}
          closable={!installing}
          maskClosable={!installing}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Typography.Paragraph>
              Install {installTarget?.display_name} on your server.
            </Typography.Paragraph>
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>Select Version</Typography.Text>
              <Select
                value={installVersion}
                onChange={setInstallVersion}
                style={{ width: '100%' }}
                options={installTarget?.versions.map(v => ({ value: v, label: v })) ?? []}
              />
            </div>
          </Space>
        </Modal>
      </>
    );
  }

  return <>{children}</>;
}
