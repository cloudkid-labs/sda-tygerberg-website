import type { Lang } from './site';

/**
 * Department heads, cross-checked against the "Ampsdraers 2025/2026" roster.
 *
 * One card per person, not per position — `roles` is a list because several
 * people head more than one department. `id` keys the carousel, so it survives
 * a name correction.
 *
 * Names only: no phone numbers or email addresses anywhere here — CONCERNS.md
 * C-20.
 */
export type DepartmentHead = {
  id: string;
  name: string;
  /** Singular job titles — each card is one person, not a department listing. */
  roles: Record<Lang, string[]>;
  /**
   * Filename only, e.g. `TG-DH-Jaco.jpg` — not a path. Every photo has two
   * copies and cdnImage.ts derives both from this one name so they cannot
   * drift. Delete the files with the card: `public/` is a live URL either way.
   */
  photo?: string;
  /**
   * Dormant office, hidden without losing the roster entry. Omit (or set true)
   * everywhere it is business as usual; `false` hides the card while the
   * `photo` line stays, so resuming is deleting one line.
   */
  active?: boolean;
};

/** A head whose headshot exists — the only kind that gets a card. */
export type DepartmentHeadWithPhoto = DepartmentHead & { photo: string };

/**
 * The full roster, photographed or not. Kept complete because it is the record
 * of who holds what; `shownDepartmentHeads` decides who appears on the page.
 */
