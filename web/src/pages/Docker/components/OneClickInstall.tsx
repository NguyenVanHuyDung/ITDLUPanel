import { useState, useEffect, useCallback } from 'react';
import { message, Modal, Form, Input, Empty } from 'antd';
import {
  DownloadOutlined, RocketOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePalette } from '@/hooks/usePalette';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { ApiResponse } from '@/types';
import api from '@/services/api';

interface AppTemplate {
  name: string;
  image: string;
  tag: string;
  description: string;
  category: string;
  ports: Record<string, string>;
  env: string[];
  volumes: string[];
}

const defaultApps: AppTemplate[] = [
  { name: 'Nginx', image: 'nginx', tag: 'latest', description: 'High-performance HTTP server and reverse proxy', category: 'Web Server', ports: { '80': '80', '443': '443' }, env: [], volumes: [] },
  { name: 'MySQL', image: 'mysql', tag: '8.0', description: 'Popular open-source relational database', category: 'Database', ports: { '3306': '3306' }, env: ['MYSQL_ROOT_PASSWORD=changeme'], volumes: ['/opt/mysql/data:/var/lib/mysql'] },
  { name: 'PostgreSQL', image: 'postgres', tag: '16', description: 'Advanced open-source relational database', category: 'Database', ports: { '5432': '5432' }, env: ['POSTGRES_PASSWORD=changeme'], volumes: ['/opt/postgres/data:/var/lib/postgresql/data'] },
  { name: 'Redis', image: 'redis', tag: 'alpine', description: 'In-memory data structure store, cache, and broker', category: 'Cache', ports: { '6379': '6379' }, env: [], volumes: ['/opt/redis/data:/data'] },
  { name: 'MongoDB', image: 'mongo', tag: '7', description: 'Document-oriented NoSQL database', category: 'Database', ports: { '27017': '27017' }, env: ['MONGO_INITDB_ROOT_USERNAME=admin', 'MONGO_INITDB_ROOT_PASSWORD=changeme'], volumes: ['/opt/mongo/data:/data/db'] },
  { name: 'MariaDB', image: 'mariadb', tag: '11', description: 'MySQL-compatible relational database', category: 'Database', ports: { '3306': '3306' }, env: ['MARIADB_ROOT_PASSWORD=changeme'], volumes: ['/opt/mariadb/data:/var/lib/mysql'] },
  { name: 'Portainer', image: 'portainer/portainer-ce', tag: 'latest', description: 'Docker management UI', category: 'DevTools', ports: { '9443': '9443', '9000': '9000' }, env: [], volumes: ['/var/run/docker.sock:/var/run/docker.sock', '/opt/portainer/data:/data'] },
  { name: 'phpMyAdmin', image: 'phpmyadmin', tag: 'latest', description: 'Web-based MySQL administration tool', category: 'DevTools', ports: { '8080': '80' }, env: ['PMA_ARBITRARY=1'], volumes: [] },
  { name: 'Adminer', image: 'adminer', tag: 'latest', description: 'Lightweight database management tool', category: 'DevTools', ports: { '8080': '8080' }, env: [], volumes: [] },
  { name: 'Memcached', image: 'memcached', tag: 'alpine', description: 'High-performance memory object caching system', category: 'Cache', ports: { '11211': '11211' }, env: [], volumes: [] },
  { name: 'RabbitMQ', image: 'rabbitmq', tag: '3-management', description: 'Open-source message broker', category: 'Queue', ports: { '5672': '5672', '15672': '15672' }, env: ['RABBITMQ_DEFAULT_USER=admin', 'RABBITMQ_DEFAULT_PASS=changeme'], volumes: [] },
  { name: 'MinIO', image: 'minio/minio', tag: 'latest', description: 'S3-compatible object storage', category: 'Storage', ports: { '9000': '9000', '9001': '9001' }, env: ['MINIO_ROOT_USER=admin', 'MINIO_ROOT_PASSWORD=changeme123'], volumes: ['/opt/minio/data:/data'] },
  { name: 'Elasticsearch', image: 'elasticsearch', tag: '8.12.0', description: 'Distributed search and analytics engine', category: 'Search', ports: { '9200': '9200', '9300': '9300' }, env: ['discovery.type=single-node', 'xpack.security.enabled=false'], volumes: ['/opt/elasticsearch/data:/usr/share/elasticsearch/data'] },
  { name: 'GitLab', image: 'gitlab/gitlab-ce', tag: 'latest', description: 'Complete DevOps platform', category: 'DevTools', ports: { '80': '80', '443': '443', '22': '22' }, env: [], volumes: ['/opt/gitlab/config:/etc/gitlab', '/opt/gitlab/logs:/var/log/gitlab', '/opt/gitlab/data:/var/opt/gitlab'] },
  { name: 'Jenkins', image: 'jenkins/jenkins', tag: 'lts', description: 'Open-source automation server for CI/CD', category: 'DevTools', ports: { '8080': '8080', '50000': '50000' }, env: [], volumes: ['/opt/jenkins/data:/var/jenkins_home'] },
  { name: 'WordPress', image: 'wordpress', tag: 'latest', description: 'Popular CMS for building websites', category: 'CMS', ports: { '8080': '80' }, env: ['WORDPRESS_DB_HOST=mysql:3306', 'WORDPRESS_DB_USER=wordpress', 'WORDPRESS_DB_PASSWORD=changeme'], volumes: [] },
];

