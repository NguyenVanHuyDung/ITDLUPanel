import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Button } from 'antd';
import { CodeOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth';

interface TerminalPopupProps {
  open: boolean;
  currentPath: string;
  onClose: () => void;
}

const GITHUB_DARK_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  selectionBackground: 'rgba(56, 139, 253, 0.3)',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39d353',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d364',
  brightWhite: '#f0f6fc',
};

const MIN_WIDTH = 400;
const MIN_HEIGHT = 200;

const TerminalPopup: React.FC<TerminalPopupProps> = ({ open, currentPath, onClose }) => {
  const { accessToken } = useAuthStore();
  const [termSize, setTermSize] = useState<{ w: number; h: number }>({ w: 720, h: 420 });
  const [termPos, setTermPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const draggingRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizingRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Center position on open
  useEffect(() => {
    if (open) {
      setTermPos({
        x: Math.max(0, (window.innerWidth - termSize.w) / 2),
        y: Math.max(0, (window.innerHeight - termSize.h) / 2),
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag handlers
  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = {
      offsetX: e.clientX - termPos.x,
      offsetY: e.clientY - termPos.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const newX = ev.clientX - draggingRef.current.offsetX;
      const newY = ev.clientY - draggingRef.current.offsetY;
      setTermPos({
        x: Math.max(0, Math.min(newX, window.innerWidth - termSize.w)),
        y: Math.max(0, Math.min(newY, window.innerHeight - 36)),
      });
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [termPos, termSize.w]);

  // Resize handlers
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: termSize.w,
      startH: termSize.h,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const deltaX = ev.clientX - resizingRef.current.startX;
      const deltaY = ev.clientY - resizingRef.current.startY;
      setTermSize({
        w: Math.max(MIN_WIDTH, resizingRef.current.startW + deltaX),
        h: Math.max(MIN_HEIGHT, resizingRef.current.startH + deltaY),
      });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [termSize]);

  // Mount/unmount terminal and WebSocket
  useEffect(() => {
    if (!open) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;

    const timerId = requestAnimationFrame(() => {
      setTimeout(() => {
        if (disposed || !termContainerRef.current) return;

        term = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          lineHeight: 1.2,
          scrollback: 5000,
          convertEol: true,
          allowProposedApi: true,
          theme: GITHUB_DARK_THEME,
        });

        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.open(termContainerRef.current);
        fitAddon.fit();

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(
          `${protocol}//${window.location.host}/api/v1/terminal?token=${accessToken}&cwd=${encodeURIComponent(currentPath)}`
        );
        wsRef.current = ws;

        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          if (term && fitAddon) {
            const dims = fitAddon.proposeDimensions();
            if (dims) {
              ws?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          }
        };

        ws.onmessage = (event) => {
          if (term) {
            if (event.data instanceof ArrayBuffer) {
              term.write(new Uint8Array(event.data));
            } else {
              term.write(event.data);
            }
          }
        };

        ws.onclose = () => {
          if (term && !disposed) {
            term.write('\r\n\x1b[90m[Connection closed]\x1b[0m\r\n');
          }
        };

        term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }));
          }
        });

        term.onResize(({ cols, rows }) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        });
      }, 80);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(timerId);

      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
        wsRef.current = null;
      }

      if (term) {
        term.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [open, accessToken, currentPath]);

  // Refit on size change
  useEffect(() => {
    if (open && fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
      } catch {
        // ignore fit errors during transitions
      }
    }
  }, [termSize, open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: termPos.x,
        top: termPos.y,
        width: termSize.w,
        height: termSize.h,
        zIndex: 10000,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Title bar */}
      <div
        onMouseDown={handleDragMouseDown}
        style={{
          background: '#1B2A4A',
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          cursor: 'move',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#c9d1d9', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <CodeOutlined style={{ fontSize: 14 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Terminal — {currentPath}
          </span>
        </span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined style={{ color: '#c9d1d9', fontSize: 12 }} />}
          onClick={onClose}
          style={{ minWidth: 24, height: 24 }}
        />
      </div>

      {/* Terminal body */}
      <div
        ref={termContainerRef}
        style={{
          flex: 1,
          background: '#0d1117',
          padding: '4px 0 0 4px',
          overflow: 'hidden',
        }}
      />

      {/* Resize corner handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.5 }}>
          <line x1="11" y1="1" x2="1" y2="11" stroke="#c9d1d9" strokeWidth="1.2" />
          <line x1="11" y1="5" x2="5" y2="11" stroke="#c9d1d9" strokeWidth="1.2" />
          <line x1="11" y1="9" x2="9" y2="11" stroke="#c9d1d9" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
};

export default TerminalPopup;
