import type { Lang } from './site';

export type Resource = {
  name: Record<Lang, string>;
  domain: string;
  url: string;
  // Self-hosted under /logos — downloaded from the source, not hot-linked.
  logo: string;
};

export const resources: Resource[] = [
  {
    name: { af: 'Lesstudie Biblioteek', en: 'Lesson Study Library' },
    domain: 'sabbath-school.adventech.io',
    url: 'https://sabbath-school.adventech.io/af',
    logo: '/logos/sabbath-school.png',
  },
  {
    name: { af: 'HomebaseTV Afrikaans', en: 'HomebaseTV Afrikaans' },
    domain: 'homebasetv.org',
    url: 'https://homebasetv.org/',
    logo: '/logos/homebasetv.png',
  },
  {
    name: { af: 'AWR Afrikaans', en: 'AWR Afrikaans' },
    domain: 'awrafrikaans.org',
    url: 'https://awrafrikaans.org/',
    logo: '/logos/awr.png',
  },
  {
    // The brand is "EGW Writings®", but the author's name is what a
    // congregation recognises, so the card spells it out and the domain line
    // underneath carries the brand.
    name: { af: 'Ellen G. White Geskrifte', en: 'Ellen G. White Writings' },
    domain: 'egwwritings.org',
    url: 'https://egwwritings.org/',
    logo: '/logos/egwwritings.png',
  },
];
