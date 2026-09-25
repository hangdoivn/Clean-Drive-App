import { Archive, Check, FolderKanban, PackageCheck, Pencil, Save, Search, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBytes } from '../lib/format';
import type { ArchiveProjectSummary, CoreProject, ProjectMetadataInput, ProjectStatus, ProjectStorageEntry, RetentionPolicyId } from '../types';
import { mapCoreProjectStatus } from '../lib/hangdoi-core';
import { RETENTION_POLICIES } from '../lib/production';

type ProjectStoragePanelProps = {
  entries: ProjectStorageEntry[];
  unclassifiedBytes: bigint;
  unclassifiedCount: number;
  cleanupByProject: Map<string, { count: number; bytes: bigint }>;
  archiveByProject: Map<string, ArchiveProjectSummary>;
  coreProjects?: CoreProject[];
  coreConnected?: boolean;
  isSaving?: boolean;
  onSave: (folderId: string, metadata: ProjectMetadataInput) => Promise<void>;
  onOpenArchive: (folderId: string) => void;
};

const statusLabel: Record<ProjectStatus, string> = {
  active: 'Đang chạy',
  delivered: 'Đã bàn giao',
  archive: 'Lưu trữ',
};

const statusIcon = {
  active: ShieldCheck,
  delivered: PackageCheck,
  archive: Archive,
};

