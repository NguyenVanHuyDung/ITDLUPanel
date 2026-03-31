import { useState, useEffect } from 'react';
import { Modal, Input, Checkbox, Space } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { FileItem } from '../../types';
import { octalToPerms, permsToOctal } from '../../utils/fileHelpers';
import { PERM_LABELS, PERM_GROUPS } from '../../utils/constants';

interface Props {
  open: boolean;
  file: FileItem | null;
  onOk: (data: {
    path: string;
    mode: string;
    owner: string;
    group: string;
    recursive: boolean;
  }) => void;
  onCancel: () => void;
}

export default function PermissionsModal({ open, file, onOk, onCancel }: Props) {
  const [permOctal, setPermOctal] = useState('644');
  const [permPerms, setPermPerms] = useState<boolean[]>(new Array(9).fill(false));
  const [owner, setOwner] = useState('');
  const [group, setGroup] = useState('');
  const [recursive, setRecursive] = useState(false);

  useEffect(() => {
    if (file) {
      const octal = file.mode_octal || '644';
      setPermOctal(octal);
      setPermPerms(octalToPerms(octal));
      setOwner(file.owner || '');
      setGroup(file.group || '');
      setRecursive(false);
    }
  }, [file]);

  const handleOctalChange = (value: string) => {
    setPermOctal(value);
    if (/^[0-7]{3}$/.test(value)) {
      setPermPerms(octalToPerms(value));
    }
  };

  const handlePermChange = (index: number, checked: boolean) => {
    const next = [...permPerms];
    next[index] = checked;
    setPermPerms(next);
    setPermOctal(permsToOctal(next));
  };

  const handleOk = () => {
    if (!file) return;
    onOk({ path: file.path, mode: permOctal, owner, group, recursive });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={
        <Space>
          <InfoCircleOutlined />
          Permissions — {file?.name}
        </Space>
      }
      okText="Apply"
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 6, fontWeight: 500 }}>Permission Code (Octal)</div>
        <Input
          value={permOctal}
          onChange={(e) => handleOctalChange(e.target.value)}
          style={{ width: 120, fontSize: 18, textAlign: 'center' }}
          maxLength={3}
        />
      </div>

      <table style={{ width: '100%', marginBottom: 16, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 8px' }} />
            {PERM_LABELS.map((label) => (
              <th key={label} style={{ textAlign: 'center', padding: '6px 8px' }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERM_GROUPS.map((grp, gi) => (
            <tr key={grp}>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{grp}</td>
              {PERM_LABELS.map((_, pi) => {
                const idx = gi * 3 + pi;
                return (
                  <td key={pi} style={{ textAlign: 'center', padding: '6px 8px' }}>
                    <Checkbox
                      checked={permPerms[idx]}
                      onChange={(e) => handlePermChange(idx, e.target.checked)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <Space style={{ width: '100%', marginBottom: 16 }} size="middle">
        <div>
          <div style={{ marginBottom: 4 }}>Owner</div>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner" />
        </div>
        <div>
          <div style={{ marginBottom: 4 }}>Group</div>
          <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="group" />
        </div>
      </Space>

      {file?.is_dir && (
        <div>
          <Checkbox checked={recursive} onChange={(e) => setRecursive(e.target.checked)}>
            Apply recursively
          </Checkbox>
        </div>
      )}
    </Modal>
  );
}
