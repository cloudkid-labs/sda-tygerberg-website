/**
 * Members-area settings an admin edits on the Settings tab (C-71): who may
 * sign in and which church addresses each may send as (and so whose Board
 * mail they see), where mail to an address is delivered, and who is told of
 * a website enquiry. Saved settings stand in for the matching wrangler vars;
 * until the first save the vars are the settings.
 *
 * What stays in deploy config, on purpose: the SuperAdmins (so nobody can
 * lock everyone out, and no admin can revoke them) and the addresses mail may be delivered to — Cloudflare only
 * delivers to verified destinations, and only sends to the fenced ones.
 */
/** `admin`: an admin made here — everything but the SuperAdmin-only identities. */
export type MemberSetting = { email: string; sendAs: string[]; admin?: boolean };
export type RouteSetting = { address: string; to: string };
/**
 * Who a sign-in address belongs to: a department head (`head`, the HOD entry
 * — their name and headshot), or, for a board member with no HOD position, a
 * name typed in (`name`, shown with the default avatar). One or the other.
 */
export type ProfileSetting = { email: string; head?: string; name?: string; photo?: string };
/** An uploaded profile picture (POST /api/cms/media?kind=profile). */
export const PROFILE_PHOTO = /^\/media\/profiles\/[a-z0-9-]+\.jpg$/;
export const MAX_NAME = 80;
export type MailSettings = { members: MemberSetting[]; routes: RouteSetting[]; notify: string[]; profiles: ProfileSetting[] };

const HEAD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** What the settings may choose from, from deploy config. */
export type SettingsOptions = {
  /** Deploy config's admins: not editable or revocable here. */
  superAdmins: string[];
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
  const admins = new Set(o.superAdmins.map(normEmail));
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
      if (r.admin !== undefined && typeof r.admin !== 'boolean') errors.push(`members.${i}.admin`);
      members.push({ email, sendAs: (sendAs ?? []).filter((a) => senders.has(a)).sort(), ...(r.admin === true ? { admin: true } : {}) });
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

  // Optional: documents saved before profiles existed have none. Anyone who
  // may sign in (admin or member) may have one; a head id that no longer
  // exists just shows the default avatar.
  const profiles: ProfileSetting[] = [];
  const rawProfiles = src.profiles === undefined ? [] : Array.isArray(src.profiles) ? src.profiles : null;
  if (!rawProfiles) errors.push('profiles');
  else {
    const people = new Set([...admins, ...members.map((m) => m.email)]);
    const seen = new Set<string>();
    rawProfiles.forEach((x, i) => {
      const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const email = normEmail(r.email);
      const head = typeof r.head === 'string' ? r.head.trim() : '';
      const name = typeof r.name === 'string' ? r.name.replace(/\s+/g, ' ').trim() : '';
      // A picture of their own only without an HOD entry, and never required.
      const photo = typeof r.photo === 'string' ? r.photo.trim() : '';
      const one = head
        ? HEAD_ID.test(head) && !name && !photo
        : name.length > 0 && name.length <= MAX_NAME && (!photo || PROFILE_PHOTO.test(photo));
      if (!people.has(email) || seen.has(email) || !one) errors.push(`profiles.${i}`);
      seen.add(email);
      profiles.push(head ? { email, head } : { email, name, ...(photo ? { photo } : {}) });
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { members, routes, notify, profiles } };
}
