import type { FileItem } from '../types';
import { getFileIcon } from './FileIcon';
import { usePalette } from '../palette';

interface FileGridProps {
  files: FileItem[];
  selectedKeys: React.Key[];
  onSelectChange: (keys: React.Key[]) => void;
  onNavigate: (path: string) => void;
  onEdit: (file: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, file: FileItem) => void;
}

export default function FileGrid({
  files, selectedKeys, onSelectChange,
  onNavigate, onEdit, onContextMenu,
}: FileGridProps) {
  const { p, isDark } = usePalette();

  const toggleSelect = (path: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onSelectChange(
        selectedKeys.includes(path)
          ? selectedKeys.filter(k => k !== path)
          : [...selectedKeys, path]
      );
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
        gap: 8, padding: 12,
      }}
    >
      {files.map(file => {
        const selected = selectedKeys.includes(file.path);
        return (
          <div
            key={file.path}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 12, borderRadius: 8, cursor: 'pointer',
              textAlign: 'center', transition: 'all 0.15s',
              border: selected
                ? `2px solid ${p.accent}`
                : '2px solid transparent',
              background: selected
                ? `${p.accent}08`
                : 'transparent',
            }}
            onClick={(e) => toggleSelect(file.path, e)}
            onDoubleClick={() => {
              if (file.is_dir) onNavigate(file.path);
              else onEdit(file);
            }}
            onContextMenu={(e) => onContextMenu(e, file)}
            onMouseEnter={(e) => {
              if (!selected) e.currentTarget.style.background = p.rowHover;
            }}
            onMouseLeave={(e) => {
              if (!selected) e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 4 }}>{getFileIcon(file)}</div>
            <span
              style={{
                fontSize: 11, width: '100%',
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', color: p.text,
              }}
            >
              {file.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
