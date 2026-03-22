import React, { useEffect } from 'react';
import {
  FolderFilled,
  EditOutlined,
  DownloadOutlined,
  ScissorOutlined,
  CopyOutlined,
  SwapOutlined,
  CompressOutlined,
  InfoCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { ContextMenuState, FileItem } from '../types';
import { ARCHIVE_EXTENSIONS } from '../utils/constants';
import { getExtension } from '../utils/fileHelpers';

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
  show?: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ state, onClose, onAction }) => {
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
      className="fixed z-[9999] min-w-[180px] rounded-lg bg-white border border-gray-200 shadow-lg py-1"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item === 'divider') {
          return <div key={`d-${idx}`} className="my-1 border-t border-gray-100" />;
        }

        const { key, label, icon, danger } = item;
        return (
          <button
            key={key}
            type="button"
            className={`flex items-center gap-2 w-full px-3 py-1.5 rounded text-left text-sm transition-colors ${
              danger
                ? 'text-red-500 hover:bg-red-50'
                : 'text-gray-700 hover:bg-blue-50'
            }`}
            onClick={() => handleClick(key)}
          >
            {icon}
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;
