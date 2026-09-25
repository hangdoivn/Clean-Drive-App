export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  quotaBytesUsed?: string;
  md5Checksum?: string;
  createdTime?: string;
  modifiedTime?: string;
  viewedByMeTime?: string;
  parents?: string[];
  ownedByMe?: boolean;
  starred?: boolean;
  trashed?: boolean;
  capabilities?: { canTrash?: boolean };
  webViewLink?: string;
  appProperties?: Record<string, string>;
  owners?: { displayName?: string; emailAddress?: string }[];
  shared?: boolean;
};

export type StorageQuota = {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
};

export type DriveSnapshot = {
  files: DriveFile[];
  quota: StorageQuota;
  displayName?: string;
  email?: string;
  incompleteSearch: boolean;
  changePageToken?: string;
  lastSyncedAt?: string;
};

export type CategoryId = 'overview' | 'large' | 'duplicate' | 'old' | 'empty';
export type DuplicateRole = 'keep' | 'remove';
export type ProjectStatus = 'active' | 'delivered' | 'archive';

export type ProductionRole = 'source' | 'working' | 'final' | 'temporary' | 'other';
export type RetentionPolicyId = 'hospitality' | 'fnb-retainer' | 'event' | 'internal';

export type RetentionPolicy = {
  id: RetentionPolicyId;
  label: string;
  description: string;
  sourceReviewDays: number;
  workingReviewDays: number;
  temporaryCleanupDays: number;
};

export type FileKind =
  | 'video'
  | 'photo-raw'
  | 'image'
  | 'design'
  | 'editing-project'
  | 'archive'
  | 'document'
  | 'folder'
  | 'other';

export type CleanupRules = {
  largeFileBytes: number;
  oldFileDays: number;
};

export type ProjectContext = {
  folderId: string;
  name: string;
  client?: string;
  status: ProjectStatus;
  coreProjectId?: string;
  retentionPolicyId?: RetentionPolicyId;
};

export type ClassifiedFile = DriveFile & {
  bytes: bigint;
  kind: FileKind;
  productionRole: ProductionRole;
  productionRoleReason?: string;
  categories: Exclude<CategoryId, 'overview'>[];
  protectedReason?: string;
  duplicateCount?: number;
  duplicateGroupId?: string;
  duplicateRole?: DuplicateRole;
  project?: ProjectContext;
};

export type ProjectStorageEntry = {
  folder: DriveFile;
  bytes: bigint;
  fileCount: number;
  folderCount: number;
  tagged: boolean;
  name: string;
  client?: string;
  status?: ProjectStatus;
  coreProjectId?: string;
  retentionPolicyId?: RetentionPolicyId;
};

export type ProjectMetadataInput = {
  name: string;
  client: string;
  status: ProjectStatus;
  coreProjectId?: string;
  retentionPolicyId?: RetentionPolicyId;
};


export type DrivePermission = {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  domain?: string;
  displayName?: string;
  allowFileDiscovery?: boolean;
  deleted?: boolean;
  expirationTime?: string;
  pendingOwner?: boolean;
  permissionDetails?: {
    inherited?: boolean;
    inheritedFrom?: string;
    permissionType?: string;
    role?: string;
  }[];
};

export type AccessAuditResult = {
  folderId: string;
  permissions: DrivePermission[];
  error?: string;
};


export type CoreProject = {
  id: string;
  projectCode?: string | null;
  name: string;
  currentStatus?: string | null;
  status?: string | null;
  deliveryStatus?: string | null;
  client?: { id: string; companyName: string } | null;
};

export type CoreSessionUser = {
  id: string;
  email: string;
  status: string;
  permissions?: string[];
  employee?: { id: string; fullName: string } | null;
};

export type CoreSession = {
  accessToken: string;
  refreshToken: string;
  user: CoreSessionUser;
};


export type ActivityLogType = 'sync' | 'cleanup' | 'restore' | 'project' | 'permission';

export type ActivityLogEntry = {
  id: string;
  type: ActivityLogType;
  createdAt: string;
  title: string;
  detail?: string;
  count?: number;
  bytes?: string;
};


export type ProductionRoleSummary = {
  role: ProductionRole;
  bytes: bigint;
  count: number;
};

export type ArchiveProjectSummary = {
  folderId: string;
  retentionPolicyId: RetentionPolicyId;
  totalBytes: bigint;
  totalFiles: number;
  safeRecoverableBytes: bigint;
  safeRecoverableCount: number;
  reviewBytes: bigint;
  reviewCount: number;
  projectedBytes: bigint;
  roles: ProductionRoleSummary[];
};
