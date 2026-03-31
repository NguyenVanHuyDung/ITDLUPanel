import { useState, useMemo, useCallback } from 'react';
import { Tooltip, Dropdown, Popconfirm } from 'antd';
import type { MenuProps } from 'antd';
import {
  EditOutlined, DownloadOutlined, ScissorOutlined,
  CopyOutlined, DeleteOutlined, MoreOutlined,
  SwapOutlined, CompressOutlined, InfoCircleOutlined,
  CaretUpFilled, CaretDownFilled,
} from '@ant-design/icons';
import type { FileItem } from '../types';
import { getFileIcon } from './FileIcon';
import { formatSize, formatDate, getExtension } from '../utils/fileHelpers';
import { ARCHIVE_EXTENSIONS } from '../utils/constants';
import { usePalette } from '../palette';

interface FileTableProps {
  files: FileItem[];
  loading: boolean;
  selectedKeys: React.Key[];
  onSelectChange: (keys: React.Key[]) => void;
  onNavigate: (path: string) => void;
  onEdit: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onAction: (action: string, file: FileItem) => void;
}

type SortField = 'name' | 'size' | 'mod_time';

function SortableHeader({ label, field, sortField, sortDir, onClick, p }: {
  label: string; field: SortField; sortField: SortField; sortDir: 'asc' | 'desc';
  onClick: (f: SortField) => void; p: import('../palette').Palette;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onClick(field)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3, padding: 0,
        color: active ? p.accent : p.textMuted,
        fontWeight: active ? 700 : 600, fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        transition: 'color 0.2s',
      }}
    >
      {label}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0, marginTop: -1 }}>
        <CaretUpFilled style={{ fontSize: 8, color: active && sortDir === 'asc' ? p.accent : p.textDim }} />
        <CaretDownFilled style={{ fontSize: 8, color: active && sortDir === 'desc' ? p.accent : p.textDim, marginTop: -2 }} />
      </span>
    </button>
  );
}

