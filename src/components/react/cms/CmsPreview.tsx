import { useEffect, useState } from 'react';
import { LanguageProvider, useLanguage } from '../../../context/LanguageContext';
import { cmsCopy } from '../../../data/cmsCopy';
import type { Page } from '../../../lib/cms/types';
import { StandardPage } from '../StandardPage';
import { PREVIEW_STORAGE_PREFIX } from './CmsPages';
import { cmsApi } from './ui';

type Content = Omit<Page, 'status' | 'updatedBy' | 'updatedAt'>;

function PreviewContent() {
  const { lang } = useLanguage();
  const t = cmsCopy[lang];
  const [page, setPage] = useState<Content | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('slug') ?? '';
    // The editor hands over what is on screen, saved or not.
    try {
      const key = `${PREVIEW_STORAGE_PREFIX}${slug}`;
      const handed = window.localStorage.getItem(key);
      if (handed) {
        window.localStorage.removeItem(key);
        setPage(JSON.parse(handed) as Content);
        return;
      }
    } catch {
      // Storage blocked: fall back to the saved draft below.
    }
    cmsApi<{ page: Page }>('GET', `/api/cms/pages?slug=${encodeURIComponent(slug)}`).then((res) => {
      if (res.ok) setPage(res.data.page);
      else setMissing(true);
    });
  }, []);

  return (
    <>
      <div role="status" className="sticky top-0 z-[60] bg-navy px-4 py-2 text-center text-[13px] font-bold text-white">
        {missing ? t.pgPreviewMissing : t.pgPreviewBanner}
      </div>
      {page && <StandardPage header={{ eyebrow: page.eyebrow, title: page.title, intro: page.intro }} blocks={page.blocks} />}
    </>
  );
}

/** /members/preview/?slug= — a draft in the standard template, members only. */
export function CmsPreview() {
  return (
    <LanguageProvider>
      <PreviewContent />
    </LanguageProvider>
  );
}
