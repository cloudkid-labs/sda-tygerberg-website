import { useCallback, useEffect, useState } from 'react';
import { LanguageProvider, useLanguage } from '../../context/LanguageContext';
import { boardCopy, FROM_ADDRESSES, type BoardCopy } from '../../data/boardCopy';
import { SubPageHeader } from './SubPageHeader';
import { SubPageFooter } from './SubPageFooter';

type Phase = 'loading' | 'signed-out' | 'ready';
type View = 'inbox' | 'sent' | 'write';
type SendOutcome = 'invalid' | 'unauthorised' | 'forbidden' | 'not-configured' | 'send-error' | 'network';

type ThreadReply = { by: string; at: string };
type ThreadSummary = {
  id: string;
  submittedAt: string;
  topic: string;
  name: string;
  email: string | null;
  phone: string | null;
  lang: string;
  replies: ThreadReply[];
};
type Thread = ThreadSummary & { message: string };
type SentSummary = {
  id: string;
  at: string;
  by: string;
  from: string;
  to: string[];
  subject: string;
  kind: 'compose' | 'reply';
  threadId: string | null;
};
type SentItem = SentSummary & { body: string };

const inputClass =
  'w-full rounded-card border border-subtle bg-white px-4 py-2.5 text-[15px] text-ink placeholder:text-slate/60';

/**
 * The inbox as two queues: unanswered threads under New, answered ones under
 * Replied. Answering moves the thread — the reply count is the state, so no
 * separate read/unread flag exists to drift out of step with it.
 */
