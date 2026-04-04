import { useState, useEffect } from 'react';
import { Modal, Input, Space } from 'antd';
import { FolderAddOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  currentPath: string;
  onOk: (name: string) => void;
  onCancel: () => void;
}

export default function NewFolderModal({ open, currentPath, onOk, onCancel }: Props) {
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (open) {
      setFolderName('');
    }
  }, [open]);

  const handleOk = () => {
    if (!folderName.trim()) return;
    onOk(folderName.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <FolderAddOutlined />
          New Folder
        </Space>
      }
      okText="OK"
      destroyOnHidden
    >
      <div style={{ color: '#888', marginBottom: 12 }}>
        In: {currentPath}
      </div>
      <Input
        value={folderName}
        onChange={(e) => setFolderName(e.target.value)}
        onPressEnter={handleOk}
        autoFocus
        placeholder="Folder name"
      />
    </Modal>
  );
}
