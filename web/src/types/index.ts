export interface User {
  id: number;
  username: string;
  email?: string;
  role: string;
  totp_enabled: boolean;
  status: number;
  last_login?: string;
  last_ip?: string;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token?: string;
  expires_in?: number;
  user?: User;
  require_2fa?: boolean;
  temp_token?: string;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface SystemInfo {
  system: {
    hostname: string;
    os: string;
    kernel: string;
    uptime: number;
    panel_version: string;
  };
  cpu: { model: string; cores: number; usage_percent: number; load_average: number[] };
  memory: { total: number; used: number; available: number; usage_percent: number };
  disk: { total: number; used: number; available: number; usage_percent: number };
  network: { bytes_sent: number; bytes_recv: number };
  counts: { sites: number; databases: number; ftp_accounts: number; cron_jobs: number; running_tasks: number };
}

export interface Site {
  id: number; name: string; domain: string; path: string;
  webserver: string; php_version?: string; ssl_enabled: boolean;
  ssl_type?: string; ssl_expiry?: string; status: number;
  created_at: string;
}

export interface Database {
  id: number; name: string; db_type: string; username: string;
  charset: string; size: number; created_at: string;
}

export interface FTPAccount {
  id: number; username: string; path: string; status: number; created_at: string;
}

export interface Software {
  name: string; display_name: string; version: string; type: string;
  status: number; service_name?: string;
}

export interface Task {
  id: number; type: string; name: string; status: string;
  progress: number; created_at: string;
}
