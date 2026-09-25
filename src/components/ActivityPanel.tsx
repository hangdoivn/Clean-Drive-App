import { Clock3, FolderKanban, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { formatBytes, formatDate } from '../lib/format';
import type { ActivityLogEntry, ActivityLogType } from '../types';

type Props = {
  entries: ActivityLogEntry[];
};

const typeMeta: Record<ActivityLogType, { label: string; icon: typeof Clock3 }> = {
  sync: { label: 'Đồng bộ', icon: RefreshCw },
  cleanup: { label: 'Dọn dẹp', icon: Trash2 },
  restore: { label: 'Khôi phục', icon: RotateCcw },
  project: { label: 'Project', icon: FolderKanban },
  permission: { label: 'Quyền', icon: ShieldAlert },
};

export function ActivityPanel({ entries }: Props) {
  return (
    <section className="activity-page">
      <div className="activity-head">
        <div>
          <p className="eyebrow"><Clock3 size={14} /> Nhật ký cục bộ</p>
          <h2>Lịch sử thao tác Clean Drive</h2>
          <p>Ghi trên trình duyệt này để dễ truy vết thao tác. Đây không phải audit log pháp lý của Hang Đôi OS.</p>
        </div>
        <span>{entries.length} sự kiện gần nhất</span>
      </div>

      {entries.length === 0 ? (
        <div className="activity-empty">
          <Clock3 size={30} />
          <strong>Chưa có thao tác nào được ghi</strong>
          <span>Sau khi đồng bộ hoặc thay đổi Drive, nhật ký sẽ xuất hiện ở đây.</span>
        </div>
      ) : (
        <div className="activity-list">
          {entries.map((entry) => {
            const meta = typeMeta[entry.type];
            const Icon = meta.icon;
            return (
              <article className="activity-row" key={entry.id}>
                <span className={`activity-icon is-${entry.type}`}><Icon size={17} /></span>
                <div className="activity-main">
                  <div className="activity-title">
                    <strong>{entry.title}</strong>
                    <span>{meta.label}</span>
                  </div>
                  {entry.detail ? <p>{entry.detail}</p> : null}
                  <small>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</small>
                </div>
                <div className="activity-metric">
                  {typeof entry.count === 'number' ? <strong>{entry.count.toLocaleString('vi-VN')} mục</strong> : null}
                  {entry.bytes ? <span>{formatBytes(entry.bytes)}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
