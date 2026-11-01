import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { boardCopy } from '../../data/boardCopy';
import { membersCopy } from '../../data/membersCopy';
import { MEMBERS_SITES } from '../../data/site';
import { buttonPrimary, buttonSecondary, cardClass } from './cms/ui';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';
import { BoardMail } from './BoardMail';
import { CmsEvents } from './cms/CmsEvents';
import { CmsHeads } from './cms/CmsHeads';
import { CmsPages } from './cms/CmsPages';
import { RecentChanges } from './cms/RecentChanges';
import { isUnread, type ThreadLike } from '../../lib/mailUnread';
import { SettingsPanel } from './cms/SettingsPanel';
import { Avatar } from './Avatar';

type Tab = 'mail' | 'content' | 'test' | 'settings';
type Section = 'events' | 'heads' | 'pages';
type Phase = 'loading' | 'ready' | 'not-configured' | 'error';

const SECTIONS: Section[] = ['events', 'heads', 'pages'];

function readLocation(): { tab: Tab; section: Section } {
  if (typeof window === 'undefined') return { tab: 'mail', section: 'events' };
  const params = new URLSearchParams(window.location.search);
  const section = SECTIONS.find((s) => s === params.get('section')) ?? 'events';
  const tab = params.get('tab');
  return { tab: tab === 'content' || tab === 'test' || tab === 'settings' ? tab : 'mail', section };
}