const categories = ['All', ...Array.from(new Set(defaultApps.map(a => a.category)))];

export default function OneClickInstall({ onRefresh }: { onRefresh?: () => void }) {
  const { t } = useTranslation();
  const { p, isDark } = usePalette();
  const isMobile = useIsMobile();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [installOpen, setInstallOpen] = useState(false);
  const [installApp, setInstallApp] = useState<AppTemplate | null>(null);
  const [installLoading, setInstallLoading] = useState(false);
  const [installForm] = Form.useForm();

  const filtered = selectedCategory === 'All' ? defaultApps : defaultApps.filter(a => a.category === selectedCategory);

  const openInstall = (app: AppTemplate) => {
    setInstallApp(app);
    setInstallOpen(true);
    installForm.setFieldsValue({
      name: app.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      image: `${app.image}:${app.tag}`,
      ports: Object.entries(app.ports).map(([h, c]) => `${h}:${c}`).join('\n'),
      env: app.env.join('\n'),
      volumes: app.volumes.join('\n'),
    });
  };

  const handleInstall = async (values: { name: string; image: string; ports: string; env: string; volumes: string }) => {
    setInstallLoading(true);
    try {
      const ports: Record<string, string> = {};
      if (values.ports) {
        values.ports.split('\n').filter(Boolean).forEach(line => {
          const [host, container] = line.split(':');
          if (host && container) ports[host.trim()] = container.trim();
        });
      }

      await api.post('/docker/images/pull', { name: values.image });

      await api.post('/docker/containers', {
        name: values.name,
        image: values.image,
        ports,
        env: values.env ? values.env.split('\n').filter(Boolean) : [],
        volumes: values.volumes ? values.volumes.split('\n').filter(Boolean) : [],
        restart_policy: 'unless-stopped',
      });

      await api.post(`/docker/containers/${values.name}/start`);

      message.success(`${installApp?.name} installed and started!`);
      setInstallOpen(false);
      installForm.resetFields();
      onRefresh?.();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Installation failed');
    } finally {
      setInstallLoading(false);
    }
  };

  return (
    <div>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)} style={{
            padding: '5px 14px', borderRadius: 6,
            border: selectedCategory === cat ? 'none' : `1px solid ${p.cardBorder}`,
            background: selectedCategory === cat ? `${p.accent}15` : 'transparent',
            color: selectedCategory === cat ? p.accent : p.textMuted,
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            {cat}
          </button>
        ))}
      </div>

      {/* App Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 12,
      }}>
        {filtered.map(app => (
          <div key={app.name} style={{
            padding: 16, borderRadius: 10,
            border: `1px solid ${p.cardBorder}`,
            display: 'flex', flexDirection: 'column', gap: 8,
            transition: 'border-color 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${p.accent}12`, color: p.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700,
              }}>
                {app.name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: p.text, fontSize: 14 }}>{app.name}</div>
                <div style={{ fontSize: 11, color: p.textMuted }}>{app.image}:{app.tag}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: p.textMuted, flex: 1 }}>{app.description}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: `${p.purple}15`, color: p.purple, fontWeight: 500,
                lineHeight: 1,
              }}>{app.category}</span>
              <button onClick={() => openInstall(app)} style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <RocketOutlined /> Install
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Install Modal */}
      <Modal
        title={`Install ${installApp?.name ?? ''}`}
        open={installOpen}
        onCancel={() => { setInstallOpen(false); installForm.resetFields(); }}
        onOk={() => installForm.submit()}
        confirmLoading={installLoading}
        okText={installLoading ? 'Installing...' : 'Install & Start'}
        width={isMobile ? '95%' : 550}
      >
        <Form form={installForm} layout="vertical" onFinish={handleInstall}>
          <Form.Item name="name" label="Container Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="image" label="Image" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="ports" label="Port Mapping" extra="host:container, one per line">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="env" label="Environment Variables" extra="KEY=VALUE, one per line">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="volumes" label="Volumes" extra="host_path:container_path, one per line">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
