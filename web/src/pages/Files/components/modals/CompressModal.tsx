import { useState, useEffect } from 'react';
import { Modal, Input, Select, Space } from 'antd';
import { CompressOutlined } from '@ant-design/icons';
import { COMPRESS_FORMATS } from '../../utils/constants';

interface Props {
  open: boolean;
  paths: string[];
  defaultDest: string;
  onOk: (paths: string[], dest: string, format: string) => void;
  onCancel: () => void;
}

export default function CompressModal({ open, paths, defaultDest, onOk, onCancel }: Props) {
  const [dest, setDest] = useState('');
  const [format, setFormat] = useState('zip');

  useEffect(() => {
    if (open) {
      setDest(defaultDest);
      setFormat('zip');
    }
  }, [open, defaultDest]);

  const handleOk = () => {
    if (!dest.trim()) return;
    onOk(paths, dest.trim(), format);
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <CompressOutlined />
          Compress
        </Space>
      }
      okText="Compress"
      destroyOnClose
    >
      <div style={{ color: '#888', marginBottom: 12 }}>
        {paths.length} item(s) selected
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4 }}>Format</div>
        <Select
          value={format}
          onChange={setFormat}
          options={COMPRESS_FORMATS}
          style={{ width: 160 }}
        />
      </div>

      <div>
        <div style={{ marginBottom: 4 }}>Destination</div>
        <Input
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="Archive path"
        />
      </div>
    </Modal>
  );
}
