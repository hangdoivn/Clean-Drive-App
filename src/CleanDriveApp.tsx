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
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { CategoryNav } from './components/CategoryNav';
import { CleanupPanel } from './components/CleanupPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FileTable } from './components/FileTable';
import { StatCard } from './components/StatCard';
import { classifyFiles, filterByCategory, isCleanupCandidate, totalBytes } from './lib/classify';
import { demoSnapshot } from './lib/demo-data';
import { formatBytes } from './lib/format';
import { moveFilesToTrash, restoreFilesFromTrash, scanGoogleDrive } from './lib/google-drive';
import type { CategoryId, DriveFile, DriveSnapshot } from './types';

function toBytes(value?: string): bigint {
  return BigInt(value || '0');
}

export function CleanDriveApp() {
  const [snapshot, setSnapshot] = useState<DriveSnapshot>(demoSnapshot);
  const [isDemo, setIsDemo] = useState(true);
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

  const classifiedFiles = useMemo(() => classifyFiles(snapshot.files), [snapshot.files]);
  const visibleFiles = useMemo(
    () => filterByCategory(classifiedFiles, activeCategory).sort((a, b) => (b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0)),
    [classifiedFiles, activeCategory],
  );

  const cleanupBlocked = !isDemo && snapshot.incompleteSearch;
  const selectedFiles = classifiedFiles.filter((file) => selectedIds.has(file.id) && isCleanupCandidate(file));
  const suggestionFiles = classifiedFiles.filter(isCleanupCandidate);
  const potentialSavings = totalBytes(suggestionFiles);

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

  const handleScan = async () => {
    setScanState('scanning');
    setScanCount(0);
    setMessage(undefined);
    setSelectedIds(new Set());
    setCleanResult(undefined);
    setLastTrashBatch([]);
    try {
      const nextSnapshot = await scanGoogleDrive(setScanCount);
      setSnapshot(nextSnapshot);
      setIsDemo(false);
      setScanState('idle');
      if (nextSnapshot.incompleteSearch) {
        setMessage('Google báo kết quả quét chưa đầy đủ. Clean đã khóa thao tác dọn; hãy quét lại trước khi thay đổi file.');
      }
    } catch (error) {
      setScanState('error');
      setMessage(error instanceof Error ? error.message : 'Không thể kết nối Google Drive.');
    }
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
      if (result.failed.length) {
        setMessage(`${result.failed.length} file chưa khôi phục được. Clean giữ nút khôi phục để bạn thử lại.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể khôi phục file.');
    } finally {
      setIsRestoring(false);
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
          <span className={isDemo ? 'data-badge is-demo' : 'data-badge is-live'}>
            <span /> {isDemo ? 'Dữ liệu mô phỏng' : 'Drive đã kết nối'}
          </span>
          <button className="connect-button" type="button" onClick={handleScan} disabled={scanState === 'scanning'}>
            {scanState === 'scanning' ? <RefreshCw className="spin" size={17} /> : <Cloud size={17} />}
            {scanState === 'scanning' ? `Đang quét ${scanCount.toLocaleString('vi-VN')} file` : isDemo ? 'Kết nối Google Drive' : 'Quét lại Drive'}
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

        {message ? (
          <div className="message-banner" role="alert">
            <AlertCircle size={18} />
            <span>{message}</span>
            {scanState === 'error' || cleanupBlocked ? <button type="button" onClick={handleScan}>Quét lại <ArrowRight size={14} /></button> : null}
          </div>
        ) : null}

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
            selectedIds={selectedIds}
            cleanupBlocked={cleanupBlocked}
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
          />

          <CleanupPanel
            selected={selectedFiles}
            isCleaning={isCleaning}
            progress={cleanProgress}
            result={cleanResult}
            cleanupBlocked={cleanupBlocked}
            blockedReason="Lần quét chưa hoàn chỉnh nên Clean đã khóa mọi thay đổi file."
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
