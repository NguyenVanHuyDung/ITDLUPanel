import { Card, Col, Progress, Row, Statistic, Typography } from 'antd';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const { Title, Text } = Typography;

const mockChartData = [
  { time: '00:00', cpu: 25, memory: 45 },
  { time: '04:00', cpu: 30, memory: 48 },
  { time: '08:00', cpu: 55, memory: 52 },
  { time: '12:00', cpu: 70, memory: 60 },
  { time: '16:00', cpu: 45, memory: 55 },
  { time: '20:00', cpu: 35, memory: 50 },
  { time: '24:00', cpu: 28, memory: 47 },
];

export default function Dashboard() {
  const { t } = useTranslation();

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>{t('dashboard.title')}</Title>

      {/* Resource Usage Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.cpu_usage')}</Text>
              <Progress
                type="circle"
                percent={32}
                strokeColor="#1565C0"
                size={100}
                style={{ display: 'block', margin: '16px auto' }}
              />
              <Text>4 Cores</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.memory_usage')}</Text>
              <Progress
                type="circle"
                percent={58}
                strokeColor="#2E7D32"
                size={100}
                style={{ display: 'block', margin: '16px auto' }}
              />
              <Text>4.6 / 8 GB</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.disk_usage')}</Text>
              <Progress
                type="circle"
                percent={45}
                strokeColor="#FF9800"
                size={100}
                style={{ display: 'block', margin: '16px auto' }}
              />
              <Text>90 / 200 GB</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">{t('dashboard.network_traffic')}</Text>
              <Progress
                type="circle"
                percent={22}
                strokeColor="#0288D1"
                size={100}
                style={{ display: 'block', margin: '16px auto' }}
              />
              <Text>↑ 1.2 GB ↓ 5.8 GB</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Quick Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.total_sites')}
              value={5}
              prefix={<GlobalOutlined style={{ color: '#1565C0' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.total_databases')}
              value={8}
              prefix={<DatabaseOutlined style={{ color: '#2E7D32' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.total_ftp')}
              value={3}
              prefix={<CloudServerOutlined style={{ color: '#FF9800' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title={t('dashboard.total_cron')}
              value={12}
              prefix={<ClockCircleOutlined style={{ color: '#0288D1' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Resource Chart */}
      <Card title={t('dashboard.resource_usage')} style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={mockChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis unit="%" />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="cpu"
              name={t('dashboard.cpu')}
              stroke="#1565C0"
              fill="#1565C0"
              fillOpacity={0.15}
            />
            <Area
              type="monotone"
              dataKey="memory"
              name={t('dashboard.memory')}
              stroke="#2E7D32"
              fill="#2E7D32"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
