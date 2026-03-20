import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Breadcrumb, Space, Input, Modal, Upload, message,
  Dropdown, Typography, Tooltip, Card,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  FolderOutlined, FileOutlined, DownloadOutlined, DeleteOutlined,
  EditOutlined, UploadOutlined, FolderAddOutlined, FileAddOutlined,
  ReloadOutlined, HomeOutlined, ScissorOutlined, CopyOutlined,
  MoreOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

const { Text } = Typography;
const { TextArea } = Input;

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  permissions: string;
  owner: string;
  group: string;
  mod_time: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString();
}

export default function Files() {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState('/root');
  const [pathInput, setPathInput] = useState('/root');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFilePath, setEditFilePath] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameFile, setRenameFile] = useState<FileItem | null>(null);
  const [newName, setNewName] = useState('');

  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ path: string; items: FileItem[] }>>('/files', { params: { path } });
      setFiles(data.data?.items ?? []);
      setCurrentPath(path);
      setPathInput(path);
      setSelectedRowKeys([]);
    } catch {
      message.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles(currentPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = (path: string) => {
    fetchFiles(path);
  };

  const handlePathSubmit = () => {
    if (pathInput.trim()) {
      navigateTo(pathInput.trim());
    }
  };

  // Breadcrumb
  const pathSegments = currentPath.split('/').filter(Boolean);
  const breadcrumbItems = [
    {
      title: (
        <span onClick={() => navigateTo('/')} style={{ cursor: 'pointer' }}>
          <HomeOutlined />
        </span>
      ),
    },
    ...pathSegments.map((seg, i) => {
      const fullPath = '/' + pathSegments.slice(0, i + 1).join('/');
      return {
        title: (
          <span onClick={() => navigateTo(fullPath)} style={{ cursor: 'pointer' }}>
            {seg}
          </span>
        ),
      };
    }),
  ];

  // Download
  const handleDownload = (file: FileItem) => {
    const link = document.createElement('a');
    link.href = `/api/v1/files/download?path=${encodeURIComponent(file.path)}`;
    link.download = file.name;
    link.click();
  };

  // Delete
  const handleDelete = (paths: string[]) => {
    Modal.confirm({
      title: t('common.confirm_delete'),
      icon: <ExclamationCircleOutlined />,
      content: `${paths.length} item(s) will be deleted permanently.`,
      okType: 'danger',
      onOk: async () => {
        try {
          await api.delete('/files', { data: { paths } });
          message.success(t('common.success'));
          fetchFiles(currentPath);
        } catch {
          message.error(t('common.error'));
        }
      },
    });
  };

  // Edit file
  const handleEdit = async (file: FileItem) => {
    setEditFilePath(file.path);
    setEditModalOpen(true);
    setEditLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ path: string; content: string }>>('/files/content', {
        params: { path: file.path },
      });
      setEditContent(data.data?.content ?? '');
    } catch {
      message.error('Failed to read file');
      setEditModalOpen(false);
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaveLoading(true);
    try {
      await api.put('/files/content', { path: editFilePath, content: editContent });
      message.success(t('common.success'));
      setEditModalOpen(false);
    } catch {
      message.error(t('common.error'));
    } finally {
      setSaveLoading(false);
    }
  };

  // Rename
  const handleRename = async () => {
    if (!renameFile || !newName.trim()) return;
    try {
      const dir = renameFile.path.substring(0, renameFile.path.lastIndexOf('/'));
      await api.put('/files/rename', { old_path: renameFile.path, new_path: `${dir}/${newName.trim()}` });
      message.success(t('common.success'));
      setRenameModalOpen(false);
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  // New Folder
  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.post('/files/mkdir', { path: `${currentPath}/${newFolderName.trim()}` });
      message.success(t('common.success'));
      setNewFolderModalOpen(false);
      setNewFolderName('');
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  // New File
  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    try {
      await api.put('/files/content', { path: `${currentPath}/${newFileName.trim()}`, content: '' });
      message.success(t('common.success'));
      setNewFileModalOpen(false);
      setNewFileName('');
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  // Row actions menu
  const getRowActions = (record: FileItem): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (!record.is_dir) {
      items.push(
        { key: 'download', icon: <DownloadOutlined />, label: t('common.download'), onClick: () => handleDownload(record) },
        { key: 'edit', icon: <EditOutlined />, label: t('common.edit'), onClick: () => handleEdit(record) },
      );
    }
    items.push(
      { key: 'rename', icon: <ScissorOutlined />, label: 'Rename', onClick: () => { setRenameFile(record); setNewName(record.name); setRenameModalOpen(true); } },
      { key: 'copy-path', icon: <CopyOutlined />, label: t('common.copy') + ' Path', onClick: () => { navigator.clipboard.writeText(record.path); message.success(t('common.copied')); } },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: t('common.delete'), danger: true, onClick: () => handleDelete([record.path]) },
    );
    return items;
  };

  const columns: ColumnsType<FileItem> = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record) => (
        <Space>
          {record.is_dir
            ? <FolderOutlined style={{ color: '#faad14', fontSize: 18 }} />
            : <FileOutlined style={{ color: '#1565C0', fontSize: 16 }} />
          }
          <span
            style={{ cursor: record.is_dir ? 'pointer' : 'default', fontWeight: record.is_dir ? 500 : 400 }}
            onDoubleClick={() => record.is_dir && navigateTo(record.path)}
          >
            {name}
          </span>
        </Space>
      ),
    },
    {
      title: t('common.size'),
      dataIndex: 'size',
      width: 120,
      sorter: (a, b) => a.size - b.size,
      render: (size: number, record) => record.is_dir ? '—' : formatSize(size),
    },
    { title: 'Permissions', dataIndex: 'permissions', width: 120 },
    { title: 'Owner', dataIndex: 'owner', width: 120, render: (owner: string, record) => `${owner}:${record.group}` },
    {
      title: 'Modified',
      dataIndex: 'mod_time',
      width: 180,
      sorter: (a, b) => new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime(),
      render: (v: string) => formatDate(v),
    },
    {
      title: t('common.actions'),
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} size="small" />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      {/* Toolbar */}
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '8px 16px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onPressEnter={handlePathSubmit}
            style={{ flex: 1, minWidth: 200, fontFamily: 'monospace' }}
            size="small"
            prefix={<FolderOutlined />}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchFiles(currentPath)}>
            {t('common.refresh')}
          </Button>
          <Upload
            action={`/api/v1/files/upload`}
            data={{ path: currentPath }}
            multiple
            showUploadList={false}
            headers={{ Authorization: `Bearer ${api.defaults.headers?.common?.Authorization || ''}` }}
            beforeUpload={() => {
              // Auth header will be added by the interceptor for api calls,
              // but Upload uses its own XMLHttpRequest, so we set it manually
              return true;
            }}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const formData = new FormData();
                formData.append('file', file as File);
                formData.append('path', currentPath);
                await api.post('/files/upload', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                onSuccess?.(null);
                message.success(`Uploaded ${(file as File).name}`);
                fetchFiles(currentPath);
              } catch (err) {
                onError?.(err as Error);
                message.error(`Upload failed`);
              }
            }}
          >
            <Button size="small" icon={<UploadOutlined />}>{t('common.upload')}</Button>
          </Upload>
          <Button size="small" icon={<FolderAddOutlined />} onClick={() => { setNewFolderName(''); setNewFolderModalOpen(true); }}>
            New Folder
          </Button>
          <Button size="small" icon={<FileAddOutlined />} onClick={() => { setNewFileName(''); setNewFileModalOpen(true); }}>
            New File
          </Button>
          {selectedRowKeys.length > 0 && (
            <Tooltip title={`Delete ${selectedRowKeys.length} items`}>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(selectedRowKeys as string[])}
              >
                Delete ({selectedRowKeys.length})
              </Button>
            </Tooltip>
          )}
        </div>
      </Card>

      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 12 }} />

      {/* File table */}
      <Table<FileItem>
        columns={columns}
        dataSource={files}
        rowKey="path"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ y: 'calc(100vh - 340px)' }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        onRow={(record) => ({
          onDoubleClick: () => {
            if (record.is_dir) navigateTo(record.path);
          },
        })}
      />

      {/* Edit File Modal */}
      <Modal
        title={<><EditOutlined /> {editFilePath.split('/').pop()}</>}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setEditModalOpen(false)}>{t('common.cancel')}</Button>,
          <Button key="save" type="primary" loading={saveLoading} onClick={handleSaveEdit}>{t('common.save')}</Button>,
        ]}
      >
        {editLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Text type="secondary">{t('common.loading')}</Text></div>
        ) : (
          <TextArea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
            style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: 13 }}
          />
        )}
      </Modal>

      {/* Rename Modal */}
      <Modal
        title="Rename"
        open={renameModalOpen}
        onCancel={() => setRenameModalOpen(false)}
        onOk={handleRename}
        okText={t('common.save')}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
        />
      </Modal>

      {/* New Folder Modal */}
      <Modal
        title="New Folder"
        open={newFolderModalOpen}
        onCancel={() => setNewFolderModalOpen(false)}
        onOk={handleNewFolder}
        okText={t('common.create')}
      >
        <Input
          placeholder="Folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleNewFolder}
          autoFocus
        />
      </Modal>

      {/* New File Modal */}
      <Modal
        title="New File"
        open={newFileModalOpen}
        onCancel={() => setNewFileModalOpen(false)}
        onOk={handleNewFile}
        okText={t('common.create')}
      >
        <Input
          placeholder="File name"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onPressEnter={handleNewFile}
          autoFocus
        />
      </Modal>
    </div>
  );
}
