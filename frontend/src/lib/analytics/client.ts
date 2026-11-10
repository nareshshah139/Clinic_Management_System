'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { OpenPanel } from '@openpanel/sdk';
import type { User } from '@/lib/types';
import { SCREEN_VIEW, type EventName, type EventProps } from './vocabulary';
import { checkWire, identityOf, routeTemplate, type Identity } from './wire';

export interface AnalyticsConfig {
  clientId: string;
  apiUrl: string;
}

const DEFAULT_API_URL = 'https://api.openpanel.dev';
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];

export function readConfig(env: { clientId?: string; apiUrl?: string }): AnalyticsConfig | null {
  const clientId = env.clientId?.trim();
  if (!clientId) return null;
  const apiUrl = (env.apiUrl?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  try {
    const url = new URL(apiUrl);
    const secure = url.protocol === 'https:';
    const loopback = url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname);
    return secure || loopback ? { clientId, apiUrl } : null;
  } catch {
    return null;
  }
}

let sdk: OpenPanel | null | undefined;
let identity: Identity | null = null;
let lastScreen: string | null = null;

function getSdk(): OpenPanel | null {
  if (typeof window === 'undefined') return null;
  if (sdk !== undefined) return sdk;
  const config = readConfig({
    clientId: process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID,
    apiUrl: process.env.NEXT_PUBLIC_OPENPANEL_API_URL,
  });
  try {
    sdk = config ? new OpenPanel({ ...config, sdk: 'web' }) : null;
  } catch {
    sdk = null;
  }
  return sdk;
}

function emit(candidate: unknown): void {
  const safe = checkWire(candidate);
  if (!safe) return;
  const client = getSdk();
  if (!client) return;
  try {
    void client.send(safe).catch(() => {});
  } catch {}
}

/**
 * @cc [owner:nareshshah139,label:security] analytics-never-affects-app
 * Analytics MUST NOT affect the app: track returns void, never throws, and sends nothing when
 * NEXT_PUBLIC_OPENPANEL_CLIENT_ID is unset or no staff member is signed in.
 */
export function track<N extends EventName>(
  name: N,
  ...props: keyof EventProps<N> extends never ? [] : [EventProps<N>]
): void {
  try {
    if (!identity) return;
    const [declared] = props;
    emit({
      type: 'track',
      payload: {
        name,
        profileId: identity.staffId,
        properties: {
          ...declared,
          role: identity.role,
          branch_id: identity.branchId ?? 'none',
        },
      },
    });
  } catch {}
}

const sameIdentity = (a: Identity | null, b: Identity | null): boolean =>
  a === b || (!!a && !!b && a.staffId === b.staffId && a.role === b.role && a.branchId === b.branchId);

export function AnalyticsMount({ user }: { user: User | null }): null {
  const pathname = usePathname();

  useEffect(() => {
    const next = user ? identityOf(user) : null;
    if (sameIdentity(next, identity)) return;
    identity = next;
    lastScreen = null;
    if (next) {
      emit({
        type: 'identify',
        payload: {
          profileId: next.staffId,
          properties: { role: next.role, branch_id: next.branchId ?? 'none' },
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.branchId]);

  useEffect(() => {
    if (!identity) return;
    const template = routeTemplate(pathname ?? '/');
    const key = `${identity.staffId}|${template}`;
    if (key === lastScreen) return;
    lastScreen = key;
    emit({
      type: 'track',
      payload: {
        name: SCREEN_VIEW,
        profileId: identity.staffId,
        properties: {
          __path: window.location.origin + template,
          role: identity.role,
          branch_id: identity.branchId ?? 'none',
        },
      },
    });
  }, [pathname, user?.id]);

  return null;
}

export function resetAnalyticsForTests(): void {
  sdk = undefined;
  identity = null;
  lastScreen = null;
}
