import { create } from 'zustand';
import api from '@/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CleanupRule {
  id: number;
  name: string;
  cleanup_types: string[];
  mode: 'manual' | 'schedule' | 'threshold';
  schedule?: string;
  threshold_pct?: number;
  enabled: boolean;
  keep_last_log: number;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
  last_run_status?: string;
  last_space_reclaimed?: number;
}

export interface CleanupLog {
  id: number;
  rule_id?: number;
  triggered_by: string;
  started_at: string;
  finished_at?: string;
  space_reclaimed: number;
  items_removed: Record<string, number>;
  errors: string[];
  status: string;
}

export interface CleanupStats {
  disk_total: number;
  disk_used: number;
  disk_free: number;
  disk_percent: number;
  images_size: number;
  containers_size: number;
  volumes_size: number;
  build_cache_size: number;
  images_count: number;
  containers_count: number;
  volumes_count: number;
}

export interface DryRunResult {
  stopped_containers?: { id: string; name: string; created: number; state: string }[];
  dangling_images?: { id: string; tags: string[]; size: number }[];
  unused_volumes?: string[];
  total_reclaimable_bytes: number;
}

export interface CreateRulePayload {
  name: string;
  cleanup_types: string[];
  mode: 'manual' | 'schedule' | 'threshold';
  schedule?: string;
  threshold_pct?: number;
  enabled?: boolean;
  keep_last_log?: number;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface DockerCleanupStore {
  rules: CleanupRule[];
  logs: CleanupLog[];
  logTotal: number;
  stats: CleanupStats | null;
  loading: boolean;

  fetchRules: () => Promise<void>;
  fetchLogs: (page?: number, perPage?: number) => Promise<void>;
  fetchStats: () => Promise<void>;

  createRule: (data: CreateRulePayload) => Promise<void>;
  updateRule: (id: number, data: CreateRulePayload) => Promise<void>;
  deleteRule: (id: number) => Promise<void>;
  runCleanup: (id: number) => Promise<import('./dockerCleanup').CleanupLog>;
  dryRun: (types: string[]) => Promise<DryRunResult>;
  clearLogs: (ruleId: number) => Promise<void>;
}

export const useDockerCleanupStore = create<DockerCleanupStore>((set) => ({
  rules: [],
  logs: [],
  logTotal: 0,
  stats: null,
  loading: false,

  fetchRules: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/docker/cleanup/rules');
      set({ rules: data.data ?? [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchLogs: async (page = 1, perPage = 50) => {
    const { data } = await api.get('/docker/cleanup/logs', { params: { page, per_page: perPage } });
    set({ logs: data.data ?? [], logTotal: data.total ?? 0 });
  },

  fetchStats: async () => {
    const { data } = await api.get('/docker/cleanup/stats');
    set({ stats: data.data ?? null });
  },

  createRule: async (payload) => {
    await api.post('/docker/cleanup/rules', payload);
  },

  updateRule: async (id, payload) => {
    await api.put(`/docker/cleanup/rules/${id}`, payload);
  },

  deleteRule: async (id) => {
    await api.delete(`/docker/cleanup/rules/${id}`);
  },

  runCleanup: async (id) => {
    const { data } = await api.post(`/docker/cleanup/rules/${id}/run`);
    return data.data;
  },

  dryRun: async (types) => {
    const { data } = await api.post('/docker/cleanup/dry-run', { types });
    return data.data;
  },

  clearLogs: async (ruleId) => {
    await api.delete(`/docker/cleanup/logs/${ruleId}`);
  },
}));
