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
  Settings2,
} from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { CategoryNav } from './components/CategoryNav';
import { CleanupPanel } from './components/CleanupPanel';
import { DriveSyncState } from './components/DriveSyncState';
import { DriveConnectState } from './components/DriveConnectState';
import { DriveFastBoot } from './components/DriveFastBoot';
import { StorageHealthPanel } from './components/StorageHealthPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FileTable } from './components/FileTable';
import { CleanupExplorer, type CleanupExplorerView } from './components/CleanupExplorer';
import { StatCard } from './components/StatCard';
import {
  DEFAULT_CLEANUP_RULES,
  filterByCategory,
  isCleanupCandidate,
  storageByKind,
  totalBytes,
} from './lib/classify';
import { buildProjectStorage, collectDescendantIds, projectAppProperties } from './lib/projects';
import { applyCoreProjectOverlay, loadCoreContext } from './lib/hangdoi-core';
import { appendActivityLog, loadActivityLog } from './lib/activity-log';
import { buildArchiveSummaries, getRetentionPolicy, isArchiveSafeCandidate } from './lib/production';
import { clearDriveIndex, loadLastDriveIndex, patchDriveIndex, saveDriveIndex } from './lib/drive-index';
import { classifyFilesAsync } from './lib/classify-worker';
import { clearFastDriveSummary, loadFastDriveSummary, saveFastDriveSummary } from './lib/fast-summary';
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
  ClassifiedFile,
  DriveFile,
  DrivePermission,
  DriveSnapshot,
  FileKind,
  ProjectMetadataInput,
  ProjectStorageEntry,
} from './types';

const ProjectStoragePanel = lazy(() =>
  import('./components/ProjectStoragePanel').then((module) => ({ default: module.ProjectStoragePanel })),
);
const CoreIntegrationPanel = lazy(() =>
  import('./components/CoreIntegrationPanel').then((module) => ({ default: module.CoreIntegrationPanel })),
);
const AccessPanel = lazy(() =>
  import('./components/AccessPanel').then((module) => ({ default: module.AccessPanel })),
);
const ActivityPanel = lazy(() =>
  import('./components/ActivityPanel').then((module) => ({ default: module.ActivityPanel })),
);
const ArchiveReviewPanel = lazy(() =>
  import('./components/ArchiveReviewPanel').then((module) => ({ default: module.ArchiveReviewPanel })),
);
const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then((module) => ({ default: module.SettingsDialog })),
);
const ProjectTrashDialog = lazy(() =>
  import('./components/ProjectTrashDialog').then((module) => ({ default: module.ProjectTrashDialog })),
);

function PanelLoading({ label }: { label: string }) {
  return <div className="panel-loading" aria-live="polite">{label}</div>;
}

const RULES_STORAGE_KEY = 'hangdoi-clean-drive-rules-v1';
const DUPLICATE_KEEPERS_KEY = 'hangdoi-clean-drive-duplicate-keepers-v1';