export default function FileTable({
  files, loading, selectedKeys, onSelectChange,
  onNavigate, onEdit, onDownload, onContextMenu, onAction,
}: FileTableProps) {
  const { p, isDark } = usePalette();
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return field; }
      setSortDir('asc');
      return field;
    });
  }, []);

  const sorted = useMemo(() => {
    return [...files].sort((a, b) => {
      // Directories always first
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      const m = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name': return m * a.name.localeCompare(b.name);
        case 'size': return m * (a.size - b.size);
        case 'mod_time': return m * (new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime());
        default: return 0;
      }
    });
  }, [files, sortField, sortDir]);

  const allSelected = files.length > 0 && selectedKeys.length === files.length;
  const someSelected = selectedKeys.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    onSelectChange(allSelected ? [] : files.map(f => f.path));
  };

  const toggleSelect = (path: string) => {
    onSelectChange(
      selectedKeys.includes(path)
        ? selectedKeys.filter(k => k !== path)
        : [...selectedKeys, path]
    );
  };

  const getRowActions = (record: FileItem): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (!record.is_dir) {
      items.push(
        { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => onAction('edit', record) },
        { key: 'download', icon: <DownloadOutlined />, label: 'Download', onClick: () => onAction('download', record) },
      );
    }
    items.push(
      { key: 'rename', icon: <ScissorOutlined />, label: 'Rename', onClick: () => onAction('rename', record) },
      { key: 'copy', icon: <CopyOutlined />, label: 'Copy', onClick: () => onAction('copy', record) },
      { key: 'move', icon: <SwapOutlined />, label: 'Move', onClick: () => onAction('move', record) },
      { key: 'compress', icon: <CompressOutlined />, label: 'Compress', onClick: () => onAction('compress', record) },
    );
    const ext = getExtension(record.name);
    if (ARCHIVE_EXTENSIONS.includes(ext)) {
      items.push({ key: 'decompress', icon: <CompressOutlined />, label: 'Decompress', onClick: () => onAction('decompress', record) });
    }
    items.push(
      { key: 'permissions', icon: <InfoCircleOutlined />, label: 'Permissions', onClick: () => onAction('permissions', record) },
      { key: 'copy-path', icon: <CopyOutlined />, label: 'Copy Path', onClick: () => onAction('copy-path', record) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: () => onAction('delete', record) },
    );
    return items;
  };

  const colHeaderStyle: React.CSSProperties = {
    fontSize: 10, color: p.textDim, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.08em',
  };

  const actionBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: p.textDim, fontSize: 13, padding: 4, borderRadius: 4,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'color 0.15s, background 0.15s',
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: p.textDim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Column header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 120px 90px 150px 120px',
          padding: '8px 12px',
          borderBottom: `1px solid ${p.cardBorder}`,
          background: p.colHeaderBg,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={toggleSelectAll}
            style={{ cursor: 'pointer', accentColor: p.accent }}
          />
        </div>
        <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <span style={colHeaderStyle}>PMSN / Owner</span>
        <SortableHeader label="Size" field="size" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <SortableHeader label="Modified" field="mod_time" sortField={sortField} sortDir={sortDir} onClick={handleSort} p={p} />
        <span style={{ ...colHeaderStyle, textAlign: 'center' }}>Actions</span>
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: p.textDim, fontSize: 13 }}>
            Empty directory
          </div>
        )}
        {sorted.map((file, idx) => {
          const selected = selectedKeys.includes(file.path);
          const isOdd = idx % 2 === 1;
          const rowBg = selected ? `${p.accent}08` : isOdd ? p.rowAlt : 'transparent';
          const borderColor = isDark ? 'rgba(30,41,59,0.4)' : '#F1F5F9';

          return (
            <div
              key={file.path}
              onContextMenu={(e) => onContextMenu(e, file)}
              onDoubleClick={() => {
                if (file.is_dir) onNavigate(file.path);
                else onEdit(file);
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 120px 90px 150px 120px',
                padding: '6px 12px', alignItems: 'center',
                background: rowBg,
                borderBottom: `1px solid ${borderColor}`,
                borderLeft: selected ? `2px solid ${p.accent}` : '2px solid transparent',
                transition: 'background 0.15s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = p.rowHover; }}
              onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = rowBg; }}
            >
              {/* Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(file.path)}
                  style={{ cursor: 'pointer', accentColor: p.accent }}
                />
              </div>

              {/* Name */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  overflow: 'hidden', paddingRight: 8,
                  cursor: file.is_dir ? 'pointer' : 'default',
                }}
                onClick={() => { if (file.is_dir) onNavigate(file.path); }}
              >
                <span style={{ flexShrink: 0, fontSize: 16 }}>{getFileIcon(file)}</span>
                <span
                  style={{
                    fontSize: 12, fontWeight: 400,
                    color: file.is_dir ? p.text : p.textMuted,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                  {file.is_symlink && (
                    <span style={{ color: p.textDim, fontSize: 10, marginLeft: 6 }}>
                      → {file.link_target}
                    </span>
                  )}
                </span>
              </div>

              {/* Permissions / Owner */}
              <span
                style={{
                  fontSize: 11, color: p.accent,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onClick={() => onAction('permissions', file)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
              >
                {file.mode_octal || '---'} / {file.owner}
              </span>

              {/* Size */}
              <span style={{ fontSize: 11, color: p.textDim }}>
                {file.is_dir ? '—' : formatSize(file.size)}
              </span>

              {/* Modified */}
              <span style={{ fontSize: 11, color: p.textDim, whiteSpace: 'nowrap' }}>
                {formatDate(file.mod_time)}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                {!file.is_dir && (
                  <>
                    <Tooltip title="Edit">
                      <button
                        style={actionBtn}
                        onClick={(e) => { e.stopPropagation(); onAction('edit', file); }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = p.accent; e.currentTarget.style.background = `${p.accent}10`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = p.textDim; e.currentTarget.style.background = 'none'; }}
                      >
                        <EditOutlined />
                      </button>
                    </Tooltip>
                    <Tooltip title="Download">
                      <button
                        style={actionBtn}
                        onClick={(e) => { e.stopPropagation(); onAction('download', file); }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = p.green; e.currentTarget.style.background = `${p.green}10`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = p.textDim; e.currentTarget.style.background = 'none'; }}
                      >
                        <DownloadOutlined />
                      </button>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Rename">
                  <button
                    style={actionBtn}
                    onClick={(e) => { e.stopPropagation(); onAction('rename', file); }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = p.amber; e.currentTarget.style.background = `${p.amber}10`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = p.textDim; e.currentTarget.style.background = 'none'; }}
                  >
                    <ScissorOutlined />
                  </button>
                </Tooltip>
                <Tooltip title="Delete">
                  <button
                    style={actionBtn}
                    onClick={(e) => { e.stopPropagation(); onAction('delete', file); }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = p.red; e.currentTarget.style.background = `${p.red}10`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = p.textDim; e.currentTarget.style.background = 'none'; }}
                  >
                    <DeleteOutlined />
                  </button>
                </Tooltip>
                <Dropdown menu={{ items: getRowActions(file) }} trigger={['click']}>
                  <button
                    style={actionBtn}
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => { e.currentTarget.style.color = p.text; e.currentTarget.style.background = `${p.accent}10`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = p.textDim; e.currentTarget.style.background = 'none'; }}
                  >
                    <MoreOutlined />
                  </button>
                </Dropdown>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
