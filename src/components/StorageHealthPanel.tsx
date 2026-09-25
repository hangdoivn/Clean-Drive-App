import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Clock3,
  FolderKanban,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  Tags,
} from 'lucide-react';
import { formatBytes } from '../lib/format';
import { summarizeAccessAudit } from '../lib/access-audit';
import type { AccessAuditResult, ArchiveProjectSummary, ProjectStorageEntry } from '../types';

type Props = {
  projects: ProjectStorageEntry[];
  archiveByProject: Map<string, ArchiveProjectSummary>;
  audits: Record<string, AccessAuditResult>;
  unclassifiedBytes: bigint;
  unclassifiedCount: number;
  usagePercent?: number;
  lastSyncedAt?: string;
  isCached: boolean;
  onProjects: () => void;
  onAccess: () => void;
  onArchive: (folderId: string) => void;
  onCleanup: () => void;
  onSync: () => void;
};

const statusLabel = {
  active: 'Đang chạy',
  delivered: 'Đã bàn giao',
  archive: 'Lưu trữ',
};

type Signal = {
  id: string;
  tone: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
};

export function StorageHealthPanel({
  projects,
  archiveByProject,
  audits,
  unclassifiedBytes,
  unclassifiedCount,
  usagePercent,
  lastSyncedAt,
  isCached,
  onProjects,
  onAccess,
  onArchive,
  onCleanup,
  onSync,
}: Props) {
  const tagged = projects.filter((project) => project.tagged);
  const archiveQueue = tagged
    .filter((project) => project.status !== 'active')
    .map((project) => ({ project, summary: archiveByProject.get(project.folder.id) }))
    .filter((item): item is { project: ProjectStorageEntry; summary: ArchiveProjectSummary } => Boolean(item.summary))
    .filter((item) => item.summary.safeRecoverableCount > 0 || item.summary.reviewCount > 0)
    .sort((a, b) => b.summary.safeRecoverableBytes > a.summary.safeRecoverableBytes ? 1 : -1);

  const archiveRecoverable = archiveQueue.reduce((sum, item) => sum + item.summary.safeRecoverableBytes, 0n);

  const audited = tagged.filter((project) => audits[project.folder.id] && !audits[project.folder.id].error);
  const broadAccess = audited.filter((project) => {
    const level = summarizeAccessAudit(audits[project.folder.id]).level;
    return level === 'critical' || level === 'high' || level === 'medium';
  });

  const topProjects = tagged
    .slice()
    .sort((a, b) => b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0)
    .slice(0, 4);

  const signals: Signal[] = [];
  const lastSyncAgeHours = lastSyncedAt
    ? (Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000
    : undefined;

  if (isCached) {
    signals.push({
      id: 'cached',
      tone: 'warning',
      title: 'Drive cần xác minh lại',
      detail: 'Đang hiển thị metadata từ lần đồng bộ trước. Write action vẫn bị khóa.',
      action: 'Kết nối lại',
      onClick: onSync,
    });
  } else if (lastSyncAgeHours !== undefined && lastSyncAgeHours > 24) {
    signals.push({
      id: 'stale-sync',
      tone: 'info',
      title: 'Metadata đã hơn 24 giờ',
      detail: 'Đồng bộ Changes API để cập nhật file mới/thay đổi trước khi review.',
      action: 'Đồng bộ',
      onClick: onSync,
    });
  }

  if (usagePercent !== undefined && usagePercent >= 85) {
    signals.push({
      id: 'quota',
      tone: usagePercent >= 95 ? 'critical' : 'warning',
      title: usagePercent >= 95 ? 'Drive gần đầy' : 'Dung lượng Drive đang cao',
      detail: `Tài khoản đang dùng ${usagePercent}% quota được Google báo cáo.`,
      action: 'Xem dọn',
      onClick: onCleanup,
    });
  }

  if (archiveQueue.length > 0) {
    signals.push({
      id: 'archive',
      tone: 'info',
      title: `${archiveQueue.length} project đang chờ archive review`,
      detail: `${formatBytes(archiveRecoverable)} có thể thu hồi an toàn theo retention hiện tại.`,
      action: 'Review',
      onClick: () => onArchive(archiveQueue[0].project.folder.id),
    });
  }

  if (broadAccess.length > 0) {
    signals.push({
      id: 'access-risk',
      tone: 'warning',
      title: `${broadAccess.length} project có quyền truy cập rộng`,
      detail: 'Có public/domain permission cần được rà soát.',
      action: 'Kiểm tra quyền',
      onClick: onAccess,
    });
  } else if (tagged.length > 0 && audited.length < tagged.length) {
    signals.push({
      id: 'audit-gap',
      tone: 'info',
      title: 'Access Audit chưa đầy đủ',
      detail: `${audited.length}/${tagged.length} project đã được audit quyền truy cập.`,
      action: 'Audit',
      onClick: onAccess,
    });
  }

  const visibleSignals = signals.slice(0, 4);

  return (
    <section className="storage-health" aria-label="Storage Health">
      {visibleSignals.length > 0 ? (
        <div className="attention-signals" aria-label="Cần xử lý">
          <div className="attention-signals__head">
            <div>
              <strong>Cần xử lý</strong>
              <span>Tự tính lại sau mỗi lần mở hoặc đồng bộ Drive.</span>
            </div>
            <b>{visibleSignals.length}</b>
          </div>
          <div className="attention-signals__list">
            {visibleSignals.map((signal) => (
              <button
                type="button"
                key={signal.id}
                className={`attention-signal is-${signal.tone}`}
                onClick={signal.onClick}
              >
                <span className="attention-signal__icon">
                  {signal.id === 'quota' ? <HardDrive size={16} />
                    : signal.id === 'archive' ? <Archive size={16} />
                      : signal.id === 'cached' || signal.id === 'stale-sync' ? <RefreshCw size={16} />
                        : signal.id === 'access-risk' || signal.id === 'audit-gap' ? <ShieldAlert size={16} />
                          : <AlertTriangle size={16} />}
                </span>
                <div>
                  <strong>{signal.title}</strong>
                  <span>{signal.detail}</span>
                </div>
                <em>{signal.action} <ArrowRight size={12} /></em>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="storage-health__head">
        <div>
          <strong>Storage Health</strong>
          <span>Điểm cần xử lý tiếp theo trong Drive production.</span>
        </div>
        {lastSyncedAt ? (
          <span className="storage-health__sync"><Clock3 size={12} /> {new Date(lastSyncedAt).toLocaleString('vi-VN')}</span>
        ) : null}
      </div>

      <div className="storage-health__grid">
        <button type="button" className="health-item is-archive" onClick={() => {
          if (archiveQueue[0]) onArchive(archiveQueue[0].project.folder.id);
          else onProjects();
        }}>
          <span className="health-item__icon"><Archive size={17} /></span>
          <div>
            <span>Archive Queue</span>
            <strong>{formatBytes(archiveRecoverable)}</strong>
            <small>{archiveQueue.length} project cần review</small>
          </div>
          <ArrowRight size={14} />
        </button>

        <button type="button" className="health-item" onClick={onProjects}>
          <span className="health-item__icon"><Tags size={17} /></span>
          <div>
            <span>Chưa phân loại</span>
            <strong>{formatBytes(unclassifiedBytes)}</strong>
            <small>{unclassifiedCount.toLocaleString('vi-VN')} file ngoài project</small>
          </div>
          <ArrowRight size={14} />
        </button>

        <button type="button" className={`health-item${broadAccess.length ? ' is-warning' : ''}`} onClick={onAccess}>
          <span className="health-item__icon"><ShieldAlert size={17} /></span>
          <div>
            <span>Access Risk</span>
            <strong>{audited.length ? broadAccess.length : '—'}</strong>
            <small>{audited.length ? `${audited.length}/${tagged.length} project đã audit` : 'Chưa audit quyền project'}</small>
          </div>
          <ArrowRight size={14} />
        </button>

        <div className="health-top-projects">
          <div className="health-top-projects__head">
            <span><FolderKanban size={14} /> Top project theo dung lượng</span>
            <button type="button" onClick={onProjects}>Xem tất cả</button>
          </div>
          <div className="health-top-projects__list">
            {topProjects.length ? topProjects.map((project) => (
              <div key={project.folder.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.status ? statusLabel[project.status] : 'Chưa trạng thái'} · {project.client || project.folder.name}</span>
                </div>
                <b>{formatBytes(project.bytes)}</b>
              </div>
            )) : (
              <span className="health-empty">Chưa có project được thiết lập.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
