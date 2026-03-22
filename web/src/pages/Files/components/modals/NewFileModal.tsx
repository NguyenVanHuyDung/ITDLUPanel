import { useState, useEffect } from 'react';
import { Modal, Input, Space } from 'antd';
import { FileAddOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  currentPath: string;
  onOk: (name: string) => void;
  onCancel: () => void;
}

export default function NewFileModal({ open, currentPath, onOk, onCancel }: Props) {
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (open) {
      setFileName('');
    }
  }, [open]);

  const handleOk = () => {
    if (!fileName.trim()) return;
    onOk(fileName.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <FileAddOutlined />
          New File
        </Space>
      }
      okText="OK"
      destroyOnClose
    >
      <div style={{ color: '#888', marginBottom: 12 }}>
        In: {currentPath}
      </div>
      <Input
        value={fileName}
        onChange={(e) => setFileName(e.target.value)}
        onPressEnter={handleOk}
        autoFocus
        placeholder="File name"
      />
    </Modal>
  );
}
