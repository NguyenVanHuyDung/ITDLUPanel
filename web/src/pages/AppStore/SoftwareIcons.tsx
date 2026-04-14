import React from 'react';

const R = 7;

function Icon({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx={R} fill={bg} />
      {children}
    </svg>
  );
}

const icons: Record<string, React.ReactNode> = {
  nginx: (
    <Icon bg="#009639">
      <path d="M8 24V8h3.5l8.5 11V8H24v16h-3.5L12 13v11H8z" fill="white" />
    </Icon>
  ),
  apache: (
    <Icon bg="#D22128">
      <path d="M16 6L7 26h4l2-5h6l2 5h4L16 6zm0 7l2.5 6h-5L16 13z" fill="white" />
    </Icon>
  ),
  mysql: (
    <Icon bg="#4479A1">
      <ellipse cx="16" cy="10" rx="8" ry="3" fill="none" stroke="white" strokeWidth="1.8" />
      <path d="M8 10v12c0 1.66 3.58 3 8 3s8-1.34 8-3V10" fill="none" stroke="white" strokeWidth="1.8" />
      <path d="M8 16c0 1.66 3.58 3 8 3s8-1.34 8-3" fill="none" stroke="white" strokeWidth="1.5" opacity="0.5" />
    </Icon>
  ),
  mariadb: (
    <Icon bg="#003545">
      <ellipse cx="16" cy="10" rx="8" ry="3" fill="none" stroke="white" strokeWidth="1.8" />
      <path d="M8 10v12c0 1.66 3.58 3 8 3s8-1.34 8-3V10" fill="none" stroke="white" strokeWidth="1.8" />
      <path d="M8 16c0 1.66 3.58 3 8 3s8-1.34 8-3" fill="none" stroke="white" strokeWidth="1.5" opacity="0.5" />
      <circle cx="16" cy="19" r="2" fill="white" opacity="0.6" />
    </Icon>
  ),
  postgresql: (
    <Icon bg="#336791">
      <ellipse cx="16" cy="10" rx="7" ry="3" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M9 10v11c0 1.66 3.13 3 7 3s7-1.34 7-3V10" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M9 15c0 1.66 3.13 3 7 3s7-1.34 7-3" fill="none" stroke="white" strokeWidth="1.3" opacity="0.5" />
      <path d="M9 20c0 1.66 3.13 3 7 3s7-1.34 7-3" fill="none" stroke="white" strokeWidth="1.3" opacity="0.5" />
    </Icon>
  ),
  php: (
    <Icon bg="#777BB4">
      <text x="16" y="21" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="sans-serif">PHP</text>
    </Icon>
  ),
  phpmyadmin: (
    <Icon bg="#F89C0E">
      <ellipse cx="16" cy="12" rx="7" ry="3" fill="none" stroke="white" strokeWidth="1.8" />
      <path d="M9 12v8c0 1.66 3.13 3 7 3s7-1.34 7-3v-8" fill="none" stroke="white" strokeWidth="1.8" />
      <circle cx="16" cy="18" r="2.5" fill="white" />
      <circle cx="16" cy="18" r="1" fill="#F89C0E" />
    </Icon>
  ),
  nodejs: (
    <Icon bg="#339933">
      <path d="M16 6l8.66 5v10L16 26l-8.66-5V11L16 6z" fill="none" stroke="white" strokeWidth="1.5" />
      <text x="16" y="19" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" fontFamily="sans-serif">JS</text>
    </Icon>
  ),
  redis: (
    <Icon bg="#DC382D">
      <path d="M16 7l9 5.5-9 5.5-9-5.5L16 7z" fill="white" opacity="0.9" />
      <path d="M7 16l9 5.5L25 16v3.5L16 25l-9-5.5V16z" fill="white" opacity="0.45" />
    </Icon>
  ),
  memcached: (
    <Icon bg="#3C7E31">
      <text x="16" y="22" textAnchor="middle" fill="white" fontSize="17" fontWeight="700" fontFamily="sans-serif">M</text>
    </Icon>
  ),
  python: (
    <Icon bg="#3776AB">
      <path d="M16 6c-4 0-6 2-6 4v3h6v1H9c-2 0-4 2-4 5s1.5 5 4 5h3v-3c0-2 1.5-4 4-4h5c2 0 3-1 3-3V10c0-2-2-4-5-4h-3zm-1 2a1 1 0 110 2 1 1 0 010-2z" fill="white" />
      <path d="M16 26c4 0 6-2 6-4v-3h-6v-1h7c2 0 4-2 4-5s-1.5-5-4-5h-3v3c0 2-1.5 4-4 4h-5c-2 0-3 1-3 3v4c0 2 2 4 5 4h3zm1-2a1 1 0 110-2 1 1 0 010 2z" fill="#FFD43B" opacity="0.7" />
    </Icon>
  ),
  docker: (
    <Icon bg="#2496ED">
      <g fill="white">
        <rect x="7" y="14" width="4" height="3.5" rx="0.5" />
        <rect x="12" y="14" width="4" height="3.5" rx="0.5" />
        <rect x="17" y="14" width="4" height="3.5" rx="0.5" />
        <rect x="12" y="10" width="4" height="3.5" rx="0.5" />
        <rect x="17" y="10" width="4" height="3.5" rx="0.5" />
        <rect x="22" y="14" width="3" height="3.5" rx="0.5" />
        <rect x="17" y="6" width="4" height="3.5" rx="0.5" />
      </g>
      <path d="M5 19c2 4 6 6 11 6 7 0 11-4 13-8H5z" fill="white" opacity="0.2" />
    </Icon>
  ),
  mongodb: (
    <Icon bg="#47A248">
      <path d="M16 5c0 0-5 5-5 12 0 5 2.5 8 5 10 2.5-2 5-5 5-10 0-7-5-12-5-12z" fill="white" />
      <line x1="16" y1="8" x2="16" y2="24" stroke="#47A248" strokeWidth="1.5" />
    </Icon>
  ),
  golang: (
    <Icon bg="#00ADD8">
      <text x="16" y="21" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="sans-serif">Go</text>
    </Icon>
  ),
  supervisor: (
    <Icon bg="#4B8BBE">
      <circle cx="16" cy="12" r="4" fill="white" />
      <path d="M8 24c0-4 3.6-7 8-7s8 3 8 7" fill="white" opacity="0.7" />
      <path d="M22 10l3-3M22 14h4M22 10l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </Icon>
  ),
  tomcat: (
    <Icon bg="#F8DC75">
      <circle cx="16" cy="14" r="7" fill="none" stroke="#D4451A" strokeWidth="2" />
      <path d="M13 12c0 0 1.5 1 3 1s3-1 3-1" fill="none" stroke="#D4451A" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="13" cy="11" r="1" fill="#D4451A" />
      <circle cx="19" cy="11" r="1" fill="#D4451A" />
      <path d="M14 7c-1-2-3-2-3-2M18 7c1-2 3-2 3-2" fill="none" stroke="#D4451A" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  ),
  elasticsearch: (
    <Icon bg="#FEC514">
      <circle cx="16" cy="16" r="8" fill="none" stroke="#343741" strokeWidth="2" />
      <path d="M9 13h14M9 19h14" stroke="#343741" strokeWidth="1.5" />
      <rect x="11" y="13" width="10" height="6" fill="#343741" opacity="0.3" rx="1" />
    </Icon>
  ),
  openlitespeed: (
    <Icon bg="#3A7BD5">
      <path d="M18 6l-8 12h6l-2 8 8-12h-6l2-8z" fill="white" />
    </Icon>
  ),
  pureftpd: (
    <Icon bg="#6C757D">
      <path d="M11 19V13H8l6-7 6 7h-3v6h-6z" fill="white" />
      <path d="M21 13v6h3l-6 7-6-7h3v-6h6z" fill="white" opacity="0.45" />
    </Icon>
  ),
  ftp_storage: (
    <Icon bg="#1890FF">
      <path d="M8 10h16v2H8zM8 15h16v2H8zM8 20h16v2H8z" fill="white" opacity="0.6" />
      <path d="M16 7v18M12 9l4-3 4 3M12 23l4 3 4-3" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Icon>
  ),
  s3_storage: (
    <Icon bg="#FF9900">
      <path d="M9 18c0 1.1 3.1 2 7 2s7-.9 7-2" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M9 14c0 1.1 3.1 2 7 2s7-.9 7-2" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M9 10c0 1.1 3.1 2 7 2s7-.9 7-2" fill="none" stroke="white" strokeWidth="1.5" />
      <ellipse cx="16" cy="10" rx="7" ry="2" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M9 10v8M23 10v8" stroke="white" strokeWidth="1.5" />
    </Icon>
  ),
  google_drive: (
    <Icon bg="#4285F4">
      <path d="M11.5 8L6 18h5l5.5-10H11.5z" fill="white" opacity="0.9" />
      <path d="M16.5 8L11 18h10l5.5-10H16.5z" fill="white" opacity="0.6" />
      <path d="M6 18h20v4H6z" fill="white" opacity="0.4" rx="1" />
    </Icon>
  ),
  onedrive: (
    <Icon bg="#0078D4">
      <path d="M12 20c-2.8 0-5-2.2-5-5 0-2.1 1.3-3.9 3.1-4.6C10.7 8.4 12.7 7 15 7c2.8 0 5.1 2 5.7 4.5C22.5 12 24 13.8 24 16c0 2.2-1.8 4-4 4H12z" fill="white" />
    </Icon>
  ),
};

export function getSoftwareIcon(name: string): React.ReactNode {
  return icons[name] ?? (
    <Icon bg="#64748B">
      <circle cx="16" cy="16" r="4" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M16 8v-2M16 26v-2M8 16H6M26 16h-2M10.3 10.3l-1.4-1.4M23.1 23.1l-1.4-1.4M21.7 10.3l1.4-1.4M8.9 23.1l1.4-1.4" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
    </Icon>
  );
}
