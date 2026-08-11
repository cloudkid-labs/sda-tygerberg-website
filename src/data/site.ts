export type Lang = 'af' | 'en';

// The address, the service times and the opening hours below are mirrored by
// hand in `public/llms.txt`, which is a flat file and cannot import them.
// Change anything here and change it there too — CONCERNS.md C-35.
export const SITE = {
  name: 'Tygerberg SDA',
  address: '54 Boston St, Boston, Cape Town, 7530',
  lat: -33.8974,
  lng: 18.6235,
  directionsUrl:
    'https://www.google.com/maps/dir//Tygerberg+SDA+Kerk,+54+Boston+St,+Boston,+Cape+Town,+7530',
  appleMapsUrl: 'https://maps.apple.com/?address=54%20Boston%20St,%20Boston,%20Cape%20Town,%207530',
  youtubeChannelUrl: 'https://www.youtube.com/@SDATygerberg',
  // "Featured", not /videos — /videos surfaced an old section, not what the
  // channel curates.
  youtubeFeaturedUrl: 'https://www.youtube.com/@SDATygerberg/featured',
  // Fallback only. The live CTA normally links to the video id the YouTube API
  // named; this catches a live answer that arrived without one, and YouTube
  // redirects it to whatever the channel is streaming.
  youtubeLiveUrl: 'https://www.youtube.com/@SDATygerberg/live',
  // Auto-generated "uploads" playlist: always the latest video, no maintenance.
  // youtube-nocookie.com because the regular embed domain needs third-party
  // storage access that iOS Safari blocks, leaving a blank black box.
  youtubeUploadsEmbedUrl: 'https://www.youtube-nocookie.com/embed/videoseries?list=UUtZlioPBBORWMMMSJ9BE1Wg',
  // Self-hosted so the download works without depending on an external site.
  beliefsPdfPath: '/SDA-28-Fundamental-Beliefs.pdf',
} as const;

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

export type ServiceTime = { af: string; en: string; start: string; end: string };

/**
 * The Sabbath morning, in order. Both ends kept: a start time alone doesn't
 * tell a visitor if they are committing to half an hour or the whole morning.
 */
export const SERVICE_TIMES: ServiceTime[] = [
  { af: 'Sabbatskool', en: 'Sabbath School', start: '09:30', end: '10:00' },
  { af: 'Lesstudie', en: 'Lesson Study', start: '10:00', end: '10:45' },
  { af: 'Hoofdiens', en: 'Divine Service', start: '11:00', end: '12:00' },
];

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
