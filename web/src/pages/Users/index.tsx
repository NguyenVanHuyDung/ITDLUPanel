import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

export default function Users() {
  const { t } = useTranslation();
  return (
    <div>
      <Typography.Title level={2}>{t('sidebar.users')}</Typography.Title>
      <Typography.Text type="secondary">{t('common.coming_soon')}</Typography.Text>
    </div>
  );
}
