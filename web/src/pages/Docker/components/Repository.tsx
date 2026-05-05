import { usePalette } from '@/hooks/usePalette';
import {
  SafetyOutlined, CloudOutlined, LockOutlined, SettingOutlined,
} from '@ant-design/icons';

const registries = [
  { name: 'Docker Hub', url: 'https://hub.docker.com', desc: 'Official Docker image registry — default for all pull/push operations', isDefault: true },
  { name: 'GitHub Container Registry', url: 'https://ghcr.io', desc: 'GitHub-hosted container images via ghcr.io' },
  { name: 'Google Container Registry', url: 'https://gcr.io', desc: 'Google Cloud container image hosting' },
  { name: 'Amazon ECR Public', url: 'https://gallery.ecr.aws', desc: 'AWS public container image gallery' },
  { name: 'Quay.io', url: 'https://quay.io', desc: 'Red Hat container registry' },
];

export default function Repository() {
  const { p } = usePalette();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Registry Reference */}
      <div style={{ borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden' }}>
        <div style={{
          padding: '10px 16px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CloudOutlined style={{ color: p.accent }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Container Registries</span>
        </div>
        <div style={{ padding: 0 }}>
          {registries.map((reg, i) => (
            <div key={reg.name} style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < registries.length - 1 ? `1px solid ${p.cardBorder}` : 'none',
            }}>
              <SafetyOutlined style={{ fontSize: 16, color: reg.isDefault ? p.green : p.textMuted, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: p.text }}>{reg.name}</span>
                  {reg.isDefault && (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4,
                      background: `${p.green}15`, color: p.green, fontWeight: 500, lineHeight: 1,
                    }}>DEFAULT</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: p.textMuted, marginTop: 2 }}>{reg.desc}</div>
              </div>
              <a href={reg.url} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 11, fontFamily: 'inherit',
                color: p.accent, textDecoration: 'none', flexShrink: 0,
              }}>{reg.url.replace('https://', '')}</a>
            </div>
          ))}
        </div>
      </div>

      {/* Auth Guide */}
      <div style={{ borderRadius: 10, border: `1px solid ${p.cardBorder}`, overflow: 'hidden' }}>
        <div style={{
          padding: '10px 16px', borderBottom: `1px solid ${p.cardBorder}`,
          background: p.headerBg, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <LockOutlined style={{ color: p.accent }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: p.text }}>Private Registry Authentication</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: p.textMuted, lineHeight: 1.8 }}>
            To pull images from a private registry, authenticate via terminal:
          </div>
          <pre style={{
            background: p.headerBg, padding: 12, borderRadius: 8, marginTop: 8,
            fontFamily: 'inherit', fontSize: 12,
            color: p.text, border: `1px solid ${p.cardBorder}`, overflow: 'auto',
          }}>
{`# Docker Hub
docker login

# GitHub Container Registry
docker login ghcr.io -u USERNAME

# Custom registry
docker login registry.example.com`}
          </pre>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.textMuted }}>
            <SettingOutlined />
            To add registry mirrors for faster pulls, go to <strong style={{ color: p.accent }}>Settings → Registry Mirrors</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
