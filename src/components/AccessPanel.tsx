import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileKey2,
  Globe2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserMinus,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AccessAuditResult, DriveFile, DrivePermission, ProjectStorageEntry } from '../types';
import { isInheritedPermission, permissionRisk, summarizeAccessAudit } from '../lib/access-audit';
import { AccessPermissionDialog } from './AccessPermissionDialog';

type Props = {
  projects: ProjectStorageEntry[];
  files: DriveFile[];
  accountEmail?: string;
  audits: Record<string, AccessAuditResult>;
  readOnly: boolean;
  isAuditing: boolean;
  auditProgress: { done: number; total: number };
  nonOwnedCount: number;
  isRemoving?: boolean;
  onAudit: () => void;
  onRevoke: (folderId: string, permission: DrivePermission) => Promise<void>;
};

const roleLabel: Record<string, string> = {
  owner: 'Chủ sở hữu',
  organizer: 'Quản lý',
  fileOrganizer: 'Quản lý nội dung',
  writer: 'Chỉnh sửa',
  commenter: 'Nhận xét',
  reader: 'Xem',
};

const riskLabel = {
  critical: 'Nguy cơ cao',
  high: 'Quyền rộng',
  medium: 'Theo domain',
  safe: 'An toàn',
  unknown: 'Chưa audit',
} as const;

function permissionLabel(permission: DrivePermission): string {
  if (permission.type === 'anyone') {
    return permission.allowFileDiscovery ? 'Công khai trên web' : 'Bất kỳ ai có liên kết';
  }
  if (permission.type === 'domain') return permission.domain || 'Toàn miền';
  return permission.emailAddress || permission.displayName || 'Không rõ người dùng';
}

function permissionKind(permission: DrivePermission): string {
  if (permission.type === 'anyone') return 'Public';
  if (permission.type === 'domain') return 'Domain';
  if (permission.type === 'group') return 'Nhóm';
  if (permission.role === 'owner') return 'Owner';
  return 'Người dùng';
}

function canRevoke(permission: DrivePermission): boolean {
  return permission.role !== 'owner'
    && !permission.deleted
    && !isInheritedPermission(permission);
}

function ownerEmail(file: DriveFile): string | undefined {
  return file.owners?.[0]?.emailAddress;
}

