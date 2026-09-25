import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserMinus,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AccessAuditResult, DrivePermission, ProjectStorageEntry } from '../types';
import { AccessPermissionDialog } from './AccessPermissionDialog';

type Props = {
  projects: ProjectStorageEntry[];
  audits: Record<string, AccessAuditResult>;
  isDemo: boolean;
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
  return permission.role !== 'owner' && !permission.deleted;
}

export function AccessPanel({
  projects,
  audits,
  isDemo,
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

  const publicCount = allPermissions.filter(({ permission }) => permission.type === 'anyone').length;
  const domainCount = allPermissions.filter(({ permission }) => permission.type === 'domain').length;
  const directCount = allPermissions.filter(({ permission }) =>
    (permission.type === 'user' || permission.type === 'group') && permission.role !== 'owner'
  ).length;
  const auditedCount = Object.values(audits).filter((audit) => !audit.error).length;

  const normalizedEmail = offboardingEmail.trim().toLocaleLowerCase('en');
  const offboardingMatches = normalizedEmail
    ? allPermissions.filter(({ permission }) => permission.emailAddress?.toLocaleLowerCase('en') === normalizedEmail)
    : [];

  const visibleProjects = taggedProjects.filter((project) => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    if (!normalized) return true;
    return project.name.toLocaleLowerCase('vi').includes(normalized)
      || project.client?.toLocaleLowerCase('vi').includes(normalized);
  });

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
        <div className={publicCount ? 'is-warning' : ''}>
          <span>Quyền công khai</span>
          <strong>{publicCount}</strong>
        </div>
        <div>
          <span>User / group trực tiếp</span>
          <strong>{directCount}</strong>
          {domainCount > 0 ? <small>{domainCount} quyền domain</small> : null}
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
          <p>Audit ở cấp folder project để kiểm tra nhanh public link, domain, user và group.</p>
        </div>
        <button
          className="connect-button"
          type="button"
          disabled={isDemo || isAuditing || taggedProjects.length === 0}
          onClick={onAudit}
        >
          {isAuditing ? <RefreshCw className="spin" size={16} /> : <ShieldAlert size={16} />}
          {isAuditing ? `Đang quét ${auditProgress.done}/${auditProgress.total}` : 'Quét quyền project'}
        </button>
      </div>

      {isDemo ? (
        <div className="access-empty">
          <ShieldAlert size={30} />
          <strong>Kết nối Google Drive để audit quyền thật</strong>
          <span>Clean không tạo dữ liệu permission mô phỏng.</span>
        </div>
      ) : taggedProjects.length === 0 ? (
        <div className="access-empty">
          <UsersRound size={30} />
          <strong>Chưa có project được thiết lập</strong>
          <span>Vào tab Dự án và đánh dấu folder project trước khi audit quyền.</span>
        </div>
      ) : (
        <>
          <section className="offboarding-card">
            <div className="offboarding-card__intro">
              <span className="offboarding-icon"><UserMinus size={19} /></span>
              <div>
                <strong>Offboarding access</strong>
                <span>Nhập chính xác email nhân sự hoặc freelancer để tìm project họ vẫn còn quyền.</span>
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
                {offboardingMatches.length === 0 ? (
                  <span>Không tìm thấy quyền trực tiếp của email này trong các project đã audit.</span>
                ) : (
                  <>
                    <strong>{offboardingMatches.length} project/quyền cần rà soát</strong>
                    {offboardingMatches.map(({ folderId, permission }) => {
                      const project = projectById.get(folderId);
                      return (
                        <div className="offboarding-match" key={`${folderId}:${permission.id}`}>
                          <div>
                            <strong>{project?.name || folderId}</strong>
                            <span>{roleLabel[permission.role] || permission.role}</span>
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
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            ) : null}
          </section>

          <div className="access-list-card">
            <div className="access-list-header">
              <div>
                <strong>Project đã thiết lập</strong>
                <span>Mỗi permission bên dưới là quyền trực tiếp trên folder project.</span>
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
                const risky = permissions.filter((permission) =>
                  permission.type === 'anyone' || permission.type === 'domain'
                );

                return (
                  <article className="access-project" key={project.folder.id}>
                    <div className="access-project__head">
                      <div>
                        <strong>{project.name}</strong>
                        <span>{project.client || project.folder.name}</span>
                      </div>
                      {!audit ? (
                        <span className="access-state">Chưa audit</span>
                      ) : audit.error ? (
                        <span className="access-state is-error"><AlertTriangle size={13} /> Lỗi</span>
                      ) : risky.length ? (
                        <span className="access-state is-warning"><Globe2 size={13} /> {risky.length} quyền rộng</span>
                      ) : (
                        <span className="access-state is-safe"><CheckCircle2 size={13} /> Đã kiểm tra</span>
                      )}
                    </div>

                    {audit?.error ? (
                      <div className="access-error">{audit.error}</div>
                    ) : permissions.length > 0 ? (
                      <div className="permission-list">
                        {permissions.map((permission) => (
                          <div className="permission-row" key={permission.id}>
                            <span className={`permission-type is-${permission.type}`}>{permissionKind(permission)}</span>
                            <div className="permission-person">
                              <strong>{permissionLabel(permission)}</strong>
                              <span>{roleLabel[permission.role] || permission.role}</span>
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
                            ) : null}
                          </div>
                        ))}
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
