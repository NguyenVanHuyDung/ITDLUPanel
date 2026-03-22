import { useEffect, useRef } from 'react';
import { useTaskStore, type TaskDetail } from '@/stores/task';
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';

const RECONNECT_INTERVAL = 5000;
const FALLBACK_POLL_INTERVAL = 5000;

interface WsEvent {
  type: string;
  timestamp: string;
  data: TaskDetail;
}

export function useTaskWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const updateTask = useTaskStore((s) => s.updateTask);
  const fetchSummary = useTaskStore((s) => s.fetchSummary);
  const fetchRunningTasks = useTaskStore((s) => s.fetchRunningTasks);
  const setWsConnected = useTaskStore((s) => s.setWsConnected);

  useEffect(() => {
    mountedRef.current = true;

    const connect = async () => {
      if (!mountedRef.current) return;

      // Ensure fresh token by making a lightweight API call (triggers auto-refresh interceptor if expired)
      let token = useAuthStore.getState().accessToken;
      if (!token) return;
      try {
        await api.get('/tasks/summary');
        // Re-read token in case the interceptor refreshed it
        token = useAuthStore.getState().accessToken;
      } catch {
        startFallbackPolling();
        scheduleReconnect();
        return;
      }
      if (!token || !mountedRef.current) return;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/api/v1/monitor/realtime?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setWsConnected(true);
          stopFallbackPolling();
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const msg: WsEvent = JSON.parse(event.data);
            if (msg.type === 'task_update' && msg.data) {
              updateTask(msg.data);
              fetchSummary();
            }
          } catch { /* ignore non-JSON messages */ }
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setWsConnected(false);
          startFallbackPolling();
          scheduleReconnect();
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        startFallbackPolling();
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_INTERVAL);
    };

    const startFallbackPolling = () => {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(() => {
        if (mountedRef.current) {
          fetchSummary();
          fetchRunningTasks();
        }
      }, FALLBACK_POLL_INTERVAL);
    };

    const stopFallbackPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    // Initial data load
    fetchSummary();
    fetchRunningTasks();

    // Connect WebSocket
    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      stopFallbackPolling();
    };
  }, [updateTask, fetchSummary, fetchRunningTasks, setWsConnected]);
}
