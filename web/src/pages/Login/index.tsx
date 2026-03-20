import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Dropdown, Space } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, TranslationOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';
import type { LoginResponse, ApiResponse } from '@/types';
import type { MenuProps } from 'antd';

const { Title, Text } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { setAuth } = useAuthStore();
  const [form] = Form.useForm();

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponse>>('/auth/login', values);
      const resp = data.data;
      if (resp.require_2fa) {
        setRequires2FA(true);
        setTempToken(resp.temp_token ?? '');
      } else if (resp.access_token && resp.user) {
        setAuth(resp.access_token, resp.user);
        message.success(t('auth.login_success'));
        navigate('/');
      }
    } catch {
      message.error(t('auth.invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (values: { code: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponse>>('/auth/2fa/verify', {
        temp_token: tempToken,
        code: values.code,
      });
      const resp = data.data;
      if (resp.access_token && resp.user) {
        setAuth(resp.access_token, resp.user);
        message.success(t('auth.login_success'));
        navigate('/');
      }
    } catch {
      message.error(t('auth.login_failed'));
    } finally {
      setLoading(false);
    }
  };

  const languageItems: MenuProps['items'] = [
    { key: 'en', label: '🇺🇸 English' },
    { key: 'vi', label: '🇻🇳 Tiếng Việt' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        styles={{ body: { padding: '40px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎓</div>
          <Title level={3} style={{ margin: 0, color: '#1565C0' }}>
            ITDLUPanel
          </Title>
          <Text type="secondary">{t('auth.login_subtitle')}</Text>
        </div>

        {!requires2FA ? (
          <Form form={form} onFinish={handleLogin} layout="vertical" size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: t('auth.username') }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder={t('auth.username')}
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: t('auth.password') }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder={t('auth.password')}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{ height: 44, borderRadius: 8, backgroundColor: '#1565C0' }}
              >
                {loading ? t('auth.logging_in') : t('auth.login_button')}
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Form onFinish={handle2FA} layout="vertical" size="large">
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <SafetyOutlined style={{ fontSize: 32, color: '#1565C0' }} />
              <Title level={5}>{t('auth.two_factor')}</Title>
              <Text type="secondary">{t('auth.two_factor_required')}</Text>
            </div>
            <Form.Item
              name="code"
              rules={[{ required: true, message: t('auth.two_factor_required') }]}
            >
              <Input
                prefix={<SafetyOutlined style={{ color: '#bfbfbf' }} />}
                placeholder={t('auth.two_factor_placeholder')}
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 18 }}
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{ height: 44, borderRadius: 8, backgroundColor: '#1565C0' }}
              >
                {t('auth.two_factor_submit')}
              </Button>
            </Form.Item>
          </Form>
        )}

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Dropdown menu={{ items: languageItems, onClick: ({ key }) => i18n.changeLanguage(key) }}>
            <Space style={{ cursor: 'pointer', color: '#8c8c8c' }}>
              <TranslationOutlined />
              <Text type="secondary">{i18n.language === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
            </Space>
          </Dropdown>
        </div>
      </Card>
    </div>
  );
}
