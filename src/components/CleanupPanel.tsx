import { CheckCircle2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { formatBytes } from '../lib/format';
import type { ClassifiedFile } from '../types';

type CleanupPanelProps = {
  selected: ClassifiedFile[];
  isCleaning: boolean;
  progress: number;
  result?: { succeeded: number; failed: number };
  onClean: () => void;
  onClear: () => void;
};

export function CleanupPanel({ selected, isCleaning, progress, result, onClean, onClear }: CleanupPanelProps) {
  const bytes = selected.reduce((sum, file) => sum + file.bytes, 0n);

  return (
    <aside className="cleanup-panel" aria-label="Kế hoạch dọn">
      <div className="cleanup-panel__heading">
        <span className="safe-badge"><ShieldCheck size={15} /> Chế độ an toàn</span>
        <h2>Kế hoạch dọn</h2>
        <p>Chỉ những file bạn chọn mới được đưa vào thùng rác.</p>
      </div>

      <div className="cleanup-summary">
        <div>
          <span>Đã chọn</span>
          <strong>{selected.length} file</strong>
        </div>
        <div>
          <span>Có thể giải phóng</span>
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
          <CheckCircle2 size={20} />
          <div>
            <strong>Đã xử lý xong</strong>
            <span>{result.succeeded} thành công · {result.failed} lỗi</span>
          </div>
        </div>
      ) : null}

      <button className="primary-action" type="button" disabled={!selected.length || isCleaning} onClick={onClean}>
        <Trash2 size={18} />
        {isCleaning ? 'Đang đưa vào thùng rác…' : 'Đưa vào thùng rác'}
      </button>
      <button className="secondary-action" type="button" disabled={!selected.length || isCleaning} onClick={onClear}>
        <RotateCcw size={16} /> Bỏ chọn
      </button>
      <p className="retention-note">Bạn có thể khôi phục file từ thùng rác trong vòng 30 ngày.</p>
    </aside>
  );
}
