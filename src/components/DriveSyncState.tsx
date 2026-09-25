import { Cloud, Database, RefreshCw, ShieldCheck } from 'lucide-react';

type Props = {
  mode: 'restoring' | 'scanning';
  count?: number;
};

export function DriveSyncState({ mode, count = 0 }: Props) {
  const restoring = mode === 'restoring';

  return (
    <section className="drive-sync-state" aria-live="polite" aria-busy="true">
      <div className="drive-sync-state__hero">
        <span className="drive-sync-state__icon">
          {restoring ? <Database size={24} /> : <RefreshCw className="spin" size={24} />}
        </span>
        <div>
          <p className="eyebrow">{restoring ? 'Khôi phục phiên làm việc' : 'Google Drive'}</p>
          <h2>{restoring ? 'Đang kiểm tra dữ liệu lần trước…' : 'Đang đồng bộ Drive…'}</h2>
          <p>
            {restoring
              ? 'Clean đang kiểm tra metadata cache trên thiết bị này trước khi quyết định hiển thị dữ liệu.'
              : count > 0
                ? `Đã đọc ${count.toLocaleString('vi-VN')} file. Clean chỉ cập nhật giao diện sau khi dữ liệu Drive hoàn tất.`
                : 'Đang xác minh tài khoản và chuẩn bị metadata thật từ Google Drive.'}
          </p>
        </div>
      </div>

      <div className="drive-sync-state__trust">
        <span><ShieldCheck size={15} /> Mọi thao tác thay đổi file đang bị khóa</span>
        <span><Cloud size={15} /> Không tải nội dung file về Clean</span>
      </div>

      <div className="drive-sync-skeleton" aria-hidden="true">
        <div className="drive-sync-skeleton__stats">
          <i /><i /><i />
        </div>
        <div className="drive-sync-skeleton__toolbar" />
        <div className="drive-sync-skeleton__table">
          <i /><i /><i /><i /><i />
        </div>
      </div>
    </section>
  );
}
