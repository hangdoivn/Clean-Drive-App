import type { AccessAuditResult, DrivePermission } from '../types';

export type AccessRiskLevel = 'critical' | 'high' | 'medium' | 'safe' | 'unknown';

export type AccessRiskSummary = {
  level: AccessRiskLevel;
  broadCount: number;
  directCount: number;
  inheritedCount: number;
  publicWriteCount: number;
};

function roleCanWrite(role: string): boolean {
  return role === 'writer' || role === 'organizer' || role === 'fileOrganizer';
}

export function isInheritedPermission(permission: DrivePermission): boolean {
  return Boolean(permission.permissionDetails?.some((detail) => detail.inherited));
}

export function permissionRisk(permission: DrivePermission): AccessRiskLevel {
  if (permission.deleted || permission.role === 'owner') return 'safe';

  if (permission.type === 'anyone') {
    return roleCanWrite(permission.role) ? 'critical' : 'high';
  }

  if (permission.type === 'domain') {
    return roleCanWrite(permission.role) ? 'high' : 'medium';
  }

  return 'safe';
}

const riskRank: Record<AccessRiskLevel, number> = {
  unknown: -1,
  safe: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function summarizeAccessAudit(audit?: AccessAuditResult): AccessRiskSummary {
  if (!audit || audit.error) {
    return {
      level: 'unknown',
      broadCount: 0,
      directCount: 0,
      inheritedCount: 0,
      publicWriteCount: 0,
    };
  }

  let level: AccessRiskLevel = 'safe';
  let broadCount = 0;
  let directCount = 0;
  let inheritedCount = 0;
  let publicWriteCount = 0;

  for (const permission of audit.permissions) {
    const risk = permissionRisk(permission);
    if (riskRank[risk] > riskRank[level]) level = risk;

    if (permission.type === 'anyone' || permission.type === 'domain') broadCount += 1;
    if ((permission.type === 'user' || permission.type === 'group') && permission.role !== 'owner') directCount += 1;
    if (isInheritedPermission(permission)) inheritedCount += 1;
    if (permission.type === 'anyone' && roleCanWrite(permission.role)) publicWriteCount += 1;
  }

  return { level, broadCount, directCount, inheritedCount, publicWriteCount };
}
