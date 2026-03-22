import { useState, useMemo, useCallback } from 'react';
import { Input, Tooltip, Popconfirm, message, Tag } from 'antd';
import {
  SearchOutlined,
  ThunderboltOutlined,
  CloseCircleOutlined,
  CaretUpFilled,
  CaretDownFilled,
  UserOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import api from '@/services/api';

/* ─── Types ──────────────────────────────────────────────────────────── */

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

interface Props {
  processes: ProcessInfo[];
  onRefresh?: () => void;
}

/* ─── Palette ────────────────────────────────────────────────────────── */

const palette = {
  bg: '#0B1120',
  card: '#111827',
  cardBorder: '#1E293B',
  headerBg: '#0F172A',
  rowHover: 'rgba(56, 189, 248, 0.04)',
  rowAlt: 'rgba(15, 23, 42, 0.5)',
  text: '#E2E8F0',
  textMuted: '#64748B',
  textDim: '#475569',
  accent: '#38BDF8',
  accentDim: '#0EA5E9',
  green: '#34D399',
  greenDim: '#059669',
  amber: '#FBBF24',
  amberDim: '#D97706',
  red: '#F87171',
  redDim: '#DC2626',
  purple: '#A78BFA',
  purpleDim: '#7C3AED',
  cyan: '#22D3EE',
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

const userColors = [
  { bg: 'rgba(56,189,248,0.12)', text: '#38BDF8', border: 'rgba(56,189,248,0.25)' },
  { bg: 'rgba(52,211,153,0.12)', text: '#34D399', border: 'rgba(52,211,153,0.25)' },
  { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.25)' },
  { bg: 'rgba(251,191,36,0.12)', text: '#FBBF24', border: 'rgba(251,191,36,0.25)' },
  { bg: 'rgba(248,113,113,0.12)', text: '#F87171', border: 'rgba(248,113,113,0.25)' },
  { bg: 'rgba(34,211,238,0.12)', text: '#22D3EE', border: 'rgba(34,211,238,0.25)' },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getUserColor(user: string) {
  if (user === 'root') return { bg: 'rgba(248,113,113,0.15)', text: '#F87171', border: 'rgba(248,113,113,0.3)' };
  return userColors[hashStr(user) % userColors.length];
}

function cpuColor(v: number): string {
  if (v > 80) return palette.red;
  if (v > 50) return palette.amber;
  if (v > 20) return palette.green;
  return palette.accent;
}

function memColor(v: number): string {
  if (v > 80) return palette.red;
  if (v > 50) return palette.purple;
  if (v > 20) return palette.accent;
  return palette.cyan;
}

function cpuGradient(v: number): string {
  if (v > 80) return 'linear-gradient(90deg, #DC2626 0%, #F87171 100%)';
  if (v > 50) return 'linear-gradient(90deg, #D97706 0%, #FBBF24 100%)';
  if (v > 20) return 'linear-gradient(90deg, #059669 0%, #34D399 100%)';
  return 'linear-gradient(90deg, #0369A1 0%, #38BDF8 100%)';
}

function memGradient(v: number): string {
  if (v > 80) return 'linear-gradient(90deg, #DC2626 0%, #F87171 100%)';
  if (v > 50) return 'linear-gradient(90deg, #7C3AED 0%, #A78BFA 100%)';
  if (v > 20) return 'linear-gradient(90deg, #0284C7 0%, #38BDF8 100%)';
  return 'linear-gradient(90deg, #0891B2 0%, #22D3EE 100%)';
}

function statusLabel(s: string): { label: string; color: string } {
  switch (s) {
    case 'R': case 'running': return { label: 'RUN', color: palette.green };
    case 'S': case 'sleeping': return { label: 'SLP', color: palette.accent };
    case 'D': case 'disk-sleep': return { label: 'IO', color: palette.amber };
    case 'Z': case 'zombie': return { label: 'ZMB', color: palette.red };
    case 'T': case 'stopped': return { label: 'STP', color: palette.amberDim };
    case 'I': case 'idle': return { label: 'IDL', color: palette.textDim };
    default: return { label: s?.slice(0, 3).toUpperCase() || '?', color: palette.textDim };
  }
}

type SortField = 'pid' | 'cpu' | 'memory' | 'name' | 'threads';

/* ─── Inline bar ─────────────────────────────────────────────────────── */

function ResourceBar({ value, gradient, color }: { value: number; gradient: string; color: string }) {
  const w = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: 'rgba(30,41,59,0.8)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${w}%`,
            height: '100%',
            borderRadius: 3,
            background: gradient,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: w > 50 ? `0 0 8px ${color}40` : 'none',
          }}
        />
      </div>
      <span
        style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 11,
          fontWeight: 600,
          color,
          minWidth: 42,
          textAlign: 'right',
        }}
      >
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

/* ─── Sort header ────────────────────────────────────────────────────── */

