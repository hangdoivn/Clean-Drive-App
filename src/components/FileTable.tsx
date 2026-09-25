import { ExternalLink, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBytes, formatDate } from '../lib/format';
import type { ClassifiedFile, FileKind } from '../types';
import { FileIcon } from './FileIcon';

type FileTableProps = {
  files: ClassifiedFile[];
  selectedIds: Set<string>;
  cleanupBlocked?: boolean;
  oldFileDays: number;
  onToggle: (file: ClassifiedFile) => void;
  onToggleAll: (files: ClassifiedFile[]) => void;
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

function reasonLabel(file: ClassifiedFile, oldFileDays: number): string {
  if (file.categories.includes('duplicate')) {
    return file.duplicateRole === 'keep'
      ? `Bản giữ lại · ${file.duplicateCount} bản giống nhau`
      : `Có thể dọn · ${file.duplicateCount} bản giống nhau`;
  }
  if (file.categories.includes('large')) return 'File dung lượng lớn';
  if (file.categories.includes('old')) {
    const years = oldFileDays / 365;
    return years >= 1 ? `Không hoạt động hơn ${Number.isInteger(years) ? years : years.toFixed(1)} năm` : 'Không hoạt động hơn 6 tháng';
  }
  if (file.categories.includes('empty')) return 'Không có file bên trong';
  return 'Đề xuất xem lại';
}

function disabledReason(file: ClassifiedFile, cleanupBlocked?: boolean): string | undefined {
  if (cleanupBlocked) return 'Quét Drive chưa hoàn chỉnh';
  if (file.protectedReason) return file.protectedReason;
  if (file.duplicateRole === 'keep') return 'Clean giữ lại ít nhất 1 bản trong nhóm trùng lặp';
  return undefined;
}

export function FileTable({ files, selectedIds, cleanupBlocked, oldFileDays, onToggle, onToggleAll }: FileTableProps) {
  const [query, setQuery] = useState('');
  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    if (!normalized) return files;
    return files.filter((file) => file.name.toLocaleLowerCase('vi').includes(normalized));
  }, [files, query]);

  const selectableFiles = visibleFiles.filter((file) => !disabledReason(file, cleanupBlocked));
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
              disabled={selectableFiles.length === 0}
              onChange={() => onToggleAll(selectableFiles)}
              aria-label="Chọn tất cả file có thể dọn"
            />
          </div>
          <div role="columnheader">Tên file</div>
          <div role="columnheader">Lý do</div>
          <div role="columnheader">Hoạt động</div>
          <div role="columnheader" className="align-right">Dung lượng</div>
        </div>

        {visibleFiles.length === 0 ? (
          <div className="empty-state">
            <ShieldCheck size={30} />
            <strong>Không tìm thấy file phù hợp</strong>
            <span>Thử đổi nhóm hoặc từ khóa tìm kiếm.</span>
          </div>
        ) : visibleFiles.map((file) => {
          const disabled = disabledReason(file, cleanupBlocked);
          return (
            <div
              className={`file-table__row${disabled ? ' is-protected' : ''}`}
              role="row"
              key={file.id}
            >
              <div role="cell" className="check-cell">
                <input
                  type="checkbox"
                  checked={selectedIds.has(file.id)}
                  disabled={Boolean(disabled)}
                  onChange={() => onToggle(file)}
                  aria-label={`Chọn ${file.name}`}
                />
              </div>
              <div role="cell" className="file-name-cell">
                <FileIcon mimeType={file.mimeType} />
                <span>
                  <strong>{file.name}</strong>
                  <span className="file-meta-line">
                    <small className="file-kind-chip">{kindLabels[file.kind]}</small>
                    {file.webViewLink ? (
                      <a href={file.webViewLink} target="_blank" rel="noreferrer">
                        Mở Drive <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </span>
                </span>
              </div>
              <div role="cell" className="reason-cell">
                {disabled ? (
                  <span className="protection-label" title={disabled}>
                    <LockKeyhole size={14} /> {file.duplicateRole === 'keep' ? 'Giữ lại' : 'Được bảo vệ'}
                  </span>
                ) : reasonLabel(file, oldFileDays)}
              </div>
              <div role="cell" className="date-cell">{formatDate(file.viewedByMeTime || file.modifiedTime)}</div>
              <div role="cell" className="size-cell align-right">{formatBytes(file.bytes)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
