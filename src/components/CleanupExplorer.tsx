
import {
  Archive,
  ChevronRight,
  Folder,
  FolderKanban,
  LockKeyhole,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBytes, formatDate } from '../lib/format';
import type { ArchiveProjectSummary, ClassifiedFile, ProjectStorageEntry } from '../types';

export type CleanupExplorerView = 'project' | 'folder' | 'file';

type Props = {
  view: CleanupExplorerView;
  entries: ProjectStorageEntry[];
  files: ClassifiedFile[];
  archiveByProject: Map<string, ArchiveProjectSummary>;
  cleanupBlocked: boolean;
  lastTrash?: { name: string; bytes: bigint; count: number };
  isRestoring?: boolean;
  onViewChange: (view: CleanupExplorerView) => void;
  onOpenProjectFiles: (folderId: string) => void;
  onOpenFolderFiles: (folderId: string) => void;
  onOpenArchive: (folderId: string) => void;
  onTrashProject: (entry: ProjectStorageEntry) => void;
  onUndoProjectTrash: () => void;
  onManageProjects: () => void;
};

const statusLabel = {
  active: 'Đang chạy',
  delivered: 'Đã bàn giao',
  archive: 'Lưu trữ',
} as const;

function latestActivity(files: ClassifiedFile[]): string | undefined {
  let latest = '';
  for (const file of files) {
    const value = file.viewedByMeTime || file.modifiedTime;
    if (value && (!latest || value > latest)) latest = value;
  }
  return latest || undefined;
}

