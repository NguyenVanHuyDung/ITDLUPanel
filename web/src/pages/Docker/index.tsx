import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

export default function Docker() {
  const { t } = useTranslation();
  return (
    <div>
      <Typography.Title level={2}>{t('sidebar.docker')}</Typography.Title>
      <Typography.Text type="secondary">{t('common.coming_soon')}</Typography.Text>
    </div>
  );
}
