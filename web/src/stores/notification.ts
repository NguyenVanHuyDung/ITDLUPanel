import { create } from 'zustand';
import api from '@/services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NotificationChannel {
  id: number;
  type: 'email' | 'telegram';
  name: string;
  config: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationRule {
  id: number;
  channel_id: number;
  event_type: string;
  is_enabled: boolean;
}

export interface NotificationLog {
  id: number;
  event_type: string;
  channel_type: string;
  recipient: string;
  subject: string;
  message: string;
  status: string;
  error: string;
  created_at: string;
}

export interface EventTypeInfo {
  type: string;
  severity: string;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface NotificationState {
  channels: NotificationChannel[];
  rules: NotificationRule[];
  logs: NotificationLog[];
  eventTypes: EventTypeInfo[];
  criticalTypes: string[];
  loading: boolean;

  fetchChannels: () => Promise<void>;
  fetchRules: () => Promise<void>;
  fetchLogs: (page?: number, limit?: number) => Promise<void>;
  fetchEventTypes: () => Promise<void>;
  fetchCriticalTypes: () => Promise<void>;

  createChannel: (ch: Partial<NotificationChannel>) => Promise<void>;
  updateChannel: (id: number, ch: Partial<NotificationChannel>) => Promise<void>;
  deleteChannel: (id: number) => Promise<void>;
  testChannel: (id: number) => Promise<string>;
  testEvent: (channelId: number, eventType: string) => Promise<string>;

  updateRules: (rules: { channel_id: number; event_type: string; is_enabled: boolean }[]) => Promise<void>;
  clearLogs: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  channels: [],
  rules: [],
  logs: [],
  eventTypes: [],
  criticalTypes: [],
  loading: false,

  fetchChannels: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/notifications/channels');
      set({ channels: data.data ?? [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchRules: async () => {
    const { data } = await api.get('/notifications/rules');
    set({ rules: data.data ?? [] });
  },

  fetchLogs: async (page = 1, limit = 50) => {
    const { data } = await api.get('/notifications/logs', { params: { page, per_page: limit } });
    set({ logs: data.data ?? [] });
  },

  fetchEventTypes: async () => {
    const { data } = await api.get('/notifications/event-types');
    set({ eventTypes: data.data ?? [] });
  },

  fetchCriticalTypes: async () => {
    const { data } = await api.get('/notifications/event-types/critical');
    set({ criticalTypes: data.data ?? [] });
  },

  createChannel: async (ch) => {
    await api.post('/notifications/channels', ch);
  },

  updateChannel: async (id, ch) => {
    await api.put(`/notifications/channels/${id}`, ch);
  },

  deleteChannel: async (id) => {
    await api.delete(`/notifications/channels/${id}`);
  },

  testChannel: async (id) => {
    const { data } = await api.post(`/notifications/channels/${id}/test`);
    return data.message || 'Test sent';
  },

  testEvent: async (channelId, eventType) => {
    const { data } = await api.post(`/notifications/channels/${channelId}/test/${eventType}`);
    return data.message || 'Test event sent';
  },

  updateRules: async (rules) => {
    await api.put('/notifications/rules', { rules });
  },

  clearLogs: async () => {
    await api.delete('/notifications/logs');
    set({ logs: [] });
  },
}));
