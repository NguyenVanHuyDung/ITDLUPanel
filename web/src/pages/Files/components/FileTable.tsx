import { useMemo } from 'react';
import { Table, Space, Button, Tooltip, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  EditOutlined, DownloadOutlined, ScissorOutlined,
  CopyOutlined, DeleteOutlined, MoreOutlined,
  SwapOutlined, CompressOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import type { FileItem } from '../types';
import { getFileIcon } from './FileIcon';
import { formatSize, formatDate, getExtension } from '../utils/fileHelpers';
import { ARCHIVE_EXTENSIONS } from '../utils/constants';

interface FileTableProps {
  files: FileItem[];
  loading: boolean;
  selectedKeys: React.Key[];
  onSelectChange: (keys: React.Key[]) => void;
  onNavigate: (path: string) => void;
  onEdit: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onAction: (action: string, file: FileItem) => void;
}

export default function FileTable({
  files, loading, selectedKeys, onSelectChange,
  onNavigate, onEdit, onContextMenu, onAction,
}: FileTableProps) {
  const getRowActions = (record: FileItem): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (!record.is_dir) {
      items.push(
        { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => onAction('edit', record) },
        { key: 'download', icon: <DownloadOutlined />, label: 'Download', onClick: () => onAction('download', record) },
      );
    }
    items.push(
      { key: 'rename', icon: <ScissorOutlined />, label: 'Rename', onClick: () => onAction('rename', record) },
      { key: 'copy', icon: <CopyOutlined />, label: 'Copy', onClick: () => onAction('copy', record) },
      { key: 'move', icon: <SwapOutlined />, label: 'Move', onClick: () => onAction('move', record) },
      { key: 'compress', icon: <CompressOutlined />, label: 'Compress', onClick: () => onAction('compress', record) },
    );
    const ext = getExtension(record.name);
    if (ARCHIVE_EXTENSIONS.includes(ext)) {
      items.push({ key: 'decompress', icon: <CompressOutlined />, label: 'Decompress', onClick: () => onAction('decompress', record) });
    }
    items.push(
      { key: 'permissions', icon: <InfoCircleOutlined />, label: 'Permissions', onClick: () => onAction('permissions', record) },
      { key: 'copy-path', icon: <CopyOutlined />, label: 'Copy Path', onClick: () => onAction('copy-path', record) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => onAction('delete', record) },
    );
    return items;
  };

  const columns: ColumnsType<FileItem> = useMemo(() => [
    {
      title: 'Name',
      dataIndex: 'name',
      sorter: (a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      },
      render: (name: string, record) => (
        <Space
          className="cursor-pointer"
          onClick={() => { if (record.is_dir) onNavigate(record.path); }}
          onDoubleClick={() => { if (!record.is_dir) onEdit(record); }}
        >
          {getFileIcon(record)}
          <span className={record.is_dir ? 'font-medium text-gray-900' : 'text-gray-600'}>
            {name}
            {record.is_symlink && <span className="text-gray-400 text-xs ml-1">→ {record.link_target}</span>}
          </span>
        </Space>
      ),
    },
    {
      title: 'PMSN/Owner',
      width: 140,
      render: (_, record) => (
        <span
          className="cursor-pointer text-blue-600 hover:underline"
          onClick={() => onAction('permissions', record)}
        >
          {record.mode_octal || '---'} / {record.owner}
        </span>
      ),
    },
    {
      title: 'Size',
      dataIndex: 'size',
      width: 120,
      sorter: (a, b) => a.size - b.size,
      render: (size: number, record) =>
        record.is_dir ? <span className="text-gray-400">-</span> : formatSize(size),
    },
    {
      title: 'Modified',
      dataIndex: 'mod_time',
      width: 180,
      sorter: (a, b) => new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime(),
      render: (v: string) => <span className="text-gray-500 text-[13px]">{formatDate(v)}</span>,
    },
    {
      title: 'Operations',
      width: 200,
      align: 'center',
      render: (_, record) => (
        <Space size={4}>
          {!record.is_dir && (
            <>
              <Tooltip title="Edit">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onAction('edit', record)} />
              </Tooltip>
              <Tooltip title="Download">
                <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => onAction('download', record)} />
              </Tooltip>
            </>
          )}
          <Tooltip title="Rename">
            <Button type="text" size="small" icon={<ScissorOutlined />} onClick={() => onAction('rename', record)} />
          </Tooltip>
          <Tooltip title="Copy">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => onAction('copy', record)} />
          </Tooltip>
          <Tooltip title="Delete">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onAction('delete', record)} />
          </Tooltip>
          <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ], [onNavigate, onEdit, onAction]);

  return (
    <Table<FileItem>
      columns={columns}
      dataSource={files}
      rowKey="path"
      loading={loading}
      size="small"
      pagination={false}
      rowSelection={{ selectedRowKeys: selectedKeys, onChange: onSelectChange }}
      onRow={(record) => ({
        onContextMenu: (e) => onContextMenu(e, record),
        onDoubleClick: () => {
          if (record.is_dir) onNavigate(record.path);
          else onEdit(record);
        },
        style: { cursor: 'default' },
      })}
      scroll={{ x: 700 }}
      className="flex-1"
    />
  );
}