export function CleanupExplorer({
  view,
  entries,
  files,
  archiveByProject,
  cleanupBlocked,
  lastTrash,
  isRestoring,
  onViewChange,
  onOpenProjectFiles,
  onOpenFolderFiles,
  onOpenArchive,
  onTrashProject,
  onUndoProjectTrash,
  onManageProjects,
}: Props) {
  const [query, setQuery] = useState('');

  const projectStats = useMemo(() => {
    const map = new Map<string, { last?: string; unowned: number }>();
    for (const file of files) {
      const id = file.project?.folderId;
      if (!id) continue;
      const current = map.get(id) ?? { last: undefined, unowned: 0 };
      const activity = file.viewedByMeTime || file.modifiedTime;
      if (activity && (!current.last || activity > current.last)) current.last = activity;
      if (file.ownedByMe === false) current.unowned += 1;
      map.set(id, current);
    }
    return map;
  }, [files]);

  const folderStats = useMemo(() => {
    const byRoot = new Map<string, ClassifiedFile[]>();
    for (const entry of entries) byRoot.set(entry.folder.id, []);
    for (const file of files) {
      const id = file.project?.folderId;
      if (id && byRoot.has(id)) byRoot.get(id)!.push(file);
    }
    return new Map([...byRoot].map(([id, scoped]) => [id, {
      last: latestActivity(scoped),
      unowned: scoped.filter((file) => file.ownedByMe === false).length,
    }]));
  }, [entries, files]);

  const normalized = query.trim().toLocaleLowerCase('vi');
  const projects = entries
    .filter((entry) => entry.tagged)
    .filter((entry) => entry.bytes > 0n || entry.fileCount > 0)
    .filter((entry) => !normalized
      || entry.name.toLocaleLowerCase('vi').includes(normalized)
      || entry.client?.toLocaleLowerCase('vi').includes(normalized))
    .sort((a, b) => b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0);

  const folders = entries
    .filter((entry) => !normalized
      || entry.name.toLocaleLowerCase('vi').includes(normalized)
      || entry.folder.name.toLocaleLowerCase('vi').includes(normalized)
      || entry.client?.toLocaleLowerCase('vi').includes(normalized))
    .sort((a, b) => b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0);

  const totalProjectBytes = projects.reduce((sum, entry) => sum + entry.bytes, 0n);
  const deliveredBytes = projects
    .filter((entry) => entry.status && entry.status !== 'active')
    .reduce((sum, entry) => sum + entry.bytes, 0n);

  return (
    <section className="cleanup-explorer">
      <div className="explorer-switch" role="tablist" aria-label="Cấp xem dữ liệu">
        <button type="button" className={view === 'project' ? 'is-active' : ''} onClick={() => onViewChange('project')}>
          <FolderKanban size={15} /> Theo dự án
        </button>
        <button type="button" className={view === 'folder' ? 'is-active' : ''} onClick={() => onViewChange('folder')}>
          <Folder size={15} /> Theo folder
        </button>
        <button type="button" className={view === 'file' ? 'is-active' : ''} onClick={() => onViewChange('file')}>
          Theo file
        </button>
      </div>

      {lastTrash ? (
        <div className="project-undo-banner">
          <div>
            <RotateCcw size={16} />
            <span><strong>{lastTrash.name}</strong> vừa được đưa vào thùng rác · {formatBytes(lastTrash.bytes)} · {lastTrash.count.toLocaleString('vi-VN')} file</span>
          </div>
          <button type="button" disabled={isRestoring} onClick={onUndoProjectTrash}>
            {isRestoring ? 'Đang khôi phục…' : 'Khôi phục project'}
          </button>
        </div>
      ) : null}

      {view === 'project' ? (
        <div className="explorer-card">
          <div className="explorer-card__header">
            <div>
              <p className="eyebrow">Dọn theo dự án</p>
              <h2>Dự án đang chiếm dung lượng Drive</h2>
              <span>{projects.length} project · {formatBytes(totalProjectBytes)} · {formatBytes(deliveredBytes)} thuộc project đã qua</span>
            </div>
            <label className="search-box explorer-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm dự án / khách hàng" />
            </label>
          </div>

          {projects.length === 0 ? (
            <div className="empty-state">
              <FolderKanban size={30} />
              <strong>Chưa có folder nào được gắn project</strong>
              <span>Thiết lập project để Clean có thể tổng hợp và dọn theo vòng đời dự án.</span>
              <button type="button" className="secondary-action" onClick={onManageProjects}><Settings2 size={14} /> Thiết lập dự án</button>
            </div>
          ) : (
            <div className="project-clean-list">
              <div className="project-clean-row project-clean-head">
                <span>Dự án</span><span>Trạng thái</span><span>Dung lượng</span><span>Có thể thu hồi</span><span>Hoạt động cuối</span><span />
              </div>
              {projects.map((entry) => {
                const summary = archiveByProject.get(entry.folder.id);
                const stats = projectStats.get(entry.folder.id);
                const active = entry.status === 'active';
                const canTrashWhole = Boolean(
                  !cleanupBlocked
                  && entry.status
                  && !active
                  && entry.folder.capabilities?.canTrash !== false
                  && entry.folder.ownedByMe !== false
                  && (stats?.unowned ?? 0) === 0
                );

                return (
                  <article className="project-clean-row" key={entry.folder.id}>
                    <div className="project-clean-name">
                      <span className="project-folder-icon"><FolderKanban size={16} /></span>
                      <div>
                        <strong>{entry.name}</strong>
                        <span>{entry.client || entry.folder.name} · {entry.fileCount.toLocaleString('vi-VN')} file · {entry.folderCount.toLocaleString('vi-VN')} folder</span>
                      </div>
                    </div>
                    <div>
                      {active ? (
                        <span className="project-status is-active"><LockKeyhole size={12} /> Đang chạy</span>
                      ) : (
                        <span className="project-status is-finished"><ShieldCheck size={12} /> {entry.status ? statusLabel[entry.status] : 'Chưa trạng thái'}</span>
                      )}
                    </div>
                    <strong className="project-clean-size">{formatBytes(entry.bytes)}</strong>
                    <div className="project-clean-recover">
                      <strong>{summary ? formatBytes(summary.safeRecoverableBytes) : '—'}</strong>
                      {summary?.reviewCount ? <span>{summary.reviewCount} file cần review</span> : null}
                    </div>
                    <span className="project-clean-activity">{stats?.last || entry.folder.modifiedTime ? formatDate(stats?.last || entry.folder.modifiedTime) : '—'}</span>
                    <div className="project-clean-actions">
                      {summary && !active ? (
                        <button type="button" onClick={() => onOpenArchive(entry.folder.id)}><Archive size={13} /> Review</button>
                      ) : null}
                      <button type="button" onClick={() => onOpenProjectFiles(entry.folder.id)}>Xem file <ChevronRight size={13} /></button>
                      {!active ? (
                        <button
                          type="button"
                          className="is-danger"
                          disabled={!canTrashWhole}
                          title={(stats?.unowned ?? 0) > 0 ? 'Project có file không thuộc sở hữu của tài khoản hiện tại.' : undefined}
                          onClick={() => onTrashProject(entry)}
                        >
                          <Trash2 size={13} /> Đưa cả project vào Trash
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : view === 'folder' ? (
        <div className="explorer-card">
          <div className="explorer-card__header">
            <div>
              <p className="eyebrow">Dung lượng theo folder</p>
              <h2>Folder đang chiếm dung lượng</h2>
              <span>Project folder và top-level folder, sắp xếp từ lớn đến nhỏ.</span>
            </div>
            <label className="search-box explorer-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm folder" />
            </label>
          </div>

          <div className="folder-clean-list">
            {folders.map((entry) => {
              const stats = folderStats.get(entry.folder.id);
              const active = entry.status === 'active';
              return (
                <article className="folder-clean-row" key={entry.folder.id}>
                  <span className="project-folder-icon"><Folder size={16} /></span>
                  <div className="folder-clean-name">
                    <strong>{entry.folder.name}</strong>
                    <span>{entry.tagged ? entry.name + (entry.client ? ' · ' + entry.client : '') : 'Chưa gắn project'}</span>
                  </div>
                  <div className="folder-clean-counts">
                    <span>{entry.fileCount.toLocaleString('vi-VN')} file</span>
                    <span>{entry.folderCount.toLocaleString('vi-VN')} folder</span>
                  </div>
                  <strong>{formatBytes(entry.bytes)}</strong>
                  <span className="project-clean-activity">{stats?.last ? formatDate(stats.last) : '—'}</span>
                  <div className="project-clean-actions">
                    <button type="button" onClick={() => onOpenFolderFiles(entry.folder.id)}>Xem file <ChevronRight size={13} /></button>
                    {entry.tagged && !active ? (
                      <button type="button" className="is-danger" disabled={cleanupBlocked} onClick={() => onTrashProject(entry)}>
                        <Trash2 size={13} /> Dọn project
                      </button>
                    ) : !entry.tagged ? (
                      <button type="button" onClick={onManageProjects}><Settings2 size={13} /> Gắn project</button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
