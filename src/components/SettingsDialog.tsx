import { Database, HardDrive, RefreshCw, RotateCcw, Settings2, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CleanupRules } from '../types';

type Props = {
  email?: string;
  lastSyncedAt?: string;
  isCached: boolean;
  rules: CleanupRules;
  isSyncing: boolean;
  onRulesChange: (rules: CleanupRules) => void;
  onFullReindex: () => Promise<void>;
  onClearCache: () => Promise<void>;
  onResetDuplicateKeepers: () => void;
  onClose: () => void;
};

const LARGE_OPTIONS = [
  { value: 250_000_000, label: '250 MB' },
  { value: 500_000_000, label: '500 MB' },
  { value: 1_000_000_000, label: '1 GB' },
  { value: 2_000_000_000, label: '2 GB' },
  { value: 5_000_000_000, label: '5 GB' },
];

const OLD_OPTIONS = [
  { value: 180, label: '6 tháng' },
  { value: 365, label: '1 năm' },
  { value: 730, label: '2 năm' },
  { value: 1095, label: '3 năm' },
];

export function SettingsDialog({
  email,
  lastSyncedAt,
  isCached,
  rules,
  isSyncing,
  onRulesChange,
  onFullReindex,
  onClearCache,
  onResetDuplicateKeepers,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);

  return (
    <dialog ref={ref} className="settings-dialog" onCancel={onClose}>
      <button className="dialog-close" type="button" onClick={onClose} aria-label="Đóng">
        <X size={20} />
      </button>

      <div className="settings-dialog__head">
        <span><Settings2 size={20} /></span>
        <div>
          <p className="eyebrow">Clean Drive</p>
          <h2>Cài đặt vận hành</h2>
          <p>Thiết lập local trên thiết bị này. Safety rules cốt lõi luôn được khóa.</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__head">
          <Database size={16} />
          <div>
            <strong>Google Drive & metadata index</strong>
            <span>{email || 'Chưa kết nối Google Drive'}</span>
          </div>
        </div>
        <div className="settings-status-grid">
          <div>
            <span>Trạng thái</span>
            <strong>{isCached ? 'Đang dùng cache' : email ? 'Đã đồng bộ' : 'Chưa kết nối'}</strong>
          </div>
          <div>
            <span>Lần đồng bộ gần nhất</span>
            <strong>{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('vi-VN') : '—'}</strong>
          </div>
        </div>
        <div className="settings-actions">
          <button type="button" disabled={isSyncing} onClick={() => { void onFullReindex().catch(() => undefined); }}>
            <RefreshCw className={isSyncing ? 'spin' : ''} size={15} />
            {isSyncing ? 'Đang re-index…' : 'Full re-index Drive'}
          </button>
          <button type="button" disabled={isSyncing} onClick={() => { void onClearCache().catch(() => undefined); }}>
            <Trash2 size={15} /> Xóa metadata cache máy này
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__head">
          <HardDrive size={16} />
          <div>
            <strong>Ngưỡng đề xuất dọn</strong>
            <span>Chỉ ảnh hưởng việc Clean đưa file vào danh sách review.</span>
          </div>
        </div>
        <div className="settings-rule-grid">
          <label>
            <span>File lớn từ</span>
            <select
              value={rules.largeFileBytes}
              onChange={(event) => onRulesChange({ ...rules, largeFileBytes: Number(event.target.value) })}
            >
              {LARGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>File cũ từ</span>
            <select
              value={rules.oldFileDays}
              onChange={(event) => onRulesChange({ ...rules, oldFileDays: Number(event.target.value) })}
            >
              {OLD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="settings-reset-link" onClick={onResetDuplicateKeepers}>
          <RotateCcw size={14} /> Reset lựa chọn bản giữ duplicate
        </button>
      </div>

      <div className="settings-section settings-safety">
        <div className="settings-section__head">
          <ShieldCheck size={16} />
          <div>
            <strong>Safety rules bắt buộc</strong>
            <span>Không thể tắt trong Clean v1.</span>
          </div>
        </div>
        <div className="settings-safety-list">
          <span><ShieldCheck size={14} /> Project đang chạy luôn được bảo vệ</span>
          <span><ShieldCheck size={14} /> Final/Master luôn giữ mặc định</span>
          <span><ShieldCheck size={14} /> Source/Working cần review project</span>
          <span><ShieldCheck size={14} /> Duplicate luôn giữ ít nhất 1 bản</span>
          <span><ShieldCheck size={14} /> Trash luôn cần xác nhận và hỗ trợ Undo</span>
        </div>
      </div>
    </dialog>
  );
}
