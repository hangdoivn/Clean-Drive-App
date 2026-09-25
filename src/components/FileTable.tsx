import { ExternalLink, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBytes, formatDate } from '../lib/format';
import type { ClassifiedFile } from '../types';
import { FileIcon } from './FileIcon';

type FileTableProps = {
  files: ClassifiedFile[];
  selectedIds: Set<string>;
  onToggle: (file: ClassifiedFile) => void;
  onToggleAll: (files: ClassifiedFile[]) => void;
};

function reasonLabel(file: ClassifiedFile): string {
  if (file.categories.includes('duplicate')) return `${file.duplicateCount} bản giống nhau`;
  if (file.categories.includes('large')) return 'File dung lượng lớn';
  if (file.categories.includes('old')) return 'Không chỉnh sửa hơn 2 năm';
  if (file.categories.includes('empty')) return 'Không có file bên trong';
  return 'Đề xuất xem lại';
}

export function FileTable({ files, selectedIds, onToggle, onToggleAll }: FileTableProps) {
  const [query, setQuery] = useState('');
  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    if (!normalized) return files;
    return files.filter((file) => file.name.toLocaleLowerCase('vi').includes(normalized));
  }, [files, query]);
  const selectableFiles = visibleFiles.filter((file) => !file.protectedReason);
  const allSelected = selectableFiles.length > 0 && selectableFiles.every((file) => selectedIds.has(file.id));

  return (
    <section className="files-card" aria-labelledby="files-title">
      <div className="files-card__header">
        <div>
          <p className="eyebrow">Xem trước trước khi dọn</p>
          <h2 id="files-title">Các file nên xem lại</h2>
        </div>
        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Tìm theo tên file</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên" />
        </label>
      </div>

      <div className="file-table" role="table" aria-label="Danh sách file đề xuất">
        <div className="file-table__row file-table__head" role="row">
          <div role="columnheader" className="check-cell">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleAll(selectableFiles)}
              aria-label="Chọn tất cả file có thể dọn"
            />
          </div>
          <div role="columnheader">Tên file</div>
          <div role="columnheader">Lý do</div>
          <div role="columnheader">Chỉnh sửa</div>
          <div role="columnheader" className="align-right">Dung lượng</div>
        </div>

        {visibleFiles.length === 0 ? (
          <div className="empty-state">
            <ShieldCheck size={30} />
            <strong>Không tìm thấy file phù hợp</strong>
            <span>Thử đổi nhóm hoặc từ khóa tìm kiếm.</span>
          </div>
        ) : visibleFiles.map((file) => (
          <div
            className={`file-table__row${file.protectedReason ? ' is-protected' : ''}`}
            role="row"
            key={file.id}
          >
            <div role="cell" className="check-cell">
              <input
                type="checkbox"
                checked={selectedIds.has(file.id)}
                disabled={Boolean(file.protectedReason)}
                onChange={() => onToggle(file)}
                aria-label={`Chọn ${file.name}`}
              />
            </div>
            <div role="cell" className="file-name-cell">
              <FileIcon mimeType={file.mimeType} />
              <span>
                <strong>{file.name}</strong>
                {file.webViewLink ? (
                  <a href={file.webViewLink} target="_blank" rel="noreferrer">
                    Mở trên Drive <ExternalLink size={12} />
                  </a>
                ) : <small>{file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}</small>}
              </span>
            </div>
            <div role="cell" className="reason-cell">
              {file.protectedReason ? (
                <span className="protection-label" title={file.protectedReason}>
                  <LockKeyhole size={14} /> Được bảo vệ
                </span>
              ) : reasonLabel(file)}
            </div>
            <div role="cell" className="date-cell">{formatDate(file.modifiedTime)}</div>
            <div role="cell" className="size-cell align-right">{formatBytes(file.bytes)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