export function AccessPanel({
  projects,
  files,
  accountEmail,
  audits,
  readOnly,
  isAuditing,
  auditProgress,
  nonOwnedCount,
  isRemoving,
  onAudit,
  onRevoke,
}: Props) {
  const [query, setQuery] = useState('');
  const [offboardingEmail, setOffboardingEmail] = useState('');
  const [pending, setPending] = useState<{ folderId: string; projectName: string; permission: DrivePermission }>();

  const taggedProjects = projects.filter((project) => project.tagged);
  const projectById = new Map(taggedProjects.map((project) => [project.folder.id, project]));

  const allPermissions = useMemo(() => {
    return Object.values(audits).flatMap((audit) =>
      audit.permissions.map((permission) => ({ folderId: audit.folderId, permission }))
    );
  }, [audits]);

  const auditedCount = taggedProjects.filter((project) => Boolean(audits[project.folder.id] && !audits[project.folder.id].error)).length;
  const auditComplete = taggedProjects.length > 0 && auditedCount === taggedProjects.length;

  const projectRisk = useMemo(() => {
    return new Map(taggedProjects.map((project) => [
      project.folder.id,
      summarizeAccessAudit(audits[project.folder.id]),
    ]));
  }, [taggedProjects, audits]);

  const criticalProjects = taggedProjects.filter((project) => projectRisk.get(project.folder.id)?.level === 'critical').length;
  const broadProjects = taggedProjects.filter((project) => {
    const level = projectRisk.get(project.folder.id)?.level;
    return level === 'critical' || level === 'high' || level === 'medium';
  }).length;

  const normalizedEmail = offboardingEmail.trim().toLocaleLowerCase('en');
  const offboardingMatches = normalizedEmail
    ? allPermissions.filter(({ permission }) => permission.emailAddress?.toLocaleLowerCase('en') === normalizedEmail)
    : [];

  const ownershipMatches = normalizedEmail
    ? files.filter((file) => ownerEmail(file)?.toLocaleLowerCase('en') === normalizedEmail)
    : [];

  const isCurrentDriveAccount = Boolean(
    normalizedEmail && accountEmail?.toLocaleLowerCase('en') === normalizedEmail
  );

  const offboardingReady = Boolean(
    normalizedEmail
    && auditComplete
    && offboardingMatches.length === 0
    && ownershipMatches.length === 0
  );

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return taggedProjects
      .filter((project) => {
        if (!normalized) return true;
        return project.name.toLocaleLowerCase('vi').includes(normalized)
          || project.client?.toLocaleLowerCase('vi').includes(normalized);
      })
      .sort((a, b) => {
        const rank = { critical: 4, high: 3, medium: 2, safe: 1, unknown: 0 };
        return rank[projectRisk.get(b.folder.id)?.level || 'unknown']
          - rank[projectRisk.get(a.folder.id)?.level || 'unknown'];
      });
  }, [taggedProjects, query, projectRisk]);

  const confirmRevoke = async () => {
    if (!pending) return;
    try {
      await onRevoke(pending.folderId, pending.permission);
      setPending(undefined);
    } catch {
      // Parent surfaces the Drive API error; keep confirmation open for retry.
    }
  };

  return (
    <section className="access-page">
      <div className="access-summary">
        <div>
          <span>Project đã audit</span>
          <strong>{auditedCount}/{taggedProjects.length}</strong>
        </div>
        <div className={criticalProjects ? 'is-danger' : ''}>
          <span>Công khai có quyền sửa</span>
          <strong>{criticalProjects}</strong>
        </div>
        <div className={broadProjects ? 'is-warning' : ''}>
          <span>Project có quyền rộng</span>
          <strong>{broadProjects}</strong>
        </div>
        <div className={nonOwnedCount ? 'is-warning' : ''}>
          <span>File không thuộc sở hữu bạn</span>
          <strong>{nonOwnedCount.toLocaleString('vi-VN')}</strong>
        </div>
      </div>

      <div className="access-toolbar">
        <div>
          <p className="eyebrow"><ShieldAlert size={14} /> Access Audit</p>
          <h2>Quyền truy cập project</h2>
          <p>Audit ở cấp folder project. Quyền kế thừa được đánh dấu riêng và phải xử lý tại folder nguồn.</p>
        </div>
        <button
          className="connect-button"
          type="button"
          disabled={readOnly || isAuditing || taggedProjects.length === 0}
          onClick={onAudit}
        >
          {isAuditing ? <RefreshCw className="spin" size={16} /> : <ShieldAlert size={16} />}
          {isAuditing ? `Đang quét ${auditProgress.done}/${auditProgress.total}` : 'Quét quyền project'}
        </button>
      </div>

      {taggedProjects.length === 0 ? (
        <div className="access-empty">
          <UsersRound size={30} />
          <strong>Chưa có project được thiết lập</strong>
          <span>Vào tab Dự án và đánh dấu folder project trước khi audit quyền.</span>
        </div>
      ) : (
        <>
          <section className="offboarding-card is-expanded">
            <div className="offboarding-card__intro">
              <span className="offboarding-icon"><UserMinus size={19} /></span>
              <div>
                <strong>Offboarding access</strong>
                <span>Rà soát quyền project và ownership Drive theo một email cụ thể.</span>
              </div>
            </div>
            <label className="offboarding-search">
              <Search size={16} />
              <input
                type="email"
                value={offboardingEmail}
                onChange={(event) => setOffboardingEmail(event.target.value)}
                placeholder="email@domain.com"
              />
            </label>

            {normalizedEmail ? (
              <div className="offboarding-result">
                {isCurrentDriveAccount ? (
                  <div className="offboarding-warning">
                    <AlertTriangle size={15} />
                    Email này là tài khoản Google Drive đang kết nối. Clean sẽ không tự thay đổi ownership.
                  </div>
                ) : null}

                <div className="offboarding-checklist">
                  <div className={auditComplete ? 'is-done' : 'is-pending'}>
                    {auditComplete ? <Check size={15} /> : <CircleDashed size={15} />}
                    <span>
                      <strong>Audit đầy đủ project</strong>
                      <small>{auditComplete ? 'Tất cả project đã được kiểm tra.' : `Còn ${taggedProjects.length - auditedCount} project chưa audit.`}</small>
                    </span>
                  </div>
                  <div className={offboardingMatches.length === 0 && auditComplete ? 'is-done' : 'is-pending'}>
                    {offboardingMatches.length === 0 && auditComplete ? <Check size={15} /> : <CircleDashed size={15} />}
                    <span>
                      <strong>Quyền trực tiếp trên project</strong>
                      <small>{offboardingMatches.length === 0 ? 'Không còn quyền trực tiếp được tìm thấy.' : `Còn ${offboardingMatches.length} quyền cần xử lý.`}</small>
                    </span>
                  </div>
                  <div className={ownershipMatches.length === 0 ? 'is-done' : 'is-pending'}>
                    {ownershipMatches.length === 0 ? <Check size={15} /> : <CircleDashed size={15} />}
                    <span>
                      <strong>Ownership file</strong>
                      <small>{ownershipMatches.length === 0 ? 'Không thấy file nào trong snapshot do email này sở hữu.' : `Còn ${ownershipMatches.length} file cần bàn giao ownership.`}</small>
                    </span>
                  </div>
                </div>

                <div className={offboardingReady ? 'offboarding-status is-ready' : 'offboarding-status'}>
                  {offboardingReady ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                  <div>
                    <strong>{offboardingReady ? 'Có thể đóng quyền Drive' : 'Chưa nên đóng offboarding'}</strong>
                    <span>{offboardingReady
                      ? 'Không còn quyền project hoặc ownership được phát hiện trong dữ liệu hiện tại.'
                      : 'Xử lý các mục còn vướng bên dưới rồi audit lại.'}</span>
                  </div>
                </div>

                {offboardingMatches.length > 0 ? (
                  <div className="offboarding-section">
                    <strong>Quyền project còn lại</strong>
                    {offboardingMatches.map(({ folderId, permission }) => {
                      const project = projectById.get(folderId);
                      const inherited = isInheritedPermission(permission);
                      return (
                        <div className="offboarding-match" key={`${folderId}:${permission.id}`}>
                          <div>
                            <strong>{project?.name || folderId}</strong>
                            <span>
                              {roleLabel[permission.role] || permission.role}
                              {inherited ? ' · Kế thừa từ folder cha' : ''}
                            </span>
                          </div>
                          {canRevoke(permission) ? (
                            <button
                              type="button"
                              onClick={() => setPending({
                                folderId,
                                projectName: project?.name || folderId,
                                permission,
                              })}
                            >
                              <UserMinus size={14} /> Gỡ quyền
                            </button>
                          ) : inherited ? (
                            <span className="offboarding-inherited">Xử lý ở folder nguồn</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {ownershipMatches.length > 0 ? (
                  <div className="offboarding-section">
                    <strong>File cần bàn giao ownership</strong>
                    {ownershipMatches.slice(0, 8).map((file) => (
                      <div className="ownership-match" key={file.id}>
                        <div>
                          <FileKey2 size={14} />
                          <span>{file.name}</span>
                        </div>
                        {file.webViewLink ? (
                          <a href={file.webViewLink} target="_blank" rel="noreferrer">
                            Mở Drive <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </div>
                    ))}
                    {ownershipMatches.length > 8 ? (
                      <small>+{ownershipMatches.length - 8} file khác trong snapshot hiện tại</small>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className="access-list-card">
            <div className="access-list-header">
              <div>
                <strong>Project đã thiết lập</strong>
                <span>Ưu tiên project có quyền public/domain trước.</span>
              </div>
              <label className="search-box project-search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm project" />
              </label>
            </div>

            <div className="access-project-list">
              {visibleProjects.map((project) => {
                const audit = audits[project.folder.id];
                const permissions = audit?.permissions ?? [];
                const risk = projectRisk.get(project.folder.id) || summarizeAccessAudit(audit);

                return (
                  <article className={`access-project risk-${risk.level}`} key={project.folder.id}>
                    <div className="access-project__head">
                      <div>
                        <strong>{project.name}</strong>
                        <span>
                          {project.client || project.folder.name}
                          {risk.inheritedCount > 0 ? ` · ${risk.inheritedCount} quyền kế thừa` : ''}
                        </span>
                      </div>
                      {!audit ? (
                        <span className="access-state">Chưa audit</span>
                      ) : audit.error ? (
                        <span className="access-state is-error"><AlertTriangle size={13} /> Lỗi</span>
                      ) : risk.level === 'safe' ? (
                        <span className="access-state is-safe"><CheckCircle2 size={13} /> An toàn</span>
                      ) : (
                        <span className={`access-state is-${risk.level}`}>
                          {risk.level === 'critical' || risk.level === 'high' ? <Globe2 size={13} /> : <ShieldAlert size={13} />}
                          {riskLabel[risk.level]}
                        </span>
                      )}
                    </div>

                    {audit?.error ? (
                      <div className="access-error">{audit.error}</div>
                    ) : permissions.length > 0 ? (
                      <div className="permission-list">
                        {permissions.map((permission) => {
                          const inherited = isInheritedPermission(permission);
                          const riskLevel = permissionRisk(permission);
                          return (
                            <div className="permission-row" key={permission.id}>
                              <span className={`permission-type is-${permission.type} risk-${riskLevel}`}>{permissionKind(permission)}</span>
                              <div className="permission-person">
                                <strong>{permissionLabel(permission)}</strong>
                                <span>
                                  {roleLabel[permission.role] || permission.role}
                                  {inherited ? ' · Kế thừa' : ''}
                                  {permission.expirationTime ? ` · hết hạn ${new Date(permission.expirationTime).toLocaleDateString('vi-VN')}` : ''}
                                </span>
                              </div>
                              {permission.deleted ? <span className="permission-deleted">Đã xóa</span> : null}
                              {canRevoke(permission) ? (
                                <button
                                  className="permission-remove"
                                  type="button"
                                  onClick={() => setPending({
                                    folderId: project.folder.id,
                                    projectName: project.name,
                                    permission,
                                  })}
                                >
                                  <Trash2 size={14} /> Gỡ
                                </button>
                              ) : inherited ? (
                                <span className="permission-inherited">Kế thừa</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : audit ? (
                      <div className="permission-empty">Không có quyền bổ sung được trả về cho folder này.</div>
                    ) : (
                      <div className="permission-empty">Bấm “Quét quyền project” để kiểm tra.</div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}

      {pending ? (
        <AccessPermissionDialog
          projectName={pending.projectName}
          permission={pending.permission}
          isRemoving={isRemoving}
          onCancel={() => setPending(undefined)}
          onConfirm={confirmRevoke}
        />
      ) : null}
    </section>
  );
}
