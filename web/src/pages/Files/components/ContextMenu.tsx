import React, { useEffect } from 'react';
import {
  FolderFilled, EditOutlined, DownloadOutlined,
  ScissorOutlined, CopyOutlined, SwapOutlined,
  CompressOutlined, InfoCircleOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ContextMenuState, FileItem } from '../types';
import { ARCHIVE_EXTENSIONS } from '../utils/constants';
import { getExtension } from '../utils/fileHelpers';
import { usePalette } from '../palette';

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onAction: (action: string, file: FileItem) => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ state, onClose, onAction }) => {
  const { p, isDark } = usePalette();

  useEffect(() => {
    if (!state) return;
    const handleClose = () => onClose();
    document.addEventListener('click', handleClose);
    document.addEventListener('scroll', handleClose, true);
    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('scroll', handleClose, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  const { x, y, file } = state;
  const ext = getExtension(file.name).toLowerCase();
  const isArchive = ARCHIVE_EXTENSIONS.includes(ext);

  const items: (MenuItem | 'divider')[] = [
    ...(file.is_dir
      ? [{ key: 'open', label: 'Open', icon: <FolderFilled /> }]
      : [
          { key: 'edit', label: 'Edit', icon: <EditOutlined /> },
          { key: 'download', label: 'Download', icon: <DownloadOutlined /> },
        ]),
    'divider',
    { key: 'rename', label: 'Rename', icon: <ScissorOutlined /> },
    { key: 'copy', label: 'Copy', icon: <CopyOutlined /> },
    { key: 'move', label: 'Move', icon: <SwapOutlined /> },
    'divider',
    { key: 'compress', label: 'Compress', icon: <CompressOutlined /> },
    ...(isArchive
      ? [{ key: 'decompress', label: 'Decompress', icon: <CompressOutlined /> }]
      : []),
    'divider',
    { key: 'permissions', label: 'Permissions', icon: <InfoCircleOutlined /> },
    { key: 'copyPath', label: 'Copy Path', icon: <CopyOutlined /> },
    'divider',
    { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true },
  ];

  const handleClick = (key: string) => {
    onAction(key, file);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', zIndex: 9999, minWidth: 180,
        left: x, top: y,
        borderRadius: 10, padding: '4px 0',
        background: p.card,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark
          ? '0 8px 24px rgba(0,0,0,0.4)'
          : '0 8px 24px rgba(0,0,0,0.12)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item === 'divider') {
          return (
            <div
              key={`d-${idx}`}
              style={{
                margin: '4px 8px',
                borderTop: `1px solid ${p.cardBorder}`,
              }}
            />
          );
        }

        const { key, label, icon, danger } = item;
        return (
          <button
            key={key}
            type="button"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 12px', border: 'none',
              borderRadius: 0, textAlign: 'left', fontSize: 12,
              cursor: 'pointer', transition: 'background 0.1s',
              background: 'transparent',
              color: danger ? p.red : p.text,
            }}
            onClick={() => handleClick(key)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = danger ? `${p.red}08` : p.rowHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ color: danger ? p.red : p.textMuted, fontSize: 13 }}>{icon}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;
