import type { FileItem } from '../types';
import { getFileIcon } from './FileIcon';

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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-3">
      {files.map(file => {
        const selected = selectedKeys.includes(file.path);
        return (
          <div
            key={file.path}
            className={`flex flex-col items-center justify-center p-3 rounded-lg cursor-pointer text-center transition-all
              ${selected ? 'border-2 border-blue-600 bg-blue-50' : 'border-2 border-transparent hover:bg-gray-50'}`}
            onClick={(e) => toggleSelect(file.path, e)}
            onDoubleClick={() => {
              if (file.is_dir) onNavigate(file.path);
              else onEdit(file);
            }}
            onContextMenu={(e) => onContextMenu(e, file)}
          >
            <div className="text-[32px] mb-1">{getFileIcon(file)}</div>
            <span className="text-xs w-full overflow-hidden text-ellipsis whitespace-nowrap">
              {file.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
