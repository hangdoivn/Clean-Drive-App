
import { AlertTriangle, FolderKanban, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../lib/format';
import type { ProjectStorageEntry } from '../types';

type Props = {
  project: ProjectStorageEntry;
  descendantCount: number;
  unownedCount: number;
  isWorking: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProjectTrashDialog({
  project,
  descendantCount,
  unownedCount,
  isWorking,
  onCancel,
  onConfirm,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);

  const blocked = unownedCount > 0 || project.status === 'active' || project.folder.capabilities?.canTrash === false;

  return (
    <dialog ref={ref} className="confirm-dialog project-trash-dialog" onCancel={onCancel}>
      <button className="dialog-close" type="button" onClick={onCancel} aria-label="Đóng"><X size={19} /></button>
      <div className="project-trash-icon"><Trash2 size={21} /></div>
      <p className="eyebrow"><FolderKanban size={14} /> Dọn toàn bộ project</p>
      <h2>Đưa “{project.name}” vào thùng rác?</h2>
      <p className="dialog-description">
        Clean sẽ trash folder gốc. Các file/folder bên trong sẽ đi theo parent folder và có thể khôi phục lại từ Trash.
      </p>

      <div className="project-trash-summary">
        <div><span>Dung lượng</span><strong>{formatBytes(project.bytes)}</strong></div>
        <div><span>File</span><strong>{project.fileCount.toLocaleString('vi-VN')}</strong></div>
        <div><span>Folder</span><strong>{project.folderCount.toLocaleString('vi-VN')}</strong></div>
        <div><span>Metadata backup</span><strong>{descendantCount.toLocaleString('vi-VN')} mục</strong></div>
      </div>

      {unownedCount > 0 ? (
        <div className="project-trash-warning">
          <AlertTriangle size={16} />
          <span>Có {unownedCount.toLocaleString('vi-VN')} mục không thuộc sở hữu tài khoản hiện tại. Clean khóa thao tác nguyên project; hãy review theo file.</span>
        </div>
      ) : null}

      {!blocked ? (
        <label className="project-trash-check">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Tôi đã kiểm tra đây là project đã bàn giao/lưu trữ và muốn đưa toàn bộ folder vào Trash.</span>
        </label>
      ) : null}

      <div className="dialog-actions">
        <button type="button" className="secondary-action" disabled={isWorking} onClick={onCancel}>Hủy</button>
        <button type="button" className="primary-action is-danger" disabled={blocked || !confirmed || isWorking} onClick={onConfirm}>
          <Trash2 size={15} /> {isWorking ? 'Đang đưa vào Trash…' : 'Đưa cả project vào Trash'}
        </button>
      </div>
    </dialog>
  );
}
