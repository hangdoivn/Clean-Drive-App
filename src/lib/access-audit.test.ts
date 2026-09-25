import { describe, expect, it } from 'vitest';
import { isInheritedPermission, permissionRisk, summarizeAccessAudit } from './access-audit';
import type { AccessAuditResult, DrivePermission } from '../types';

function permission(overrides: Partial<DrivePermission>): DrivePermission {
  return {
    id: 'p',
    type: 'user',
    role: 'reader',
    ...overrides,
  };
}

describe('access audit risk', () => {
  it('treats public write access as critical', () => {
    expect(permissionRisk(permission({ type: 'anyone', role: 'writer' }))).toBe('critical');
  });

  it('treats public read access as high and domain read as medium', () => {
    expect(permissionRisk(permission({ type: 'anyone', role: 'reader' }))).toBe('high');
    expect(permissionRisk(permission({ type: 'domain', role: 'reader', domain: 'example.com' }))).toBe('medium');
  });

  it('does not flag direct user access as broad by itself', () => {
    expect(permissionRisk(permission({ type: 'user', role: 'writer', emailAddress: 'person@example.com' }))).toBe('safe');
  });

  it('detects inherited permissions', () => {
    const item = permission({
      permissionDetails: [{ inherited: true, inheritedFrom: 'parent' }],
    });
    expect(isInheritedPermission(item)).toBe(true);
  });

  it('summarizes the highest risk and inherited counts', () => {
    const audit: AccessAuditResult = {
      folderId: 'project',
      permissions: [
        permission({ id: 'public', type: 'anyone', role: 'reader' }),
        permission({
          id: 'inherited',
          type: 'domain',
          role: 'reader',
          domain: 'example.com',
          permissionDetails: [{ inherited: true, inheritedFrom: 'root' }],
        }),
        permission({ id: 'owner', type: 'user', role: 'owner' }),
      ],
    };

    const summary = summarizeAccessAudit(audit);
    expect(summary.level).toBe('high');
    expect(summary.broadCount).toBe(2);
    expect(summary.inheritedCount).toBe(1);
    expect(summary.publicWriteCount).toBe(0);
  });

  it('returns unknown when audit is missing or failed', () => {
    expect(summarizeAccessAudit().level).toBe('unknown');
    expect(summarizeAccessAudit({ folderId: 'x', permissions: [], error: 'failed' }).level).toBe('unknown');
  });
});
