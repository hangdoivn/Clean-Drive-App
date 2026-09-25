import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { DrivePermission } from '../types';

type Props = {
  projectName: string;
  permission: DrivePermission;
  isRemoving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function permissionLabel(permission: DrivePermission): string {
  if (permission.type === 'anyone') {
    return permission.allowFileDiscovery ? 'Công khai trên web' : 'Bất kỳ ai có liên kết';
  }
  if (permission.type === 'domain') return permission.domain || 'Toàn miền';
  return permission.emailAddress || permission.displayName || permission.type;
}

export function AccessPermissionDialog({
  projectName,
  permission,
  isRemoving,
  onCancel,
  onConfirm,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);

  return (
    <dialog ref={ref} className="confirm-dialog" onCancel={onCancel}>
      <button className="dialog-close" type="button" onClick={onCancel} aria-label="Đóng">
        <X size={20} />
      </button>
      <span className="dialog-icon"><AlertTriangle size={24} /></span>
      <p className="eyebrow">Xác nhận thay đổi quyền</p>
      <h2>Gỡ quyền khỏi project?</h2>
      <p>
        <strong>{permissionLabel(permission)}</strong> sẽ mất quyền được cấp trực tiếp trên
        folder <strong>{projectName}</strong>. Clean không thay đổi các quyền khác.
      </p>
      <div className="dialog-actions">
        <button type="button" className="secondary-action" disabled={isRemoving} onClick={onCancel}>
          Giữ nguyên
        </button>
        <button type="button" className="danger-action" disabled={isRemoving} onClick={onConfirm}>
          {isRemoving ? 'Đang gỡ quyền…' : 'Xác nhận gỡ quyền'}
        </button>
      </div>
    </dialog>
  );
}
