import { Dropdown, Tooltip, Upload, Tag } from 'antd';
import { message } from 'antd';
import type { MenuProps } from 'antd';
import {
  UploadOutlined, FileAddOutlined, FolderAddOutlined,
  SearchOutlined, CodeOutlined, HomeOutlined,
  EyeOutlined, EyeInvisibleOutlined,
  DeleteOutlined, CompressOutlined,
  UnorderedListOutlined, AppstoreOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import type { ViewMode } from '../types';
import { usePalette, mono } from '../palette';

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
  const { p, isDark } = usePalette();

  const newMenuItems: MenuProps['items'] = [
    { key: 'folder', icon: <FolderAddOutlined />, label: 'New Folder', onClick: onNewFolder },
    { key: 'file', icon: <FileAddOutlined />, label: 'New File', onClick: onNewFile },
  ];

  const btn = (active?: boolean, danger?: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, border: 'none',
    transition: 'all 0.15s',
    background: danger
      ? `${p.red}15`
      : active
        ? `${p.accent}18`
        : (isDark ? 'rgba(30,41,59,0.5)' : '#F1F5F9'),
    color: danger ? p.red : active ? p.accent : p.textMuted,
  });

  const iconBtn = (active?: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
    border: active ? `1px solid ${p.accent}40` : '1px solid transparent',
    background: active ? `${p.accent}15` : 'transparent',
    color: active ? p.accent : p.textMuted,
    fontSize: 14, transition: 'all 0.15s',
  });

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', gap: 8, flexWrap: 'wrap',
        borderBottom: `1px solid ${p.cardBorder}`,
        background: p.headerBg,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          <button style={{
            ...btn(), background: p.accent, color: '#fff',
            fontWeight: 700, letterSpacing: '-0.01em',
          }}>
            <UploadOutlined /> Upload
          </button>
        </Upload>

        <Dropdown menu={{ items: newMenuItems }} trigger={['click']}>
          <button style={btn()}>
            <FileAddOutlined /> New ▾
          </button>
        </Dropdown>

        <button style={btn(searchVisible)} onClick={onToggleSearch}>
          <SearchOutlined /> Search
        </button>

        <button style={btn(termOpen)} onClick={onToggleTerminal}>
          <CodeOutlined /> Terminal
        </button>

        <button style={btn()} onClick={onRemoteDownload}>
          <CloudDownloadOutlined /> Remote
        </button>

        <button style={btn()} onClick={onGoRoot}>
          <HomeOutlined /> Root
        </button>

        <Tooltip title={showHidden ? 'Hide hidden files' : 'Show hidden files'}>
          <button style={iconBtn(showHidden)} onClick={onToggleHidden}>
            {showHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          </button>
        </Tooltip>

        {selectedCount > 0 && (
          <>
            <button style={btn(false, true)} onClick={onBulkDelete}>
              <DeleteOutlined /> Delete
              <Tag
                style={{
                  margin: 0, background: `${p.red}20`, border: `1px solid ${p.red}30`,
                  color: p.red, fontSize: 10, fontWeight: 700, fontFamily: mono,
                  borderRadius: 4, padding: '0 5px', lineHeight: '18px',
                }}
              >
                {selectedCount}
              </Tag>
            </button>
            <button style={btn()} onClick={onBulkCompress}>
              <CompressOutlined /> Compress
              <Tag
                style={{
                  margin: 0, background: `${p.accent}15`, border: `1px solid ${p.accent}30`,
                  color: p.accent, fontSize: 10, fontWeight: 700, fontFamily: mono,
                  borderRadius: 4, padding: '0 5px', lineHeight: '18px',
                }}
              >
                {selectedCount}
              </Tag>
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2 }}>
        <Tooltip title="List view">
          <button style={iconBtn(viewMode === 'list')} onClick={() => onViewModeChange('list')}>
            <UnorderedListOutlined />
          </button>
        </Tooltip>
        <Tooltip title="Grid view">
          <button style={iconBtn(viewMode === 'grid')} onClick={() => onViewModeChange('grid')}>
            <AppstoreOutlined />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
