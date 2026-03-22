import React from 'react';
import { Pagination, Select } from 'antd';
import { formatSize } from '../utils/fileHelpers';
import { PAGE_SIZE_KEY } from '../utils/constants';

interface FooterBarProps {
  dirCount: number;
  fileCount: number;
  totalSize: number;
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const pageSizeOptions = [25, 50, 100, 200];

const FooterBar: React.FC<FooterBarProps> = ({
  dirCount,
  fileCount,
  totalSize,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) => {
  const handlePageSizeChange = (size: number) => {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
    onPageSizeChange(size);
  };

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 text-sm text-gray-500">
      <span>
        Total <strong>{dirCount}</strong> directories, <strong>{fileCount}</strong> files.
        {' '}File size: <strong>{formatSize(totalSize)}</strong>
      </span>

      <div className="flex items-center gap-2">
        <Select
          size="small"
          value={pageSize}
          onChange={handlePageSizeChange}
          options={pageSizeOptions.map(v => ({ label: `${v} / page`, value: v }))}
          className="w-[120px]"
        />
        <Pagination
          size="small"
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
          showQuickJumper
          showTotal={(t) => `Total ${t}`}
        />
      </div>
    </div>
  );
};

export default FooterBar;
