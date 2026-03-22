import { create } from 'zustand';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

export interface TaskDetail {
  id: number;
  type: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  log?: string;
  result?: string;
  error?: string;
  created_by?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  duration?: string;
}

export interface TaskSummary {
  running: number;
  pending: number;
  completed: number;
  failed: number;
  total: number;
}

interface TaskState {
  tasks: Record<number, TaskDetail>;
  summary: TaskSummary;
  selectedTaskId: number | null;
  modalOpen: boolean;
  activeTab: 'tasks' | 'messages' | 'log';
  wsConnected: boolean;

  setModalOpen: (open: boolean) => void;
  setActiveTab: (tab: 'tasks' | 'messages' | 'log') => void;
  setSelectedTaskId: (id: number | null) => void;
  updateTask: (task: TaskDetail) => void;
  addTask: (task: TaskDetail) => void;
  removeTask: (id: number) => void;
  fetchSummary: () => Promise<void>;
  fetchRunningTasks: () => Promise<void>;
  fetchAllTasks: (page?: number, perPage?: number, status?: string) => Promise<{ tasks: TaskDetail[]; total: number }>;
  fetchTaskLog: (taskId: number) => Promise<string>;
  cancelTask: (taskId: number) => Promise<void>;
  setWsConnected: (connected: boolean) => void;
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: {},
  summary: { running: 0, pending: 0, completed: 0, failed: 0, total: 0 },
  selectedTaskId: null,
  modalOpen: false,
  activeTab: 'tasks',
  wsConnected: false,

  setModalOpen: (open) => set({ modalOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  updateTask: (task) => {
    set((state) => {
      const newTasks = { ...state.tasks, [task.id]: task };
      const running = Object.values(newTasks).filter(
        (t) => t.status === 'running' || t.status === 'pending'
      ).length;
      return {
        tasks: newTasks,
        summary: { ...state.summary, running, pending: 0 },
      };
    });
  },

  addTask: (task) => {
    set((state) => {
      const newTasks = { ...state.tasks, [task.id]: task };
      const running = Object.values(newTasks).filter(
        (t) => t.status === 'running' || t.status === 'pending'
      ).length;
      return {
        tasks: newTasks,
        summary: { ...state.summary, running, pending: 0 },
      };
    });
  },

  removeTask: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.tasks;
      return { tasks: rest };
    });
  },

  fetchSummary: async () => {
    try {
      const { data: resp } = await api.get<ApiResponse<TaskSummary>>('/tasks/summary');
      set({ summary: resp.data });
    } catch { /* ignore */ }
  },

  fetchRunningTasks: async () => {
    try {
      const { data: resp } = await api.get('/tasks', {
        params: { page: 1, per_page: 50, status: 'running' },
      });
      const runningTasks: TaskDetail[] = resp.data || [];
      const { data: pendingResp } = await api.get('/tasks', {
        params: { page: 1, per_page: 50, status: 'pending' },
      });
      const pendingTasks: TaskDetail[] = pendingResp.data || [];
      const allActive = [...runningTasks, ...pendingTasks];
      const activeIds = new Set(allActive.map((t) => t.id));

      // Find tracked tasks that were running/pending but are no longer active
      const stale = Object.values(get().tasks).filter(
        (t) => (t.status === 'running' || t.status === 'pending') && !activeIds.has(t.id),
      );

      // Re-fetch each stale task to get its final status
      const settled: TaskDetail[] = [];
      for (const s of stale) {
        try {
          const { data: r } = await api.get<ApiResponse<TaskDetail>>(`/tasks/${s.id}`);
          if (r.data) settled.push(r.data);
        } catch { /* task may have been deleted */ }
      }

      set((state) => {
        const newTasks = { ...state.tasks };
        for (const t of [...allActive, ...settled]) {
          newTasks[t.id] = t;
        }
        return { tasks: newTasks };
      });
    } catch { /* ignore */ }
  },

  fetchAllTasks: async (page = 1, perPage = 20, status?: string) => {
    try {
      const params: Record<string, unknown> = { page, per_page: perPage };
      if (status) params.status = status;
      const { data: resp } = await api.get('/tasks', { params });
      return { tasks: resp.data || [], total: resp.pagination?.total || 0 };
    } catch {
      return { tasks: [], total: 0 };
    }
  },

  fetchTaskLog: async (taskId: number) => {
    try {
      const { data: resp } = await api.get<ApiResponse<{ log: string }>>(`/tasks/${taskId}/log`);
      return resp.data.log || '';
    } catch {
      return '';
    }
  },

  cancelTask: async (taskId: number) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      set((state) => {
        const task = state.tasks[taskId];
        if (task) {
          return {
            tasks: {
              ...state.tasks,
              [taskId]: { ...task, status: 'cancelled' as const },
            },
          };
        }
        return {};
      });
      get().fetchSummary();
    } catch { /* ignore */ }
  },
}));