export function ProjectStoragePanel({
  entries,
  unclassifiedBytes,
  unclassifiedCount,
  cleanupByProject,
  archiveByProject,
  coreProjects = [],
  coreConnected,
  isSaving,
  onSave,
  onOpenArchive,
}: ProjectStoragePanelProps) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<ProjectMetadataInput>({
    name: '',
    client: '',
    status: 'active',
    coreProjectId: undefined,
    retentionPolicyId: 'internal',
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('vi');
    if (!q) return entries;
    return entries.filter((entry) =>
      entry.name.toLocaleLowerCase('vi').includes(q) ||
      entry.client?.toLocaleLowerCase('vi').includes(q) ||
      entry.folder.name.toLocaleLowerCase('vi').includes(q)
    );
  }, [entries, query]);

  const startEdit = (entry: ProjectStorageEntry) => {
    setEditingId(entry.folder.id);
    setDraft({
      name: entry.name || entry.folder.name,
      client: entry.client || '',
      status: entry.status || 'active',
      coreProjectId: entry.coreProjectId,
      retentionPolicyId: entry.retentionPolicyId || 'internal',
    });
  };

  const submit = async (folderId: string) => {
    if (!draft.name.trim()) return;
    try {
      await onSave(folderId, draft);
      setEditingId(undefined);
    } catch {
      // Parent surfaces the Drive API error; keep the editor open for retry.
    }
  };

  return (
    <section className="project-storage">
      <div className="project-storage__summary">
        <div>
          <span>Project đã quản lý</span>
          <strong>{entries.filter((entry) => entry.tagged).length}</strong>
        </div>
        <div>
          <span>Folder cấp cao</span>
          <strong>{entries.length}</strong>
        </div>
        <div>
          <span>File chưa phân loại</span>
          <strong>{unclassifiedCount.toLocaleString('vi-VN')}</strong>
          <small>{formatBytes(unclassifiedBytes)}</small>
        </div>
      </div>

      <div className="project-storage__card">
        <div className="project-storage__header">
          <div>
            <p className="eyebrow"><FolderKanban size={14} /> Project Storage</p>
            <h2>Quản lý dung lượng theo project</h2>
            <p>Đánh dấu folder cấp cao là project. Project “Đang chạy” được Clean bảo vệ khỏi thao tác dọn.</p>
          </div>
          <label className="search-box project-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm project / khách hàng" />
          </label>
        </div>

        <div className="project-list">
          {filtered.map((entry) => {
            const editing = editingId === entry.folder.id;
            const cleanup = cleanupByProject.get(entry.folder.id);
            const archiveSummary = archiveByProject.get(entry.folder.id);
            const canArchiveReview = Boolean(entry.tagged && entry.status !== 'active' && archiveSummary);
            const StatusIcon = entry.status ? statusIcon[entry.status] : FolderKanban;
            return (
              <article className={`project-row${entry.tagged ? ' is-tagged' : ''}`} key={entry.folder.id}>
                <div className="project-row__main">
                  <span className="project-row__icon"><StatusIcon size={19} /></span>
                  <div className="project-row__title">
                    <strong>{entry.name}</strong>
                    <span>
                      {entry.client || entry.folder.name}
                      {entry.coreProjectId ? ' · Project Core' : ''}
                      {entry.tagged ? ` · ${RETENTION_POLICIES[entry.retentionPolicyId || 'internal'].label}` : ''}
                    </span>
                  </div>
                </div>

                <div className="project-row__metric">
                  <strong>{formatBytes(entry.bytes)}</strong>
                  <span>{entry.fileCount.toLocaleString('vi-VN')} file{cleanup && cleanup.count > 0 ? ` · ${cleanup.count} đề xuất` : ''}</span>
                </div>

                <div className="project-row__status">
                  {entry.tagged && entry.status ? (
                    <span className={`project-status is-${entry.status}`}><Check size={13} /> {statusLabel[entry.status]}</span>
                  ) : (
                    <span className="project-status">Chưa thiết lập</span>
                  )}
                </div>

                <div className="project-row__actions">
                  {canArchiveReview ? (
                    <button className="project-review" type="button" onClick={() => onOpenArchive(entry.folder.id)}>
                      Review archive{archiveSummary && archiveSummary.safeRecoverableBytes > 0n ? ` · ${formatBytes(archiveSummary.safeRecoverableBytes)}` : ''}
                    </button>
                  ) : null}
                  <button className="project-edit" type="button" onClick={() => startEdit(entry)}>
                    <Pencil size={15} /> {entry.tagged ? 'Sửa' : 'Thiết lập'}
                  </button>
                </div>

                {editing ? (
                  <div className="project-editor">
                    {coreConnected ? (
                      <label>
                        <span>Project Core</span>
                        <select
                          value={draft.coreProjectId || ''}
                          onChange={(event) => {
                            const id = event.target.value || undefined;
                            const project = coreProjects.find((item) => item.id === id);
                            if (!project) {
                              setDraft({ ...draft, coreProjectId: undefined });
                              return;
                            }
                            setDraft({
                              coreProjectId: project.id,
                              name: project.name,
                              client: project.client?.companyName || '',
                              status: mapCoreProjectStatus(project.currentStatus || project.status),
                              retentionPolicyId: draft.retentionPolicyId || 'internal',
                            });
                          }}
                        >
                          <option value="">Không liên kết Project Core</option>
                          {coreProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.projectCode ? `${project.projectCode} · ` : ''}{project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      <span>Tên project</span>
                      <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                    </label>
                    <label>
                      <span>Khách hàng</span>
                      <input value={draft.client} onChange={(event) => setDraft({ ...draft, client: event.target.value })} placeholder="VD: Akimitsu" />
                    </label>
                    <label>
                      <span>Retention</span>
                      <select
                        value={draft.retentionPolicyId || 'internal'}
                        onChange={(event) => setDraft({ ...draft, retentionPolicyId: event.target.value as RetentionPolicyId })}
                      >
                        {Object.values(RETENTION_POLICIES).map((policy) => (
                          <option key={policy.id} value={policy.id}>{policy.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Trạng thái</span>
                      <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectStatus })}>
                        <option value="active">Đang chạy</option>
                        <option value="delivered">Đã bàn giao</option>
                        <option value="archive">Lưu trữ</option>
                      </select>
                    </label>
                    <div className="project-editor__actions">
                      <button type="button" className="secondary-action" onClick={() => setEditingId(undefined)}><X size={15} /> Hủy</button>
                      <button type="button" className="primary-action" disabled={isSaving || !draft.name.trim()} onClick={() => submit(entry.folder.id)}>
                        <Save size={15} /> {isSaving ? 'Đang lưu…' : 'Lưu project'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
