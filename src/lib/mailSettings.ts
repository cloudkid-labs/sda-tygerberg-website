/**
 * Members-area settings an admin edits on the Settings tab (C-71): who may
 * sign in and which church addresses each may send as (and so whose Board
 * mail they see), where mail to an address is delivered, and who is told of
 * a website enquiry. Saved settings stand in for the matching wrangler vars;
 * until the first save the vars are the settings.
 *
 * What stays in deploy config, on purpose: the admins (so nobody can lock
 * everyone out) and the addresses mail may be delivered to — Cloudflare only
 * delivers to verified destinations, and only sends to the fenced ones.
 */
export type MemberSetting = { email: string; sendAs: string[] };
export type RouteSetting = { address: string; to: string };
export type MailSettings = { members: MemberSetting[]; routes: RouteSetting[]; notify: string[] };

/** What the settings may choose from, from deploy config. */
export type SettingsOptions = {
  admins: string[];
  /** Role addresses members may send as (admin-only identities excluded). */
  senders: string[];
  /** Verified destinations: delivery targets for routes and notifications. */
  destinations: string[];
  /** The church domain every routed address is on. */
  domain: string;
  /** Where mail to an address with no route goes, and the archive copy. */
  forwardTo: string;
  archive: string;
};

export const MAX_MEMBERS = 50;
export const MAX_ROUTES = 50;
export const MAX_NOTIFY = 10;

const EMAIL = /^[^\s@,;=<>"]+@[^\s@,;=<>"]+\.[^\s@,;=<>"]+$/;
export const normEmail = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const isEmail = (v: string) => v.length <= 254 && EMAIL.test(v);

type Result = { ok: true; value: MailSettings } | { ok: false; errors: string[] };

/**
 * Checks a settings document against the options. Every address is
 * normalised (trimmed, lower case); errors name the field (`members.2.email`).
 */
export function validateSettings(input: unknown, o: SettingsOptions): Result {
  const errors: string[] = [];
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const admins = new Set(o.admins.map(normEmail));
  const senders = new Set(o.senders.map(normEmail));
  const destinations = new Set(o.destinations.map(normEmail));
  const archive = normEmail(o.archive);

  const members: MemberSetting[] = [];
  const rawMembers = Array.isArray(src.members) ? src.members : null;
  if (!rawMembers) errors.push('members');
  else if (rawMembers.length > MAX_MEMBERS) errors.push('members.max');
  else {
    const seen = new Set<string>();
    rawMembers.forEach((m, i) => {
      const r = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
      const email = normEmail(r.email);
      if (!isEmail(email) || admins.has(email) || seen.has(email)) errors.push(`members.${i}.email`);
      seen.add(email);
      const sendAs = Array.isArray(r.sendAs) ? [...new Set(r.sendAs.map(normEmail))] : null;
      if (!sendAs || sendAs.some((a) => !senders.has(a))) errors.push(`members.${i}.sendAs`);
      members.push({ email, sendAs: (sendAs ?? []).filter((a) => senders.has(a)).sort() });
    });
  }

  const routes: RouteSetting[] = [];
  const rawRoutes = Array.isArray(src.routes) ? src.routes : null;
  if (!rawRoutes) errors.push('routes');
  else if (rawRoutes.length > MAX_ROUTES) errors.push('routes.max');
  else {
    const seen = new Set<string>();
    rawRoutes.forEach((x, i) => {
      const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const address = normEmail(r.address);
      const to = normEmail(r.to);
      // A route for the archive would loop it back through this Worker.
      if (!isEmail(address) || !address.endsWith(`@${o.domain}`) || address === archive || seen.has(address)) {
        errors.push(`routes.${i}.address`);
      }
      seen.add(address);
      if (!destinations.has(to) || to === address) errors.push(`routes.${i}.to`);
      routes.push({ address, to });
    });
  }

  const rawNotify = Array.isArray(src.notify) ? [...new Set(src.notify.map(normEmail))] : null;
  const notify = (rawNotify ?? []).sort();
  if (!rawNotify) errors.push('notify');
  else if (notify.length > MAX_NOTIFY || notify.some((a) => !destinations.has(a) || a === archive)) errors.push('notify');
  // Someone must hear of an enquiry — where there is anywhere to send it.
  else if (notify.length === 0 && destinations.size > 0) errors.push('notify.empty');

  return errors.length ? { ok: false, errors } : { ok: true, value: { members, routes, notify } };
}
