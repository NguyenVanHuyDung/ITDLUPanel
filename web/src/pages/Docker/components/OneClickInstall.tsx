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
  command?: string;
}

const defaultApps: AppTemplate[] = [
  // Web Servers
  { name: 'Nginx', image: 'nginx', tag: 'latest', description: 'High-performance HTTP server and reverse proxy', category: 'Web Server', ports: { '80': '80', '443': '443' }, env: [], volumes: [] },
  { name: 'Apache', image: 'httpd', tag: '2.4', description: 'Apache HTTP Server — the most widely used web server', category: 'Web Server', ports: { '80': '80' }, env: [], volumes: [] },
  { name: 'Caddy', image: 'caddy', tag: 'latest', description: 'Fast web server with automatic HTTPS', category: 'Web Server', ports: { '80': '80', '443': '443' }, env: [], volumes: ['/opt/caddy/data:/data', '/opt/caddy/config:/config'] },
  { name: 'Traefik', image: 'traefik', tag: 'v3.0', description: 'Cloud-native reverse proxy and load balancer', category: 'Web Server', ports: { '80': '80', '443': '443', '8080': '8080' }, env: [], volumes: ['/var/run/docker.sock:/var/run/docker.sock'], command: '--api.insecure=true --providers.docker' },
  // Databases
  { name: 'MySQL', image: 'mysql', tag: '8.0', description: 'Popular open-source relational database', category: 'Database', ports: { '3306': '3306' }, env: ['MYSQL_ROOT_PASSWORD=changeme'], volumes: ['/opt/mysql/data:/var/lib/mysql'] },
  { name: 'PostgreSQL', image: 'postgres', tag: '16', description: 'Advanced open-source relational database', category: 'Database', ports: { '5432': '5432' }, env: ['POSTGRES_PASSWORD=changeme'], volumes: ['/opt/postgres/data:/var/lib/postgresql/data'] },
  { name: 'MongoDB', image: 'mongo', tag: '7', description: 'Document-oriented NoSQL database', category: 'Database', ports: { '27017': '27017' }, env: ['MONGO_INITDB_ROOT_USERNAME=admin', 'MONGO_INITDB_ROOT_PASSWORD=changeme'], volumes: ['/opt/mongo/data:/data/db'] },
  { name: 'MariaDB', image: 'mariadb', tag: '11', description: 'MySQL-compatible relational database', category: 'Database', ports: { '3306': '3306' }, env: ['MARIADB_ROOT_PASSWORD=changeme'], volumes: ['/opt/mariadb/data:/var/lib/mysql'] },
  { name: 'ClickHouse', image: 'clickhouse/clickhouse-server', tag: 'latest', description: 'Fast column-oriented OLAP database for analytics', category: 'Database', ports: { '8123': '8123', '9009': '9000' }, env: [], volumes: ['/opt/clickhouse/data:/var/lib/clickhouse'] },
  { name: 'CockroachDB', image: 'cockroachdb/cockroach', tag: 'latest', description: 'Distributed SQL database built for scale', category: 'Database', ports: { '26257': '26257', '8080': '8080' }, env: [], volumes: ['/opt/cockroach/data:/cockroach/cockroach-data'], command: 'start-single-node --insecure' },
  // Cache
  { name: 'Redis', image: 'redis', tag: 'alpine', description: 'In-memory data structure store, cache, and broker', category: 'Cache', ports: { '6379': '6379' }, env: [], volumes: ['/opt/redis/data:/data'] },
  { name: 'Memcached', image: 'memcached', tag: 'alpine', description: 'High-performance memory object caching system', category: 'Cache', ports: { '11211': '11211' }, env: [], volumes: [] },
  { name: 'KeyDB', image: 'eqalpha/keydb', tag: 'latest', description: 'High-performance Redis alternative with multithreading', category: 'Cache', ports: { '6379': '6379' }, env: [], volumes: ['/opt/keydb/data:/data'] },
  // Queue / Message
  { name: 'RabbitMQ', image: 'rabbitmq', tag: '3-management', description: 'Open-source message broker with management UI', category: 'Queue', ports: { '5672': '5672', '15672': '15672' }, env: ['RABBITMQ_DEFAULT_USER=admin', 'RABBITMQ_DEFAULT_PASS=changeme'], volumes: [] },
  { name: 'Kafka', image: 'bitnami/kafka', tag: 'latest', description: 'Distributed event streaming platform', category: 'Queue', ports: { '9092': '9092' }, env: ['KAFKA_CFG_NODE_ID=0', 'KAFKA_CFG_PROCESS_ROLES=controller,broker', 'KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093', 'KAFKA_CFG_CONTROLLER_QUORUM_VOTERS=0@localhost:9093', 'KAFKA_CFG_CONTROLLER_LISTENER_NAMES=CONTROLLER', 'KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT'], volumes: ['/opt/kafka/data:/bitnami/kafka'] },
  { name: 'NATS', image: 'nats', tag: 'latest', description: 'High-performance cloud-native messaging system', category: 'Queue', ports: { '4222': '4222', '8222': '8222' }, env: [], volumes: [] },
  // Storage
  { name: 'MinIO', image: 'minio/minio', tag: 'latest', description: 'S3-compatible object storage', category: 'Storage', ports: { '9000': '9000', '9001': '9001' }, env: ['MINIO_ROOT_USER=admin', 'MINIO_ROOT_PASSWORD=changeme123'], volumes: ['/opt/minio/data:/data'], command: 'server /data --console-address :9001' },
  // Search
  { name: 'Elasticsearch', image: 'elasticsearch', tag: '8.12.0', description: 'Distributed search and analytics engine', category: 'Search', ports: { '9200': '9200', '9300': '9300' }, env: ['discovery.type=single-node', 'xpack.security.enabled=false', 'ES_JAVA_OPTS=-Xms512m -Xmx512m'], volumes: ['/opt/elasticsearch/data:/usr/share/elasticsearch/data'] },
  { name: 'Meilisearch', image: 'getmeili/meilisearch', tag: 'latest', description: 'Lightning-fast, typo-tolerant search engine', category: 'Search', ports: { '7700': '7700' }, env: ['MEILI_ENV=production', 'MEILI_MASTER_KEY=changeme'], volumes: ['/opt/meilisearch/data:/meili_data'] },
  { name: 'Typesense', image: 'typesense/typesense', tag: '27.1', description: 'Fast, typo-tolerant search engine alternative to Algolia', category: 'Search', ports: { '8108': '8108' }, env: [], volumes: ['/opt/typesense/data:/data'], command: '--data-dir /data --api-key=changeme --enable-cors' },
  // DevTools
  { name: 'Portainer', image: 'portainer/portainer-ce', tag: 'latest', description: 'Docker management UI', category: 'DevTools', ports: { '9443': '9443' }, env: [], volumes: ['/var/run/docker.sock:/var/run/docker.sock', '/opt/portainer/data:/data'] },
  { name: 'phpMyAdmin', image: 'phpmyadmin', tag: 'latest', description: 'Web-based MySQL administration tool', category: 'DevTools', ports: { '8080': '80' }, env: ['PMA_ARBITRARY=1'], volumes: [] },
  { name: 'Adminer', image: 'adminer', tag: 'latest', description: 'Lightweight database management tool', category: 'DevTools', ports: { '8081': '8080' }, env: [], volumes: [] },
  { name: 'pgAdmin', image: 'dpage/pgadmin4', tag: 'latest', description: 'Web-based PostgreSQL administration tool', category: 'DevTools', ports: { '5050': '80' }, env: ['PGADMIN_DEFAULT_EMAIL=admin@example.com', 'PGADMIN_DEFAULT_PASSWORD=changeme'], volumes: ['/opt/pgadmin/data:/var/lib/pgadmin'] },
  { name: 'GitLab', image: 'gitlab/gitlab-ce', tag: 'latest', description: 'Complete DevOps platform with Git hosting', category: 'DevTools', ports: { '8929': '80', '8930': '443', '2222': '22' }, env: ['GITLAB_OMNIBUS_CONFIG=external_url "http://localhost:8929"'], volumes: ['/opt/gitlab/config:/etc/gitlab', '/opt/gitlab/logs:/var/log/gitlab', '/opt/gitlab/data:/var/opt/gitlab'] },
  { name: 'Gitea', image: 'gitea/gitea', tag: 'latest', description: 'Lightweight self-hosted Git service', category: 'DevTools', ports: { '3000': '3000', '2222': '22' }, env: [], volumes: ['/opt/gitea/data:/data'] },
  { name: 'Jenkins', image: 'jenkins/jenkins', tag: 'lts', description: 'Open-source automation server for CI/CD', category: 'DevTools', ports: { '8082': '8080', '50000': '50000' }, env: [], volumes: ['/opt/jenkins/data:/var/jenkins_home'] },
  { name: 'Drone CI', image: 'drone/drone', tag: 'latest', description: 'Container-native CI/CD platform', category: 'DevTools', ports: { '8083': '80' }, env: ['DRONE_SERVER_HOST=localhost:8083', 'DRONE_SERVER_PROTO=http', 'DRONE_RPC_SECRET=changeme', 'DRONE_DATABASE_DRIVER=sqlite3', 'DRONE_DATABASE_DATASOURCE=/data/database.sqlite'], volumes: ['/opt/drone/data:/data'] },
  { name: 'SonarQube', image: 'sonarqube', tag: 'community', description: 'Code quality and security analysis platform', category: 'DevTools', ports: { '9000': '9000' }, env: ['SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true'], volumes: ['/opt/sonarqube/data:/opt/sonarqube/data', '/opt/sonarqube/logs:/opt/sonarqube/logs'] },
  { name: 'Vault', image: 'hashicorp/vault', tag: 'latest', description: 'Secret management and data protection', category: 'DevTools', ports: { '8200': '8200' }, env: ['VAULT_DEV_ROOT_TOKEN_ID=changeme', 'SKIP_SETCAP=true', 'VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200'], volumes: ['/opt/vault/data:/vault/file'], command: 'server -dev' },
  // Monitoring
  { name: 'Grafana', image: 'grafana/grafana', tag: 'latest', description: 'Observability dashboards and visualization', category: 'Monitoring', ports: { '3000': '3000' }, env: ['GF_SECURITY_ADMIN_PASSWORD=changeme'], volumes: ['/opt/grafana/data:/var/lib/grafana'] },
  { name: 'Prometheus', image: 'prom/prometheus', tag: 'latest', description: 'Metrics collection and alerting toolkit', category: 'Monitoring', ports: { '9090': '9090' }, env: [], volumes: ['/opt/prometheus/data:/prometheus'] },
  { name: 'Uptime Kuma', image: 'louislam/uptime-kuma', tag: 'latest', description: 'Self-hosted monitoring tool like Uptime Robot', category: 'Monitoring', ports: { '3001': '3001' }, env: [], volumes: ['/opt/uptime-kuma/data:/app/data'] },
  // CMS
  { name: 'WordPress', image: 'wordpress', tag: 'latest', description: 'Popular CMS for building websites', category: 'CMS', ports: { '8084': '80' }, env: ['WORDPRESS_DB_HOST=host.docker.internal:3306', 'WORDPRESS_DB_USER=wordpress', 'WORDPRESS_DB_PASSWORD=changeme', 'WORDPRESS_DB_NAME=wordpress'], volumes: ['/opt/wordpress/html:/var/www/html'] },
  { name: 'Ghost', image: 'ghost', tag: 'latest', description: 'Professional publishing platform and headless CMS', category: 'CMS', ports: { '2368': '2368' }, env: ['NODE_ENV=production', 'url=http://localhost:2368'], volumes: ['/opt/ghost/data:/var/lib/ghost/content'] },
  { name: 'Joomla', image: 'joomla', tag: 'latest', description: 'Flexible CMS for building websites and applications', category: 'CMS', ports: { '8085': '80' }, env: ['JOOMLA_DB_HOST=host.docker.internal:3306', 'JOOMLA_DB_USER=joomla', 'JOOMLA_DB_PASSWORD=changeme'], volumes: ['/opt/joomla/html:/var/www/html'] },
  // Communication
  { name: 'n8n', image: 'n8nio/n8n', tag: 'latest', description: 'Workflow automation tool — open-source Zapier alternative', category: 'Automation', ports: { '5678': '5678' }, env: [], volumes: ['/opt/n8n/data:/home/node/.n8n'] },
  { name: 'Directus', image: 'directus/directus', tag: 'latest', description: 'Instant REST & GraphQL API for any SQL database', category: 'DevTools', ports: { '8055': '8055' }, env: ['SECRET=changeme', 'ADMIN_EMAIL=admin@example.com', 'ADMIN_PASSWORD=changeme'], volumes: ['/opt/directus/uploads:/directus/uploads', '/opt/directus/database:/directus/database'] },
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
  const [installedImages, setInstalledImages] = useState<Set<string>>(new Set());

  const fetchInstalledContainers = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<any[]>>('/docker/containers?all=true');
      const images = new Set<string>();
      (res.data?.data ?? []).forEach((c: any) => {
        const img = (c.image || '').split(':')[0].toLowerCase();
        if (img) images.add(img);
      });
      setInstalledImages(images);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchInstalledContainers(); }, [fetchInstalledContainers]);

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
        command: installApp?.command || '',
      });

      await api.post(`/docker/containers/${values.name}/start`);

      message.success(`${installApp?.name} installed and started!`);
      setInstallOpen(false);
      installForm.resetFields();
      fetchInstalledContainers();
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
        {filtered.map(app => {
          const isInstalled = installedImages.has(app.image.toLowerCase());
          return (
          <div key={app.name} style={{
            padding: 16, borderRadius: 10,
            border: `1px solid ${isInstalled ? p.green + '60' : p.cardBorder}`,
            background: isInstalled ? (isDark ? p.green + '08' : p.green + '06') : 'transparent',
            display: 'flex', flexDirection: 'column', gap: 8,
            transition: 'border-color 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: `${isInstalled ? p.green : p.accent}12`, color: isInstalled ? p.green : p.accent,
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
              {isInstalled ? (
                <span style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: `${p.green}18`, color: p.green,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <AppstoreOutlined /> Installed
                </span>
              ) : (
                <button onClick={() => openInstall(app)} style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: p.accent, color: '#fff', fontSize: 12, fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <RocketOutlined /> Install
                </button>
              )}
            </div>
          </div>
          );
        })}
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
