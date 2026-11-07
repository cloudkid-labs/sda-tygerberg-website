import type { Lang } from './site';

export type BeliefsCopy = {
  backHome: string;
  eyebrow: string;
  heading: string;
  sub: string;
  pdfCta: string;
};

export const beliefsCopy: Record<Lang, BeliefsCopy> = {
  af: {
    backHome: 'Tuisblad',
    eyebrow: '28 Fundamentele Leerstellings',
    heading: 'Wat Ons Glo',
    sub: 'Adventiste glo dat die Bybel God se Woord is en die enigste maatstaf van geloof en lewe. Hierdie 28 leerstellings som ons verstaan van die Skrif op, gegroepeer in ses temas.',
    pdfCta: 'Laai die amptelike PDF af',
  },
  en: {
    backHome: 'Homepage',
    eyebrow: '28 Fundamental Beliefs',
    heading: 'What We Believe',
    sub: 'Adventists believe the Bible is God’s Word and the only standard of faith and life. These 28 beliefs summarise our understanding of Scripture, grouped into six themes.',
    pdfCta: 'Download the official PDF',
  },
};
