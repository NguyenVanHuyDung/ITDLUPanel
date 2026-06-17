import { useState } from 'react';
import { Modal } from 'antd';
import { CloudOutlined } from '@ant-design/icons';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import GoogleDriveConnectionsTab from './GoogleDriveConnectionsTab';

const SECTIONS = [
  { key: 'connections', label: 'Connections', icon: <CloudOutlined /> },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GoogleDriveManageModal({ open, onClose }: Props) {
  const isMobile = useIsMobile();
  const { p } = usePalette();
  const [section, setSection] = useState<SectionKey>('connections');

  const MODAL_BORDER = p.cardBorder;
  const MODAL_PRIMARY = p.accent;
  const MODAL_PRIMARY_LIGHT = `${MODAL_PRIMARY}12`;
  const MODAL_TEXT = p.text;

  const sidebarStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: active ? MODAL_PRIMARY : MODAL_TEXT,
    background: active ? MODAL_PRIMARY_LIGHT : 'transparent',
    borderLeft: isMobile ? 'none' : (active ? `3px solid ${MODAL_PRIMARY}` : '3px solid transparent'),
    borderBottom: isMobile ? (active ? `2px solid ${MODAL_PRIMARY}` : '2px solid transparent') : 'none',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CloudOutlined style={{ color: '#4285F4' }} />
          <span>Google Drive Manager</span>
        </div>
      }
      width={isMobile ? '95vw' : 960}
      styles={{ body: { padding: 0, maxHeight: '80vh', overflow: 'hidden' } }}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 500 }}>
        <div style={{
          width: isMobile ? '100%' : 200,
          borderRight: isMobile ? 'none' : `1px solid ${MODAL_BORDER}`,
          borderBottom: isMobile ? `1px solid ${MODAL_BORDER}` : 'none',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          overflowX: isMobile ? 'auto' : 'visible',
        }}>
          {SECTIONS.map((s) => (
            <div key={s.key} onClick={() => setSection(s.key)} style={sidebarStyle(section === s.key)}>
              {s.icon} {s.label}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', maxHeight: isMobile ? '60vh' : '80vh' }}>
          {section === 'connections' && <GoogleDriveConnectionsTab open={open} />}
        </div>
      </div>
    </Modal>
  );
}
