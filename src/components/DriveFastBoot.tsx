import { Database, HardDrive, RefreshCw } from 'lucide-react';
import { formatBytes } from '../lib/format';
import type { FastDriveSummary } from '../lib/fast-summary';

type Props = { summary: FastDriveSummary };

function bytes(value?: string): bigint {
  return BigInt(value || '0');
}

export function DriveFastBoot({ summary }: Props) {
  const usage = bytes(summary.quota.usage || summary.quota.usageInDrive);
  const limit = summary.quota.limit ? bytes(summary.quota.limit) : undefined;

  return (
    <section className="fast-boot" aria-live="polite">
      <div className="fast-boot__head">
        <span><RefreshCw className="spin" size={18} /></span>
        <div>
          <strong>Đang mở index Drive…</strong>
          <small>
            {summary.email}
            {summary.lastSyncedAt ? ` · ${new Date(summary.lastSyncedAt).toLocaleString('vi-VN')}` : ''}
          </small>
        </div>
      </div>
      <div className="fast-boot__stats">
        <div><HardDrive size={15} /><span>Đã dùng</span><strong>{formatBytes(usage)}{limit ? ` / ${formatBytes(limit)}` : ''}</strong></div>
        <div><Database size={15} /><span>Metadata</span><strong>{summary.fileCount.toLocaleString('vi-VN')} file</strong></div>
        <div><span>Thu hồi</span><strong>{formatBytes(bytes(summary.recoverableBytes))}</strong></div>
        <div><span>Active project</span><strong>{formatBytes(bytes(summary.activeProjectBytes))}</strong></div>
      </div>
    </section>
  );
}
