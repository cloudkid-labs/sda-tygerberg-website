export type Lang = 'af' | 'en';

// The address, the service times and the opening hours below are mirrored by
// hand in `public/llms.txt`, which is a flat file and cannot import them.
// Change anything here and change it there too — CONCERNS.md C-35.
/**
 * The address in parts, so the flat string every component prints and the
 * JSON-LD PostalAddress are built from the same values. They were separate
 * before, and had drifted: structuredData.ts said "Boston, Bellville" where
 * this file said "Boston, Cape Town", and a comment claimed both read from
 * here. Boston is the suburb, Bellville the town, Cape Town the metro — all
 * three are true, and each field below is the one schema.org asks for. C-49
 */
const ADDRESS = {
  street: '54 Boston St',
  suburb: 'Boston',
  town: 'Bellville',
  city: 'Cape Town',
  region: 'Western Cape',
  postalCode: '7530',
  /** ISO 3166-1 alpha-2, which is what schema.org's addressCountry expects. */
  country: 'ZA',
} as const;

/**
 * The members area's "Test site" tab and its way back. The test origin must
 * match terraform/ `devtest_origin` (the OAuth client lists it).
 */
export const MEMBERS_SITES = {
  test: 'https://tygerberg-sda.cloudkid.link/members/',
  live: 'https://sdatygerberg.co.za/members/',
} as const;

export const SITE = {
  name: 'Tygerberg SDA',
  /** The congregation's full name, for the map popup and the page titles. */
  fullName: 'Tygerberg SDA Church',
  addressParts: ADDRESS,
  address: `${ADDRESS.street}, ${ADDRESS.suburb}, ${ADDRESS.city}, ${ADDRESS.postalCode}`,
  lat: -33.8974,
  lng: 18.6235,
  directionsUrl:
    'https://www.google.com/maps/dir//Tygerberg+SDA+Kerk,+54+Boston+St,+Boston,+Cape+Town,+7530',
  appleMapsUrl: 'https://maps.apple.com/?address=54%20Boston%20St,%20Boston,%20Cape%20Town,%207530',
  youtubeChannelUrl: 'https://www.youtube.com/@SDATygerberg',
  // /streams, by the church's instruction: the services are streamed, so the
  // streams tab is where the latest content actually is — /featured and
  // /videos both surfaced older sections.
  youtubeStreamsUrl: 'https://www.youtube.com/@SDATygerberg/streams',
  // Fallback only. The live CTA normally links to the video id the YouTube API
  // named; this catches a live answer that arrived without one, and YouTube
  // redirects it to whatever the channel is streaming.
  youtubeLiveUrl: 'https://www.youtube.com/@SDATygerberg/live',
  // The uploads playlist, used three ways by the preview card: the Worker and
  // the build read this page server-side for the latest video's id and title
  // (src/lib/latestVideo.ts), and a proven-clean network plays inline with
  // this list as its "next services" context. Never loaded blind in an iframe:
  // the embed redirect-loops through Google's consent endpoint on some
  // networks — the congregation's region among them, on both YouTube hosts —
  // so the card probes the visitor's own network first. C-60.
  youtubeUploadsEmbedUrl: 'https://www.youtube.com/embed/videoseries?list=UUtZlioPBBORWMMMSJ9BE1Wg',
  // Self-hosted so the download works without depending on an external site.
  beliefsPdfPath: '/SDA-28-Fundamental-Beliefs.pdf',
} as const;

/**
 * The church's social channels, in display order — the one place their URLs
 * live. The homepage footer and /connect both render this list; neither types a
 * URL of its own. YouTube is the streams tab, the same URL the hero links to.
 *
 * Text labels only: a platform's logo comes from that platform's own brand kit
 * or not at all, never redrawn.
 */
export type SocialLink = { id: 'youtube' | 'instagram' | 'facebook'; label: string; url: string };

