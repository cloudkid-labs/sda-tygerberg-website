import { useState } from 'react';
import { LanguageProvider } from '../../context/LanguageContext';
import { PAGE_PAYLOAD_ID } from '../../lib/cms/ids';
import { readJsonScript } from '../../lib/cms/payload';
import type { PagePayload, PublicPage } from '../../lib/cms/types';
import { StandardPage } from './StandardPage';

/** What the build renders into /page-shell/. Never served as is (C-70). */
const SHELL: PublicPage = {
  slug: 'page-shell',
  title: { af: '', en: '' },
  eyebrow: { af: '', en: '' },
  intro: { af: '', en: '' },
  blocks: [],
};

/**
 * The island behind every CMS page at /<slug>/. The Worker renders it with
 * `page` set and writes the same page into the payload; the browser reads the
 * payload, so its first render matches the Worker's HTML.
 */
export function CmsPageView({ page }: { page?: PublicPage }) {
  const [current] = useState<PublicPage>(() => page ?? readJsonScript<PagePayload>(PAGE_PAYLOAD_ID)?.page ?? SHELL);
  return (
    <LanguageProvider>
      <StandardPage
        rootId="cms-page-root"
        header={{ eyebrow: current.eyebrow, title: current.title, intro: current.intro }}
        blocks={current.blocks}
      />
    </LanguageProvider>
  );
}
