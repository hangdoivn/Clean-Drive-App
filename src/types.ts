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
};

export type CategoryId = 'overview' | 'large' | 'duplicate' | 'old' | 'empty';
export type DuplicateRole = 'keep' | 'remove';
export type ProjectStatus = 'active' | 'delivered' | 'archive';

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
};

export type ClassifiedFile = DriveFile & {
  bytes: bigint;
  kind: FileKind;
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
};

export type ProjectMetadataInput = {
  name: string;
  client: string;
  status: ProjectStatus;
};
