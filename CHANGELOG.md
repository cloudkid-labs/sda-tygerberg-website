# Changelog

[Semantic Versioning](https://semver.org/). What the numbers mean: README,
"Versioning and releases".

## [1.2.1] — unreleased

- `/blood-bank` lists the drive dates and their 45-minute slots; the week grid
  gains a fifth card counting the sessions still bookable (C-36, C-37).
- Ellen G. White Geskrifte (`egwwritings.org`) in "Voed jou geloof daagliks".
- `/llms.txt` per [llmstxt.org](https://llmstxt.org/), restating the site's
  facts for agent readers (C-35).
- Strewers, Kinderbediening and Gesinsbediening render — the three Louw
  headshots landed and are now referenced (C-29). The couple photo was cropped
  to portrait first.
- Six open advisories cleared: `js-yaml`, `nanoid`, `postcss` and `undici`,
  the last via `wrangler` 4.120.0 and a matching `@cloudflare/workers-types`.
- Token setup lists the R2 permission the consent bucket needs —
  SETUP-INSTRUCTIONS.md §3.2.

## [1.2.0] — 2026-08-10

- Consent records for `/api/contact` written to R2 before delivery (C-34).
  Retention is a manual lifecycle rule — SETUP-INSTRUCTIONS.md §3.6.
- Carousel swipe survives the browser cancelling an ambiguous gesture (C-33).
- Roster corrections for seven departments.
- Semver policy, promotion guard, this changelog.

## [1.1.0] — 2026-08-09

Re-tag of `a66c8ac` to move onto 1.x. No code change, and no 1.0.0.
`package.json` still read `0.3.0` at this tag; 1.2.0 brings them back into step.

## [0.3.0] — 2026-08-08

- "Kyk Lewendig" shows only while streaming, and deep-links to the broadcast.
- `/api/live-status` gained `videoId` and `watchUrl`.
- `WebSite` JSON-LD node, so search shows the church's name.

## [0.2.0] — 2026-08-04

- Footer pinned on short pages; Skenk links straight to `/giving`.
- Elder roles corrected against the board's list rather than the Ampsdraers PDF.

## [0.1.0] — 2026-08-01

First release.

[1.2.1]: https://github.com/cloud-technologist/sda-tygerberg-website/compare/v1.2.0...dev
[1.2.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v1.2.0
[1.1.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v1.1.0
[0.3.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.3.0
[0.2.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.2.0
[0.1.0]: https://github.com/cloud-technologist/sda-tygerberg-website/releases/tag/v0.1.0
