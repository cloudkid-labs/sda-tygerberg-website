/// <reference types="@cloudflare/workers-types" />

import { allowedFrom, isAdmin, isAdminOnlyEmail, senders, type AuthEnv } from './auth';
import { audit, keepHistory, readJson, writeJson } from './cmsStore';
import type { AuditChange } from '../lib/cms/auditDiff';
import { normEmail, validateSettings, type MailSettings, type SettingsOptions } from '../lib/mailSettings';

/**
 * The Settings tab's storage and its one seam into the rest of the Worker
 * (C-71). Saved settings live in the CMS bucket; `withSettings` lays them
 * over the wrangler vars they replace, so every existing check (sign-in,
 * send-as, visibility, routing, notifications) reads them unchanged:
 *
 *   members  → BOARD_ALLOWED_EMAILS, BOARD_SEND_AS
 *   routes   → MAIL_ROUTES
 *   notify   → CONTACT_EMAIL_TO
 *
 * Nothing saved yet: the vars are the settings, exactly as before.
 */

export type SettingsEnv = AuthEnv & {
  CMS?: R2Bucket;
  MAIL_ROUTES?: Record<string, string>;
  CONTACT_EMAIL_TO?: string;
  CONTACT_EMAIL_FROM?: string;
  MAIL_FORWARD_TO?: string;
  MAIL_ARCHIVE_TO?: string;
  /** Verified destination addresses (comma-separated); deploy config only. */
  MAIL_DESTINATIONS?: string;
};

export const SETTINGS_KEY = 'settings/mail.json';
export type SettingsDoc = { rev: number; settings: MailSettings; updatedBy: string; updatedAt: string };

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);

/** What settings may choose from — deploy config, never editable here. */
export function settingsOptions(env: SettingsEnv): SettingsOptions {
  return {
    admins: list(env.BOARD_ADMIN_EMAILS),
    senders: [...senders(env)].filter((a) => !isAdminOnlyEmail(env, a)),
    destinations: list(env.MAIL_DESTINATIONS),
    domain: normEmail(env.CONTACT_EMAIL_FROM).split('@')[1] || 'sdatygerberg.co.za',
    forwardTo: normEmail(env.MAIL_FORWARD_TO),
    archive: normEmail(env.MAIL_ARCHIVE_TO),
  };
}

/** The settings the vars describe — what the tab shows before the first save. */
export function settingsFromConfig(env: SettingsEnv): MailSettings {
  const admins = new Set(list(env.BOARD_ADMIN_EMAILS));
  const regular = new Set(settingsOptions(env).senders);
  return {
    members: list(env.BOARD_ALLOWED_EMAILS)
      .filter((email, i, all) => !admins.has(email) && all.indexOf(email) === i)
      .map((email) => ({ email, sendAs: allowedFrom(env, email).filter((a) => regular.has(a)).sort() })),
    routes: Object.entries(env.MAIL_ROUTES ?? {}).map(([address, to]) => ({ address: normEmail(address), to: normEmail(to) })),
    notify: list(env.CONTACT_EMAIL_TO).sort(),
  };
}

export async function readSettings(bucket: R2Bucket): Promise<{ doc: SettingsDoc; etag: string } | null> {
  const hit = await readJson<SettingsDoc>(bucket, SETTINGS_KEY);
  return hit ? { doc: hit.value, etag: hit.etag } : null;
}

/**
 * The vars with saved settings laid over them. Anything the deploy config no
 * longer allows (a destination or sender since removed) is dropped here, not
 * trusted because it once validated; with nothing left to notify, the var's
 * recipients stand.
 */
export function applySettings<E extends SettingsEnv>(env: E, s: MailSettings): E {
  const o = settingsOptions(env);
  const regular = new Set(o.senders);
  const dest = new Set(o.destinations);
  const admins = new Set(o.admins);
  const members = s.members.filter((m) => m.email && !admins.has(m.email));
  const notify = s.notify.filter((a) => dest.has(a) && a !== o.archive);
  return {
    ...env,
    BOARD_ALLOWED_EMAILS: members.map((m) => m.email).join(','),
    // An entry with no addresses fences that member to nothing (fail closed).
    BOARD_SEND_AS: members.map((m) => `${m.email}=${m.sendAs.filter((a) => regular.has(a)).join(',')}`).join(';'),
    MAIL_ROUTES: Object.fromEntries(
      s.routes.filter((r) => dest.has(r.to) && r.address.endsWith(`@${o.domain}`) && r.address !== o.archive).map((r) => [r.address, r.to]),
    ),
    CONTACT_EMAIL_TO: notify.length ? notify.join(',') : env.CONTACT_EMAIL_TO,
  };
}

