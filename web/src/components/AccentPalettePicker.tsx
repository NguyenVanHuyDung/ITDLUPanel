import { useState, useEffect } from 'react';
import { App, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, BgColorsOutlined } from '@ant-design/icons';
import { useAccentStore, listAccentPalettes } from '@/stores/accent';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';

export default function AccentPalettePicker() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const { p, isDark } = usePalette();
  const { paletteId, setPalette } = useAccentStore();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const palettes = listAccentPalettes();

  // Reset applying state when paletteId matches applyingId (success)
  useEffect(() => {
    if (applyingId && applyingId === paletteId) {
      setApplyingId(null);
    }
  }, [paletteId, applyingId]);

  const handlePick = async (id: string) => {
    if (id === paletteId) return;
    setApplyingId(id);
    try {
      await setPalette(id);
      const picked = palettes.find(p => p.id === id);
      message.success(t('settings.accent_palette_applied', { name: picked?.name ?? id }));
    } catch {
      message.error(t('common.error'));
      setApplyingId(null);
    }
  };

  const swatchSize = isMobile ? 60 : 72;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', borderRadius: 8,
        background: `${p.accent}10`, border: `1px solid ${p.accent}30`,
      }}>
        <BgColorsOutlined style={{ color: p.accent, marginTop: 2, fontSize: 16 }} />
        <span style={{ fontSize: 13, color: p.text, lineHeight: 1.5 }}>
          {t('settings.accent_palette_hint')}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile
          ? 'repeat(2, 1fr)'
          : 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: 12,
      }}>
        {palettes.map((palette) => {
          const isActive = paletteId === palette.id;
          const isHovered = hoverId === palette.id;
          const previewColor = isDark ? palette.dark : palette.light;
          const busy = applyingId === palette.id;

          return (
            <button
              key={palette.id}
              type="button"
              onClick={() => handlePick(palette.id)}
              onMouseEnter={() => setHoverId(palette.id)}
              onMouseLeave={() => setHoverId(null)}
              disabled={busy}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 10,
                padding: 14,
                borderRadius: 10,
                background: isDark ? p.rowAlt : p.headerBg,
                border: `2px solid ${isActive ? previewColor : (isHovered ? `${previewColor}80` : p.cardBorder)}`,
                cursor: busy ? 'wait' : 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                position: 'relative',
                opacity: busy ? 0.7 : 1,
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: p.text,
                }}>
                  {palette.name}
                </span>
                {isActive && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22, height: 22,
                    borderRadius: '50%',
                    background: previewColor,
                    color: '#fff',
                    fontSize: 12,
                    flexShrink: 0,
                  }}>
                    <CheckOutlined />
                  </span>
                )}
              </div>

              <div style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                height: swatchSize,
                borderRadius: 8,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `linear-gradient(135deg, ${shift(previewColor, -0.3)} 0%, ${previewColor} 50%, ${shift(previewColor, 0.2)} 100%)`,
                  opacity: 0.85,
                }} />
                <div style={{
                  position: 'relative',
                  display: 'flex', gap: 6, alignItems: 'center',
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(6px)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {busy ? <Spin size="small" /> : t('settings.accent_preview')}
                </div>
              </div>

              <div style={{
                display: 'flex', gap: 6, alignItems: 'center',
                fontSize: 11, color: p.textMuted,
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 4,
                  background: palette.light, border: `1px solid ${p.cardBorder}`,
                }} />
                <code style={{ fontFamily: 'monospace' }}>{palette.light}</code>
                <span style={{ opacity: 0.4 }}>/</span>
                <code style={{ fontFamily: 'monospace' }}>{palette.dark}</code>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shift(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  let r = parseInt(clean.substring(0, 2), 16);
  let g = parseInt(clean.substring(2, 4), 16);
  let b = parseInt(clean.substring(4, 6), 16);
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * (1 + amount));
    g = Math.round(g * (1 + amount));
    b = Math.round(b * (1 + amount));
  }
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(n => n.toString(16).padStart(2, '0')).join('');
}
