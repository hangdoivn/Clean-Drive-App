import {
  AlertCircle,
  ArrowRight,
  Cloud,
  Database,
  HardDrive,
  Info,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  FolderKanban,
  WandSparkles,
  ShieldAlert,
  Clock3,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { CategoryNav } from './components/CategoryNav';
import { CleanupPanel } from './components/CleanupPanel';
import { ProjectStoragePanel } from './components/ProjectStoragePanel';
import { CoreIntegrationPanel } from './components/CoreIntegrationPanel';
import { AccessPanel } from './components/AccessPanel';
import { ActivityPanel } from './components/ActivityPanel';
import { ArchiveReviewPanel } from './components/ArchiveReviewPanel';
import { DriveSyncState } from './components/DriveSyncState';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FileTable } from './components/FileTable';
import { StatCard } from './components/StatCard';
import {
  classifyFiles,
  DEFAULT_CLEANUP_RULES,
  filterByCategory,
  isCleanupCandidate,
  storageByKind,
  totalBytes,
} from './lib/classify';
import { buildProjectStorage, projectAppProperties } from './lib/projects';
import { applyCoreProjectOverlay, loadCoreContext } from './lib/hangdoi-core';
import { appendActivityLog, loadActivityLog } from './lib/activity-log';
import { buildArchiveSummary, getRetentionPolicy, isArchiveSafeCandidate } from './lib/production';
import { demoSnapshot } from './lib/demo-data';
import { loadLastDriveIndex, saveDriveIndex } from './lib/drive-index';
import { formatBytes } from './lib/format';
import {
  listFilePermissions,
  moveFilesToTrash,
  removeFilePermission,
  restoreFilesFromTrash,
  syncGoogleDrive,
  updateProjectFolderMetadata,
} from './lib/google-drive';
import type {
  AccessAuditResult,
  ActivityLogEntry,
  CategoryId,
  CoreProject,
  CoreSession,
  CleanupRules,
  DriveFile,
  DrivePermission,
  DriveSnapshot,
  FileKind,
  ProjectMetadataInput,
} from './types';

const RULES_STORAGE_KEY = 'hangdoi-clean-drive-rules-v1';
const DUPLICATE_KEEPERS_KEY = 'hangdoi-clean-drive-duplicate-keepers-v1';

const kindLabels: Record<FileKind, string> = {
  video: 'Video',
  'photo-raw': 'Photo RAW',
  image: 'Hình ảnh',
  design: 'Design',
  'editing-project': 'Project edit',
  archive: 'Archive',
  document: 'Tài liệu',
  folder: 'Folder',
  other: 'Khác',
};

function loadRules(): CleanupRules {
  try {
    const raw = window.localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_CLEANUP_RULES;
    const parsed = JSON.parse(raw) as Partial<CleanupRules>;
    return {
      largeFileBytes: Number(parsed.largeFileBytes) || DEFAULT_CLEANUP_RULES.largeFileBytes,
      oldFileDays: Number(parsed.oldFileDays) || DEFAULT_CLEANUP_RULES.oldFileDays,
    };
  } catch {
    return DEFAULT_CLEANUP_RULES;
  }
}

function loadDuplicateKeeperOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(DUPLICATE_KEEPERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

function toBytes(value?: string): bigint {
  return BigInt(value || '0');
}

export function CleanDriveApp() {
  const [snapshot, setSnapshot] = useState<DriveSnapshot>(demoSnapshot);
  const [mode, setMode] = useState<'cleanup' | 'projects' | 'access' | 'activity'>('cleanup');
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectFilterId, setProjectFilterId] = useState<string>();
  const [archiveProjectId, setArchiveProjectId] = useState<string>();
  const [archiveSafeOnly, setArchiveSafeOnly] = useState(false);
  const [rules, setRules] = useState<CleanupRules>(loadRules);
  const [duplicateKeeperOverrides, setDuplicateKeeperOverrides] = useState<Record<string, string>>(loadDuplicateKeeperOverrides);
  const [isDemo, setIsDemo] = useState(true);
  const [isCached, setIsCached] = useState(false);
  const [bootState, setBootState] = useState<'restoring' | 'ready'>('restoring');
  const [syncSummary, setSyncSummary] = useState<string>();
  const [activeCategory, setActiveCategory] = useState<CategoryId>('overview');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'error'>('idle');
  const [scanCount, setScanCount] = useState(0);
  const [message, setMessage] = useState<string>();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanProgress, setCleanProgress] = useState(0);
  const [cleanResult, setCleanResult] = useState<{ succeeded: number; failed: number }>();
  const [lastTrashBatch, setLastTrashBatch] = useState<DriveFile[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [accessAudits, setAccessAudits] = useState<Record<string, AccessAuditResult>>({});
  const [isAuditingAccess, setIsAuditingAccess] = useState(false);
  const [auditProgress, setAuditProgress] = useState({ done: 0, total: 0 });
  const [isRemovingPermission, setIsRemovingPermission] = useState(false);
  const [coreSession, setCoreSession] = useState<CoreSession>();
  const [coreProjects, setCoreProjects] = useState<CoreProject[]>([]);
  const [coreState, setCoreState] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
  const [coreError, setCoreError] = useState<string>();
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(loadActivityLog);


  useEffect(() => {
    let cancelled = false;
    loadLastDriveIndex()
      .then((cached) => {
        if (cancelled) return;
        if (cached?.email && cached.files.length > 0) {
          setSnapshot(cached);
          setIsDemo(false);
          setIsCached(true);
          setSyncSummary(cached.lastSyncedAt ? `Dữ liệu từ ${new Date(cached.lastSyncedAt).toLocaleString('vi-VN')}` : 'Dữ liệu từ lần đồng bộ trước');
          setMessage('Đã khôi phục dữ liệu từ lần đồng bộ trước. Kết nối lại Drive để xác minh thay đổi mới trước khi dọn.');
        }
        setBootState('ready');
      })
      .catch(() => {
        if (!cancelled) setBootState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCoreState('loading');
    loadCoreContext()
      .then(({ session, projects }) => {
        if (cancelled) return;
        setCoreSession(session);
        setCoreProjects(projects);
        setCoreState('connected');
        setCoreError(undefined);
      })
      .catch((error) => {
        if (cancelled) return;
        setCoreState('error');
        setCoreError(error instanceof Error ? error.message : 'Không kết nối được Project Core.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveFiles = useMemo(
    () => applyCoreProjectOverlay(snapshot.files, coreProjects),
    [snapshot.files, coreProjects],
  );
  const classifiedFiles = useMemo(
    () => classifyFiles(effectiveFiles, rules, duplicateKeeperOverrides),
    [effectiveFiles, rules, duplicateKeeperOverrides],
  );
  const visibleFiles = useMemo(() => {
    const base = filterByCategory(classifiedFiles, activeCategory);
    const scoped = projectFilterId ? base.filter((file) => file.project?.folderId === projectFilterId) : base;
    const archiveScoped = archiveSafeOnly
      ? scoped.filter((file) => isArchiveSafeCandidate(file, getRetentionPolicy(file.project?.retentionPolicyId)))
      : scoped;
    return archiveScoped.sort((a, b) => (b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0));
  }, [classifiedFiles, activeCategory, projectFilterId, archiveSafeOnly]);

  const isBootRestoring = bootState === 'restoring';
  const isInitialSync = scanState === 'scanning' && isDemo;
  const cleanupBlocked = isBootRestoring || scanState === 'scanning' || (!isDemo && (snapshot.incompleteSearch || isCached));
  const selectedFiles = classifiedFiles.filter((file) => selectedIds.has(file.id) && isCleanupCandidate(file));
  const suggestionFiles = classifiedFiles.filter(isCleanupCandidate);
  const potentialSavings = totalBytes(suggestionFiles);
  const mediaFootprint = useMemo(() => storageByKind(classifiedFiles).slice(0, 4), [classifiedFiles]);
  const projectStorage = useMemo(() => buildProjectStorage(effectiveFiles), [effectiveFiles]);
  const projectCleanup = useMemo(() => {
    const grouped = new Map<string, { count: number; bytes: bigint }>();
    for (const file of classifiedFiles) {
      if (!file.project || !isCleanupCandidate(file)) continue;
      const current = grouped.get(file.project.folderId) ?? { count: 0, bytes: 0n };
      current.count += 1;
      current.bytes += file.bytes;
      grouped.set(file.project.folderId, current);
    }
    return grouped;
  }, [classifiedFiles]);
  const filteredProject = projectFilterId
    ? projectStorage.projects.find((entry) => entry.folder.id === projectFilterId)
    : undefined;
  const archiveByProject = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildArchiveSummary>>();
    for (const entry of projectStorage.projects) {
      if (!entry.tagged || entry.status === 'active') continue;
      map.set(entry.folder.id, buildArchiveSummary(classifiedFiles, entry.folder.id, entry.retentionPolicyId));
    }
    return map;
  }, [projectStorage.projects, classifiedFiles]);
  const archiveProject = archiveProjectId
    ? projectStorage.projects.find((entry) => entry.folder.id === archiveProjectId)
    : undefined;
  const archiveSummary = archiveProjectId ? archiveByProject.get(archiveProjectId) : undefined;

  const limit = snapshot.quota.limit ? toBytes(snapshot.quota.limit) : undefined;
  const usage = toBytes(snapshot.quota.usage || snapshot.quota.usageInDrive);
  const usageInDrive = toBytes(snapshot.quota.usageInDrive);
  const trashUsage = toBytes(snapshot.quota.usageInDriveTrash);
  const activeDriveUsage = usageInDrive > trashUsage ? usageInDrive - trashUsage : 0n;
  const otherUsage = usage > usageInDrive ? usage - usageInDrive : 0n;
  const usagePercent = limit && limit > 0n ? Math.min(100, Number((usage * 100n) / limit)) : undefined;
  const percentOfLimit = (bytes: bigint) => limit && limit > 0n
    ? Math.max(0, Math.min(100, Number((bytes * 100n) / limit)))
    : 0;

  const recordActivity = (entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) => {
    setActivityLog(appendActivityLog(entry));
  };

  const updateRules = (nextRules: CleanupRules) => {
    setRules(nextRules);
    setSelectedIds(new Set());
    window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(nextRules));
  };

  const handleScan = async () => {
    setScanState('scanning');
    setScanCount(0);
    setMessage(undefined);
    setSelectedIds(new Set());
    setCleanResult(undefined);
    setLastTrashBatch([]);
    setAccessAudits({});
    try {
      const result = await syncGoogleDrive(isDemo ? undefined : snapshot, setScanCount);
      setSnapshot(result.snapshot);
      setIsDemo(false);
      setIsCached(false);
      setScanState('idle');
      setSyncSummary(
        result.mode === 'incremental'
          ? `Đồng bộ nhanh · ${result.changesApplied.toLocaleString('vi-VN')} thay đổi`
          : `Quét toàn bộ · ${result.snapshot.files.length.toLocaleString('vi-VN')} file`
      );
      recordActivity({
        type: 'sync',
        title: result.mode === 'incremental' ? 'Đồng bộ thay đổi Drive' : 'Quét toàn bộ Drive',
        detail: result.mode === 'incremental'
          ? `${result.changesApplied.toLocaleString('vi-VN')} thay đổi được áp dụng vào metadata index.`
          : `${result.snapshot.files.length.toLocaleString('vi-VN')} file được index lại.`,
        count: result.mode === 'incremental' ? result.changesApplied : result.snapshot.files.length,
      });
      saveDriveIndex(result.snapshot).catch(() => undefined);

      if (result.snapshot.incompleteSearch) {
        setMessage('Google báo kết quả quét chưa đầy đủ. Clean đã khóa thao tác dọn; hãy quét lại trước khi thay đổi file.');
      }
    } catch (error) {
      setScanState('error');
      setMessage(error instanceof Error ? error.message : 'Không thể kết nối Google Drive.');
    }
  };


  const handleChooseDuplicateKeeper = (groupId: string, fileId: string) => {
    setDuplicateKeeperOverrides((current) => {
      const next = { ...current, [groupId]: fileId };
      window.localStorage.setItem(DUPLICATE_KEEPERS_KEY, JSON.stringify(next));
      return next;
    });
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const file of classifiedFiles) {
        if (file.duplicateGroupId === groupId) next.delete(file.id);
      }
      return next;
    });
    setCleanResult(undefined);
  };

  const handleToggle = (file: (typeof classifiedFiles)[number]) => {
    if (cleanupBlocked || !isCleanupCandidate(file)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
    setCleanResult(undefined);
  };

  const handleToggleAll = (files: typeof classifiedFiles) => {
    if (cleanupBlocked) return;
    const safeFiles = files.filter(isCleanupCandidate);
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = safeFiles.length > 0 && safeFiles.every((file) => next.has(file.id));
      for (const file of safeFiles) {
        if (allSelected) next.delete(file.id);
        else next.add(file.id);
      }
      return next;
    });
    setCleanResult(undefined);
  };

  const handleConfirmedClean = async () => {
    setShowConfirm(false);
    if (cleanupBlocked) {
      setMessage('Không thể dọn vì lần quét Drive chưa hoàn chỉnh.');
      return;
    }

    const safeSelection = selectedFiles.filter(isCleanupCandidate);
    if (!safeSelection.length) return;

    setIsCleaning(true);
    setCleanProgress(0);
    setCleanResult(undefined);
    setLastTrashBatch([]);

    if (isDemo) {
      for (let count = 1; count <= safeSelection.length; count += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 160));
        setCleanProgress(count);
      }
      const ids = new Set(safeSelection.map((file) => file.id));
      setSnapshot((current) => ({
        ...current,
        files: current.files.filter((file) => !ids.has(file.id)),
      }));
      setLastTrashBatch(safeSelection);
      setCleanResult({ succeeded: safeSelection.length, failed: 0 });
      recordActivity({
        type: 'cleanup',
        title: 'Dọn dữ liệu mô phỏng',
        detail: 'Thao tác demo — không thay đổi Google Drive.',
        count: safeSelection.length,
        bytes: safeSelection.reduce((sum, file) => sum + file.bytes, 0n).toString(),
      });
      setSelectedIds(new Set());
      setIsCleaning(false);
      return;
    }

    try {
      const result = await moveFilesToTrash(safeSelection, setCleanProgress);
      const succeededIds = new Set(result.succeeded);
      const succeededFiles = safeSelection.filter((file) => succeededIds.has(file.id));
      setSnapshot((current) => ({
        ...current,
        files: current.files.filter((file) => !succeededIds.has(file.id)),
      }));
      setLastTrashBatch(succeededFiles);
      setCleanResult({ succeeded: result.succeeded.length, failed: result.failed.length });
      if (result.succeeded.length) {
        recordActivity({
          type: 'cleanup',
          title: 'Đã đưa file vào thùng rác',
          detail: result.failed.length
            ? `${result.failed.length} file lỗi và chưa bị thay đổi.`
            : 'Tất cả file đã chọn được xử lý thành công.',
          count: result.succeeded.length,
          bytes: succeededFiles.reduce((sum, file) => sum + file.bytes, 0n).toString(),
        });
      }
      setSelectedIds(new Set(result.failed.map((item) => item.id)));
      if (result.failed.length) setMessage(`${result.failed.length} file chưa thể đưa vào thùng rác. Bạn có thể thử lại.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể hoàn tất thao tác dọn.');
    } finally {
      setIsCleaning(false);
    }
  };

  const handleUndo = async () => {
    if (!lastTrashBatch.length || isRestoring) return;
    setIsRestoring(true);
    setMessage(undefined);

    if (isDemo) {
      setSnapshot((current) => ({ ...current, files: [...current.files, ...lastTrashBatch] }));
      recordActivity({
        type: 'restore',
        title: 'Khôi phục dữ liệu mô phỏng',
        detail: 'Thao tác demo — không thay đổi Google Drive.',
        count: lastTrashBatch.length,
      });
      setLastTrashBatch([]);
      setCleanResult(undefined);
      setIsRestoring(false);
      return;
    }

    try {
      const result = await restoreFilesFromTrash(lastTrashBatch, () => undefined);
      const restoredIds = new Set(result.succeeded);
      const restoredFiles = lastTrashBatch.filter((file) => restoredIds.has(file.id));
      setSnapshot((current) => ({
        ...current,
        files: [...current.files, ...restoredFiles.filter((file) => !current.files.some((item) => item.id === file.id))],
      }));
      setLastTrashBatch(lastTrashBatch.filter((file) => !restoredIds.has(file.id)));
      setCleanResult(undefined);
      if (result.succeeded.length) {
        recordActivity({
          type: 'restore',
          title: 'Đã khôi phục file khỏi thùng rác',
          detail: result.failed.length ? `${result.failed.length} file chưa khôi phục được.` : 'Khôi phục thành công.',
          count: result.succeeded.length,
        });
      }
      if (result.failed.length) {
        setMessage(`${result.failed.length} file chưa khôi phục được. Clean giữ nút khôi phục để bạn thử lại.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể khôi phục file.');
    } finally {
      setIsRestoring(false);
    }
  };





  const handleRefreshCore = async () => {
    setCoreState('loading');
    setCoreError(undefined);
    try {
      const context = await loadCoreContext();
      setCoreSession(context.session);
      setCoreProjects(context.projects);
      setCoreState('connected');
    } catch (error) {
      setCoreState('error');
      setCoreError(error instanceof Error ? error.message : 'Không kết nối được Project Core.');
    }
  };

  const handleAuditAccess = async () => {
    const tagged = projectStorage.projects.filter((entry) => entry.tagged);
    if (isDemo || isCached || !tagged.length || isAuditingAccess) return;

    setIsAuditingAccess(true);
    setAuditProgress({ done: 0, total: tagged.length });
    setMessage(undefined);

    const next: Record<string, AccessAuditResult> = {};
    for (let index = 0; index < tagged.length; index += 1) {
      const project = tagged[index];
      try {
        const permissions = await listFilePermissions(project.folder.id);
        next[project.folder.id] = { folderId: project.folder.id, permissions };
      } catch (error) {
        next[project.folder.id] = {
          folderId: project.folder.id,
          permissions: [],
          error: error instanceof Error ? error.message : 'Không thể đọc quyền project.',
        };
      }
      setAccessAudits({ ...next });
      setAuditProgress({ done: index + 1, total: tagged.length });
    }

    setIsAuditingAccess(false);
  };

  const handleRevokePermission = async (folderId: string, permission: DrivePermission) => {
    if (isDemo || isCached || permission.role === 'owner') return;
    setIsRemovingPermission(true);
    setMessage(undefined);
    try {
      await removeFilePermission(folderId, permission.id);
      recordActivity({
        type: 'permission',
        title: 'Đã gỡ quyền truy cập project',
        detail: permission.emailAddress || permission.domain || permission.type,
        count: 1,
      });
      setAccessAudits((current) => {
        const audit = current[folderId];
        if (!audit) return current;
        return {
          ...current,
          [folderId]: {
            ...audit,
            permissions: audit.permissions.filter((item) => item.id !== permission.id),
          },
        };
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể gỡ quyền truy cập.');
      throw error;
    } finally {
      setIsRemovingPermission(false);
    }
  };

  const handleReviewProject = (folderId: string) => {
    setProjectFilterId(folderId);
    setArchiveSafeOnly(false);
    setActiveCategory('overview');
    setSelectedIds(new Set());
    setMode('cleanup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReviewArchiveSafe = (folderId: string) => {
    setProjectFilterId(folderId);
    setArchiveSafeOnly(true);
    setActiveCategory('overview');
    setSelectedIds(new Set());
    setArchiveProjectId(undefined);
    setMode('cleanup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProject = async (folderId: string, metadata: ProjectMetadataInput) => {
    const appProperties = projectAppProperties(metadata);
    if (isCached) {
      setMessage('Hãy đồng bộ Drive trước khi thay đổi metadata project.');
      throw new Error('Drive đang ở chế độ cache.');
    }
    setIsSavingProject(true);
    setMessage(undefined);
    try {
      if (!isDemo) await updateProjectFolderMetadata(folderId, appProperties);
      setSnapshot((current) => ({
        ...current,
        files: current.files.map((file) =>
          file.id === folderId
            ? { ...file, appProperties: { ...(file.appProperties ?? {}), ...appProperties } }
            : file
        ),
      }));
      recordActivity({
        type: 'project',
        title: 'Đã cập nhật metadata project',
        detail: `${metadata.name} · ${metadata.client || 'Không ghi khách hàng'} · ${metadata.status}`,
        count: 1,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu metadata project.');
      throw error;
    } finally {
      setIsSavingProject(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/clean-drive" aria-label="Clean Drive — trang chính">
          <BrandMark />
          <span>Clean Drive</span>
        </a>
        <div className="topbar__actions">
          <a className="hub-back-link" href="/">Apps</a>
          <span
            className={isBootRestoring
              ? 'data-badge is-restoring'
              : scanState === 'scanning'
                ? 'data-badge is-syncing'
                : scanState === 'error'
                  ? 'data-badge is-error'
                  : isDemo
                    ? 'data-badge is-demo'
                    : isCached
                      ? 'data-badge is-cached'
                      : 'data-badge is-live'}
            title={syncSummary}
          >
            <span />
            {isBootRestoring
              ? 'Đang khôi phục'
              : scanState === 'scanning'
                ? 'Đang đồng bộ Drive'
                : scanState === 'error'
                  ? 'Không thể đồng bộ'
                  : isDemo
                    ? 'Dữ liệu mô phỏng'
                    : isCached
                      ? 'Cần kết nối lại'
                      : 'Drive đã đồng bộ'}
          </span>
          <button className="connect-button" type="button" onClick={handleScan} disabled={isBootRestoring || scanState === 'scanning'}>
            {scanState === 'scanning' ? <RefreshCw className="spin" size={17} /> : <Cloud size={17} />}
            {isBootRestoring
              ? 'Đang khôi phục'
              : scanState === 'scanning'
                ? `Đã đọc ${scanCount.toLocaleString('vi-VN')} file`
                : scanState === 'error'
                  ? 'Thử lại kết nối'
                  : isDemo
                    ? 'Kết nối Google Drive'
                    : isCached
                      ? 'Kết nối lại Drive'
                      : 'Đồng bộ thay đổi'}
          </button>
          <div className="avatar" title={snapshot.email}>{snapshot.displayName?.charAt(0) || 'B'}</div>
        </div>
      </header>

      <main id="top" className="workspace">
        <section className="welcome-row">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> Storage Operations · Hang Đôi</p>
            <h1>Drive gọn, an toàn và đúng vòng đời project.</h1>
            <p>Clean chỉ đề xuất. Mọi thay đổi đều cần xác nhận và có thể khôi phục sau khi đưa vào thùng rác.</p>
          </div>
          <button className="privacy-note" type="button" title="Clean Drive chỉ dùng metadata như tên, kích thước và ngày sửa. Nội dung file không được tải về.">
            <ShieldCheck size={18} /> Không đọc nội dung file <Info size={14} />
          </button>
        </section>

        <nav className="clean-mode-tabs" aria-label="Khu vực Clean Drive">
          <button type="button" className={mode === 'cleanup' ? 'is-active' : ''} onClick={() => setMode('cleanup')}>
            <WandSparkles size={16} /> Dọn dẹp
          </button>
          <button type="button" className={mode === 'projects' ? 'is-active' : ''} onClick={() => setMode('projects')}>
            <FolderKanban size={16} /> Dự án
            {projectStorage.projects.filter((entry) => entry.tagged).length > 0 ? (
              <b>{projectStorage.projects.filter((entry) => entry.tagged).length}</b>
            ) : null}
          </button>
          <button type="button" className={mode === 'access' ? 'is-active' : ''} onClick={() => setMode('access')}>
            <ShieldAlert size={16} /> Quyền truy cập
          </button>
          <button type="button" className={mode === 'activity' ? 'is-active' : ''} onClick={() => setMode('activity')}>
            <Clock3 size={16} /> Nhật ký
          </button>
        </nav>

        {message ? (
          <div className="message-banner" role="alert">
            <AlertCircle size={18} />
            <span>{message}</span>
            {scanState === 'error' || cleanupBlocked ? <button type="button" onClick={handleScan}>Quét lại <ArrowRight size={14} /></button> : null}
          </div>
        ) : null}

        {isBootRestoring || isInitialSync ? (
          <DriveSyncState mode={isBootRestoring ? 'restoring' : 'scanning'} count={scanCount} />
        ) : mode === 'cleanup' ? (
          <>
            <section className="dashboard-grid" aria-label="Tổng quan dung lượng">
              <div className="storage-card">
                <div className="storage-card__top">
                  <div>
                    <p>Dung lượng tài khoản đã dùng</p>
                    <strong>
                      {formatBytes(usage)}
                      <small>{limit ? ` / ${formatBytes(limit)}` : ' · quota do tổ chức quản lý'}</small>
                    </strong>
                  </div>
                  <span className={usagePercent === undefined ? 'is-unbounded' : ''} style={usagePercent === undefined ? undefined : { background: `conic-gradient(var(--blue) ${usagePercent}%, #edf1f7 0)` }}>
                    {usagePercent === undefined ? '—' : `${usagePercent}%`}
                  </span>
                </div>
                <div className="storage-track" aria-label={usagePercent === undefined ? 'Không có giới hạn quota cá nhân' : `Đã dùng ${usagePercent}%`}>
                  <span className="storage-track__files" style={{ width: `${percentOfLimit(activeDriveUsage)}%` }} />
                  <span className="storage-track__trash" style={{ width: `${percentOfLimit(trashUsage)}%` }} />
                  <span className="storage-track__other" style={{ width: `${percentOfLimit(otherUsage)}%` }} />
                </div>
                <div className="storage-legend">
                  <span><i className="legend-files" /> Drive đang dùng {formatBytes(activeDriveUsage)}</span>
                  <span><i className="legend-trash" /> Thùng rác {formatBytes(trashUsage)}</span>
                  <span><i className="legend-other" /> Ngoài Drive {formatBytes(otherUsage)}</span>
                  {limit ? <span><i className="legend-free" /> Còn trống {formatBytes(limit > usage ? limit - usage : 0n)}</span> : null}
                </div>
              </div>

              <StatCard
                label="Có thể giải phóng an toàn"
                value={formatBytes(potentialSavings)}
                detail={`${suggestionFiles.length} mục có thể chọn`}
                icon={<ScanSearch size={21} />}
                tone="green"
              />
              <StatCard
                label="File đang theo dõi"
                value={snapshot.files.length.toLocaleString('vi-VN')}
                detail="Chỉ metadata được quét"
                icon={<Database size={21} />}
                tone="violet"
              />
            </section>

            <section className="media-footprint" aria-label="Phân bổ asset">
              <div className="media-footprint__heading">
                <strong>Asset footprint</strong>
                <span>Nhóm file đang chiếm nhiều dung lượng nhất</span>
              </div>
              <div className="media-footprint__items">
                {mediaFootprint.map((item) => (
                  <div className="media-footprint__item" key={item.kind}>
                    <span>{kindLabels[item.kind]}</span>
                    <strong>{formatBytes(item.bytes)}</strong>
                    <small>{item.count.toLocaleString('vi-VN')} file</small>
                  </div>
                ))}
              </div>
            </section>

            {filteredProject ? (
              <div className="project-filter-banner">
                <div>
                  <FolderKanban size={17} />
                  <span>{archiveSafeOnly ? 'Archive review · ' : 'Đang xem đề xuất của '}<strong>{filteredProject.name}</strong>{filteredProject.client ? ` · ${filteredProject.client}` : ''}</span>
                </div>
                <button type="button" onClick={() => { setProjectFilterId(undefined); setArchiveSafeOnly(false); setSelectedIds(new Set()); }}>Xem tất cả</button>
              </div>
            ) : null}

            <section className="work-grid">
              <aside className="left-rail">
                <div className="rail-label">Nhóm đề xuất</div>
                <CategoryNav active={activeCategory} files={classifiedFiles} onChange={setActiveCategory} />
                <div className="trash-callout">
                  <span><Trash2 size={18} /></span>
                  <div>
                    <strong>{formatBytes(snapshot.quota.usageInDriveTrash)}</strong>
                    <p>đang ở thùng rác</p>
                  </div>
                </div>
              </aside>

              <FileTable
                files={visibleFiles}
                activeCategory={activeCategory}
                selectedIds={selectedIds}
                cleanupBlocked={cleanupBlocked}
                rules={rules}
                onRulesChange={updateRules}
                onToggle={handleToggle}
                onToggleAll={handleToggleAll}
                onChooseDuplicateKeeper={handleChooseDuplicateKeeper}
              />

              <CleanupPanel
                selected={selectedFiles}
                isCleaning={isCleaning}
                progress={cleanProgress}
                result={cleanResult}
                cleanupBlocked={cleanupBlocked}
                blockedReason={scanState === 'scanning'
                  ? 'Clean đang đồng bộ Drive. Mọi thay đổi file tạm thời bị khóa.'
                  : isCached
                    ? 'Dữ liệu đã được khôi phục sau reload nhưng Google Drive chưa được xác minh lại. Hãy bấm Kết nối lại Drive.'
                    : 'Lần quét chưa hoàn chỉnh nên Clean đã khóa mọi thay đổi file.'}
                undoFiles={lastTrashBatch}
                isRestoring={isRestoring}
                onClean={() => setShowConfirm(true)}
                onClear={() => setSelectedIds(new Set())}
                onUndo={handleUndo}
              />
            </section>

            <footer className="footer-note">
              <HardDrive size={15} /> Dung lượng giải phóng là ước tính từ metadata Google Drive và có thể cập nhật chậm sau khi dọn.
            </footer>
          </>
        ) : mode === 'projects' ? (
          <>
            <CoreIntegrationPanel
              state={coreState}
              email={coreSession?.user.email}
              projectCount={coreProjects.length}
              linkedCount={projectStorage.projects.filter((entry) => Boolean(entry.coreProjectId)).length}
              error={coreError}
              onRefresh={handleRefreshCore}
            />
            {archiveProject && archiveSummary ? (
              <ArchiveReviewPanel
                project={archiveProject}
                summary={archiveSummary}
                onClose={() => setArchiveProjectId(undefined)}
                onReviewSafe={handleReviewArchiveSafe}
              />
            ) : null}
            <ProjectStoragePanel
              entries={projectStorage.projects}
              unclassifiedBytes={projectStorage.unclassifiedBytes}
              unclassifiedCount={projectStorage.unclassifiedCount}
              cleanupByProject={projectCleanup}
              archiveByProject={archiveByProject}
              coreProjects={coreProjects}
              coreConnected={coreState === 'connected'}
              isSaving={isSavingProject}
              onSave={handleSaveProject}
              onOpenArchive={setArchiveProjectId}
            />
          </>
        ) : mode === 'access' ? (
          <AccessPanel
            projects={projectStorage.projects}
            audits={accessAudits}
            isDemo={isDemo || isCached}
            isAuditing={isAuditingAccess}
            auditProgress={auditProgress}
            nonOwnedCount={snapshot.files.filter((file) => file.ownedByMe === false).length}
            isRemoving={isRemovingPermission}
            onAudit={handleAuditAccess}
            onRevoke={handleRevokePermission}
          />
        ) : (
          <ActivityPanel entries={activityLog} />
        )}
      </main>

      {showConfirm ? (
        <ConfirmDialog
          files={selectedFiles}
          isDemo={isDemo}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirmedClean}
        />
      ) : null}
    </div>
  );
}

export default CleanDriveApp;