/**
 * Env for one request or one inbound mail. A failed read falls back to the
 * vars — the settings can make the site stricter or looser, never broken.
 */
export async function withSettings<E extends SettingsEnv>(env: E): Promise<E> {
  if (!env.CMS) return env;
  try {
    const hit = await readSettings(env.CMS);
    return hit ? applySettings(env, hit.doc.settings) : env;
  } catch {
    console.error('settings: read FAILED, using wrangler vars');
    return env;
  }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** One audit line per save: who was added, removed or changed, by address. */
export function diffSettings(before: MailSettings, after: MailSettings): AuditChange[] {
  const changes: AuditChange[] = [];
  const byEmail = new Map(before.members.map((m) => [m.email, m]));
  const nowEmail = new Set(after.members.map((m) => m.email));
  for (const m of after.members) {
    const old = byEmail.get(m.email);
    if (!old) changes.push({ op: 'added', label: m.email });
    else if (old.sendAs.join() !== m.sendAs.join()) changes.push({ op: 'edited', label: m.email, fields: ['sendAs'] });
  }
  for (const m of before.members) if (!nowEmail.has(m.email)) changes.push({ op: 'removed', label: m.email });
  const routeTo = new Map(before.routes.map((r) => [r.address, r.to]));
  const nowRoute = new Set(after.routes.map((r) => r.address));
  for (const r of after.routes) {
    const old = routeTo.get(r.address);
    if (old === undefined) changes.push({ op: 'added', label: `${r.address} → ${r.to}` });
    else if (old !== r.to) changes.push({ op: 'edited', label: `${r.address} → ${r.to}`, fields: ['to'], from: `${r.address} → ${old}` });
  }
  for (const r of before.routes) if (!nowRoute.has(r.address)) changes.push({ op: 'removed', label: `${r.address} → ${r.to}` });
  if (before.notify.join() !== after.notify.join()) changes.push({ op: 'edited', label: after.notify.join(', '), fields: ['notify'] });
  return changes;
}

/**
 * GET/PUT /api/cms/settings — admins only. GET answers the settings in force
 * (saved, or from config) and what they may choose from; PUT `{ rev,
 * settings }` validates, writes against the read rev, keeps the previous
 * version, and audits what changed.
 */
export async function settingsRoute(
  request: Request,
  env: SettingsEnv,
  g: { email: string; bucket: R2Bucket },
  body: () => Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }>,
): Promise<Response> {
  if (!isAdmin(env, g.email)) return json({ ok: false, outcome: 'forbidden' }, 403);
  const options = settingsOptions(env);
  const current = await readSettings(g.bucket);
  const inForce = current?.doc.settings ?? settingsFromConfig(env);
  if (request.method === 'GET') {
    return json(
      {
        ok: true,
        rev: current?.doc.rev ?? 0,
        source: current ? 'saved' : 'config',
        settings: inForce,
        options,
        updatedBy: current?.doc.updatedBy ?? null,
        updatedAt: current?.doc.updatedAt ?? null,
      },
      200,
    );
  }
  if (request.method !== 'PUT') return json({ ok: false, outcome: 'invalid', errors: ['method'] }, 405);
  const read = await body();
  if (!read.ok) return read.response;
  const rev = current?.doc.rev ?? 0;
  if (read.body.rev !== rev) return json({ ok: false, outcome: 'conflict', rev }, 409);
  const checked = validateSettings(read.body.settings, options);
  if (!checked.ok) return json({ ok: false, outcome: 'invalid', errors: checked.errors }, 400);
  const next: SettingsDoc = { rev: rev + 1, settings: checked.value, updatedBy: g.email, updatedAt: new Date().toISOString() };
  if (!(await writeJson(g.bucket, SETTINGS_KEY, next, current?.etag ?? null))) {
    return json({ ok: false, outcome: 'conflict', rev }, 409);
  }
  if (current) await keepHistory(g.bucket, 'settings', current.doc);
  const changes = diffSettings(inForce, next.settings);
  if (changes.length) await audit(g.bucket, { by: g.email, action: 'settings.save', target: 'settings', changes });
  return json({ ok: true, rev: next.rev, source: 'saved', settings: next.settings, options, updatedBy: next.updatedBy, updatedAt: next.updatedAt }, 200);
}
