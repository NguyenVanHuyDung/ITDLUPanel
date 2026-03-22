import { useState, useCallback } from 'react';
import type React from 'react';

export function useFileSelection() {
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedKeys([]);
  }, []);

  const toggleKey = useCallback((key: React.Key) => {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key],
    );
  }, []);

  const isSelected = useCallback((key: React.Key) => {
    return selectedKeys.includes(key);
  }, [selectedKeys]);

  return {
    selectedKeys,
    setSelectedKeys,
    clearSelection,
    toggleKey,
    isSelected,
  };
}
