import { Archive, ArrowRight, FolderKanban, ShieldAlert, Tags } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { summarizeAccessAudit } from '../lib/access-audit';
import type { AccessAuditResult, ArchiveProjectSummary, ProjectStorageEntry } from '../types';

type Props = {
  projects: ProjectStorageEntry[];
  archiveByProject: Map<string, ArchiveProjectSummary>;
  audits: Record<string, AccessAuditResult>;
  unclassifiedBytes: bigint;
  unclassifiedCount: number;
  onProjects: () => void;
  onAccess: () => void;
  onArchive: (folderId: string) => void;
};

const statusLabel = {
  active: 'Đang chạy',
  delivered: 'Đã bàn giao',
  archive: 'Lưu trữ',
};

export function StorageHealthPanel({
  projects,
  archiveByProject,
  audits,
  unclassifiedBytes,
  unclassifiedCount,
  onProjects,
  onAccess,
  onArchive,
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

  return (
    <section className="storage-health" aria-label="Storage Health">
      <div className="storage-health__head">
        <div>
          <strong>Storage Health</strong>
          <span>Điểm cần xử lý tiếp theo trong Drive production.</span>
        </div>
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