/** Writes the tab into the URL so a refresh or a shared link lands in place. */
function writeLocation(tab: Tab, section: Section, extra?: Record<string, string>) {
  const params = new URLSearchParams();
  if (tab === 'content') {
    params.set('tab', 'content');
    params.set('section', section);
  }
  if (tab === 'test' || tab === 'settings') params.set('tab', tab);
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

/** Outline icons for the sidebar (24px grid, stroke). */
const ICONS = {
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  content: 'M4 5h16v14H4zM4 9h16M9 9v10',
  test: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 14h9',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
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
  /** False where the Worker has Board mail switched off (devtest). */
  const [mailOn, setMailOn] = useState(true);
  /** Admins (SuperAdmins and those Settings names) see the Settings tab. */
  const [admin, setAdmin] = useState(false);
  /** Name and picture from Settings: an HOD's headshot, an upload, or none. */
  const [profile, setProfile] = useState<{ name: string | null; photo: string | null }>({ name: null, photo: null });
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
        const data = (await res.json()) as { email?: string; mail?: boolean; admin?: boolean };
        setEmail(data.email ?? '');
        setAdmin(data.admin === true);
        void fetch('/api/cms/profile', { cache: 'no-store', headers: { Accept: 'application/json' } })
          .then((r) => (r.ok ? (r.json() as Promise<{ name?: string | null; photo?: string | null }>) : null))
          .then((p) => {
            if (p) setProfile({ name: p.name ?? null, photo: p.photo ?? null });
          })
          .catch(() => {});
        if (data.mail === false) {
          // No Board mail here: open on Website content instead.
          setMailOn(false);
          setLocation((loc) => (loc.tab === 'mail' ? { ...loc, tab: 'content' } : loc));
          if (initial.tab === 'mail') writeLocation('content', initial.section);
          setPhase('ready');
          return;
        }
        setPhase('ready');
        // The badge must be right before Board mail is ever opened.
        const inbox = await fetch('/api/mail/inbox', { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (inbox.ok) {
          const list = (await inbox.json()) as { items?: ThreadLike[] };
          setUnread((list.items ?? []).filter(isUnread).length);
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

  // A Settings link opened by someone who is not an admin lands on content.
  useEffect(() => {
    if (phase === 'ready' && tab === 'settings' && !admin) go('content');
  }, [phase, tab, admin, go]);

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

  const navItem = (id: Tab, label: string, icon: ReactNode, badge?: ReactNode) => (
    <a
      key={id}
      href={id === 'mail' ? '?' : id === 'content' ? `?tab=content&section=${section}` : `?tab=${id}`}
      aria-current={tab === id ? 'page' : undefined}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        go(id);
      }}
      className={`inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-3 text-[14.5px] transition-colors sm:gap-3 sm:px-3.5 sm:text-[15px] lg:w-full ${
        tab === id ? 'bg-navy font-bold text-white' : 'font-semibold text-slate hover:bg-navy/5 hover:text-navy'
      }`}
    >
      <span className={tab === id ? 'text-orange' : 'text-slate-muted'}>{icon}</span>
      <span className="flex-1">{label}</span>
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
      <SubPageHeader
        backHome={b.backHome}
        account={
          phase === 'ready' && email ? (
            <span className="flex min-w-0 items-center gap-2" title={`${b.signedInAs}: ${email}`}>
              <Avatar src={profile.photo} size={32} alt={profile.name ?? email} />
              <span className="hidden min-w-0 flex-col leading-tight md:flex">
                <span className="text-[11px] text-slate-muted">{b.signedInAs}:</span>
                <span className="max-w-[200px] truncate text-[13px] font-bold text-ink">{profile.name ?? email}</span>
              </span>
            </span>
          ) : undefined
        }
      />

      <main id="main" className="mx-auto w-full max-w-content flex-1 px-5 pb-20 pt-12 sm:px-7 sm:pt-14">
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
          <div className="mt-8 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-8">
            {/* The sections: a sidebar on wide screens, a grid of buttons on phones. */}
            <aside className="min-w-0 lg:sticky lg:top-24">
              <nav
                aria-label={t.areaNav}
                className="grid grid-cols-2 gap-1.5 rounded-card-lg border border-subtle bg-cream-card p-2 shadow-card sm:flex sm:flex-wrap lg:flex-col lg:flex-nowrap"
              >
                {mailOn && navItem('mail', t.tabMail, <NavIcon d={ICONS.mail} />, <Badge count={unread} label={b.unreadSuffix} />)}
                {navItem('content', t.tabContent, <NavIcon d={ICONS.content} />)}
                {navItem('test', t.tabTestSite, <NavIcon d={ICONS.test} />)}
                {admin && navItem('settings', t.tabSettings, <NavIcon d={ICONS.settings} />)}
              </nav>
              <div className="mt-3 hidden min-w-0 px-2 text-[13px] text-slate lg:block">
                <span className="block">{b.signedInAs}:</span>
                <strong className="block break-all text-ink">{email}</strong>
              </div>
              <button type="button" onClick={signOut} className="mt-1 hidden min-h-11 px-2 text-[14px] font-bold text-navy underline lg:block">
                {b.signOut}
              </button>
            </aside>

            <div className="min-w-0">
              {tab === 'mail' && mailOn && (
                <div>
                  <p className="mb-3.5 text-[14px] text-slate-muted">{t.mailIntro}</p>
                  <BoardMail onUnread={setUnread} />
                </div>
              )}

              {tab === 'test' && <TestSitePanel />}

              {tab === 'settings' && admin && <SettingsPanel />}

              {tab === 'content' && (
                <div>
                  <p className="mb-3.5 text-[14px] text-slate-muted">{t.contentIntro}</p>
                  <nav aria-label={t.contentNav} className="mb-7 flex flex-wrap gap-2">
                    {SECTIONS.map((sec) => (
                      <a
                        key={sec}
                        href={`?tab=content&section=${sec}`}
                        aria-current={section === sec ? 'page' : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          go('content', sec);
                        }}
                        className={`inline-flex min-h-11 items-center rounded-pill px-5 text-[14px] font-bold transition-colors ${
                          section === sec ? 'bg-navy text-white' : 'border-[1.5px] border-navy text-navy hover:bg-navy/5'
                        }`}
                      >
                        {sectionLabel[sec]}
                      </a>
                    ))}
                  </nav>
                  {section === 'events' && <CmsEvents onOpenPage={openPageFromEvents} />}
                  {section === 'heads' && <CmsHeads />}
                  {section === 'pages' && <CmsPages initialSlug={openPage} />}
                  <RecentChanges refreshKey={section} />
                </div>
              )}

              {/* Phones: who is signed in, and sign out, under the section. */}
              <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-4 text-[14px] text-slate lg:hidden">
                <span className="min-w-0 break-all">
                  {b.signedInAs}: <strong className="text-ink">{email}</strong>
                </span>
                <button type="button" onClick={signOut} className="min-h-11 font-bold text-navy underline">
                  {b.signOut}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <SubPageFooter backHome={b.backHome} />
    </div>
  );
}

/**
 * The Test site tab: what the devtest copy is for, and a Sign in button that
 * starts Google sign-in on devtest itself, whose callback lands on its
 * /members/. On devtest the tab says so and points back to the real site.
 * Which of the two shows is decided after mount, so the first render matches
 * the build.
 */
function TestSitePanel() {
  const { lang } = useLanguage();
  const t = membersCopy[lang];
  const [onTest, setOnTest] = useState(false);
  useEffect(() => setOnTest(window.location.origin === MEMBERS_SITES.test), []);

  if (onTest) {
    return (
      <section aria-labelledby="ts-h" className={cardClass}>
        <h2 id="ts-h" className="font-serif text-[26px] font-medium text-ink">{t.onTestHeading}</h2>
        <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-slate">{t.onTestIntro}</p>
        <a href={`${MEMBERS_SITES.live}/members/`} className={`${buttonSecondary} mt-5`}>
          {t.onTestLive}
        </a>
      </section>
    );
  }
  return (
    <section aria-labelledby="ts-h" className={cardClass}>
      <h2 id="ts-h" className="font-serif text-[26px] font-medium text-ink">{t.testHeading}</h2>
      <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-slate">{t.testIntro}</p>
      <ul className="mt-4 grid max-w-[620px] list-disc gap-1.5 pl-5 text-[14.5px] leading-relaxed text-ink">
        {t.testPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p className="mt-5 max-w-[620px] rounded-[10px] bg-tan px-4 py-3 text-[14.5px] font-bold text-navy">{t.testRecommend}</p>
      <a href={`${MEMBERS_SITES.test}/auth/login`} className={`${buttonPrimary} mt-5`}>
        {t.testSignIn}
      </a>
      <p className="mt-2 text-[12.5px] text-slate-muted">{t.testSignInNote}</p>
    </section>
  );
}

export function MembersPage() {
  return (
    <LanguageProvider>
      <MembersContent />
    </LanguageProvider>
  );
}
