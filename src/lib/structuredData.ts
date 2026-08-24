import { SITE, SABBATH_HOURS } from '../data/site';

/**
 * The name Google prints above the URL in a search result.
 *
 * Google picks one site name per host and reads `WebSite.name` first, ahead of
 * `og:site_name`, `<title>` and headings. Without this node the site inherited
 * the name Google had already derived for the parent domain — `cloudkid.link`
 * publishes `"name": "Cloudkid Consulting"` — and church results appeared
 * branded as a consultancy.
 *
 * Google only reads this from a host's **home page**, so it has to be present
 * on `/`. It is emitted on every page anyway: the node describes the site, not
 * the page, so it is true everywhere and cannot go missing from the one page
 * that matters.
 *
 * Re-derived at the origin, so a domain change carries it automatically.
 */
export function websiteJsonLd(site: URL) {
  return {
    '@type': 'WebSite',
    '@id': new URL('#website', site).href,
    name: 'Tygerberg SDA Kerk',
    alternateName: ['Tygerberg Sewendedag Adventiste Kerk', 'Tygerberg SDA Church'],
    url: site.href,
    inLanguage: 'af-ZA',
    publisher: { '@id': new URL('#church', site).href },
  };
}

/**
 * schema.org description of the congregation, emitted on every page, so a search
 * engine can answer "when does Tygerberg SDA meet". Restates what is already on
 * the page; both read from src/data/site.ts, so there is nothing to sync.
 *
 * That last sentence used to be false. Every address field was a literal here,
 * and the locality had drifted from the one the site displays. They are derived
 * now, so the claim holds. C-49
 */
export function churchJsonLd(site: URL) {
  return {
    '@type': 'Church',
    // The congregation, not the page — every page emits the same node.
    '@id': new URL('#church', site).href,
    name: 'Tygerberg Sewendedag Adventiste Kerk',
    alternateName: ['Tygerberg SDA Kerk', 'Tygerberg Seventh-day Adventist Church'],
    url: site.href,
    address: {
      '@type': 'PostalAddress',
      // Suburb rides with the street line; addressLocality is the town.
      streetAddress: `${SITE.addressParts.street}, ${SITE.addressParts.suburb}`,
      addressLocality: SITE.addressParts.town,
      addressRegion: SITE.addressParts.region,
      postalCode: SITE.addressParts.postalCode,
      addressCountry: SITE.addressParts.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: SITE.lat,
      longitude: SITE.lng,
    },
    hasMap: SITE.directionsUrl,
    sameAs: [SITE.youtubeChannelUrl],
    // One span, not three: three would claim the building shuts between
    // services. This describes when the place is open.
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Saturday',
        opens: SABBATH_HOURS.opens,
        closes: SABBATH_HOURS.closes,
      },
    ],
  };
}
