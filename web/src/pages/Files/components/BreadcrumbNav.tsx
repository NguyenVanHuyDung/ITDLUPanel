import { useState } from 'react';
import { Button, Space, Tooltip, Input } from 'antd';
import { LeftOutlined, RightOutlined, HomeOutlined, ReloadOutlined } from '@ant-design/icons';

interface BreadcrumbNavProps {
  currentPath: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (path: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
}

export default function BreadcrumbNav({
  currentPath, loading, canGoBack, canGoForward,
  onNavigate, onGoBack, onGoForward, onRefresh,
}: BreadcrumbNavProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const segments = currentPath.split('/').filter(Boolean);

  const startEdit = () => {
    setEditValue(currentPath);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== currentPath) {
      onNavigate(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white">
      <Space size={4}>
        <Tooltip title="Back">
          <Button type="text" size="small" icon={<LeftOutlined />} disabled={!canGoBack} onClick={onGoBack} />
        </Tooltip>
        <Tooltip title="Forward">
          <Button type="text" size="small" icon={<RightOutlined />} disabled={!canGoForward} onClick={onGoForward} />
        </Tooltip>
      </Space>

      {editing ? (
        <Input
          size="small"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onPressEnter={commitEdit}
          onBlur={commitEdit}
          autoFocus
          className="flex-1 font-mono text-[13px]"
        />
      ) : (
        <div
          className="flex items-center gap-1 flex-1 flex-wrap text-[13px] cursor-text"
          onDoubleClick={startEdit}
        >
          <span
            className="cursor-pointer text-blue-700 font-medium hover:underline"
            onClick={() => onNavigate('/')}
          >
            <HomeOutlined /> Root
          </span>
          {segments.map((seg, i) => {
            const fullPath = '/' + segments.slice(0, i + 1).join('/');
            const isLast = i === segments.length - 1;
            return (
              <span key={fullPath} className="inline-flex items-center gap-1">
                <span className="text-gray-400">/</span>
                <span
                  className={`cursor-pointer hover:underline ${isLast ? 'text-gray-900 font-semibold' : 'text-blue-700'}`}
                  onClick={() => onNavigate(fullPath)}
                >
                  {seg}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <Tooltip title="Refresh">
        <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={onRefresh} />
      </Tooltip>
    </div>
  );
}
