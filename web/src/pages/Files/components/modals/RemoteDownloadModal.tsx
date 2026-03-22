import { useState, useEffect } from 'react';
import { Modal, Input, Space } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  currentPath: string;
  onOk: (url: string, dest: string, filename: string) => void;
  onCancel: () => void;
}

export default function RemoteDownloadModal({ open, currentPath, onOk, onCancel }: Props) {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [dest, setDest] = useState('');

  useEffect(() => {
    if (open) {
      setUrl('');
      setFilename('');
      setDest(currentPath);
    }
  }, [open, currentPath]);

  const handleOk = () => {
    if (!url.trim()) return;
    onOk(url.trim(), dest.trim(), filename.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <CloudDownloadOutlined />
          Remote Download
        </Space>
      }
      okText="Download"
      destroyOnClose
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4 }}>URL</div>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          placeholder="https://example.com/file.zip"
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4 }}>Save to</div>
        <Input
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="Destination directory"
        />
      </div>

      <div>
        <div style={{ marginBottom: 4 }}>Filename (optional)</div>
        <Input
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="Leave empty to auto-detect"
        />
      </div>
    </Modal>
  );
}
