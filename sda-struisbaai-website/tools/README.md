# tools/

Authoring helpers. Nothing here runs during `npm run build` or on deploy — these
are one-off scripts whose *output* is committed.

After regenerating any icon, confirm a browser actually *draws* it
(`naturalWidth > 0`), not merely that the file contains the right path data —
CONCERNS.md C-26.

## Headshot fallbacks — moved

`build-headshots.mjs` used to live here. It is gone: `scripts/headshot-fallbacks.mjs`
did the same job from the same sources, `npm run headshots` pointed at that one,
and the two disagreed on quality and on whether to apply EXIF rotation — so
which copy a headshot got depended on which script someone happened to run.
One of the fourteen committed fallbacks had been built by the wrong one.

There is one generator now:

```sh
npm run headshots            # build anything missing, check the rest
npm run headshots -- --force # rebuild every fallback
```

`public/images/hod/TG-DH-*.jpg` (~20 MP, 7-10 MB) →
`public/images/hod/fallback/TG-DH-*.jpg` (1400px wide, ~200-360 kB, EXIF
stripped). It resizes nothing else — the originals stay exactly as delivered,
because they are what Cloudflare transforms per viewport. See CONCERNS.md C-52.

Run it whenever a headshot is added or replaced, and commit the output.

Like `og-image.html` below it needs `sharp`, but no extra install: `sharp` comes
in with Astro's own dependencies, so `npm ci` is enough. If that ever stops
being true the script says so and exits.

## og-image.html

Source for `public/og-image.png` (1200×630, the social card) and
`public/apple-touch-icon.png` (180×180).

Rendered by hand rather than generated at build time: the card changes roughly
never, and generating it per build would mean adding an image pipeline and its
dependencies to a project that deliberately runs five.

### Regenerating

Needs Playwright and a Chromium; neither is a project dependency, so install
them somewhere outside the repo.

```sh
npm i playwright            # in a scratch directory, not this repo
npx playwright install chromium
```

The template references Newsreader and Public Sans. A headless browser with no
network access renders them as fallback serif/sans, which looks wrong, so the
fonts have to be inlined first — fetch the Google Fonts CSS, replace each
`https://fonts.gstatic.com/...woff2` URL with a `data:font/woff2;base64,...`
equivalent, and substitute the result for the `<!-- FONT_CSS -->` comment.

Then screenshot at exactly 1200×630 with `deviceScaleFactor: 1`, waiting on
`document.fonts.status === 'loaded'` before capturing.

### Replacing it with a photograph

A photo of the building or the congregation would be better than a composed
card, and swapping one in needs no code change — drop a 1200×630 image at
`public/og-image.png`. The dimensions are declared in
`src/layouts/Layout.astro` (`og:image:width` / `og:image:height`); change them
there if the replacement is a different size, and update `og:image:alt` to
describe what the photo actually shows.
