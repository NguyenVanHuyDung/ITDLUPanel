import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  setAuth: (token: string, user: User, permissions?: string[]) => void;
  setAccessToken: (token: string) => void;
  setPermissions: (permissions: string[]) => void;
  hasPermission: (permission: string) => boolean;
  logout: () => void;
}

// Check if a permission matches against a list (supports wildcards)
function checkPermission(perms: string[], permission: string): boolean {
  for (const p of perms) {
    if (p === '*') return true;
    if (p === permission) return true;
    if (p.endsWith('.*')) {
      const prefix = p.slice(0, -2);
      if (permission.startsWith(prefix + '.')) return true;
    }
  }
  return false;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
      setAuth: (token, user, permissions) => set({
        accessToken: token, user, isAuthenticated: true,
        permissions: permissions || [],
      }),
      setAccessToken: (token) => set({ accessToken: token }),
      setPermissions: (permissions) => set({ permissions }),
      hasPermission: (permission) => checkPermission(get().permissions, permission),
      logout: () => set({ accessToken: null, user: null, permissions: [], isAuthenticated: false }),
    }),
    {
      name: 'itdlupanel-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
