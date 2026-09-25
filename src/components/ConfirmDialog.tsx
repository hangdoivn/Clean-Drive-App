import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatBytes } from '../lib/format';
import type { ClassifiedFile } from '../types';

type ConfirmDialogProps = {
  files: ClassifiedFile[];
  isDemo: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ files, isDemo, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0n);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="confirm-dialog" onCancel={onCancel}>
      <button className="dialog-close" type="button" onClick={onCancel} aria-label="Đóng">
        <X size={20} />
      </button>
      <span className="dialog-icon"><AlertTriangle size={24} /></span>
      <p className="eyebrow">Xác nhận lần cuối</p>
      <h2>Đưa {files.length} file vào thùng rác?</h2>
      <p>
        Dung lượng ước tính <strong>{formatBytes(bytes)}</strong>. File không bị xóa vĩnh viễn và có thể khôi phục trong 30 ngày.
      </p>
      {isDemo ? <div className="demo-notice">Đây là dữ liệu mô phỏng — thao tác chỉ được diễn thử.</div> : null}
      <div className="dialog-actions">
        <button type="button" className="secondary-action" onClick={onCancel}>Quay lại kiểm tra</button>
        <button type="button" className="danger-action" onClick={onConfirm}>Xác nhận đưa vào thùng rác</button>
      </div>
    </dialog>
  );
}
