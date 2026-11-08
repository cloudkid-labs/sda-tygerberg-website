import { defineChurchSite } from '@cloudkid-labs/sda-church-site-core/config';
import { MEMBERS_SITES, SERVICE_TIMES, SITE } from './site';
import { UI_CONFIG } from './uiConfig';

// Core metadata is derived from Tygerberg's existing config so the church keeps
// one source for its address, map, service times, domain, and brand colors.
export const CHURCH_SITE = defineChurchSite({
  id: 'tygerberg-sda',
  name: { af: SITE.name, en: SITE.name },
  locales: ['af', 'en'],
  defaultLocale: 'af',
  url: MEMBERS_SITES.live,
  location: {
    address: SITE.address,
    lat: SITE.lat,
    lng: SITE.lng,
    directionsUrl: SITE.directionsUrl,
    appleMapsUrl: SITE.appleMapsUrl,
  },
  serviceTimes: SERVICE_TIMES.map(({ af, en, start, end }) => ({
    name: { af, en },
    start,
    end,
  })),
  theme: { primary: '#0b3d54', accent: '#e8862c' },
  visibility: UI_CONFIG.visibility,
});
