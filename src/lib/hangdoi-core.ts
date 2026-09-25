import type { CoreProject, CoreSession, CoreSessionUser, DriveFile, ProjectStatus } from '../types';
import {
  PROJECT_CLIENT_PROP,
  PROJECT_ID_PROP,
  PROJECT_NAME_PROP,
  PROJECT_STATUS_PROP,
} from './projects';

const API_BASE = (import.meta.env.VITE_HANGDOI_API_BASE_URL as string | undefined)
  || 'https://api.hangdoistudio.vn/api';
const COOKIE_NAME = 'hangdoi-session';
const LEGACY_KEY = 'hangdoi-admin-session';
const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type CookiePayload = { a: string; r: string; k?: 1 };
type StoredSession = { session: CoreSession; remember: boolean };

class CoreApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CoreApiError';
  }
}

function cookieDomainAttr(): string {
  const host = window.location.hostname;
  return host === 'hangdoistudio.vn' || host.endsWith('.hangdoistudio.vn')
    ? '; domain=.hangdoistudio.vn'
    : '';
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

function sessionFromTokens(accessToken: string, refreshToken: string): CoreSession {
  return {
    accessToken,
    refreshToken,
    user: { id: '', email: '', status: 'active' },
  };
}

function readStoredSession(): StoredSession | null {
  const rawCookie = readCookie(COOKIE_NAME);
  if (rawCookie) {
    try {
      const payload = JSON.parse(rawCookie) as Partial<CookiePayload>;
      if (payload.a && payload.r) {
        return {
          session: sessionFromTokens(payload.a, payload.r),
          remember: payload.k === 1,
        };
      }
    } catch {
      // Fall through to legacy storage.
    }
  }

  for (const storage of [window.sessionStorage, window.localStorage]) {
    const raw = storage.getItem(LEGACY_KEY);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as CoreSession;
      if (parsed.accessToken && parsed.refreshToken) {
        return { session: parsed, remember: storage === window.localStorage };
      }
    } catch {
      // Ignore invalid legacy session.
    }
  }
  return null;
}

function writeStoredSession(session: CoreSession, remember: boolean): void {
  const payload: CookiePayload = remember
    ? { a: session.accessToken, r: session.refreshToken, k: 1 }
    : { a: session.accessToken, r: session.refreshToken };
  const maxAge = remember ? `; max-age=${REMEMBER_MAX_AGE_SECONDS}` : '';
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}; path=/${cookieDomainAttr()}${maxAge}; samesite=lax${secure}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = json?.message || `HTTP ${response.status}`;
    throw new CoreApiError(Array.isArray(message) ? message.join(', ') : String(message), response.status);
  }
  return json as T;
}

async function refreshSession(stored: StoredSession): Promise<StoredSession> {
  const session = await request<CoreSession>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: stored.session.refreshToken }),
  });
  writeStoredSession(session, stored.remember);
  return { session, remember: stored.remember };
}

async function withAuth<T>(
  stored: StoredSession,
  path: string,
): Promise<{ value: T; stored: StoredSession }> {
  const run = (session: CoreSession) => request<T>(path, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  try {
    return { value: await run(stored.session), stored };
  } catch (error) {
    if (!(error instanceof CoreApiError) || error.status !== 401 || !stored.session.refreshToken) throw error;
    const refreshed = await refreshSession(stored);
    return { value: await run(refreshed.session), stored: refreshed };
  }
}

export function mapCoreProjectStatus(value?: string | null): ProjectStatus {
  const status = String(value || '').trim().toLowerCase();
  if (['delivered', 'completed'].includes(status)) return 'delivered';
  if (['closed', 'cancelled', 'archived'].includes(status)) return 'archive';
  return 'active';
}

export function applyCoreProjectOverlay(files: DriveFile[], coreProjects: CoreProject[]): DriveFile[] {
  if (!coreProjects.length) return files;
  const byId = new Map(coreProjects.map((project) => [project.id, project]));

  return files.map((file) => {
    const coreProjectId = file.appProperties?.[PROJECT_ID_PROP];
    if (!coreProjectId) return file;
    const project = byId.get(coreProjectId);
    if (!project) return file;

    return {
      ...file,
      appProperties: {
        ...(file.appProperties ?? {}),
        [PROJECT_NAME_PROP]: project.name,
        [PROJECT_CLIENT_PROP]: project.client?.companyName || file.appProperties?.[PROJECT_CLIENT_PROP] || '',
        [PROJECT_STATUS_PROP]: mapCoreProjectStatus(project.currentStatus || project.status),
      },
    };
  });
}

export async function loadCoreContext(): Promise<{
  session: CoreSession;
  projects: CoreProject[];
}> {
  let stored = readStoredSession();
  if (!stored) throw new Error('Chưa có phiên đăng nhập Hang Đôi OS dùng chung.');

  const me = await withAuth<CoreSessionUser>(stored, '/auth/me');
  stored = me.stored;
  const session: CoreSession = { ...stored.session, user: me.value };

  if (!(session.user.permissions ?? []).includes('read:projects')) {
    throw new Error('Tài khoản hiện tại chưa có quyền read:projects.');
  }

  const projects = await withAuth<CoreProject[]>({ ...stored, session }, '/projects');
  writeStoredSession(projects.stored.session, projects.stored.remember);

  return { session: { ...projects.stored.session, user: session.user }, projects: projects.value };
}
