const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(value: bigint | string | undefined): string {
  const bytes = typeof value === 'bigint' ? value : BigInt(value || '0');
  if (bytes === 0n) return '0 B';

  let scaled = Number(bytes);
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < byteUnits.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const digits = scaled >= 100 || unitIndex === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toLocaleString('vi-VN', { maximumFractionDigits: digits })} ${byteUnits[unitIndex]}`;
}

export function formatDate(value?: string): string {
  if (!value) return 'Không rõ';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}