function ThreadSections({
  threads,
  topicLabel,
  fmtDate,
  openMessage,
  t,
}: {
  threads: ThreadSummary[];
  topicLabel: (topic: string) => string;
  fmtDate: (iso: string) => string;
  openMessage: (id: string) => void;
  t: BoardCopy;
}) {
  const fresh = threads.filter((x) => x.replies.length === 0);
  const done = threads.filter((x) => x.replies.length > 0);
  const table = (items: ThreadSummary[]) => (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-subtle text-[13px] text-slate">
          <th scope="col" className="py-2 pr-3 font-bold">{t.colFrom}</th>
          <th scope="col" className="py-2 pr-3 font-bold">{t.colTopic}</th>
          <th scope="col" className="py-2 pr-3 font-bold">{t.colDate}</th>
          <th scope="col" className="py-2 font-bold">
            <span className="sr-only">{t.replyAction}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((x) => (
          <tr key={x.id} className="border-b border-subtle">
            <td className="py-3 pr-3">
              <button
                type="button"
                onClick={() => openMessage(x.id)}
                className="text-left font-bold text-navy underline"
              >
                {x.name}
              </button>
              <span className="block text-[13px] text-slate">{x.email ?? x.phone ?? ''}</span>
            </td>
            <td className="py-3 pr-3 text-[14px]">{topicLabel(x.topic)}</td>
            <td className="tabular-nums py-3 pr-3 text-[14px] text-slate">{fmtDate(x.submittedAt)}</td>
            <td className="py-3 text-right">
              <button
                type="button"
                onClick={() => openMessage(x.id)}
                className="rounded-pill border-[1.5px] border-navy px-4 py-1.5 text-[13px] font-bold text-navy transition-colors hover:bg-navy hover:text-white"
              >
                {t.replyAction}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div>
      <h2 className="mb-2 font-serif text-xl font-medium text-ink">{t.sectionNew}</h2>
      {fresh.length > 0 ? (
        table(fresh)
      ) : (
        <p className="mb-8 text-[14.5px] text-slate">{t.emptyHeading}</p>
      )}
      <h2 className="mb-2 mt-10 font-serif text-xl font-medium text-ink">{t.sectionReplied}</h2>
      {done.length > 0 ? (
        table(done)
      ) : (
        <p className="text-[14.5px] text-slate">{t.emptyReplied}</p>
      )}
    </div>
  );
}

/**
 * The board's inbox: visitor submissions in a queue, each thread readable and
 * answerable from the page, plus the compose form beside it. Standard
 * list-detail; the view and the open thread live in the URL so a refresh or
 * a shared link lands in the same place.
 */
function KerkraadContent() {
  const { lang } = useLanguage();
  const t = boardCopy[lang];
  const [phase, setPhase] = useState<Phase>('loading');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<View>('inbox');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsError, setThreadsError] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<Thread | null>(null);
  const [openError, setOpenError] = useState(false);
  const [sentItems, setSentItems] = useState<SentSummary[]>([]);
  const [sentError, setSentError] = useState(false);
  const [sentLoading, setSentLoading] = useState(false);
  const [openSentId, setOpenSentId] = useState<string | null>(null);
  const [openSent, setOpenSent] = useState<SentItem | null>(null);
  const [openSentError, setOpenSentError] = useState(false);
  const [reply, setReply] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<SendOutcome | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteError, setDeleteError] = useState<SendOutcome | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [from, setFrom] = useState(FROM_ADDRESSES[0]);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<SendOutcome | null>(null);

  const topicLabel = (topic: string) =>
    topic === 'bible-study' ? t.topicBibleStudy : t.topicConnect;

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(lang === 'af' ? 'af-ZA' : 'en-ZA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  const showView = useCallback((v: View, id: string | null = null) => {
    setView(v);
    setOpenId(v === 'inbox' ? id : null);
    setOpenSentId(v === 'sent' ? id : null);
    const params = new URLSearchParams(window.location.search);
    params.set('view', v);
    if (v === 'inbox' && id) params.set('msg', id);
    else params.delete('msg');
    if (v === 'sent' && id) params.set('smsg', id);
    else params.delete('smsg');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }, []);

  const loadInbox = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(false);
    try {
      const res = await fetch('/api/mail/inbox', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: ThreadSummary[] };
      setThreads(data.items ?? []);
    } catch {
      setThreadsError(true);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const loadSent = useCallback(async () => {
    setSentLoading(true);
    setSentError(false);
    try {
      const res = await fetch('/api/mail/sent', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: SentSummary[] };
      setSentItems(data.items ?? []);
    } catch {
      setSentError(true);
    } finally {
      setSentLoading(false);
    }
  }, []);

  const openSentMessage = useCallback(
    async (id: string) => {
      showView('sent', id);
      setOpenSent(null);
      setOpenSentError(false);
      try {
        const res = await fetch(`/api/mail/sent?id=${encodeURIComponent(id)}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { item?: SentItem };
        setOpenSent(data.item ?? null);
      } catch {
        setOpenSentError(true);
      }
    },
    [showView],
  );

  const openMessage = useCallback(
    async (id: string) => {
      showView('inbox', id);
      setOpenThread(null);
      setOpenError(false);
      setDeleteArmed(false);
      setDeleteError(null);
      try {
        const res = await fetch(`/api/mail/message?id=${encodeURIComponent(id)}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { item?: Thread };
        setOpenThread(data.item ?? null);
      } catch {
        setOpenError(true);
      }
    },
    [showView],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mail/session', { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          if (res.status === 503) setError('not-configured');
          setPhase('signed-out');
          return;
        }
        const data = (await res.json()) as { email?: string; admin?: boolean };
        setEmail(data.email ?? '');
        setIsAdmin(data.admin === true);
        setPhase('ready');
        const params = new URLSearchParams(window.location.search);
        const msg = params.get('msg');
        const smsg = params.get('smsg');
        await loadInbox();
        await loadSent();
        if (msg) await openMessage(msg);
        else if (smsg) await openSentMessage(smsg);
        else if (params.get('view') === 'write') setView('write');
        else if (params.get('view') === 'sent') setView('sent');
      } catch {
        setPhase('signed-out');
      }
    })();
  }, [loadInbox, loadSent, openMessage, openSentMessage]);

  async function signOut() {
    await fetch('/auth/logout', { method: 'POST' });
    setEmail('');
    setIsAdmin(false);
    setPhase('signed-out');
  }

  /** Admin-only: removes the open thread from R2, then back to the queue. */
  async function deleteThread() {
    if (!openThread) return;
    if (!deleteArmed) {
      setDeleteError(null);
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/mail/message?id=${encodeURIComponent(openThread.id)}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => ({}))) as { outcome?: string };
      if (res.ok) {
        const id = openThread.id;
        setThreads((ts) => ts.filter((x) => x.id !== id));
        setOpenThread(null);
        setOpenId(null);
        setDeleteArmed(false);
        const params = new URLSearchParams(window.location.search);
        params.delete('msg');
        window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
      } else if (data.outcome === 'unauthorised') {
        setDeleteError('unauthorised');
        setPhase('signed-out');
      } else if (data.outcome === 'forbidden') {
        setDeleteError('forbidden');
        setDeleteArmed(false);
      } else if (data.outcome === 'not-configured') {
        setDeleteError('not-configured');
      } else {
        setDeleteError('invalid');
      }
    } catch {
      setDeleteError('network');
    } finally {
      setDeleting(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!openThread) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await fetch('/api/mail/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: openThread.id, body: reply }),
      });
      const data = (await res.json().catch(() => ({}))) as { outcome?: string };
      if (res.ok && data.outcome === 'sent') {
        const at = new Date().toISOString();
        setOpenThread({ ...openThread, replies: [...openThread.replies, { by: email, at }] });
        setThreads((ts) =>
          ts.map((x) => (x.id === openThread.id ? { ...x, replies: [...x.replies, { by: email, at }] } : x)),
        );
        setReply('');
      } else if (data.outcome === 'unauthorised') {
        setReplyError('unauthorised');
        setPhase('signed-out');
      } else if (data.outcome === 'not-configured') {
        setReplyError('not-configured');
      } else if (data.outcome === 'send-error') {
        setReplyError('send-error');
      } else {
        setReplyError('invalid');
      }
    } catch {
      setReplyError('network');
    } finally {
      setReplySending(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSent(false);
    const recipients = to.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, subject, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { outcome?: string };
      if (res.ok && data.outcome === 'sent') {
        setSent(true);
      } else if (data.outcome === 'unauthorised') {
        setError('unauthorised');
        setPhase('signed-out');
      } else if (data.outcome === 'not-configured') {
        setError('not-configured');
      } else if (data.outcome === 'send-error') {
        setError('send-error');
      } else {
        setError('invalid');
      }
    } catch {
      setError('network');
    } finally {
      setSending(false);
    }
  }

  const errorText: Record<SendOutcome, string> = {
    invalid: t.errValidation,
    unauthorised: t.errUnauthorised,
    forbidden: t.errForbidden,
    'not-configured': t.errNotConfigured,
    'send-error': t.errSend,
    network: t.errNetwork,
  };

  return (
    <div className="flex min-h-screen flex-col font-sans text-ink">
      <SubPageHeader backHome={t.backHome} />

      <main id="main" className="flex-1">
        <section className="mx-auto max-w-[720px] px-5 pb-8 pt-14 sm:px-7 sm:pt-16">
          <h1 className="mb-3 font-serif text-[clamp(28px,5vw,42px)] font-medium leading-[1.1] tracking-[-.015em] text-ink">
            {t.heading}
          </h1>
          <p className="max-w-[560px] text-[16.5px] leading-relaxed text-slate">{t.sub}</p>
        </section>

        <section className="mx-auto max-w-[720px] px-5 pb-16 sm:px-7">
          {phase === 'loading' && (
            <div aria-hidden="true" className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-card border border-subtle bg-cream-card" />
              ))}
            </div>
          )}

          {phase === 'signed-out' && (
            <div>
              {error && (
                <p className="mb-5 rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                  {errorText[error]}
                </p>
              )}
              <a
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-pill bg-navy px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-ink"
              >
                {t.signIn}
              </a>
              <p className="mt-4 text-[13.5px] text-slate">{t.signInHint}</p>
            </div>
          )}

          {phase === 'ready' && (
            <div>
              <div className="mb-6 flex items-center justify-between gap-4 text-[13.5px] text-slate">
                <span>
                  {t.signedInAs} <strong className="text-ink">{email}</strong>
                </span>
                <button type="button" onClick={signOut} className="font-bold text-navy underline">
                  {t.signOut}
                </button>
              </div>

              <div role="tablist" aria-label={t.inboxTabs} className="mb-6 flex flex-wrap gap-2">
                {(['inbox', 'sent', 'write'] as View[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => showView(v)}
                    className={`rounded-pill px-5 py-2.5 text-[14px] font-bold transition-colors ${
                      view === v ? 'bg-navy text-white' : 'border-[1.5px] border-navy text-navy hover:bg-navy hover:text-white'
                    }`}
                  >
                    {v === 'inbox' ? t.tabInbox : v === 'sent' ? t.tabSent : t.tabWrite}
                  </button>
                ))}
              </div>

              {view === 'inbox' && (
                <div>
                  {threadsLoading && (
                    <div aria-hidden="true" className="grid gap-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-16 rounded-card border border-subtle bg-cream-card" />
                      ))}
                    </div>
                  )}
                  {threadsError && (
                    <div>
                      <p className="mb-4 rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                        {t.errNetwork}
                      </p>
                      <button
                        type="button"
                        onClick={loadInbox}
                        className="rounded-pill border-[1.5px] border-navy px-5 py-2.5 text-[13.5px] font-bold text-navy transition-colors hover:bg-navy hover:text-white"
                      >
                        {t.retry}
                      </button>
                    </div>
                  )}
                  {!threadsLoading && !threadsError && threads.length === 0 && (
                    <div className="rounded-card-lg border border-subtle bg-cream-card p-6 text-center sm:p-7">
                      <h2 className="mb-2 font-serif text-xl text-ink">{t.emptyHeading}</h2>
                      <p className="text-[14.5px] text-slate">{t.emptyBody}</p>
                    </div>
                  )}
                  {!threadsLoading && !threadsError && threads.length > 0 && !openId && (
                    <ThreadSections
                      threads={threads}
                      topicLabel={topicLabel}
                      fmtDate={fmtDate}
                      openMessage={openMessage}
                      t={t}
                    />
                  )}
                  {openId && (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenThread(null);
                          showView('inbox');
                          void loadInbox();
                        }}
                        className="mb-4 font-bold text-navy underline"
                      >
                        {t.backToInbox}
                      </button>
                      {openError && (
                        <p className="rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                          {t.errNetwork}
                        </p>
                      )}
                      {!openThread && !openError && (
                        <div aria-hidden="true" className="grid gap-3">
                          <div className="h-32 rounded-card border border-subtle bg-cream-card" />
                        </div>
                      )}
                      {openThread && (
                        <article>
                          <h2 className="mb-1 font-serif text-xl text-ink">
                            {openThread.name}
                          </h2>
                          <p className="mb-1 text-[13px] font-bold text-navy">{topicLabel(openThread.topic)}</p>
                          <p className="tabular-nums mb-4 text-[13px] text-slate">{fmtDate(openThread.submittedAt)}</p>
                          <p className="mb-2 text-[13px] font-bold text-navy">{t.theirMessage}</p>
                          <p className="mb-6 whitespace-pre-wrap text-[15px] leading-relaxed">{openThread.message}</p>
                          {openThread.replies.length > 0 && (
                            <div className="mb-6">
                              <p className="mb-2 text-[13px] font-bold text-navy">{t.earlierReplies}</p>
                              <ul className="grid gap-2">
                                {openThread.replies.map((r, i) => (
                                  <li key={i} className="tabular-nums text-[13.5px] text-slate">
                                    {r.by} · {fmtDate(r.at)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {openThread.email ? (
                            <form onSubmit={sendReply} className="grid gap-3">
                              {replyError && (
                                <p className="rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                                  {errorText[replyError]}
                                </p>
                              )}
                              <label className="grid gap-1.5">
                                <span className="text-[13px] font-bold text-navy">{t.replyLabel}</span>
                                <textarea
                                  value={reply}
                                  onChange={(e) => setReply(e.target.value)}
                                  rows={6}
                                  maxLength={10000}
                                  placeholder={t.replyPlaceholder}
                                  className={inputClass}
                                />
                              </label>
                              <button
                                type="submit"
                                disabled={replySending || reply.trim().length === 0}
                                className="inline-flex items-center justify-center gap-2 rounded-pill bg-navy px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-ink disabled:opacity-60"
                              >
                                {replySending ? t.replySending : t.replySubmit}
                              </button>
                            </form>
                          ) : (
                            <p className="rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                              {t.noEmailBody}
                            </p>
                          )}
                          {isAdmin && (
                            <div className="mt-8 border-t border-subtle pt-4">
                              {deleteError && (
                                <p className="mb-3 rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                                  {errorText[deleteError]}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={deleteThread}
                                disabled={deleting}
                                className="rounded-pill border-[1.5px] border-slate px-5 py-2 text-[13px] font-bold text-slate transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
                              >
                                {deleting ? t.deleting : deleteArmed ? t.deleteConfirm : t.deleteLabel}
                              </button>
                            </div>
                          )}
                        </article>
                      )}
                    </div>
                  )}
                </div>
              )}

              {view === 'sent' && (
                <div>
                  {sentLoading && (
                    <div aria-hidden="true" className="grid gap-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-16 rounded-card border border-subtle bg-cream-card" />
                      ))}
                    </div>
                  )}
                  {sentError && (
                    <div>
                      <p className="mb-4 rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                        {t.errNetwork}
                      </p>
                      <button
                        type="button"
                        onClick={loadSent}
                        className="rounded-pill border-[1.5px] border-navy px-5 py-2.5 text-[13.5px] font-bold text-navy transition-colors hover:bg-navy hover:text-white"
                      >
                        {t.retry}
                      </button>
                    </div>
                  )}
                  {!sentLoading && !sentError && sentItems.length === 0 && !openSentId && (
                    <div className="rounded-card-lg border border-subtle bg-cream-card p-6 text-center sm:p-7">
                      <h2 className="mb-2 font-serif text-xl text-ink">{t.tabSent}</h2>
                      <p className="text-[14.5px] text-slate">{t.sentEmpty}</p>
                    </div>
                  )}
                  {!sentLoading && !sentError && sentItems.length > 0 && !openSentId && (
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-subtle text-[13px] text-slate">
                          <th scope="col" className="py-2 pr-3 font-bold">{t.colTo}</th>
                          <th scope="col" className="py-2 pr-3 font-bold">{t.colSubject}</th>
                          <th scope="col" className="py-2 font-bold">{t.colDate}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sentItems.map((x) => (
                          <tr key={x.id} className="border-b border-subtle">
                            <td className="py-3 pr-3">
                              <button
                                type="button"
                                onClick={() => openSentMessage(x.id)}
                                className="text-left font-bold text-navy underline"
                              >
                                {x.to.join(', ')}
                              </button>
                              <span className="block text-[13px] text-slate">{x.from}</span>
                            </td>
                            <td className="py-3 pr-3 text-[14px]">{x.subject}</td>
                            <td className="tabular-nums py-3 text-[14px] text-slate">{fmtDate(x.at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {openSentId && (
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenSent(null);
                          showView('sent');
                          void loadSent();
                        }}
                        className="mb-4 font-bold text-navy underline"
                      >
                        {t.sentBack}
                      </button>
                      {openSentError && (
                        <p className="rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                          {t.errNetwork}
                        </p>
                      )}
                      {!openSent && !openSentError && (
                        <div aria-hidden="true" className="grid gap-3">
                          <div className="h-32 rounded-card border border-subtle bg-cream-card" />
                        </div>
                      )}
                      {openSent && (
                        <article>
                          <h2 className="mb-1 font-serif text-xl text-ink">
                            {openSent.subject}
                          </h2>
                          <p className="mb-1 text-[13px] font-bold text-navy">
                            {t.sentFrom} {openSent.from}
                          </p>
                          <p className="mb-1 text-[13px] font-bold text-navy">
                            {t.sentTo} {openSent.to.join(', ')}
                          </p>
                          <p className="tabular-nums mb-4 text-[13px] text-slate">{fmtDate(openSent.at)}</p>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{openSent.body}</p>
                        </article>
                      )}
                    </div>
                  )}
                </div>
              )}

              {view === 'write' && (
                <div>
                  {sent ? (
                    <div className="rounded-card-lg border border-subtle bg-cream-card p-6 text-center sm:p-7">
                      <h2 className="mb-2 font-serif text-xl text-ink">{t.successHeading}</h2>
                      <p className="mb-5 text-[14.5px] text-slate">{t.successBody}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setTo('');
                          setSubject('');
                          setBody('');
                          setSent(false);
                        }}
                        className="inline-flex items-center gap-2 rounded-pill border-[1.5px] border-navy px-5 py-2.5 text-[13.5px] font-bold text-navy transition-colors hover:bg-navy hover:text-white"
                      >
                        {t.sendAnother}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={send} className="grid gap-4">
                      {error && (
                        <p className="rounded-card border border-subtle bg-cream-card px-4 py-3 text-[14.5px] text-slate">
                          {errorText[error]}
                        </p>
                      )}
                      <label className="grid gap-1.5">
                        <span className="text-[13px] font-bold text-navy">{t.fromLabel}</span>
                        <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass}>
                          {FROM_ADDRESSES.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-[13px] font-bold text-navy">{t.toLabel}</span>
                        <input
                          type="text"
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                          placeholder={t.toPlaceholder}
                          className={inputClass}
                        />
                        <span className="text-[13px] text-slate">{t.toHint}</span>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-[13px] font-bold text-navy">{t.subjectLabel}</span>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder={t.subjectPlaceholder}
                          maxLength={150}
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-[13px] font-bold text-navy">{t.bodyLabel}</span>
                        <textarea
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder={t.bodyPlaceholder}
                          rows={8}
                          maxLength={10000}
                          className={inputClass}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={sending}
                        className="inline-flex items-center justify-center gap-2 rounded-pill bg-navy px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-ink disabled:opacity-60"
                      >
                        {sending ? t.submitting : t.submit}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <SubPageFooter backHome={t.backHome} />
    </div>
  );
}

export function KerkraadPage() {
  return (
    <LanguageProvider>
      <KerkraadContent />
    </LanguageProvider>
  );
}
