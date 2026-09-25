import { SlidersHorizontal } from 'lucide-react';
import type { CleanupRules } from '../types';

type CleanupRulesBarProps = {
  rules: CleanupRules;
  onChange: (rules: CleanupRules) => void;
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

export function CleanupRulesBar({ rules, onChange }: CleanupRulesBarProps) {
  return (
    <section className="rules-bar" aria-label="Ngưỡng đề xuất dọn">
      <div className="rules-bar__label">
        <SlidersHorizontal size={17} />
        <div>
          <strong>Ngưỡng đề xuất</strong>
          <span>Chỉ thay đổi cách Clean gợi ý, không tự xóa file.</span>
        </div>
      </div>
      <label>
        <span>File lớn từ</span>
        <select
          value={rules.largeFileBytes}
          onChange={(event) => onChange({ ...rules, largeFileBytes: Number(event.target.value) })}
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
          onChange={(event) => onChange({ ...rules, oldFileDays: Number(event.target.value) })}
        >
          {OLD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
