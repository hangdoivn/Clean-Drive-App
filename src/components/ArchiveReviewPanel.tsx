import { Archive, ArrowRight, CheckCircle2, Eye, ShieldCheck, X } from 'lucide-react';
import { formatBytes } from '../lib/format';
import type { ArchiveProjectSummary, ProductionRole, ProjectStorageEntry } from '../types';
import { getRetentionPolicy } from '../lib/production';

type Props = {
  project: ProjectStorageEntry;
  summary: ArchiveProjectSummary;
  onClose: () => void;
  onReviewSafe: (folderId: string) => void;
};

const roleLabel: Record<ProductionRole, string> = {
  source: 'Source / RAW',
  working: 'Working / Edit',
  final: 'Final / Master',
  temporary: 'Temporary / Proxy',
  other: 'Khác',
};

export function ArchiveReviewPanel({ project, summary, onClose, onReviewSafe }: Props) {
  const policy = getRetentionPolicy(summary.retentionPolicyId);
  return (
    <section className="archive-review">
      <div className="archive-review__head">
        <div>
          <p className="eyebrow"><Archive size={14} /> Archive review</p>
          <h2>{project.name}</h2>
          <p>{project.client || project.folder.name} · {policy.label} · Preview chỉ dựa trên metadata, không đọc nội dung file.</p>
        </div>
        <button type="button" className="archive-close" onClick={onClose} aria-label="Đóng archive review"><X size={18} /></button>
      </div>

      <div className="archive-kpis">
        <div>
          <span>Hiện tại</span>
          <strong>{formatBytes(summary.totalBytes)}</strong>
          <small>{summary.totalFiles.toLocaleString('vi-VN')} file</small>
        </div>
        <div className="is-after">
          <span>Sau cleanup an toàn</span>
          <strong>{formatBytes(summary.projectedBytes)}</strong>
          <small>Không tính Source/Working review</small>
        </div>
        <div className="is-recoverable">
          <span>Có thể thu hồi</span>
          <strong>{formatBytes(summary.safeRecoverableBytes)}</strong>
          <small>{summary.safeRecoverableCount.toLocaleString('vi-VN')} file an toàn hơn</small>
        </div>
      </div>

      <div className="archive-role-grid">
        {summary.roles.map((item) => (
          <div className={`archive-role is-${item.role}`} key={item.role}>
            <span>{roleLabel[item.role]}</span>
            <strong>{formatBytes(item.bytes)}</strong>
            <small>{item.count.toLocaleString('vi-VN')} file</small>
          </div>
        ))}
      </div>

      <div className="archive-review__policy">
        <div><ShieldCheck size={16} /><span><strong>Final/Master</strong> được giữ mặc định.</span></div>
        <div><Eye size={16} /><span><strong>Source</strong> review sau {Math.round(policy.sourceReviewDays / 30)} tháng · <strong>Working</strong> sau {Math.round(policy.workingReviewDays / 30)} tháng.</span></div>
        <div><CheckCircle2 size={16} /><span><strong>Temporary/Proxy</strong> từ {policy.temporaryCleanupDays} ngày + duplicate dư mới vào safe recoverable.</span></div>
      </div>

      {summary.reviewCount > 0 ? (
        <div className="archive-review__note">
          <strong>{formatBytes(summary.reviewBytes)} Source/Working cần review thủ công</strong>
          <span>{summary.reviewCount.toLocaleString('vi-VN')} file có tín hiệu cũ/lớn nhưng Clean không tự đưa vào kế hoạch dọn.</span>
        </div>
      ) : null}

      <div className="archive-review__actions">
        <button type="button" className="secondary-action" onClick={onClose}>Đóng</button>
        <button
          type="button"
          className="primary-action"
          disabled={summary.safeRecoverableCount === 0}
          onClick={() => onReviewSafe(project.folder.id)}
        >
          Xem {summary.safeRecoverableCount.toLocaleString('vi-VN')} file có thể dọn <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}