function SortableHeader({
  label,
  field,
  sortField,
  sortDir,
  onClick,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  onClick: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onClick(field)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: 0,
        color: active ? palette.accent : palette.textMuted,
        fontWeight: active ? 700 : 600,
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        transition: 'color 0.2s',
      }}
    >
      {label}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0, marginTop: -1 }}>
        <CaretUpFilled style={{ fontSize: 8, color: active && sortDir === 'asc' ? palette.accent : palette.textDim }} />
        <CaretDownFilled style={{ fontSize: 8, color: active && sortDir === 'desc' ? palette.accent : palette.textDim, marginTop: -2 }} />
      </span>
    </button>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────── */

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        background: `${color}08`,
        border: `1px solid ${color}20`,
        minWidth: 140,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          fontSize: 14,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: palette.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.text, fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 10, color: palette.textDim }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ═══ MAIN COMPONENT ═════════════════════════════════════════════════ */

export default function ProcessTable({ processes, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const pageSize = 25;

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        return field;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const handleKill = useCallback(async (pid: number) => {
    try {
      await api.post('/monitor/processes/kill', { pid });
      message.success(`Process ${pid} killed`);
      onRefresh?.();
    } catch {
      message.error(`Failed to kill process ${pid}`);
    }
  }, [onRefresh]);

  /* ─── Derived data ─── */
  const filtered = useMemo(() => {
    let data = processes;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.command.toLowerCase().includes(q) ||
          p.user.toLowerCase().includes(q) ||
          String(p.pid).includes(q),
      );
    }
    data = [...data].sort((a, b) => {
      const m = sortDir === 'desc' ? -1 : 1;
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === 'string') return m * (av as string).localeCompare(bv as string);
      return m * ((av as number) - (bv as number));
    });
    return data;
  }, [processes, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  /* ─── Aggregate stats ─── */
  const totalCpu = processes.reduce((s, p) => s + p.cpu, 0);
  const totalMem = processes.reduce((s, p) => s + p.memory, 0);
  const zombieCount = processes.filter((p) => p.status === 'Z' || p.status === 'zombie').length;

  return (
    <div
      style={{
        background: palette.card,
        borderRadius: 12,
        border: `1px solid ${palette.cardBorder}`,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        style={{
          background: palette.headerBg,
          borderBottom: `1px solid ${palette.cardBorder}`,
          padding: '16px 20px',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: palette.green,
                boxShadow: `0 0 8px ${palette.green}60`,
                animation: 'pulse-dot 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: palette.text,
                letterSpacing: '-0.01em',
              }}
            >
              Processes
            </span>
            <Tag
              style={{
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.2)',
                color: palette.accent,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                borderRadius: 6,
                padding: '0 8px',
                lineHeight: '22px',
              }}
            >
              {processes.length}
            </Tag>
            {zombieCount > 0 && (
              <Tag
                style={{
                  background: 'rgba(248,113,113,0.12)',
                  border: '1px solid rgba(248,113,113,0.25)',
                  color: palette.red,
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 6,
                  padding: '0 6px',
                  lineHeight: '20px',
                }}
              >
                {zombieCount} zombie
              </Tag>
            )}
          </div>

          {/* Search */}
          <Input
            prefix={<SearchOutlined style={{ color: palette.textDim }} />}
            placeholder="Filter processes..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            allowClear
            size="small"
            style={{
              width: 220,
              background: 'rgba(15,23,42,0.6)',
              borderColor: palette.cardBorder,
              borderRadius: 8,
              color: palette.text,
              fontSize: 12,
            }}
            styles={{
              input: { background: 'transparent', color: palette.text },
            }}
          />
        </div>

        {/* Stats ribbon */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard
            icon={<ThunderboltOutlined />}
            label="Total CPU"
            value={`${totalCpu.toFixed(1)}%`}
            color={palette.accent}
          />
          <StatCard
            icon="▧"
            label="Total MEM"
            value={`${totalMem.toFixed(1)}%`}
            color={palette.purple}
          />
          <StatCard
            icon={<UserOutlined />}
            label="Users"
            value={String(new Set(processes.map((p) => p.user)).size)}
            color={palette.green}
          />
          <StatCard
            icon={<CodeOutlined />}
            label="Threads"
            value={String(processes.reduce((s, p) => s + (p.threads || 0), 0))}
            color={palette.cyan}
          />
        </div>
      </div>

      {/* ── Table header ────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 50px 1fr 160px 160px 90px 70px 40px',
          gap: 0,
          padding: '8px 16px',
          borderBottom: `1px solid ${palette.cardBorder}`,
          background: 'rgba(15,23,42,0.3)',
        }}
      >
        <SortableHeader label="PID" field="pid" sortField={sortField} sortDir={sortDir} onClick={handleSort} />
        <span style={{ fontSize: 10, color: palette.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
          ST
        </span>
        <SortableHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onClick={handleSort} />
        <SortableHeader label="CPU" field="cpu" sortField={sortField} sortDir={sortDir} onClick={handleSort} />
        <SortableHeader label="Memory" field="memory" sortField={sortField} sortDir={sortDir} onClick={handleSort} />
        <span style={{ fontSize: 10, color: palette.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
          User
        </span>
        <SortableHeader label="THR" field="threads" sortField={sortField} sortDir={sortDir} onClick={handleSort} />
        <span />
      </div>

      {/* ── Rows ────────────────────────────────────────────────── */}
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        {pageData.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: palette.textDim, fontSize: 13 }}>
            No processes match your filter
          </div>
        )}
        {pageData.map((proc, idx) => {
          const st = statusLabel(proc.status);
          const uc = getUserColor(proc.user);
          const isExpanded = expandedPid === proc.pid;
          const isOdd = idx % 2 === 1;

          return (
            <div key={proc.pid}>
              <div
                onClick={() => setExpandedPid(isExpanded ? null : proc.pid)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 50px 1fr 160px 160px 90px 70px 40px',
                  gap: 0,
                  padding: '7px 16px',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: isOdd ? palette.rowAlt : 'transparent',
                  borderBottom: `1px solid rgba(30,41,59,0.4)`,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = palette.rowHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isOdd ? palette.rowAlt : 'transparent'; }}
              >
                {/* PID */}
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    fontSize: 11,
                    color: palette.textMuted,
                    fontWeight: 500,
                  }}
                >
                  {proc.pid}
                </span>

                {/* Status */}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    color: st.color,
                    background: `${st.color}15`,
                    padding: '2px 5px',
                    borderRadius: 4,
                    border: `1px solid ${st.color}30`,
                    textAlign: 'center',
                    width: 'fit-content',
                  }}
                >
                  {st.label}
                </span>

                {/* Name */}
                <Tooltip title={proc.command || proc.name} placement="topLeft">
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: palette.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: 8,
                    }}
                  >
                    {proc.name || '—'}
                  </span>
                </Tooltip>

                {/* CPU bar */}
                <ResourceBar value={proc.cpu} gradient={cpuGradient(proc.cpu)} color={cpuColor(proc.cpu)} />

                {/* MEM bar */}
                <ResourceBar value={proc.memory} gradient={memGradient(proc.memory)} color={memColor(proc.memory)} />

                {/* User badge */}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: uc.text,
                    background: uc.bg,
                    border: `1px solid ${uc.border}`,
                    borderRadius: 5,
                    padding: '2px 7px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 80,
                    display: 'inline-block',
                  }}
                >
                  {proc.user || '—'}
                </span>

                {/* Threads */}
                <span
                  style={{
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    fontSize: 11,
                    color: palette.textDim,
                    textAlign: 'center',
                  }}
                >
                  {proc.threads || '—'}
                </span>

                {/* Kill */}
                <Popconfirm
                  title={`Kill process ${proc.pid}?`}
                  description={`${proc.name} (${proc.user})`}
                  onConfirm={(e) => { e?.stopPropagation(); handleKill(proc.pid); }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText="Kill"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true, size: 'small' }}
                >
                  <button
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: palette.textDim,
                      fontSize: 14,
                      padding: 4,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s, background 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = palette.red; e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = palette.textDim; e.currentTarget.style.background = 'none'; }}
                  >
                    <CloseCircleOutlined />
                  </button>
                </Popconfirm>
              </div>

              {/* Expanded command row */}
              {isExpanded && (
                <div
                  style={{
                    padding: '8px 16px 8px 76px',
                    background: 'rgba(15,23,42,0.6)',
                    borderBottom: `1px solid ${palette.cardBorder}`,
                  }}
                >
                  <div style={{ fontSize: 10, color: palette.textDim, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Full Command
                  </div>
                  <code
                    style={{
                      fontSize: 11,
                      color: palette.accent,
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      wordBreak: 'break-all',
                      lineHeight: 1.5,
                      display: 'block',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${palette.cardBorder}`,
                    }}
                  >
                    {proc.command || proc.name}
                  </code>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer / pagination ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: `1px solid ${palette.cardBorder}`,
          background: palette.headerBg,
        }}
      >
        <span style={{ fontSize: 11, color: palette.textDim }}>
          {filtered.length === processes.length
            ? `${processes.length} processes`
            : `${filtered.length} of ${processes.length} processes`}
        </span>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageIdx: number;
              if (totalPages <= 7) {
                pageIdx = i;
              } else if (safePage < 4) {
                pageIdx = i;
              } else if (safePage > totalPages - 5) {
                pageIdx = totalPages - 7 + i;
              } else {
                pageIdx = safePage - 3 + i;
              }
              return (
                <button
                  key={pageIdx}
                  onClick={() => setPage(pageIdx)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: pageIdx === safePage ? `1px solid ${palette.accent}40` : '1px solid transparent',
                    background: pageIdx === safePage ? `${palette.accent}15` : 'transparent',
                    color: pageIdx === safePage ? palette.accent : palette.textDim,
                    fontSize: 11,
                    fontWeight: pageIdx === safePage ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    transition: 'all 0.15s',
                  }}
                >
                  {pageIdx + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Keyframe for pulse dot */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px ${palette.green}60; }
          50% { opacity: 0.5; box-shadow: 0 0 4px ${palette.green}30; }
        }
      `}</style>
    </div>
  );
}