export const SOCIAL_LINKS: readonly SocialLink[] = [
  { id: 'youtube', label: 'YouTube', url: SITE.youtubeStreamsUrl },
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/sdatygerberg' },
  // TODO(board): confirm SDATygerbergStream is the church's main Facebook page,
  // not a stream-only page. URL is verbatim from the brief.
  { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/SDATygerbergStream' },
];

/**
 * Blood bank drives, from the church's "Bloedbank datums 2026" roster. ISO so
 * a past date can be dropped without parsing prose, and language-independent —
 * only the month names are copy (`homeCopy.months`).
 *
 * Every one falls on a Thursday, but they are listed rather than derived: the
 * roster is what the church publishes and the pattern is not a promise.
 *
 * The roster also names a responsible department and a mobile number per date.
 * Neither is here. The numbers are personal data that C-20 keeps off the site
 * entirely; the departments are an internal duty rota that tells a visitor
 * nothing. Add the departments if the board asks, never the numbers.
 */
export const BLOOD_DRIVES = [
  '2026-04-09',
  '2026-05-07',
  '2026-06-04',
  '2026-07-09',
  '2026-08-06',
  '2026-09-10',
  '2026-10-08',
  '2026-11-05',
  '2026-12-10',
] as const;

/**
 * One donation session. Slots start on the hour from 13:00 and run 45 minutes,
 * so the last one starts at 15:00 and ends inside the 16:00 close.
 *
 * Starts are listed rather than generated from a range: "13:00 to 16:00 in 45s"
 * is ambiguous about whether a fourth slot squeezes in at 15:45, and a donor
 * arriving for a slot that does not exist is the failure that matters.
 */
export const BLOOD_DRIVE_SLOT_STARTS = ['13:00', '14:00', '15:00'] as const;
export const BLOOD_DRIVE_SLOT_MINUTES = 45;

/** "13:00 – 13:45", matching how the service times already read. */
export function slotRange(start: string): string {
  const [h, m] = start.split(':').map(Number);
  const end = h * 60 + m + BLOOD_DRIVE_SLOT_MINUTES;
  return `${start} – ${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

export type ServiceTimeId = 'sabbath-school' | 'lesson-study' | 'divine-service';
export type ServiceTime = {
  /** Stable across renames — the visible names are copy, this is not. */
  id: ServiceTimeId;
  af: string;
  en: string;
  start: string;
  end: string;
};

/**
 * The Sabbath morning, in order. Both ends kept: a start time alone doesn't
 * tell a visitor if they are committing to half an hour or the whole morning.
 */
export const SERVICE_TIMES: ServiceTime[] = [
  { id: 'sabbath-school', af: 'Sabbatskool', en: 'Sabbath School', start: '09:30', end: '10:00' },
  { id: 'lesson-study', af: 'Lesstudie', en: 'Lesson Study', start: '10:00', end: '10:45' },
  { id: 'divine-service', af: 'Erediens', en: 'Divine Service', start: '11:00', end: '12:00' },
];

export function serviceTime(id: ServiceTimeId): ServiceTime {
  const found = SERVICE_TIMES.find((s) => s.id === id);
  // At module load, so a removed entry is a build failure and not a blank on
  // the page.
  if (!found) throw new Error(`SERVICE_TIMES has no entry with id "${id}"`);
  return found;
}

/**
 * The 11:00 service. The first-visit FAQ names it in prose and used to hardcode
 * it, which is why it had to be corrected by hand in v1.3.1 when the church
 * renamed it; /youth reached it as `SERVICE_TIMES.at(-1)`, which was right only
 * while it stayed last. Both go through the id now. C-53
 */
export const DIVINE_SERVICE = serviceTime('divine-service');

/** "09:30 – 10:00", matching how the midweek schedule already reads. */
export const serviceRange = (s: ServiceTime) => `${s.start} – ${s.end}`;

/**
 * When the building is open, not when the programme runs — half an hour either
 * side of the services. Deliberately not derived from SERVICE_TIMES; this is
 * what `openingHoursSpecification` means.
 */
export const SABBATH_HOURS = {
  opens: '09:00',
  closes: '12:30',
} as const;
