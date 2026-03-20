import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '@/stores/auth';
import { Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';

type ConnStatus = 'connecting' | 'connected' | 'disconnected';

export default function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const { accessToken } = useAuthStore();
  const [status, setStatus] = useState<ConnStatus>('connecting');

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#4fc3f7',
        selectionBackground: '#3a3a5e',
      },
      scrollback: 5000,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/v1/terminal?token=${accessToken}`
    );
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data);
      }
    };

    ws.onerror = () => {
      setStatus('disconnected');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Also observe parent container resize
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    if (termRef.current) resizeObserver.observe(termRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [accessToken]);

  const statusTag = {
    connecting: <Tag icon={<LoadingOutlined spin />} color="processing">Connecting</Tag>,
    connected: <Tag icon={<CheckCircleOutlined />} color="success">Connected</Tag>,
    disconnected: <Tag icon={<CloseCircleOutlined />} color="error">Disconnected</Tag>,
  }[status];

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {statusTag}
      </div>
      <div
        ref={termRef}
        style={{
          flex: 1,
          width: '100%',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#1a1a2e',
        }}
      />
    </div>
  );
}
