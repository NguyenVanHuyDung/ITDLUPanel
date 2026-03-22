import { Button, Dropdown, Space, Tooltip, Upload, type MenuProps } from 'antd';
import { message } from 'antd';
import {
  UploadOutlined, FileAddOutlined, FolderAddOutlined,
  SearchOutlined, CodeOutlined, HomeOutlined,
  EyeOutlined, EyeInvisibleOutlined,
  DeleteOutlined, CompressOutlined,
  UnorderedListOutlined, AppstoreOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import type { ViewMode } from '../types';

interface ToolbarProps {
  viewMode: ViewMode;
  showHidden: boolean;
  searchVisible: boolean;
  termOpen: boolean;
  selectedCount: number;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleHidden: () => void;
  onToggleSearch: () => void;
  onToggleTerminal: () => void;
  onGoRoot: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onUpload: (file: File) => Promise<void>;
  onBulkDelete: () => void;
  onBulkCompress: () => void;
  onRemoteDownload: () => void;
}

export default function Toolbar({
  viewMode, showHidden, searchVisible, termOpen, selectedCount,
  onViewModeChange, onToggleHidden, onToggleSearch, onToggleTerminal,
  onGoRoot, onNewFolder, onNewFile, onUpload,
  onBulkDelete, onBulkCompress, onRemoteDownload,
}: ToolbarProps) {
  const newMenuItems: MenuProps['items'] = [
    { key: 'folder', icon: <FolderAddOutlined />, label: 'New Folder', onClick: onNewFolder },
    { key: 'file', icon: <FileAddOutlined />, label: 'New File', onClick: onNewFile },
  ];

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 gap-2 flex-wrap">
      <Space size={6} wrap>
        <Upload
          multiple
          showUploadList={false}
          customRequest={async ({ file, onSuccess, onError }) => {
            try {
              await onUpload(file as File);
              onSuccess?.(null);
              message.success(`Uploaded ${(file as File).name}`);
            } catch (err) {
              onError?.(err as Error);
              message.error('Upload failed');
            }
          }}
        >
          <Button size="small" type="primary" icon={<UploadOutlined />}>
            Upload
          </Button>
        </Upload>

        <Dropdown menu={{ items: newMenuItems }} trigger={['click']}>
          <Button size="small" icon={<FileAddOutlined />}>New ▾</Button>
        </Dropdown>

        <Button size="small" icon={<SearchOutlined />}
          type={searchVisible ? 'primary' : 'default'}
          onClick={onToggleSearch}>
          Search
        </Button>

        <Button size="small" icon={<CodeOutlined />}
          type={termOpen ? 'primary' : 'default'}
          onClick={onToggleTerminal}>
          Terminal
        </Button>

        <Button size="small" icon={<CloudDownloadOutlined />} onClick={onRemoteDownload}>
          Remote DL
        </Button>

        <Button size="small" icon={<HomeOutlined />} onClick={onGoRoot}>Root</Button>

        <Tooltip title={showHidden ? 'Hide hidden files' : 'Show hidden files'}>
          <Button size="small"
            type={showHidden ? 'primary' : 'default'}
            icon={showHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            onClick={onToggleHidden}
          />
        </Tooltip>

        {selectedCount > 0 && (
          <>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={onBulkDelete}>
              Delete ({selectedCount})
            </Button>
            <Button size="small" icon={<CompressOutlined />} onClick={onBulkCompress}>
              Compress ({selectedCount})
            </Button>
          </>
        )}
      </Space>

      <Space size={4}>
        <Tooltip title="List view">
          <Button type={viewMode === 'list' ? 'primary' : 'default'} size="small"
            icon={<UnorderedListOutlined />} onClick={() => onViewModeChange('list')} />
        </Tooltip>
        <Tooltip title="Grid view">
          <Button type={viewMode === 'grid' ? 'primary' : 'default'} size="small"
            icon={<AppstoreOutlined />} onClick={() => onViewModeChange('grid')} />
        </Tooltip>
      </Space>
    </div>
  );
}
