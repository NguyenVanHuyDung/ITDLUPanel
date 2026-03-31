import React from 'react';
import { Select } from 'antd';
import { formatSize } from '../utils/fileHelpers';
import { PAGE_SIZE_KEY } from '../utils/constants';
import { usePalette } from '../palette';

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
  dirCount, fileCount, totalSize,
  currentPage, pageSize, total,
  onPageChange, onPageSizeChange,
}) => {
  const { p } = usePalette();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderTop: `1px solid ${p.cardBorder}`,
        background: p.headerBg,
        flexWrap: 'wrap', gap: 8,
      }}
    >
      <span style={{ fontSize: 11, color: p.textDim }}>
        <strong style={{ color: p.text }}>{dirCount}</strong> dirs,{' '}
        <strong style={{ color: p.text }}>{fileCount}</strong> files{' '}
        — <strong style={{ color: p.text }}>{formatSize(totalSize)}</strong>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Select
          size="small"
          value={pageSize}
          onChange={(v) => {
            localStorage.setItem(PAGE_SIZE_KEY, String(v));
            onPageSizeChange(v);
          }}
          options={pageSizeOptions.map(v => ({ label: `${v}/pg`, value: v }))}
          style={{ width: 85 }}
          popupMatchSelectWidth={false}
        />

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageIdx: number;
              if (totalPages <= 7) pageIdx = i + 1;
              else if (safePage <= 4) pageIdx = i + 1;
              else if (safePage > totalPages - 4) pageIdx = totalPages - 6 + i;
              else pageIdx = safePage - 3 + i;
              return (
                <button
                  key={pageIdx}
                  onClick={() => onPageChange(pageIdx)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: pageIdx === safePage ? `1px solid ${p.accent}40` : '1px solid transparent',
                    background: pageIdx === safePage ? `${p.accent}15` : 'transparent',
                    color: pageIdx === safePage ? p.accent : p.textDim,
                    fontSize: 11, fontWeight: pageIdx === safePage ? 700 : 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {pageIdx}
                </button>
              );
            })}
          </div>
        )}

        <span style={{ fontSize: 10, color: p.textDim }}>
          {total} total
        </span>
      </div>
    </div>
  );
};

export default FooterBar;
