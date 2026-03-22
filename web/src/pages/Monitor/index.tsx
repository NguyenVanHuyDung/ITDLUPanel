import { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Spin } from 'antd';
import api from '@/services/api';
import ProcessTable from './ProcessTable';
import HistoricalMonitor from './HistoricalMonitor';

const { Text } = Typography;

const POLL_INTERVAL = 5000;

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
  command: string;
  status: string;
  threads: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Monitor() {
  const [loading, setLoading] = useState(true);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProcesses = useCallback(async (isInitial = false) => {
    try {
      const resp = await api.get('/monitor/processes');
      setProcesses(resp.data.data || []);
    } catch {
      // ignore polling errors
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcesses(true);
  }, [fetchProcesses]);

  useEffect(() => {
    intervalRef.current = setInterval(() => fetchProcesses(), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchProcesses]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <HistoricalMonitor />
      <ProcessTable processes={processes} onRefresh={() => fetchProcesses()} />
    </div>
  );
}
