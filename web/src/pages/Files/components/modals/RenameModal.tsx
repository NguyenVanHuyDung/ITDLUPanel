import { useState, useEffect } from 'react';
import { Modal, Input, Space } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { FileItem } from '../../types';

interface Props {
  open: boolean;
  file: FileItem | null;
  onOk: (oldPath: string, newPath: string) => void;
  onCancel: () => void;
}

export default function RenameModal({ open, file, onOk, onCancel }: Props) {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (file) {
      setNewName(file.name);
    }
  }, [file]);

  const handleOk = () => {
    if (!file || !newName.trim()) return;
    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    const newPath = dir + '/' + newName.trim();
    onOk(file.path, newPath);
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <EditOutlined />
          Rename
        </Space>
      }
      okText="Rename"
      destroyOnHidden
    >
      <div style={{ color: '#888', marginBottom: 12 }}>
        Current: {file?.name}
      </div>
      <Input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onPressEnter={handleOk}
        autoFocus
        placeholder="New name"
      />
    </Modal>
  );
}
