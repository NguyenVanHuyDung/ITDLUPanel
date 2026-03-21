import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import router from '@/router';
import '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const theme = {
  token: {
    colorPrimary: '#1565C0',
    colorSuccess: '#4CAF50',
    colorWarning: '#FF9800',
    colorError: '#F44336',
    colorInfo: '#0288D1',
    borderRadius: 6,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={theme}>
        <AntApp>
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
              <Spin size="large" />
            </div>
          }>
            <RouterProvider router={router} />
          </Suspense>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