const EMPTY_SNAPSHOT: DriveSnapshot = {
  files: [],
  quota: {},
  incompleteSearch: false,
};

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
  const [snapshot, setSnapshot] = useState<DriveSnapshot>(EMPTY_SNAPSHOT);
  const [mode, setMode] = useState<'cleanup' | 'projects' | 'access' | 'activity'>('cleanup');
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectFilterId, setProjectFilterId] = useState<string>();
  const [folderFilterId, setFolderFilterId] = useState<string>();
  const [cleanupExplorerView, setCleanupExplorerView] = useState<CleanupExplorerView>('project');
  const [pendingProjectTrash, setPendingProjectTrash] = useState<ProjectStorageEntry>();
  const [lastProjectTrash, setLastProjectTrash] = useState<{ project: ProjectStorageEntry; files: DriveFile[] }>();
  const [isTrashingProject, setIsTrashingProject] = useState(false);
  const [isRestoringProject, setIsRestoringProject] = useState(false);
  const [archiveProjectId, setArchiveProjectId] = useState<string>();
  const [archiveSafeOnly, setArchiveSafeOnly] = useState(false);
  const [rules, setRules] = useState<CleanupRules>(loadRules);
  const [duplicateKeeperOverrides, setDuplicateKeeperOverrides] = useState<Record<string, string>>(loadDuplicateKeeperOverrides);
  const [isCached, setIsCached] = useState(false);
  const [autoReconnectState, setAutoReconnectState] = useState<'idle' | 'running' | 'connected' | 'failed'>('idle');
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
  const [showSettings, setShowSettings] = useState(false);
  const [classifiedFiles, setClassifiedFiles] = useState<ClassifiedFile[]>([]);
  const [classificationPending, setClassificationPending] = useState(false);
  const [fastSummary, setFastSummary] = useState(loadFastDriveSummary);


  useEffect(() => {
    let cancelled = false;
    const bootTimeout = window.setTimeout(() => {
      if (!cancelled) setBootState('ready');
    }, 1500);

    loadLastDriveIndex()
      .then((cached) => {
        if (cancelled) return;
        if (cached?.email) {
          setSnapshot(cached);
          setIsCached(true);
          setSyncSummary(cached.lastSyncedAt ? `Dữ liệu từ ${new Date(cached.lastSyncedAt).toLocaleString('vi-VN')}` : 'Dữ liệu từ lần đồng bộ trước');
          setMessage(undefined);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(bootTimeout);
        if (!cancelled) setBootState('ready');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimeout);
    };
  }, []);

  useEffect(() => {
    if (
      bootState !== 'ready'
      || !isCached
      || !snapshot.email
      || autoReconnectState !== 'idle'
      || scanState !== 'idle'
    ) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setAutoReconnectState('running');
      setSyncSummary('Đang tự xác minh phiên Google…');
      setMessage(undefined);

      syncGoogleDrive(snapshot, () => undefined, 'silent')
        .then((result) => {
          if (cancelled) return;
          setSnapshot(result.snapshot);
          setIsCached(false);
          setAutoReconnectState('connected');
          setSyncSummary(
            result.mode === 'incremental'
              ? `Đã tự kết nối lại · ${result.changesApplied.toLocaleString('vi-VN')} thay đổi`
              : `Đã tự kết nối lại · ${result.snapshot.files.length.toLocaleString('vi-VN')} file`
          );
          setMessage(undefined);

          if (result.mode === 'incremental' && result.indexPatch) {
            patchDriveIndex(
              result.snapshot,
              result.indexPatch.upsertFiles,
              result.indexPatch.removedIds,
            ).catch(() => undefined);
          } else {
            saveDriveIndex(result.snapshot).catch(() => undefined);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setAutoReconnectState('failed');
          setSyncSummary('Phiên Google cần xác nhận lại');
          setMessage('Phiên Google hiện tại không thể tự khôi phục. Bấm Kết nối lại Drive để xác nhận tài khoản.');
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bootState, isCached, snapshot, autoReconnectState, scanState]);

  useEffect(() => {
    if (bootState !== 'ready' || !snapshot.email) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
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
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bootState, snapshot.email]);

  const deferredSnapshotFiles = useDeferredValue(snapshot.files);
  const effectiveFiles = useMemo(
    () => applyCoreProjectOverlay(deferredSnapshotFiles, coreProjects),
    [deferredSnapshotFiles, coreProjects],
  );
  useEffect(() => {
    let cancelled = false;

    if (!effectiveFiles.length) {
      setClassifiedFiles([]);
      setClassificationPending(false);
      return () => { cancelled = true; };
    }

    setClassificationPending(true);
    classifyFilesAsync(effectiveFiles, rules, duplicateKeeperOverrides)
      .then((next) => {
        if (!cancelled) setClassifiedFiles(next);
      })
      .finally(() => {
        if (!cancelled) setClassificationPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveFiles, rules, duplicateKeeperOverrides]);
  const folderFilterIds = useMemo(
    () => folderFilterId ? collectDescendantIds(effectiveFiles, folderFilterId) : undefined,
    [effectiveFiles, folderFilterId],
  );
  const visibleFiles = useMemo(() => {
    const base = filterByCategory(classifiedFiles, activeCategory);
    const scoped = projectFilterId
      ? base.filter((file) => file.project?.folderId === projectFilterId)
      : folderFilterIds
        ? base.filter((file) => folderFilterIds.has(file.id))
        : base;
    const archiveScoped = archiveSafeOnly
      ? scoped.filter((file) => isArchiveSafeCandidate(file, getRetentionPolicy(file.project?.retentionPolicyId)))
      : scoped;
    return archiveScoped.sort((a, b) => (b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0));
  }, [classifiedFiles, activeCategory, projectFilterId, folderFilterIds, archiveSafeOnly]);

  const hasDriveData = Boolean(snapshot.email);
  const isPreparingDerivedData = hasDriveData
    && snapshot.files.length > 0
    && classifiedFiles.length === 0
    && classificationPending;
  const isBootRestoring = bootState === 'restoring';
  const isInitialSync = scanState === 'scanning' && !hasDriveData;
  const cleanupBlocked = !hasDriveData || isBootRestoring || scanState === 'scanning' || snapshot.incompleteSearch || isCached;
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
  const filteredFolder = folderFilterId
    ? projectStorage.projects.find((entry) => entry.folder.id === folderFilterId)
    : undefined;
  const archiveByProject = useMemo(() => buildArchiveSummaries(
    classifiedFiles,
    projectStorage.projects
      .filter((entry) => entry.tagged && entry.status !== 'active')
      .map((entry) => ({ folderId: entry.folder.id, retentionPolicyId: entry.retentionPolicyId })),
  ), [projectStorage.projects, classifiedFiles]);
  const archiveProject = archiveProjectId
    ? projectStorage.projects.find((entry) => entry.folder.id === archiveProjectId)
    : undefined;
  const archiveSummary = archiveProjectId ? archiveByProject.get(archiveProjectId) : undefined;
  const activeProjectBytes = projectStorage.projects
    .filter((entry) => entry.tagged && entry.status === 'active')
    .reduce((sum, entry) => sum + entry.bytes, 0n);
  const finishedProjects = projectStorage.projects.filter(
    (entry) => entry.tagged && entry.status && entry.status !== 'active',
  );
  const finishedProjectBytes = finishedProjects.reduce((sum, entry) => sum + entry.bytes, 0n);

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

  useEffect(() => {
    if (!snapshot.email || classificationPending || classifiedFiles.length === 0) return;

    const summary = {
      email: snapshot.email,
      displayName: snapshot.displayName,
      lastSyncedAt: snapshot.lastSyncedAt,
      quota: snapshot.quota,
      fileCount: snapshot.files.length,
      recoverableBytes: potentialSavings.toString(),
      recoverableCount: suggestionFiles.length,
      activeProjectBytes: activeProjectBytes.toString(),
      activeProjectCount: projectStorage.projects.filter((entry) => entry.tagged && entry.status === 'active').length,
      assetFootprint: mediaFootprint.map((item) => ({
        kind: item.kind,
        bytes: item.bytes.toString(),
        count: item.count,
      })),
    };

    saveFastDriveSummary(summary);
    setFastSummary(summary);
  }, [
    snapshot.email,
    snapshot.displayName,
    snapshot.lastSyncedAt,
    snapshot.quota,
    snapshot.files.length,
    classificationPending,
    classifiedFiles.length,
    potentialSavings,
    suggestionFiles.length,
    activeProjectBytes,
    projectStorage.projects,
    mediaFootprint,
  ]);

  const recordActivity = (entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) => {
    setActivityLog(appendActivityLog(entry));
  };

  const updateRules = (nextRules: CleanupRules) => {
    setRules(nextRules);
    setSelectedIds(new Set());
    window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(nextRules));
  };

  const handleScan = async () => {
    setAutoReconnectState('idle');
    setScanState('scanning');
    setScanCount(0);
    setMessage(undefined);
    setSelectedIds(new Set());
    setCleanResult(undefined);
    setLastTrashBatch([]);
    setAccessAudits({});
    try {
      const result = await syncGoogleDrive(hasDriveData ? snapshot : undefined, setScanCount);
      setSnapshot(result.snapshot);
      setIsCached(false);
      setAutoReconnectState('connected');
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
      if (result.mode === 'incremental' && result.indexPatch) {
        patchDriveIndex(
          result.snapshot,
          result.indexPatch.upsertFiles,
          result.indexPatch.removedIds,
        ).catch(() => undefined);
      } else {
        saveDriveIndex(result.snapshot).catch(() => undefined);
      }

      if (result.snapshot.incompleteSearch) {
        setMessage('Google báo kết quả quét chưa đầy đủ. Clean đã khóa thao tác dọn; hãy quét lại trước khi thay đổi file.');
      }
    } catch (error) {
      setScanState('error');
      setMessage(error instanceof Error ? error.message : 'Không thể kết nối Google Drive.');
    }
  };



  const handleFullReindex = async () => {
    if (scanState === 'scanning') return;
    setScanState('scanning');
    setScanCount(0);
    setMessage(undefined);
    setSelectedIds(new Set());
    setCleanResult(undefined);
    setLastTrashBatch([]);
    setAccessAudits({});

    try {
      const result = await syncGoogleDrive(undefined, setScanCount);
      setSnapshot(result.snapshot);
      setIsCached(false);
      setScanState('idle');
      setSyncSummary(`Full re-index · ${result.snapshot.files.length.toLocaleString('vi-VN')} file`);
      recordActivity({
        type: 'sync',
        title: 'Full re-index Google Drive',
        detail: `${result.snapshot.files.length.toLocaleString('vi-VN')} file được index lại từ đầu.`,
        count: result.snapshot.files.length,
      });
      await saveDriveIndex(result.snapshot);
      setShowSettings(false);
    } catch (error) {
      setScanState('error');
      setMessage(error instanceof Error ? error.message : 'Không thể full re-index Google Drive.');
      throw error;
    }
  };

  const handleClearLocalCache = async () => {
    try {
      await clearDriveIndex();
      clearFastDriveSummary();
      setFastSummary(undefined);
      setSyncSummary('Metadata cache trên thiết bị đã được xóa');
      setMessage('Đã xóa metadata cache trên thiết bị này. Phiên Drive hiện tại vẫn giữ nguyên cho đến khi reload.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xóa metadata cache.');
      throw error;
    }
  };

  const handleResetDuplicateKeepers = () => {
    window.localStorage.removeItem(DUPLICATE_KEEPERS_KEY);
    setDuplicateKeeperOverrides({});
    setSelectedIds(new Set());
    setMessage('Đã reset lựa chọn bản giữ duplicate về logic mặc định của Clean.');
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
    setLastProjectTrash(undefined);

    try {
      const result = await moveFilesToTrash(safeSelection, setCleanProgress);
      const succeededIds = new Set(result.succeeded);
      const succeededFiles = safeSelection.filter((file) => succeededIds.has(file.id));
      const nextSnapshot = {
        ...snapshot,
        files: snapshot.files.filter((file) => !succeededIds.has(file.id)),
      };
      setSnapshot(nextSnapshot);
      patchDriveIndex(nextSnapshot, [], result.succeeded).catch(() => undefined);
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


    try {
      const result = await restoreFilesFromTrash(lastTrashBatch, () => undefined);
      const restoredIds = new Set(result.succeeded);
      const restoredFiles = lastTrashBatch.filter((file) => restoredIds.has(file.id));
      const restoredUnique = restoredFiles.filter((file) => !snapshot.files.some((item) => item.id === file.id));
      const nextSnapshot = {
        ...snapshot,
        files: [...snapshot.files, ...restoredUnique],
      };
      setSnapshot(nextSnapshot);
      patchDriveIndex(nextSnapshot, restoredUnique, []).catch(() => undefined);
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






  const openProjectFiles = (folderId: string) => {
    setProjectFilterId(folderId);
    setFolderFilterId(undefined);
    setArchiveSafeOnly(false);
    setActiveCategory('overview');
    setSelectedIds(new Set());
    setCleanupExplorerView('file');
  };

  const openFolderFiles = (folderId: string) => {
    setFolderFilterId(folderId);
    setProjectFilterId(undefined);
    setArchiveSafeOnly(false);
    setActiveCategory('overview');
    setSelectedIds(new Set());
    setCleanupExplorerView('file');
  };

  const handleRequestProjectTrash = (entry: ProjectStorageEntry) => {
    if (
      cleanupBlocked
      || !entry.tagged
      || !entry.status
      || entry.status === 'active'
      || entry.folder.ownedByMe === false
      || entry.folder.capabilities?.canTrash === false
    ) return;
    setPendingProjectTrash(entry);
  };

  const handleConfirmedProjectTrash = async () => {
    const project = pendingProjectTrash;
    if (!project || cleanupBlocked || project.status === 'active') return;

    const descendantIds = collectDescendantIds(snapshot.files, project.folder.id);
    const backupFiles = snapshot.files.filter((file) => descendantIds.has(file.id));
    const unownedCount = backupFiles.filter((file) => file.ownedByMe === false).length;
    if (unownedCount > 0) {
      setMessage('Project có file không thuộc sở hữu tài khoản hiện tại. Clean đã khóa thao tác nguyên project; hãy review theo file.');
      return;
    }

    const rootFolder = snapshot.files.find((file) => file.id === project.folder.id) ?? project.folder;
    setIsTrashingProject(true);
    setMessage(undefined);
    setLastTrashBatch([]);

    try {
      const result = await moveFilesToTrash([rootFolder], () => undefined);
      if (!result.succeeded.includes(rootFolder.id)) {
        throw new Error(result.failed[0]?.message || 'Không thể đưa folder project vào thùng rác.');
      }

      const nextSnapshot = {
        ...snapshot,
        files: snapshot.files.filter((file) => !descendantIds.has(file.id)),
      };
      setSnapshot(nextSnapshot);
      patchDriveIndex(nextSnapshot, [], [...descendantIds]).catch(() => undefined);
      setLastProjectTrash({ project, files: backupFiles });
      setPendingProjectTrash(undefined);
      setProjectFilterId(undefined);
      setFolderFilterId(undefined);
      setCleanupExplorerView('project');
      recordActivity({
        type: 'cleanup',
        title: 'Đã đưa toàn bộ project vào thùng rác',
        detail: project.name,
        count: project.fileCount,
        bytes: project.bytes.toString(),
      });
      setMessage('Đã đưa project “' + project.name + '” vào thùng rác. Bạn có thể khôi phục nguyên project ngay trên màn Dọn dẹp.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể dọn toàn bộ project.');
    } finally {
      setIsTrashingProject(false);
    }
  };

  const handleUndoProjectTrash = async () => {
    if (!lastProjectTrash || isRestoringProject) return;

    const { project, files } = lastProjectTrash;
    const rootFolder = files.find((file) => file.id === project.folder.id) ?? project.folder;
    setIsRestoringProject(true);
    setMessage(undefined);

    try {
      const result = await restoreFilesFromTrash([rootFolder], () => undefined);
      if (!result.succeeded.includes(rootFolder.id)) {
        throw new Error(result.failed[0]?.message || 'Không thể khôi phục folder project.');
      }

      const existing = new Set(snapshot.files.map((file) => file.id));
      const restoredFiles = files.filter((file) => !existing.has(file.id));
      const nextSnapshot = { ...snapshot, files: [...snapshot.files, ...restoredFiles] };
      setSnapshot(nextSnapshot);
      patchDriveIndex(nextSnapshot, restoredFiles, []).catch(() => undefined);
      setLastProjectTrash(undefined);
      recordActivity({
        type: 'restore',
        title: 'Đã khôi phục toàn bộ project',
        detail: project.name,
        count: project.fileCount,
        bytes: project.bytes.toString(),
      });
      setMessage('Đã khôi phục project “' + project.name + '” khỏi thùng rác.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể khôi phục project.');
    } finally {
      setIsRestoringProject(false);
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
    if (!hasDriveData || isCached || !tagged.length || isAuditingAccess) return;

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
    if (!hasDriveData || isCached || permission.role === 'owner') return;
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
    setFolderFilterId(undefined);
    setCleanupExplorerView('file');
    setArchiveSafeOnly(false);
    setActiveCategory('overview');
    setSelectedIds(new Set());
    setMode('cleanup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReviewArchiveSafe = (folderId: string) => {
    setProjectFilterId(folderId);
    setFolderFilterId(undefined);
    setCleanupExplorerView('file');
    setArchiveSafeOnly(true);
    setActiveCategory('overview');
    setSelectedIds(new Set());
    setArchiveProjectId(undefined);
    setMode('cleanup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProject = async (folderId: string, metadata: ProjectMetadataInput) => {
    const appProperties = projectAppProperties(metadata);
    if (!hasDriveData || isCached) {
      setMessage('Hãy kết nối và đồng bộ Google Drive trước khi thay đổi metadata project.');
      throw new Error(!hasDriveData ? 'Google Drive chưa được kết nối.' : 'Drive đang ở chế độ cache.');
    }
    setIsSavingProject(true);
    setMessage(undefined);
    try {
      await updateProjectFolderMetadata(folderId, appProperties);
      const updatedFolder = snapshot.files.find((file) => file.id === folderId);
      const nextFolder = updatedFolder
        ? { ...updatedFolder, appProperties: { ...(updatedFolder.appProperties ?? {}), ...appProperties } }
        : undefined;
      const nextSnapshot = {
        ...snapshot,
        files: snapshot.files.map((file) => file.id === folderId && nextFolder ? nextFolder : file),
      };
      setSnapshot(nextSnapshot);
      if (nextFolder) patchDriveIndex(nextSnapshot, [nextFolder], []).catch(() => undefined);
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
          <button className="topbar-icon-button" type="button" onClick={() => setShowSettings(true)} aria-label="Cài đặt Clean Drive" title="Cài đặt">
            <Settings2 size={17} />
          </button>
          <span
            className={isBootRestoring
              ? 'data-badge is-restoring'
              : autoReconnectState === 'running' || scanState === 'scanning'
                ? 'data-badge is-syncing'
                : scanState === 'error'
                  ? 'data-badge is-error'
                  : !hasDriveData
                    ? 'data-badge is-disconnected'
                    : isCached
                      ? 'data-badge is-cached'
                      : 'data-badge is-live'}
            title={syncSummary}
          >
            <span />
            {isBootRestoring
              ? 'Đang khôi phục'
              : autoReconnectState === 'running'
                ? 'Đang xác minh Google'
                : scanState === 'scanning'
                  ? 'Đang đồng bộ Drive'
                : scanState === 'error'
                  ? 'Không thể đồng bộ'
                  : !hasDriveData
                    ? 'Chưa kết nối'
                    : isCached
                      ? 'Cần kết nối lại'
                      : 'Drive đã đồng bộ'}
          </span>
          <button className="connect-button" type="button" onClick={handleScan} disabled={isBootRestoring || autoReconnectState === 'running' || scanState === 'scanning'}>
            {autoReconnectState === 'running' || scanState === 'scanning' ? <RefreshCw className="spin" size={17} /> : <Cloud size={17} />}
            {isBootRestoring
              ? 'Đang khôi phục'
              : autoReconnectState === 'running'
                ? 'Đang tự kết nối lại'
                : scanState === 'scanning'
                  ? `Đã đọc ${scanCount.toLocaleString('vi-VN')} file`
                : scanState === 'error'
                  ? 'Thử lại kết nối'
                  : !hasDriveData
                    ? 'Kết nối Google Drive'
                    : isCached
                      ? 'Kết nối lại Drive'
                      : 'Đồng bộ thay đổi'}
          </button>
          {hasDriveData ? (
            <div className="avatar" title={snapshot.email}>{snapshot.displayName?.charAt(0) || 'G'}</div>
          ) : null}
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

        {hasDriveData ? (
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
        ) : null}

        {message ? (
          <div className="message-banner" role="alert">
            <AlertCircle size={18} />
            <span>{message}</span>
            {scanState === 'error' || cleanupBlocked ? (
              <button type="button" onClick={handleScan}>
                {!hasDriveData ? 'Kết nối Google Drive' : isCached ? 'Kết nối lại' : scanState === 'error' ? 'Thử lại' : 'Đồng bộ'} <ArrowRight size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        {isBootRestoring && fastSummary ? (
          <DriveFastBoot summary={fastSummary} />
        ) : isBootRestoring || isInitialSync ? (
          <DriveSyncState mode={isBootRestoring ? 'restoring' : 'scanning'} count={scanCount} />
        ) : !hasDriveData ? (
          <DriveConnectState
            isConnecting={scanState === 'scanning'}
            error={scanState === 'error' ? message : undefined}
            onConnect={() => { void handleScan(); }}
          />
        ) : isPreparingDerivedData ? (
          <div className="derive-loading" aria-live="polite">
            <span className="derive-loading__spinner" />
            <div>
              <strong>Đang chuẩn bị dữ liệu Drive…</strong>
              <span>Ưu tiên hiển thị giao diện trước, phân loại file chạy sau.</span>
            </div>
          </div>
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
                label="Project đã qua"
                value={formatBytes(finishedProjectBytes)}
                detail={`${finishedProjects.length} project đã bàn giao / lưu trữ`}
                icon={<ScanSearch size={21} />}
                tone="green"
              />
              <StatCard
                label="Active Project"
                value={formatBytes(activeProjectBytes)}
                detail={`${projectStorage.projects.filter((entry) => entry.tagged && entry.status === 'active').length} project đang được bảo vệ`}
                icon={<FolderKanban size={21} />}
                tone="violet"
              />
            </section>

            <StorageHealthPanel
              projects={projectStorage.projects}
              archiveByProject={archiveByProject}
              audits={accessAudits}
              unclassifiedBytes={projectStorage.unclassifiedBytes}
              unclassifiedCount={projectStorage.unclassifiedCount}
              usagePercent={usagePercent}
              lastSyncedAt={snapshot.lastSyncedAt}
              isCached={isCached}
              onProjects={() => setMode('projects')}
              onAccess={() => setMode('access')}
              onArchive={(folderId) => { setArchiveProjectId(folderId); setMode('projects'); }}
              onCleanup={() => { setMode('cleanup'); setCleanupExplorerView('project'); setActiveCategory('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onSync={() => { void handleScan(); }}
            />

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

            <CleanupExplorer
              view={cleanupExplorerView}
              entries={projectStorage.projects}
              files={classifiedFiles}
              archiveByProject={archiveByProject}
              cleanupBlocked={cleanupBlocked}
              lastTrash={lastProjectTrash ? {
                name: lastProjectTrash.project.name,
                bytes: lastProjectTrash.project.bytes,
                count: lastProjectTrash.project.fileCount,
              } : undefined}
              isRestoring={isRestoringProject}
              onViewChange={(nextView) => {
                setCleanupExplorerView(nextView);
                if (nextView !== 'file') {
                  setProjectFilterId(undefined);
                  setFolderFilterId(undefined);
                  setArchiveSafeOnly(false);
                  setSelectedIds(new Set());
                }
              }}
              onOpenProjectFiles={openProjectFiles}
              onOpenFolderFiles={openFolderFiles}
              onOpenArchive={(folderId) => { setArchiveProjectId(folderId); setMode('projects'); }}
              onTrashProject={handleRequestProjectTrash}
              onUndoProjectTrash={handleUndoProjectTrash}
              onManageProjects={() => setMode('projects')}
            />

            {cleanupExplorerView === 'file' ? (
              <>
                {filteredProject || filteredFolder ? (
                  <div className="project-filter-banner">
                    <div>
                      <FolderKanban size={17} />
                      <span>
                        {archiveSafeOnly ? 'Archive review · ' : filteredProject ? 'Dự án · ' : 'Folder · '}
                        <strong>{(filteredProject || filteredFolder)?.name}</strong>
                        {(filteredProject || filteredFolder)?.client ? ' · ' + (filteredProject || filteredFolder)?.client : ''}
                      </span>
                    </div>
                    <button type="button" onClick={() => {
                      setProjectFilterId(undefined);
                      setFolderFilterId(undefined);
                      setArchiveSafeOnly(false);
                      setSelectedIds(new Set());
                      setCleanupExplorerView('project');
                    }}>Quay lại dự án</button>
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
              </>
            ) : null}

            <footer className="footer-note">
              <HardDrive size={15} /> Dung lượng giải phóng là ước tính từ metadata Google Drive và có thể cập nhật chậm sau khi dọn.
            </footer>
          </>
        ) : mode === 'projects' ? (
          <Suspense fallback={<PanelLoading label="Đang mở dữ liệu dự án…" />}>
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
          </Suspense>
        ) : mode === 'access' ? (
          <Suspense fallback={<PanelLoading label="Đang mở quyền truy cập…" />}>
          <AccessPanel
            projects={projectStorage.projects}
            files={effectiveFiles}
            accountEmail={snapshot.email}
            audits={accessAudits}
            readOnly={isCached}
            isAuditing={isAuditingAccess}
            auditProgress={auditProgress}
            nonOwnedCount={snapshot.files.filter((file) => file.ownedByMe === false).length}
            isRemoving={isRemovingPermission}
            onAudit={handleAuditAccess}
            onRevoke={handleRevokePermission}
          />
          </Suspense>
        ) : (
          <Suspense fallback={<PanelLoading label="Đang mở nhật ký…" />}>
            <ActivityPanel entries={activityLog} />
          </Suspense>
        )}
      </main>

      {showSettings ? (
        <Suspense fallback={null}>
        <SettingsDialog
          email={snapshot.email}
          lastSyncedAt={snapshot.lastSyncedAt}
          isCached={isCached}
          rules={rules}
          isSyncing={scanState === 'scanning'}
          onRulesChange={updateRules}
          onFullReindex={handleFullReindex}
          onClearCache={handleClearLocalCache}
          onResetDuplicateKeepers={handleResetDuplicateKeepers}
          onClose={() => setShowSettings(false)}
        />
        </Suspense>
      ) : null}

      {pendingProjectTrash ? (
        <Suspense fallback={null}>
          <ProjectTrashDialog
            project={pendingProjectTrash}
            descendantCount={collectDescendantIds(snapshot.files, pendingProjectTrash.folder.id).size}
            unownedCount={snapshot.files.filter((file) =>
              collectDescendantIds(snapshot.files, pendingProjectTrash.folder.id).has(file.id)
              && file.ownedByMe === false
            ).length}
            isWorking={isTrashingProject}
            onCancel={() => setPendingProjectTrash(undefined)}
            onConfirm={handleConfirmedProjectTrash}
          />
        </Suspense>
      ) : null}

      {showConfirm ? (
        <ConfirmDialog
          files={selectedFiles}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirmedClean}
        />
      ) : null}
    </div>
  );
}

export default CleanDriveApp;
