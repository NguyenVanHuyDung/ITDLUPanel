import { useMemo } from 'react';
import { Tree } from 'antd';
import type { PermissionGroup } from '@/types';

interface PermissionTreeProps {
  permissionTree: PermissionGroup[];
  checkedKeys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}

export default function PermissionTree({ permissionTree, checkedKeys, onChange, disabled }: PermissionTreeProps) {
  const treeData = useMemo(() => {
    return permissionTree.map((group) => ({
      title: group.label,
      key: group.key,
      children: group.permissions.map((perm) => ({
        title: perm.label,
        key: perm.key,
      })),
    }));
  }, [permissionTree]);

  // All leaf keys for "Select All"
  const allLeafKeys = useMemo(() => {
    return permissionTree.flatMap((g) => g.permissions.map((p) => p.key));
  }, [permissionTree]);

  const handleCheck = (checked: unknown) => {
    // Tree returns { checked: string[], halfChecked: string[] } when checkStrictly is false
    const keys = Array.isArray(checked) ? checked as string[] : (checked as { checked: string[] }).checked;
    // Only pass leaf keys (permission keys, not group keys)
    const leafKeys = keys.filter((k) => allLeafKeys.includes(k));
    onChange(leafKeys);
  };

  return (
    <Tree
      checkable
      disabled={disabled}
      selectable={false}
      defaultExpandAll
      checkedKeys={checkedKeys}
      onCheck={handleCheck}
      treeData={treeData}
      style={{ background: 'transparent' }}
    />
  );
}
