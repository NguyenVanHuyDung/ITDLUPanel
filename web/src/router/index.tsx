import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';
import { useAuthStore } from '@/stores/auth';

const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Websites = lazy(() => import('@/pages/Websites'));
const Databases = lazy(() => import('@/pages/Databases'));
const FTP = lazy(() => import('@/pages/FTP'));
const Storage = lazy(() => import('@/pages/Storage'));
const Files = lazy(() => import('@/pages/Files'));
const Docker = lazy(() => import('@/pages/Docker'));
const Monitor = lazy(() => import('@/pages/Monitor'));
const Security = lazy(() => import('@/pages/Security'));
const Firewall = lazy(() => import('@/pages/Firewall'));
const Logs = lazy(() => import('@/pages/Logs'));
const Terminal = lazy(() => import('@/pages/Terminal'));
const Cron = lazy(() => import('@/pages/Cron'));
const AppStore = lazy(() => import('@/pages/AppStore'));
const Settings = lazy(() => import('@/pages/Settings'));
const Users = lazy(() => import('@/pages/Users'));
const WAF = lazy(() => import('@/pages/WAF'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <AuthRoute>
        <AuthLayout />
      </AuthRoute>
    ),
    children: [{ index: true, element: <Login /> }],
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'websites', element: <Websites /> },
      { path: 'databases', element: <Databases /> },
      { path: 'ftp', element: <FTP /> },
      { path: 'storage', element: <Storage /> },
      { path: 'files', element: <Files /> },
      { path: 'docker', element: <Docker /> },
      { path: 'monitor', element: <Monitor /> },
      { path: 'security', element: <Security /> },
      { path: 'firewall', element: <Firewall /> },
      { path: 'logs', element: <Logs /> },
      { path: 'terminal', element: <Terminal /> },
      { path: 'cron', element: <Cron /> },
      { path: 'appstore', element: <AppStore /> },
      { path: 'settings', element: <Settings /> },
      { path: 'users', element: <Users /> },
      { path: 'waf', element: <WAF /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default router;
