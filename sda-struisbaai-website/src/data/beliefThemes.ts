import type { Lang } from './site';

/**
 * The six themes the 28 fundamental beliefs are grouped under — the names and
 * the one-line summaries, and nothing else.
 *
 * Split out of `beliefs.ts` for one reason: the homepage summary needs these six
 * pairs and nothing more, and a static import of `beliefs.ts` pulled all 28
 * belief descriptions into the homepage bundle — 8.1 kB gzipped, to render six
 * strings. `beliefs.ts` composes these with its items, so the names still exist
 * once. C-57
 */
export type BeliefTheme = {
  name: Record<Lang, string>;
  desc: Record<Lang, string>;
};

export const beliefThemes: BeliefTheme[] = [
  {
    name: { af: 'God', en: 'God' },
    desc: {
      af: 'Die Skrif as die Woord van God, die Drie-eenheid, en die karakter van die Vader, Seun en Heilige Gees.',
      en: 'Scripture as the Word of God, the Trinity, and the character of the Father, Son and Holy Spirit.',
    },
  },
  {
    name: { af: 'Mensdom', en: 'Humanity' },
    desc: {
      af: 'Die skepping en die aard van die mens, geskape na die beeld van God.',
      en: 'Creation and the nature of humanity, made in the image of God.',
    },
  },
  {
    name: { af: 'Verlossing', en: 'Salvation' },
    desc: {
      af: 'Die groot stryd, die lewe, dood en opstanding van Christus, en die ervaring van verlossing.',
      en: 'The great controversy, the life, death and resurrection of Christ, and the experience of salvation.',
    },
  },
  {
    name: { af: 'Die Kerk', en: 'The Church' },
    desc: {
      af: 'Die kerk en haar sending, eenheid in die liggaam, die doop en die Nagmaal.',
      en: 'The church and its mission, unity in the body, baptism and the Lord’s Supper.',
    },
  },
  {
    name: { af: 'Daaglikse Lewe', en: 'Daily Living' },
    desc: {
      af: 'Die Sabbat, rentmeesterskap, die gawe van profesie, die gesin en Christelike lewe.',
      en: 'The Sabbath, stewardship, the gift of prophecy, family and Christian living.',
    },
  },
  {
    name: { af: 'Herstel', en: 'Restoration' },
    desc: {
      af: 'Christus se diens in die hemelse heiligdom, sy wederkoms, die opstanding en die nuwe aarde.',
      en: 'Christ’s ministry in the heavenly sanctuary, His second coming, the resurrection and the new earth.',
    },
  },
];
