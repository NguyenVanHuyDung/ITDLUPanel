import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuthStore } from '@/stores/auth';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Tooltip } from 'antd';
import {
  ExpandOutlined, CompressOutlined, PlusOutlined, CloseOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';

type ConnStatus = 'connecting' | 'connected' | 'disconnected';

interface TabSession {
  id: string;
  label: string;
  term: Terminal | null;
  fitAddon: FitAddon | null;
  ws: WebSocket | null;
  status: ConnStatus;
}

let tabCounter = 0;

export default function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { accessToken } = useAuthStore();
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [fullscreen, setFullscreen] = useState(false);
  const tabsRef = useRef<TabSession[]>([]);

  // Keep ref in sync
  tabsRef.current = tabs;

  const createSession = useCallback((): TabSession => {
    tabCounter++;
    return {
      id: `tab-${tabCounter}`,
      label: `Local server`,
      term: null,
      fitAddon: null,
      ws: null,
      status: 'connecting',
    };
  }, []);

  const updateTab = useCallback((tabId: string, updates: Partial<TabSession>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  const initTab = useCallback((tab: TabSession, container: HTMLDivElement) => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
      fontWeight: '400',
      letterSpacing: 0,
      lineHeight: 1.2,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(56, 139, 253, 0.3)',
        selectionForeground: '#c9d1d9',
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
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    // Small delay to let the DOM settle before fitting
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/v1/terminal?token=${accessToken}`
    );
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      updateTab(tab.id, { status: 'connected' });
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
      updateTab(tab.id, { status: 'disconnected' });
    };

    ws.onclose = () => {
      updateTab(tab.id, { status: 'disconnected' });
      term.write('\r\n\x1b[38;5;241m── Connection closed ──\x1b[0m\r\n');
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

    tab.term = term;
    tab.fitAddon = fitAddon;
    tab.ws = ws;
    updateTab(tab.id, { term, fitAddon, ws, status: 'connecting' });
  }, [accessToken, updateTab]);

  // Initialize first tab
  useEffect(() => {
    const firstTab = createSession();
    setTabs([firstTab]);
    setActiveTabId(firstTab.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount active terminal to container
  useEffect(() => {
    if (!termRef.current || !activeTabId) return;
    const container = termRef.current;

    // Clear container
    container.innerHTML = '';

    const tab = tabsRef.current.find(t => t.id === activeTabId);
    if (!tab) return;

    if (!tab.term) {
      // First mount - initialize
      initTab(tab, container);
    } else {
      // Re-attach existing terminal
      tab.term.open(container);
      requestAnimationFrame(() => {
        try { tab.fitAddon?.fit(); } catch { /* ignore */ }
        tab.term?.focus();
      });
    }
  }, [activeTabId, initTab]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const tab = tabsRef.current.find(t => t.id === activeTabId);
      if (tab?.fitAddon) {
        try { tab.fitAddon.fit(); } catch { /* ignore */ }
      }
    };
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (termRef.current) {
      observer = new ResizeObserver(() => {
        const tab = tabsRef.current.find(t => t.id === activeTabId);
        if (tab?.fitAddon) {
          try { tab.fitAddon.fit(); } catch { /* ignore */ }
        }
      });
      observer.observe(termRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [activeTabId]);

  const addTab = useCallback(() => {
    const newTab = createSession();
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [createSession]);

  const closeTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (tab) {
      tab.ws?.close();
      tab.term?.dispose();
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) {
        // Add new tab if all closed
        const newTab = createSession();
        setActiveTabId(newTab.id);
        return [newTab];
      }
      if (tabId === activeTabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeTabId, createSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tabsRef.current.forEach(tab => {
        tab.ws?.close();
        tab.term?.dispose();
      });
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFullscreen(prev => !prev);
    // Re-fit after layout change
    setTimeout(() => {
      const tab = tabsRef.current.find(t => t.id === activeTabId);
      if (tab?.fitAddon) {
        try { tab.fitAddon.fit(); } catch { /* ignore */ }
      }
    }, 100);
  }, [activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const statusDot = (status: ConnStatus) => {
    if (status === 'connected') return <CheckCircleOutlined style={{ color: '#3fb950', fontSize: 10 }} />;
    if (status === 'connecting') return <LoadingOutlined spin style={{ color: '#58a6ff', fontSize: 10 }} />;
    return <CloseCircleOutlined style={{ color: '#f85149', fontSize: 10 }} />;
  };

  const containerStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 999, display: 'flex', flexDirection: 'column', background: '#0d1117' }
    : { height: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', border: '1px solid #30363d' };

  return (
    <div style={containerStyle}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', background: '#161b22',
        borderBottom: '1px solid #30363d', minHeight: 38,
        padding: '0 4px',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 2 }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: isMobile ? '4px 8px' : '6px 12px', cursor: 'pointer',
                  background: isActive ? '#0d1117' : 'transparent',
                  borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
                  borderRadius: '4px 4px 0 0',
                  fontSize: isMobile ? 11 : 12, fontWeight: isActive ? 500 : 400,
                  color: isActive ? '#c9d1d9' : '#8b949e',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
              >
                {statusDot(tab.status)}
                <span>{tab.label}</span>
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => closeTab(tab.id, e)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: isMobile ? 20 : 16, height: isMobile ? 20 : 16, borderRadius: 3, fontSize: 9,
                      color: '#8b949e', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.target as HTMLSpanElement).style.background = '#30363d'; (e.target as HTMLSpanElement).style.color = '#f85149'; }}
                    onMouseLeave={e => { (e.target as HTMLSpanElement).style.background = 'transparent'; (e.target as HTMLSpanElement).style.color = '#8b949e'; }}
                  >
                    <CloseOutlined />
                  </span>
                )}
              </div>
            );
          })}

          {/* Add tab button */}
          <Tooltip title="New terminal">
            <div
              onClick={addTab}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, borderRadius: 4, cursor: 'pointer',
                color: '#8b949e', fontSize: 12, flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#30363d'; (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
            >
              <PlusOutlined />
            </div>
          </Tooltip>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}>
          {activeTab && (
            <span style={{
              fontSize: 11,
              color: activeTab.status === 'connected' ? '#3fb950' : activeTab.status === 'connecting' ? '#58a6ff' : '#f85149',
              padding: '2px 8px',
              background: activeTab.status === 'connected' ? 'rgba(63, 185, 80, 0.1)' : activeTab.status === 'connecting' ? 'rgba(88, 166, 255, 0.1)' : 'rgba(248, 81, 73, 0.1)',
              borderRadius: 10,
              border: `1px solid ${activeTab.status === 'connected' ? 'rgba(63, 185, 80, 0.3)' : activeTab.status === 'connecting' ? 'rgba(88, 166, 255, 0.3)' : 'rgba(248, 81, 73, 0.3)'}`,
            }}>
              {activeTab.status === 'connected' ? '● Connected' : activeTab.status === 'connecting' ? '◌ Connecting...' : '○ Disconnected'}
            </span>
          )}
          <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <div
              onClick={toggleFullscreen}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, borderRadius: 4, cursor: 'pointer',
                color: '#8b949e', fontSize: 14,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#30363d'; (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
            >
              {fullscreen ? <CompressOutlined /> : <ExpandOutlined />}
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Terminal area */}
      <div
        ref={termRef}
        style={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          backgroundColor: '#0d1117',
          padding: '4px 0 0 4px',
        }}
      />
    </div>
  );
}
