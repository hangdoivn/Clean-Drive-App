import type {
  ArchiveProjectSummary,
  ClassifiedFile,
  DriveFile,
  FileKind,
  ProductionRole,
  ProductionRoleSummary,
  RetentionPolicy,
  RetentionPolicyId,
} from '../types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const RETENTION_POLICIES: Record<RetentionPolicyId, RetentionPolicy> = {
  hospitality: {
    id: 'hospitality',
    label: 'Hospitality',
    description: 'Giữ source dài hạn; working review sau 1 năm; temporary review sớm.',
    sourceReviewDays: 1095,
    workingReviewDays: 365,
    temporaryCleanupDays: 30,
  },
  'fnb-retainer': {
    id: 'fnb-retainer',
    label: 'F&B Retainer',
    description: 'Rolling asset theo campaign; final giữ, source/working review sớm hơn.',
    sourceReviewDays: 365,
    workingReviewDays: 180,
    temporaryCleanupDays: 30,
  },
  event: {
    id: 'event',
    label: 'Event',
    description: 'Vòng đời ngắn hơn sau bàn giao; proxy/temp có thể review sớm.',
    sourceReviewDays: 365,
    workingReviewDays: 90,
    temporaryCleanupDays: 14,
  },
  internal: {
    id: 'internal',
    label: 'Internal / General',
    description: 'Preset cân bằng cho project nội bộ hoặc chưa phân loại.',
    sourceReviewDays: 730,
    workingReviewDays: 365,
    temporaryCleanupDays: 30,
  },
};

export function getRetentionPolicy(id?: RetentionPolicyId): RetentionPolicy {
  return RETENTION_POLICIES[id ?? 'internal'];
}

function lastActivityTime(file: ClassifiedFile): number | undefined {
  const viewed = file.viewedByMeTime ? new Date(file.viewedByMeTime).getTime() : 0;
  const modified = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
  const value = Math.max(viewed, modified);
  return value > 0 ? value : undefined;
}

function olderThanDays(file: ClassifiedFile, days: number): boolean {
  const activity = lastActivityTime(file);
  if (!activity) return false;
  return activity < Date.now() - days * 24 * 60 * 60 * 1000;
}


const FINAL_MARKERS = [
  'final', 'master', 'delivery', 'deliverable', 'delivered', 'approved',
  'published', 'publish', 'client final', 'final output',
];
const TEMP_MARKERS = [
  'proxy', 'proxies', 'cache', 'temp', 'temporary', 'tmp', 'preview',
  'render cache', 'media cache', 'optimized media', 'autosave', 'auto-save',
  'scratch', 'transcode', 'generated media', 'peak files',
];
const SOURCE_MARKERS = [
  'raw', 'source', 'sources', 'footage', 'original', 'originals', 'camera',
  'rushes', 'drone', 'photo raw', 'raw photo', 'source media',
];
const WORKING_MARKERS = [
  'working', 'workfile', 'work file', 'edit', 'editing', 'project file',
  'premiere', 'after effects', 'davinci', 'resolve', 'grading', 'retouch',
  'design working', 'wip',
];

