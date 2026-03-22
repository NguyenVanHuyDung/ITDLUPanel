/* ──────────────── File helper utilities ──────────────── */

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parentPath(p: string): string {
  if (p === '/') return '/';
  const parts = p.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function joinPath(base: string, name: string): string {
  return `${base === '/' ? '' : base}/${name}`;
}

export function getExtension(filename: string): string {
  if (!filename.includes('.')) return '';
  return filename.split('.').pop()!.toLowerCase();
}

export function octalToPerms(octal: string): boolean[] {
  const digits = octal.padStart(3, '0').split('').map(Number);
  const perms: boolean[] = [];
  for (const d of digits) {
    perms.push(!!(d & 4), !!(d & 2), !!(d & 1));
  }
  return perms;
}

export function permsToOctal(perms: boolean[]): string {
  let result = '';
  for (let i = 0; i < 3; i++) {
    const r = perms[i * 3] ? 4 : 0;
    const w = perms[i * 3 + 1] ? 2 : 0;
    const x = perms[i * 3 + 2] ? 1 : 0;
    result += String(r + w + x);
  }
  return result;
}
