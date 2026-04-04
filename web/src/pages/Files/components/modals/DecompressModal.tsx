import { useState, useEffect } from 'react';
import { Modal, Input, Space } from 'antd';
import { CompressOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  archivePath: string;
  defaultDest: string;
  onOk: (path: string, dest: string) => void;
  onCancel: () => void;
}

export default function DecompressModal({ open, archivePath, defaultDest, onOk, onCancel }: Props) {
  const [dest, setDest] = useState('');

  useEffect(() => {
    if (open) {
      setDest(defaultDest);
    }
  }, [open, defaultDest]);

  const filename = archivePath.split('/').pop() || archivePath;

  const handleOk = () => {
    if (!dest.trim()) return;
    onOk(archivePath, dest.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <CompressOutlined />
          Decompress — {filename}
        </Space>
      }
      okText="Decompress"
      destroyOnHidden
    >
      <div style={{ color: '#888', marginBottom: 12 }}>
        File: {archivePath}
      </div>

      <div>
        <div style={{ marginBottom: 4 }}>Extract to:</div>
        <Input
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="Destination directory"
        />
      </div>
    </Modal>
  );
}
