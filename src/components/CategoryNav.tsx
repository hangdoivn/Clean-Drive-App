import { Archive, Files, FolderOpen, HardDrive, LayoutDashboard } from 'lucide-react';
import type { CategoryId, ClassifiedFile } from '../types';

type CategoryNavProps = {
  active: CategoryId;
  files: ClassifiedFile[];
  onChange: (category: CategoryId) => void;
};

const items: { id: CategoryId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Tất cả đề xuất', icon: LayoutDashboard },
  { id: 'large', label: 'File lớn', icon: HardDrive },
  { id: 'duplicate', label: 'Bản trùng', icon: Files },
  { id: 'old', label: 'Lâu không dùng', icon: Archive },
  { id: 'empty', label: 'Folder rỗng', icon: FolderOpen },
];

export function CategoryNav({ active, files, onChange }: CategoryNavProps) {
  return (
    <nav className="category-nav" aria-label="Nhóm đề xuất">
      {items.map((item) => {
        const category = item.id;
        const count = category === 'overview'
          ? files.filter((file) => file.categories.length > 0).length
          : files.filter((file) => file.categories.includes(category)).length;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={active === item.id ? 'category-nav__item is-active' : 'category-nav__item'}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
          >
            <Icon size={18} />
            <span>{item.label}</span>
            <b>{count}</b>
          </button>
        );
      })}
    </nav>
  );
}