export const departmentHeads: DepartmentHead[] = [
  {
    id: 'kerkraad',
    name: 'Lr. Arnold Neuhoff',
    roles: {
      af: ['Leraar', 'Kerkraad', 'Berading', 'Bloedbank'],
      en: ['Pastor', 'Church Board', 'Counselling', 'Blood Bank'],
    },
  },
  {
    id: 'ouderlinge',
    name: 'Jaco van Niekerk',
    // Head elder and nothing else. The Ampsdraers roster also listed him under
    // Persoonlike Bediening and the Strategiesebeplannings-komitee; the board
    // has since confirmed both of those are Laura's, so they moved to her card.
    roles: { af: ['Hoofouderling'], en: ['Head Elder'] },
    photo: 'TG-DH-Jaco.jpg',
  },
  {
    id: 'persoonlike-bediening',
    name: 'Laura Rolfe',
    roles: {
      af: ['Persoonlike Bediening', 'Strategiesebeplannings-komitee', 'Evangelisasie'],
      en: ['Personal Ministries', 'Strategic Planning Committee', 'Evangelism'],
    },
    photo: 'TG-DH-Laura.jpg',
  },
  {
    id: 'diakens',
    name: 'Craig Campion',
    // Veiligheidsoffisier has no official head on the board's list; the head
    // deacon carries it, so it sits here as a plain title.
    roles: {
      af: ['Hoofdiaken', 'Veiligheidsoffisier'],
      en: ['Head Deacon', 'Safety Officer'],
    },
    // "Graig" is the studio's filename, kept verbatim; the roster spells him
    // Craig, which is what the card shows.
    photo: 'TG-DH-Graig.jpg',
  },
  {
    id: 'diakonesse',
    name: 'Marinda Wallace',
    roles: { af: ['Hoofdiakones'], en: ['Head Deaconess'] },
    photo: 'TG-DH-Marinda.jpg',
  },
  {
    id: 'sabbatskool',
    name: 'Gustav Allmann',
    roles: { af: ['Sabbatskool'], en: ['Sabbath School'] },
    photo: 'TG-DH-Gustav.jpg',
  },
  {
    id: 'welsyn',
    name: 'Lenie Virgin',
    // Kinderbediening is hers again. It was moved to Lané Louw in 1.2.0 on the
    // board's word; the Sabbath roster the board has since circulated names
    // Lenie the koördineerder over all five age groups, and Lané the leader of
    // one of them. She coordinates the ministry, so the title sits here and the
    // groups themselves are on /youth.
    roles: {
      af: ['Gemeenskapsdienste & Welsyn', 'Kinderbediening'],
      en: ['Community Services & Welfare', 'Children’s Ministry'],
    },
    photo: 'TG-DH-Lenie.jpg',
  },
  // Jeug, oldest tier first. Kept as one card per person rather than one
  // nested Jeug entry — the carousel is a flat ring of equal cards (C-12) and
  // adjacency is what makes the tiers read as a group.
  //
  // Senior, then Tieners, then Juniors — bands in `youthGroups.ts`. Strewers
  // follows the tiers rather than sitting inside them: it is a club, not an
  // age band.
  {
    id: 'senior-jeug',
    name: 'Monique Spammer',
    roles: { af: ['Senior Jeugleier'], en: ['Senior Youth Leader'] },
    photo: 'TG-DH-Monique.jpg',
    // Senior youth is dormant — hidden from the carousel until the board
    // resumes it. Delete this line to restore; the roster entry and the photo
    // stay exactly as they are.
    active: false,
  },
  {
    id: 'tiener-jeug',
    name: 'Lané Louw',
    // Morné and Lelani's daughter; the family holds Gesinsbediening jointly
    // further down. Tiener Jeugleier, not Kinderbediening — that one is Lenie
    // Virgin's again, see her card. 1.3.0 published her as Junior Jeugleier on
    // a reading of how the correction was worded; the repo owner has since
    // confirmed the Sabbath roster's own title is the right one. Not recorded
    // as a board decision, because it was not relayed as one.
    roles: { af: ['Tiener Jeugleier'], en: ['Teen Youth Leader'] },
    photo: 'TG-DH-Lane.jpg',
  },
  {
    // No Junior Jeugleier office remains: the Sabbath roster has the Juniors
    // under Lisa and the teens under Lané, and nothing between them.
    // Ages stay out of the title — `youthGroups.ts` is where the bands are
    // published, and two copies of "10-12" is two chances to disagree (C-03).
    id: 'juniors',
    name: 'Lisa Branders',
    roles: { af: ['Juniorleier'], en: ['Juniors Leader'] },
  },
  {
    id: 'strewers',
    name: 'Morné Louw',
    roles: { af: ['Strewersleier'], en: ['Pathfinder Leader'] },
    photo: 'TG-DH-Morne.jpg',
  },
  {
    id: 'musiek',
    name: 'Leonie Cloete',
    roles: { af: ['Musiek'], en: ['Music'] },
    photo: 'TG-DH-Leonie.jpg',
  },
  {
    id: 'tesourier',
    name: 'Adéle Meyer',
    roles: { af: ['Tesourier'], en: ['Treasurer'] },
  },
  {
    id: 'multimedia',
    name: 'Chris Meyer',
    roles: {
      af: ['Multimedia', 'Kommunikasie-verteenwoordiger'],
      en: ['Multimedia', 'Communications Representative'],
    },
  },
  {
    id: 'gesondheidsbediening',
    name: 'Gert Coetzee',
    roles: {
      af: ['Gesondheidsbediening & APO'],
      en: ['Health Ministry & APO'],
    },
  },
  {
    id: 'gebed',
    name: 'Peter Wallace',
    roles: { af: ['Gebedskoördineerder'], en: ['Prayer Coordinator'] },
  },
  {
    id: 'kerkklerk',
    name: 'Sanet Stevens',
    roles: { af: ['Kerkklerk'], en: ['Church Clerk'] },
  },
  {
    id: 'vrouebediening',
    name: 'Linda Jennings',
    roles: { af: ['Vrouebediening'], en: ['Women’s Ministry'] },
    photo: 'TG-DH-Linda.jpg',
  },
  {
    id: 'mannebediening',
    name: 'Marius Louw',
    roles: { af: ['Mannebediening'], en: ['Men’s Ministry'] },
    photo: 'TG-DH-Marius.jpg',
  },
  {
    id: 'boukomitee',
    name: 'Bertie Hoffman',
    roles: { af: ['Boukomitee'], en: ['Building Committee'] },
  },
  {
    id: 'ontspanningskomitee',
    name: 'Hanlie Tolmay',
    // Vrouebediening is held by two people — Linda Jennings above and Hanlie
    // here. `roles` is per person, so that needs no special handling.
    roles: {
      af: ['Vrouebediening', 'Ontspanningskomitee'],
      en: ['Women’s Ministry', 'Recreation Committee'],
    },
    photo: 'TG-DH-Hanlie.jpg',
  },
  {
    id: 'gesinsbediening',
    // Held by the family jointly, which is why this is the one card in the
    // roster naming two people. Morné keeps his own Strewersleier card above.
    name: 'Morné & Lelani Louw',
    roles: { af: ['Gesinsbediening'], en: ['Family Ministry'] },
    // The only two-person photo, and the only source that was not shot
    // portrait. Cropped to 4/5 from the 6000x4000 original, centred between
    // their faces rather than on the frame — a centre crop cut Lelani off at
    // the edge. headshot-fallbacks.mjs warns on landscape for this reason.
    photo: 'TG-DH-Louws.jpg',
  },
];

/**
 * Who the carousel actually renders. A card with no headshot was a striped box
 * reading "HOD photo" — an unfilled slot on a page introducing people, which
 * reads as neglect rather than as a photo still to come.
 *
 * Adding a `photo` is what publishes someone, so nothing else has to be
 * touched when a headshot arrives. `active: false` hides a dormant office
 * without touching the roster entry. The predicate is a type guard so the
 * carousel receives `photo: string` and cannot be handed an empty card.
 */
export const shownDepartmentHeads = departmentHeads.filter(
  (head): head is DepartmentHeadWithPhoto => head.active !== false && Boolean(head.photo),
);
