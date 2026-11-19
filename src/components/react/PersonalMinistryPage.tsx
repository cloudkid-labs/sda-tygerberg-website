import { LanguageProvider } from '../../context/LanguageContext';
import { personalMinistryCopy } from '../../data/personalMinistryCopy';
import type { Block } from '../../lib/cms/types';
import { StandardPage } from './StandardPage';

/**
 * QR target for the clothing-bin sticker: what goes in, what doesn't, and
 * where it ends up. Static copy (not CMS) so the sticker URL never 404s or
 * changes meaning behind a print run.
 */
function PersonalMinistryContent() {
  const c = personalMinistryCopy;
  const l10n = (pick: (t: (typeof c)['af']) => string) => ({ af: pick(c.af), en: pick(c.en) });

  const blocks: Block[] = [
    {
      type: 'cardGrid',
      heading: l10n((t) => t.acceptHeading),
      intro: l10n((t) => t.acceptIntro),
      cards: c.af.acceptItems.map((_, i) => ({
        label: { af: '', en: '' },
        title: { af: c.af.acceptItems[i].title, en: c.en.acceptItems[i].title },
        text: { af: c.af.acceptItems[i].text, en: c.en.acceptItems[i].text },
      })),
    },
    {
      type: 'text',
      heading: l10n((t) => t.noHeading),
      body: l10n((t) => t.noBody),
    },
    {
      type: 'text',
      heading: l10n((t) => t.processHeading),
      body: l10n((t) => t.processBody),
    },
    {
      type: 'text',
      heading: l10n((t) => t.binHeading),
      body: l10n((t) => t.binBody),
    },
    {
      type: 'callout',
      heading: l10n((t) => t.ctaHeading),
      text: l10n((t) => `${t.ctaText}\n\n${t.thanks}`),
      button: { label: l10n((t) => t.ctaLabel), href: '/connect/' },
    },
  ];

  return (
    <StandardPage
      header={{
        eyebrow: l10n((t) => t.eyebrow),
        title: l10n((t) => t.heading),
        intro: l10n((t) => t.sub),
      }}
      blocks={blocks}
    />
  );
}

export function PersonalMinistryPage() {
  return (
    <LanguageProvider defaultLocale="en">
      <PersonalMinistryContent />
    </LanguageProvider>
  );
}
