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
import { classifyFiles, filterByCategory, totalBytes } from './lib/classify';
import { demoSnapshot } from './lib/demo-data';
import { formatBytes } from './lib/format';
import { moveFilesToTrash, scanGoogleDrive } from './lib/google-drive';
import type { CategoryId, DriveSnapshot } from './types';

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

  const classifiedFiles = useMemo(() => classifyFiles(snapshot.files), [snapshot.files]);
  const visibleFiles = useMemo(
    () => filterByCategory(classifiedFiles, activeCategory).sort((a, b) => (b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0)),
    [classifiedFiles, activeCategory],
  );
  const selectedFiles = classifiedFiles.filter((file) => selectedIds.has(file.id));
  const suggestionFiles = classifiedFiles.filter((file) => file.categories.length > 0 && !file.protectedReason);
  const potentialSavings = totalBytes(suggestionFiles);
  const limit = BigInt(snapshot.quota.limit || '15000000000');
  const usage = BigInt(snapshot.quota.usage || snapshot.quota.usageInDrive || '0');
  const usagePercent = limit > 0n ? Math.min(100, Number((usage * 100n) / limit)) : 0;

  const handleScan = async () => {
    setScanState('scanning');
    setScanCount(0);
    setMessage(undefined);
    setSelectedIds(new Set());
    setCleanResult(undefined);
    try {
      const nextSnapshot = await scanGoogleDrive(setScanCount);
      setSnapshot(nextSnapshot);
      setIsDemo(false);
      setScanState('idle');
      if (nextSnapshot.incompleteSearch) {
        setMessage('Google báo kết quả quét chưa đầy đủ. App sẽ không cho dọn cho đến khi quét lại hoàn chỉnh.');
      }
    } catch (error) {
      setScanState('error');
      setMessage(error instanceof Error ? error.message : 'Không thể kết nối Google Drive.');
    }
  };

  const handleToggle = (file: (typeof classifiedFiles)[number]) => {
    if (file.protectedReason) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
    setCleanResult(undefined);
  };

  const handleToggleAll = (files: typeof classifiedFiles) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = files.every((file) => next.has(file.id));
      for (const file of files) {
        if (allSelected) next.delete(file.id);
        else next.add(file.id);
      }
      return next;
    });
    setCleanResult(undefined);
  };

  const handleConfirmedClean = async () => {
    setShowConfirm(false);
    setIsCleaning(true);
    setCleanProgress(0);
    setCleanResult(undefined);

    if (isDemo) {
      for (let count = 1; count <= selectedFiles.length; count += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 240));
        setCleanProgress(count);
      }
      setSnapshot((current) => ({
        ...current,
        files: current.files.filter((file) => !selectedIds.has(file.id)),
      }));
      setCleanResult({ succeeded: selectedFiles.length, failed: 0 });
      setSelectedIds(new Set());
      setIsCleaning(false);
      return;
    }

    try {
      const result = await moveFilesToTrash(selectedFiles, setCleanProgress);
      const succeededIds = new Set(result.succeeded);
      setSnapshot((current) => ({
        ...current,
        files: current.files.filter((file) => !succeededIds.has(file.id)),
      }));
      setCleanResult({ succeeded: result.succeeded.length, failed: result.failed.length });
      setSelectedIds(new Set(result.failed.map((item) => item.id)));
      if (result.failed.length) setMessage(`${result.failed.length} file chưa thể đưa vào thùng rác. Bạn có thể thử lại.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể hoàn tất thao tác dọn.');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Clean Drive — trang chính">
          <BrandMark />
          <span>Clean Drive</span>
        </a>
        <div className="topbar__actions">
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
            <p className="eyebrow"><Sparkles size={14} /> Bản xem trước an toàn</p>
            <h1>Chào {snapshot.displayName?.split(' ').at(-1) || 'bạn'}, Drive của bạn đang khá đầy.</h1>
            <p>Mình đã gom các mục đáng xem lại. Không có gì bị xóa nếu bạn chưa xác nhận.</p>
          </div>
          <button className="privacy-note" type="button" title="Clean Drive chỉ dùng metadata như tên, kích thước và ngày sửa. Nội dung file không được tải về.">
            <ShieldCheck size={18} /> Không đọc nội dung file <Info size={14} />
          </button>
        </section>

        {message ? (
          <div className="message-banner" role="alert">
            <AlertCircle size={18} />
            <span>{message}</span>
            {scanState === 'error' ? <button type="button" onClick={handleScan}>Thử lại <ArrowRight size={14} /></button> : null}
          </div>
        ) : null}

        <section className="dashboard-grid" aria-label="Tổng quan dung lượng">
          <div className="storage-card">
            <div className="storage-card__top">
              <div>
                <p>Dung lượng đã dùng</p>
                <strong>{formatBytes(usage)} <small>/ {formatBytes(limit)}</small></strong>
              </div>
              <span style={{ background: `conic-gradient(var(--blue) ${usagePercent}%, #edf1f7 0)` }}>{usagePercent}%</span>
            </div>
            <div className="storage-track" aria-label={`Đã dùng ${usagePercent}%`}>
              <span className="storage-track__files" style={{ width: `${Math.max(0, usagePercent - 12)}%` }} />
              <span className="storage-track__trash" style={{ width: '7%' }} />
              <span className="storage-track__other" style={{ width: '5%' }} />
            </div>
            <div className="storage-legend">
              <span><i className="legend-files" /> Drive {formatBytes(snapshot.quota.usageInDrive)}</span>
              <span><i className="legend-trash" /> Thùng rác {formatBytes(snapshot.quota.usageInDriveTrash)}</span>
              <span><i className="legend-free" /> Còn trống {formatBytes(limit > usage ? limit - usage : 0n)}</span>
            </div>
          </div>

          <StatCard
            label="Có thể giải phóng"
            value={formatBytes(potentialSavings)}
            detail={`${suggestionFiles.length} mục đáng xem lại`}
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
            onToggle={handleToggle}
            onToggleAll={handleToggleAll}
          />

          <CleanupPanel
            selected={selectedFiles}
            isCleaning={isCleaning}
            progress={cleanProgress}
            result={cleanResult}
            onClean={() => setShowConfirm(true)}
            onClear={() => setSelectedIds(new Set())}
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
