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
    name: 'Laura Rolff',
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
    // Welfare only. Kinderbediening was hers on the Ampsdraers roster; the
    // board has since given it to Lané Louw, whose card follows the Jeug block
    // below. Do not move it back from the PDF.
    roles: {
      af: ['Gemeenskapsdienste & Welsyn'],
      en: ['Community Services & Welfare'],
    },
    photo: 'TG-DH-Lenie.jpg',
  },
  // Jeug, oldest tier first. Kept as one card per person rather than one
  // nested Jeug entry — the carousel is a flat ring of equal cards (C-12) and
  // adjacency is what makes the tiers read as a group.
  {
    id: 'senior-jeug',
    name: 'Monique Spammer',
    roles: { af: ['Senior Jeugleier'], en: ['Senior Youth Leader'] },
    photo: 'TG-DH-Monique.jpg',
  },
  {
    id: 'junior-jeug',
    name: 'Lisa Branders',
    roles: { af: ['Junior Jeugleier'], en: ['Junior Youth Leader'] },
  },
  {
    id: 'strewers',
    name: 'Morné Louw',
    roles: { af: ['Strewersleier'], en: ['Pathfinder Leader'] },
  },
  {
    id: 'kinderbediening',
    name: 'Lané Louw',
    // Morné and Lelani's daughter; the family holds Gesinsbediening jointly
    // further down. Took Kinderbediening from Lenie Virgin — see her card.
    roles: { af: ['Kinderbediening'], en: ['Children’s Ministry'] },
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
  },
];

/**
 * Who the carousel actually renders. A card with no headshot was a striped box
 * reading "HOD photo" — an unfilled slot on a page introducing people, which
 * reads as neglect rather than as a photo still to come.
 *
 * Adding a `photo` is what publishes someone, so nothing else has to be
 * touched when a headshot arrives. The predicate is a type guard so the
 * carousel receives `photo: string` and cannot be handed an empty card.
 */
export const shownDepartmentHeads = departmentHeads.filter(
  (head): head is DepartmentHeadWithPhoto => Boolean(head.photo),
);
