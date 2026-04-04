import { useState, useEffect } from 'react';
import { Modal, Input, Space } from 'antd';
import { CopyOutlined, SwapOutlined } from '@ant-design/icons';
import type { FileItem } from '../../types';

interface Props {
  open: boolean;
  file: FileItem | null;
  mode: 'copy' | 'move';
  onOk: (src: string, dst: string) => void;
  onCancel: () => void;
}

export default function CopyMoveModal({ open, file, mode, onOk, onCancel }: Props) {
  const [dest, setDest] = useState('');

  useEffect(() => {
    if (file) {
      setDest(file.path);
    }
  }, [file]);

  const isCopy = mode === 'copy';
  const label = isCopy ? 'Copy' : 'Move';
  const Icon = isCopy ? CopyOutlined : SwapOutlined;

  const handleOk = () => {
    if (!file || !dest.trim()) return;
    onOk(file.path, dest.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <Icon />
          {label} — {file?.name}
        </Space>
      }
      okText={label}
      destroyOnHidden
    >
      <div style={{ color: '#888', marginBottom: 12 }}>
        Source: {file?.path}
      </div>
      <Input
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        onPressEnter={handleOk}
        autoFocus
        placeholder="Destination path"
      />
    </Modal>
  );
}
