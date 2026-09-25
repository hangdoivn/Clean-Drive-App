import { CheckCircle2, RotateCcw, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import { formatBytes } from '../lib/format';
import type { ClassifiedFile, DriveFile } from '../types';

type CleanupPanelProps = {
  selected: ClassifiedFile[];
  isCleaning: boolean;
  progress: number;
  result?: { succeeded: number; failed: number };
  cleanupBlocked?: boolean;
  blockedReason?: string;
  undoFiles?: DriveFile[];
  isRestoring?: boolean;
  onClean: () => void;
  onClear: () => void;
  onUndo?: () => void;
};

export function CleanupPanel({
  selected,
  isCleaning,
  progress,
  result,
  cleanupBlocked,
  blockedReason,
  undoFiles = [],
  isRestoring,
  onClean,
  onClear,
  onUndo,
}: CleanupPanelProps) {
  const bytes = selected.reduce((sum, file) => sum + file.bytes, 0n);
  const undoBytes = undoFiles.reduce((sum, file) => sum + BigInt(file.quotaBytesUsed || file.size || '0'), 0n);

  return (
    <aside className="cleanup-panel" aria-label="Kế hoạch dọn">
      <div className="cleanup-panel__heading">
        <div className="cleanup-panel__title">
          <h2>Kế hoạch dọn</h2>
          <span className="safe-badge"><ShieldCheck size={14} /> An toàn</span>
        </div>
        <p>{cleanupBlocked ? blockedReason : 'Chỉ file bạn chọn mới được đưa vào thùng rác.'}</p>
      </div>

      <div className="cleanup-summary">
        <div>
          <span>Đã chọn</span>
          <strong>{selected.length} file</strong>
        </div>
        <div>
          <span>Giải phóng</span>
          <strong>{formatBytes(bytes)}</strong>
        </div>
      </div>

      {isCleaning ? (
        <div className="clean-progress" aria-live="polite">
          <div className="clean-progress__label">
            <span>Đang xử lý</span>
            <strong>{progress}/{selected.length}</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${selected.length ? (progress / selected.length) * 100 : 0}%` }} /></div>
        </div>
      ) : null}

      {result ? (
        <div className="cleanup-result" aria-live="polite">
          <CheckCircle2 size={18} />
          <div>
            <strong>Đã xử lý xong</strong>
            <span>{result.succeeded} thành công · {result.failed} lỗi</span>
          </div>
        </div>
      ) : null}

      {undoFiles.length > 0 && onUndo ? (
        <button className="undo-action" type="button" disabled={isRestoring || isCleaning} onClick={onUndo}>
          <Undo2 size={16} />
          {isRestoring ? 'Đang khôi phục…' : `Khôi phục ${undoFiles.length} file · ${formatBytes(undoBytes)}`}
        </button>
      ) : null}

      <div className="cleanup-actions">
        <button
          className="primary-action"
          type="button"
          disabled={!selected.length || isCleaning || isRestoring || cleanupBlocked}
          onClick={onClean}
        >
          <Trash2 size={17} />
          {isCleaning ? 'Đang xử lý…' : 'Đưa vào thùng rác'}
        </button>
        <button className="secondary-action" type="button" disabled={!selected.length || isCleaning || isRestoring} onClick={onClear}>
          <RotateCcw size={15} /> Bỏ chọn
        </button>
      </div>

      <p className="retention-note">Không xóa vĩnh viễn · vẫn có thể khôi phục từ thùng rác.</p>
    </aside>
  );
}
