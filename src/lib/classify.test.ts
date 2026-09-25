import { describe, expect, it } from 'vitest';
import {
  classifyFileKind,
  classifyFiles,
  filterByCategory,
  isCleanupCandidate,
  storageByKind,
  totalBytes,
} from './classify';
import type { DriveFile } from '../types';
import { buildProjectStorage, projectAppProperties } from './projects';
import { buildArchiveSummary, classifyProductionRole, getRetentionPolicy, isArchiveSafeCandidate } from './production';

const base: DriveFile = {
  id: 'a',
  name: 'a.zip',
  mimeType: 'application/zip',
  size: '600000000',
  quotaBytesUsed: '600000000',
  md5Checksum: 'same',
  createdTime: '2019-01-01T00:00:00.000Z',
  modifiedTime: '2020-01-01T00:00:00.000Z',
  ownedByMe: true,
  capabilities: { canTrash: true },
};

describe('classifyFiles', () => {
  it('marks large exact duplicate binary files', () => {
    const files = classifyFiles([base, { ...base, id: 'b', name: 'b.zip' }]);
    expect(files[0].categories).toEqual(expect.arrayContaining(['large', 'duplicate', 'old']));
    expect(files[0].duplicateCount).toBe(2);
  });

  it('keeps exactly one file protected from cleanup in every duplicate group', () => {
    const files = classifyFiles([
      base,
      { ...base, id: 'b', name: 'b.zip', modifiedTime: '2021-01-01T00:00:00.000Z' },
      { ...base, id: 'c', name: 'c.zip', modifiedTime: '2022-01-01T00:00:00.000Z' },
    ]);
    expect(files.filter((file) => file.duplicateRole === 'keep')).toHaveLength(1);
    expect(files.filter(isCleanupCandidate)).toHaveLength(2);
    expect(files.find((file) => file.id === 'c')?.duplicateRole).toBe('keep');
  });

  it('allows a user-selected canonical copy without changing duplicate safety', () => {
    const files = classifyFiles(
      [
        base,
        { ...base, id: 'b', name: 'b.zip', modifiedTime: '2022-01-01T00:00:00.000Z' },
      ],
      undefined,
      { 'same:600000000': 'a' },
    );
    expect(files.find((file) => file.id === 'a')?.duplicateRole).toBe('keep');
    expect(files.find((file) => file.id === 'b')?.duplicateRole).toBe('remove');
    expect(files.filter((file) => file.duplicateRole === 'keep')).toHaveLength(1);
  });

  it('prefers a protected duplicate as the keeper', () => {
    const files = classifyFiles([
      base,
      { ...base, id: 'b', starred: true, modifiedTime: '2018-01-01T00:00:00.000Z' },
    ]);
    expect(files.find((file) => file.id === 'b')?.duplicateRole).toBe('keep');
    expect(files.find((file) => file.id === 'a')?.duplicateRole).toBe('remove');
  });

  it('does not call native Google files exact duplicates without a checksum', () => {
    const nativeFiles: DriveFile[] = [
      { ...base, id: 'doc-1', mimeType: 'application/vnd.google-apps.document', md5Checksum: undefined },
      { ...base, id: 'doc-2', mimeType: 'application/vnd.google-apps.document', md5Checksum: undefined },
    ];
    expect(filterByCategory(classifyFiles(nativeFiles), 'duplicate')).toHaveLength(0);
  });

  it('protects starred and unowned files', () => {
    const [starred, unowned] = classifyFiles([
      { ...base, starred: true },
      { ...base, id: 'b', ownedByMe: false },
    ]);
    expect(starred.protectedReason).toBe('Đã gắn dấu sao');
    expect(unowned.protectedReason).toBe('Không thuộc sở hữu của bạn');
  });

  it('uses the latest view/modify activity when deciding if a file is old', () => {
    const recentView = new Date().toISOString();
    const [file] = classifyFiles([{ ...base, viewedByMeTime: recentView }]);
    expect(file.categories).not.toContain('old');
  });

  it('respects custom cleanup thresholds', () => {
    const [file] = classifyFiles([{ ...base, md5Checksum: undefined }], {
      largeFileBytes: 1_000_000_000,
      oldFileDays: 3650,
    });
    expect(file.categories).not.toContain('large');
    expect(file.categories).not.toContain('old');
  });

  it('classifies production file types by extension', () => {
    expect(classifyFileKind({ ...base, name: 'A001.C001.braw', mimeType: 'application/octet-stream' })).toBe('video');
    expect(classifyFileKind({ ...base, name: 'DSC0001.ARW', mimeType: 'application/octet-stream' })).toBe('photo-raw');
    expect(classifyFileKind({ ...base, name: 'campaign.psd', mimeType: 'application/octet-stream' })).toBe('design');
    expect(classifyFileKind({ ...base, name: 'edit.prproj', mimeType: 'application/octet-stream' })).toBe('editing-project');
  });

  it('summarizes storage by production file kind', () => {
    const files = classifyFiles([
      { ...base, md5Checksum: undefined, name: 'clip.mov', mimeType: 'video/quicktime' },
      { ...base, id: 'b', md5Checksum: undefined, name: 'shot.arw', mimeType: 'application/octet-stream' },
    ]);
    const summary = storageByKind(files);
    expect(summary.map((item) => item.kind)).toEqual(expect.arrayContaining(['video', 'photo-raw']));
  });

  it('protects files inside active tagged projects', () => {
    const folder: DriveFile = {
      id: 'project',
      name: 'Akimitsu',
      mimeType: 'application/vnd.google-apps.folder',
      ownedByMe: true,
      capabilities: { canTrash: true },
      appProperties: projectAppProperties({ name: 'Akimitsu Retainer', client: 'Akimitsu', status: 'active' }),
    };
    const child: DriveFile = { ...base, id: 'child', md5Checksum: undefined, parents: ['project'] };
    const files = classifyFiles([folder, child]);
    expect(files.find((file) => file.id === 'child')?.protectedReason).toBe('Thuộc dự án đang hoạt động');
  });

  it('aggregates storage by top-level project folder', () => {
    const rootFolder: DriveFile = {
      id: 'root-project',
      name: 'Columbo',
      mimeType: 'application/vnd.google-apps.folder',
      ownedByMe: true,
      capabilities: { canTrash: true },
    };
    const nestedFolder: DriveFile = {
      ...rootFolder,
      id: 'nested',
      name: 'RAW',
      parents: ['root-project'],
    };
    const file: DriveFile = { ...base, id: 'clip', md5Checksum: undefined, parents: ['nested'] };
    const storage = buildProjectStorage([rootFolder, nestedFolder, file]);
    expect(storage.projects).toHaveLength(1);
    expect(storage.projects[0].folder.id).toBe('root-project');
    expect(storage.projects[0].bytes).toBe(600_000_000n);
  });

  it('classifies production roles from path and file type', () => {
    const project: DriveFile = {
      id: 'p',
      name: 'Campaign',
      mimeType: 'application/vnd.google-apps.folder',
      ownedByMe: true,
      capabilities: { canTrash: true },
    };
    const rawFolder: DriveFile = { ...project, id: 'raw', name: 'RAW', parents: ['p'] };
    const proxyFolder: DriveFile = { ...project, id: 'proxy', name: 'Proxy', parents: ['p'] };
    const byId = new Map([project, rawFolder, proxyFolder].map((file) => [file.id, file]));
    expect(classifyProductionRole({ ...base, id: 'r', name: 'A001.mov', parents: ['raw'] }, 'video', byId).role).toBe('source');
    expect(classifyProductionRole({ ...base, id: 'x', name: 'A001.mp4', parents: ['proxy'] }, 'video', byId).role).toBe('temporary');
    expect(classifyProductionRole({ ...base, id: 'd', name: 'KV.psd', md5Checksum: undefined }, 'design', byId).role).toBe('working');
  });

  it('does not count source or working files as default cleanup candidates', () => {
    const source = classifyFiles([{ ...base, id: 'raw-1', name: 'DSC0001.ARW', md5Checksum: undefined }])[0];
    const working = classifyFiles([{ ...base, id: 'work-1', name: 'Campaign.psd', md5Checksum: undefined }])[0];
    expect(source.productionRole).toBe('source');
    expect(working.productionRole).toBe('working');
    expect(isCleanupCandidate(source)).toBe(false);
    expect(isCleanupCandidate(working)).toBe(false);
  });

  it('builds archive preview from safe temporary and duplicate files only', () => {
    const folder: DriveFile = {
      id: 'project-archive',
      name: 'Delivered Campaign',
      mimeType: 'application/vnd.google-apps.folder',
      ownedByMe: true,
      capabilities: { canTrash: true },
      appProperties: projectAppProperties({ name: 'Delivered', client: 'Client', status: 'delivered' }),
    };
    const proxyFolder: DriveFile = {
      id: 'proxy-folder',
      name: 'Proxy',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['project-archive'],
      ownedByMe: true,
      capabilities: { canTrash: true },
    };
    const files = classifyFiles([
      folder,
      proxyFolder,
      { ...base, id: 'proxy-file', name: 'preview.mp4', md5Checksum: undefined, parents: ['proxy-folder'] },
      { ...base, id: 'source-file', name: 'DSC0001.ARW', md5Checksum: undefined, parents: ['project-archive'] },
    ]);
    const summary = buildArchiveSummary(files, 'project-archive');
    expect(summary.totalFiles).toBe(2);
    expect(files.find((file) => file.id === 'proxy-file')?.productionRole).toBe('temporary');
    expect(isArchiveSafeCandidate(files.find((file) => file.id === 'proxy-file')!)).toBe(true);
    expect(isArchiveSafeCandidate(files.find((file) => file.id === 'source-file')!)).toBe(false);
    expect(summary.safeRecoverableCount).toBe(1);
  });

  it('applies retention policy thresholds to temporary archive candidates', () => {
    const project: DriveFile = {
      id: 'policy-project',
      name: 'Event',
      mimeType: 'application/vnd.google-apps.folder',
      ownedByMe: true,
      capabilities: { canTrash: true },
      appProperties: projectAppProperties({
        name: 'Event',
        client: 'Client',
        status: 'delivered',
        retentionPolicyId: 'event',
      }),
    };
    const proxy: DriveFile = {
      ...base,
      id: 'recent-proxy',
      name: 'proxy.mp4',
      md5Checksum: undefined,
      parents: ['policy-project'],
      modifiedTime: new Date().toISOString(),
    };
    const [classified] = classifyFiles([project, proxy]).filter((file) => file.id === 'recent-proxy');
    expect(classified.project?.retentionPolicyId).toBe('event');
    expect(isArchiveSafeCandidate(classified, getRetentionPolicy('event'))).toBe(false);
  });

  it('sums int64 byte values using bigint', () => {
    const files = classifyFiles([base, { ...base, id: 'b' }]);
    expect(totalBytes(files)).toBe(1_200_000_000n);
  });
});
