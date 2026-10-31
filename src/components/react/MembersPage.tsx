import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { boardCopy } from '../../data/boardCopy';
import { membersCopy } from '../../data/membersCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';
import { BoardMail } from './BoardMail';
import { CmsEvents } from './cms/CmsEvents';
import { CmsHeads } from './cms/CmsHeads';
import { CmsPages } from './cms/CmsPages';

type Tab = 'mail' | 'content';
type Section = 'events' | 'heads' | 'pages';
type Phase = 'loading' | 'ready' | 'not-configured' | 'error';

const SECTIONS: Section[] = ['events', 'heads', 'pages'];

function readLocation(): { tab: Tab; section: Section } {
  if (typeof window === 'undefined') return { tab: 'mail', section: 'events' };
  const params = new URLSearchParams(window.location.search);
  const section = SECTIONS.find((s) => s === params.get('section')) ?? 'events';
  return { tab: params.get('tab') === 'content' ? 'content' : 'mail', section };
}

/** Writes the tab into the URL so a refresh or a shared link lands in place. */
function writeLocation(tab: Tab, section: Section, extra?: Record<string, string>) {
  const params = new URLSearchParams();
  if (tab === 'content') {
    params.set('tab', 'content');
    params.set('section', section);
  }
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="rounded-pill bg-orange px-[7px] py-0.5 text-[11px] font-bold text-ink">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

/**
 * One page, two areas: Board mail (the existing inbox, unchanged in behaviour)
 * and Website content (the CMS). The Worker has already checked the session and
 * the allow-list before this HTML was served (C-70); the session call here is
 * only for the email to show, and every API it calls re-checks for itself.
 */
function MembersContent() {
  const { lang } = useLanguage();
  const t = membersCopy[lang];
  const b = boardCopy[lang];

  const [phase, setPhase] = useState<Phase>('loading');
  const [email, setEmail] = useState('');
  const [{ tab, section }, setLocation] = useState<{ tab: Tab; section: Section }>({
    tab: 'mail',
    section: 'events',
  });
  const [unread, setUnread] = useState(0);
  /** A page the events editor asked to open (New page from template). */
  const [openPage, setOpenPage] = useState<string | null>(null);

  useEffect(() => {
    const initial = readLocation();
    setLocation(initial);
    if (initial.tab === 'content' && initial.section === 'pages') {
      setOpenPage(new URLSearchParams(window.location.search).get('page'));
    }
    (async () => {
      try {
        const res = await fetch('/api/mail/session', { headers: { Accept: 'application/json' } });
        if (res.status === 401) {
          window.location.replace('/login/');
          return;
        }
        if (res.status === 503) {
          setPhase('not-configured');
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { email?: string };
        setEmail(data.email ?? '');
        setPhase('ready');
        // The badge must be right before Board mail is ever opened.
        const inbox = await fetch('/api/mail/inbox', { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (inbox.ok) {
          const list = (await inbox.json()) as { items?: { replies?: unknown[] }[] };
          setUnread((list.items ?? []).filter((x) => (x.replies ?? []).length === 0).length);
        }
      } catch {
        setPhase('error');
      }
    })();
  }, []);

  const go = useCallback((next: Tab, nextSection: Section = section, extra?: Record<string, string>) => {
    setLocation({ tab: next, section: nextSection });
    writeLocation(next, nextSection, extra);
  }, [section]);

  const openPageFromEvents = useCallback(
    (slug: string) => {
      setOpenPage(slug);
      go('content', 'pages', { page: slug });
    },
    [go],
  );

  async function signOut() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.assign('/login/');
  }

  const topTab = (id: Tab, label: string, badge?: ReactNode) => (
    <a
      href={id === 'mail' ? '?' : `?tab=content&section=${section}`}
      aria-current={tab === id ? 'page' : undefined}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        go(id);
      }}
      className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-[3px] px-[18px] text-[16px] ${
        tab === id ? 'border-orange font-bold text-navy' : 'border-transparent font-semibold text-slate hover:text-navy'
      }`}
    >
      {label}
      {badge}
    </a>
  );

  const sectionLabel: Record<Section, string> = {
    events: t.sectionEvents,
    heads: t.sectionHeads,
    pages: t.sectionPages,
  };

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={b.backHome} />

      <main
        id="main"
        className={`mx-auto w-full flex-1 px-5 pb-20 pt-12 sm:px-7 sm:pt-14 ${
          tab === 'content' ? 'max-w-content' : 'max-w-[900px]'
        }`}
      >
        <h1 className="font-serif text-[clamp(32px,6vw,46px)] font-medium leading-[1.1] tracking-[-.02em] text-ink">
          {b.heading}
        </h1>
        <p className="mt-3.5 max-w-[540px] text-[16px] leading-relaxed text-slate">{b.sub}</p>

        {phase === 'loading' && (
          <div aria-hidden="true" className="mt-8 grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-card border border-subtle bg-cream-card" />
            ))}
          </div>
        )}

        {(phase === 'not-configured' || phase === 'error') && (
          <p role="alert" className="mt-8 rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
            {phase === 'not-configured' ? t.notConfigured : t.loadError}
          </p>
        )}

        {phase === 'ready' && (
          <>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-2 text-[14px] text-slate">
              <span className="min-w-0 break-all">
                {b.signedInAs} <strong className="text-ink">{email}</strong>
              </span>
              <button type="button" onClick={signOut} className="min-h-11 font-bold text-navy underline">
                {b.signOut}
              </button>
            </div>

            <nav aria-label={t.areaNav} className="mt-4 flex flex-wrap gap-1 border-b border-ink/15">
              {topTab('mail', t.tabMail, <Badge count={unread} label={b.unreadSuffix} />)}
              {topTab('content', t.tabContent)}
            </nav>

            {tab === 'mail' && (
              <div className="mt-[18px]">
                <p className="mb-3.5 text-[14px] text-slate-muted">{t.mailIntro}</p>
                <BoardMail onUnread={setUnread} />
              </div>
            )}

            {tab === 'content' && (
              <div className="mt-[18px]">
                <p className="mb-3.5 text-[14px] text-slate-muted">{t.contentIntro}</p>
                <nav aria-label={t.contentNav} className="mb-7 flex flex-wrap gap-2">
                  {SECTIONS.map((s) => (
                    <a
                      key={s}
                      href={`?tab=content&section=${s}`}
                      aria-current={section === s ? 'page' : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        go('content', s);
                      }}
                      className={`inline-flex min-h-11 items-center rounded-pill px-5 text-[14px] font-bold transition-colors ${
                        section === s
                          ? 'bg-navy text-white'
                          : 'border-[1.5px] border-navy text-navy hover:bg-navy/5'
                      }`}
                    >
                      {sectionLabel[s]}
                    </a>
                  ))}
                </nav>
                {section === 'events' && <CmsEvents onOpenPage={openPageFromEvents} />}
                {section === 'heads' && <CmsHeads />}
                {section === 'pages' && <CmsPages initialSlug={openPage} />}
              </div>
            )}
          </>
        )}
      </main>

      <SubPageFooter backHome={b.backHome} />
    </div>
  );
}

export function MembersPage() {
  return (
    <LanguageProvider>
      <MembersContent />
    </LanguageProvider>
  );
}