function normalized(value: string): string {
  return value.toLocaleLowerCase('en').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasMarker(text: string, markers: string[]): string | undefined {
  return markers.find((marker) => text.includes(marker));
}

function ancestryText(file: DriveFile, byId: Map<string, DriveFile>): string {
  const parts = [file.name];
  let current: DriveFile | undefined = file;
  const visited = new Set<string>([file.id]);

  for (let depth = 0; depth < 8; depth += 1) {
    const parentId = current.parents?.[0];
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.push(parent.name);
    current = parent;
  }

  return normalized(parts.join(' / '));
}

export function classifyProductionRole(
  file: DriveFile,
  kind: FileKind,
  byId: Map<string, DriveFile>,
): { role: ProductionRole; reason: string } {
  if (file.mimeType === FOLDER_MIME) return { role: 'other', reason: 'Folder' };

  const context = ancestryText(file, byId);

  const finalMarker = hasMarker(context, FINAL_MARKERS);
  if (finalMarker) return { role: 'final', reason: `Tên/path có “${finalMarker}”` };

  const tempMarker = hasMarker(context, TEMP_MARKERS);
  if (tempMarker) return { role: 'temporary', reason: `Tên/path có “${tempMarker}”` };

  const sourceMarker = hasMarker(context, SOURCE_MARKERS);
  if (sourceMarker) return { role: 'source', reason: `Tên/path có “${sourceMarker}”` };

  const workingMarker = hasMarker(context, WORKING_MARKERS);
  if (workingMarker) return { role: 'working', reason: `Tên/path có “${workingMarker}”` };

  if (kind === 'photo-raw') return { role: 'source', reason: 'Định dạng Photo RAW' };
  if (kind === 'editing-project' || kind === 'design') return { role: 'working', reason: 'Định dạng file làm việc' };

  return { role: 'other', reason: 'Chưa đủ tín hiệu để gán vai trò' };
}

export function productionProtectionReason(role: ProductionRole): string | undefined {
  if (role === 'final') return 'Final/Master — giữ mặc định';
  if (role === 'source') return 'Source/RAW — cần review project trước khi dọn';
  if (role === 'working') return 'Working/Edit — cần review project trước khi dọn';
  return undefined;
}

export function isArchiveSafeCandidate(
  file: ClassifiedFile,
  policy: RetentionPolicy = getRetentionPolicy(file.project?.retentionPolicyId),
): boolean {
  if (file.protectedReason) return false;
  if (file.duplicateRole === 'keep') return false;
  if (file.duplicateRole === 'remove') return true;
  return file.productionRole === 'temporary' && olderThanDays(file, policy.temporaryCleanupDays);
}

export function isArchiveReviewCandidate(
  file: ClassifiedFile,
  policy: RetentionPolicy = getRetentionPolicy(file.project?.retentionPolicyId),
): boolean {
  if (!file.project || file.kind === 'folder') return false;
  if (file.productionRole === 'source') return olderThanDays(file, policy.sourceReviewDays);
  if (file.productionRole === 'working') return olderThanDays(file, policy.workingReviewDays);
  return false;
}

export function buildArchiveSummary(
  files: ClassifiedFile[],
  folderId: string,
  retentionPolicyId?: RetentionPolicyId,
): ArchiveProjectSummary {
  const projectFiles = files.filter((file) => file.project?.folderId === folderId && file.kind !== 'folder');
  const policy = getRetentionPolicy(retentionPolicyId ?? projectFiles[0]?.project?.retentionPolicyId);
  const roleMap = new Map<ProductionRole, { bytes: bigint; count: number }>();

  for (const file of projectFiles) {
    const current = roleMap.get(file.productionRole) ?? { bytes: 0n, count: 0 };
    current.bytes += file.bytes;
    current.count += 1;
    roleMap.set(file.productionRole, current);
  }

  const safe = projectFiles.filter((file) => isArchiveSafeCandidate(file, policy));
  const review = projectFiles.filter((file) => isArchiveReviewCandidate(file, policy));
  const totalBytes = projectFiles.reduce((sum, file) => sum + file.bytes, 0n);
  const safeRecoverableBytes = safe.reduce((sum, file) => sum + file.bytes, 0n);

  const roleOrder: ProductionRole[] = ['source', 'working', 'final', 'temporary', 'other'];
  const roles: ProductionRoleSummary[] = roleOrder.map((role) => ({
    role,
    bytes: roleMap.get(role)?.bytes ?? 0n,
    count: roleMap.get(role)?.count ?? 0,
  }));

  return {
    folderId,
    retentionPolicyId: policy.id,
    totalBytes,
    totalFiles: projectFiles.length,
    safeRecoverableBytes,
    safeRecoverableCount: safe.length,
    reviewBytes: review.reduce((sum, file) => sum + file.bytes, 0n),
    reviewCount: review.length,
    projectedBytes: totalBytes > safeRecoverableBytes ? totalBytes - safeRecoverableBytes : 0n,
    roles,
  };
}
