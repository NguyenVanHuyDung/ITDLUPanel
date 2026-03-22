import { useRef } from 'react';
import { Button, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, StarOutlined, CloseOutlined, FolderFilled } from '@ant-design/icons';
import type { Bookmark } from '../types';

interface BookmarkBarProps {
  bookmarks: Bookmark[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onAdd: () => void;
  onRemove: (path: string) => void;
}

export default function BookmarkBar({ bookmarks, currentPath, onNavigate, onAdd, onRemove }: BookmarkBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    barRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 bg-blue-50/60 min-h-[42px]">
      <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => scroll('left')}
        className="shrink-0 !text-blue-800" />
      <div ref={barRef} className="flex gap-1 overflow-x-auto flex-1 scrollbar-none flex-nowrap">
        {bookmarks.map(bm => {
          const active = currentPath === bm.path;
          return (
            <div key={bm.path}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer whitespace-nowrap text-[13px] transition-all
                ${active ? 'bg-blue-700 text-white' : 'bg-white text-gray-800 hover:bg-blue-100'}`}
              onClick={() => onNavigate(bm.path)}
            >
              <FolderFilled className={`text-[13px] ${active ? '!text-white' : '!text-blue-600'}`} />
              <span className="max-w-[100px] overflow-hidden text-ellipsis">{bm.label}</span>
              <CloseOutlined
                className="text-[10px] opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onRemove(bm.path); }}
              />
            </div>
          );
        })}
      </div>
      <Button type="text" size="small" icon={<RightOutlined />} onClick={() => scroll('right')}
        className="shrink-0 !text-blue-800" />
      <Tooltip title="Bookmark current folder">
        <Button type="text" size="small" icon={<StarOutlined />} onClick={onAdd}
          className="shrink-0 !text-blue-800" />
      </Tooltip>
    </div>
  );
}
