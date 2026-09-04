import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { withBase } from '../../lib/base';
import { requestFormCopy, type RequestTopic, type TopicCopy } from '../../data/requestCopy';

/**
 * The shared request form behind /connect and /bible-studies, posting to
 * /api/contact. `PUBLIC_HAS_API=false` renders it read-only where there is no
 * Worker (C-22). The var is inlined at build time, so server and
 * client agree and hydration stays clean.
 */
const HAS_API = import.meta.env.PUBLIC_HAS_API !== 'false';

/**
 * The Turnstile site key, inlined at build time. Public by design — it ships in
 * the HTML — so an unset value simply means no widget and no token, and the
 * Worker skips the check where its own secret is unset too (local dev,
 * devtest). Production sets both. CONCERNS.md C-21.
 */
const TURNSTILE_SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors LIMITS in src/worker/contact.ts, so the server can't reject a
 *  length this form was willing to send. */
const LIMITS = { name: 80, email: 254, phone: 40, message: 2000 } as const;

type Status = 'idle' | 'submitting' | 'success' | 'error';

type ContactResponse = {
  ok?: boolean;
  outcome?: 'forwarded' | 'not-configured' | 'invalid' | 'forward-error';
  errors?: string[];
};

const EMPTY = { name: '', email: '', phone: '', message: '' };

type FocusableField = 'name' | 'email' | 'phone' | 'consent';

/**
 * Which input each error should send focus to, in the order the fields appear
 * on the page — so focus lands on the first thing that's actually wrong.
 */
const ERROR_FOCUS: Array<[error: string, field: FocusableField]> = [
  ['name', 'name'],
  ['contact', 'email'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['consent', 'consent'],
];

/** Errors this form can point at a field. Anything else needs a general message. */
const SHOWABLE = ERROR_FOCUS.map(([error]) => error);

export function RequestForm({ topic, copy }: { topic: RequestTopic; copy: TopicCopy }) {
  const { lang } = useLanguage();
  const t = requestFormCopy[lang];
  const uid = useId();
  const id = (part: string) => `${uid}-${part}`;

  const [values, setValues] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  /** The Turnstile token for this attempt, empty until the widget answers. */
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  /** Bumped on every failed attempt — see the focus effect below. */
  const [attempt, setAttempt] = useState(0);

  const refs = {
    name: useRef<HTMLInputElement | null>(null),
    email: useRef<HTMLInputElement | null>(null),
    phone: useRef<HTMLInputElement | null>(null),
    consent: useRef<HTMLInputElement | null>(null),
  };
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  /*
   * Set on the way out of the success panel. The panel holds focus while it is
   * mounted, so returning to the form unmounts the focused node and drops the
   * caret at document.body — the same failure the effect below was written to
   * prevent, in the other direction.
   */
  const returning = useRef(false);

  const reset = () => {
    returning.current = true;
    setValues(EMPTY);
    setConsent(false);
    setCaptchaToken('');
    widgetId.current = null;
    setStatus('idle');
    setFieldErrors([]);
    setMessage('');
  };

  const fail = (errors: string[], text: string) => {
    setFieldErrors(errors);
    setMessage(text);
    setStatus('error');
    setAttempt((n) => n + 1);
  };

  /**
   * Focus the first invalid field. Keyed on `attempt`, not the error list — the
   * same fault twice changes nothing in the DOM, and a screen reader would meet
   * the second attempt with silence.
   */
  useEffect(() => {
    if (attempt === 0) return;
    const hit = ERROR_FOCUS.find(([error]) => fieldErrors.includes(error));
    if (hit) refs[hit[1]].current?.focus();
    else alertRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Submitting replaces the form with the confirmation, which would drop focus
  // to the top of the document without this — and so does going back.
  useEffect(() => {
    if (status === 'success') {
      successRef.current?.focus();
      return;
    }
    if (returning.current) {
      returning.current = false;
      refs.name.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /*
   * Renders the Turnstile widget once, explicitly. Implicit rendering
   * re-scans on every script load and fights React re-renders; explicit keeps
   * one widget id per mount. No widget at all where no site key was inlined —
   * local dev and previews submit exactly as before, and the Worker skips its
   * half where its secret is unset. C-21.
   */
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || status === 'success') return;
    const host = turnstileRef.current;
    if (!host) return;
    let cancelled = false;

    const renderWidget = () => {
      const api = window.turnstile;
      const target = turnstileRef.current;
      if (cancelled || !api || !target) return;
      if (target.dataset.rendered === '1') return;
      try {
        widgetId.current = api.render(target, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        });
        target.dataset.rendered = '1';
      } catch {
        // A failed render leaves the token empty, and submit then says so
        // with errCaptcha rather than posting a doomed request.
      }
    };

    if (window.turnstile) {
      renderWidget();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector(
      'script[data-turnstile]',
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', renderWidget, { once: true });
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = '1';
    script.onload = renderWidget;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /** Mirrors the Worker's rules so obvious mistakes don't need a round trip. */
  const validate = (): string[] => {
    const errors: string[] = [];
    if (!values.name.trim()) errors.push('name');
    if (!values.email.trim() && !values.phone.trim()) errors.push('contact');
    if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) errors.push('email');
    if (!consent) errors.push('consent');
    return errors;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;

    const errors = validate();
    if (errors.length > 0) {
      fail(errors, t.errValidation);
      return;
    }

    // A configured widget with no token means it never answered (blocked
    // script, expired challenge) — say so without spending a round trip.
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      fail([], t.errCaptcha);
      return;
    }

    setStatus('submitting');
    setFieldErrors([]);
    setMessage('');

    try {
      const res = await fetch(withBase('/api/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          message: values.message.trim(),
          // The checkbox state, not a constant, or the consent record is a lie.
          consent,
          // Which wording was on screen when they ticked it. The Worker stores
          // the sentence itself, so the record has to know which one they saw.
          lang,
          // The human check, verified server-side (C-21). Omitted where no
          // widget was rendered; the Worker skips its half there too.
          ...(captchaToken ? { 'cf-turnstile-response': captchaToken } : {}),
        }),
      });

      const data = (await res.json().catch(() => null)) as ContactResponse | null;

      if (data?.ok) {
        setStatus('success');
        return;
      }

      if (data?.outcome === 'not-configured') fail([], t.errNotConfigured);
      else if (data?.outcome === 'forward-error') fail([], t.errForward);
      else if (data?.outcome === 'invalid') {
        if ((data.errors ?? []).includes('captcha')) fail([], t.errCaptcha);
        else {
          // These have no field to highlight, so don't say "highlighted fields".
          const shown = (data.errors ?? []).filter((f) => SHOWABLE.includes(f));
          fail(shown, shown.length > 0 ? t.errValidation : t.errUnexpected);
        }
      } else fail([], t.errNetwork);
    } catch {
      // Offline, DNS, non-JSON body — never claim it was sent (C-19).
      fail([], t.errNetwork);
    }
  };

  if (status === 'success') {
    return (
      <div
        ref={successRef}
        role="status"
        tabIndex={-1}
        className="rounded-card-lg border border-navy/20 bg-cream-card p-7 text-center focus:outline-none focus:ring-2 focus:ring-navy/25"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-navy text-xl text-white"
        >
          ✓
        </div>
        <h2 className="mb-2 font-serif text-2xl text-ink">{t.successHeading}</h2>
        <p className="mb-5 text-[15px] leading-relaxed text-slate">{t.successBody}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-pill border-[1.5px] border-navy px-5 py-2.5 text-[13.5px] font-bold text-navy transition-colors hover:bg-navy hover:text-white"
        >
          {t.successAgain}
        </button>
      </div>
    );
  }

  const invalid = (field: string) => fieldErrors.includes(field);
  const fieldClass = (field: string) =>
    `w-full rounded-card border bg-cream-card px-4 py-3 text-[15px] text-ink placeholder:text-slate-muted/70 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15 ${
      invalid(field) ? 'border-orange-hover' : 'border-strong'
    }`;
  const labelClass = 'mb-1.5 block text-[13.5px] font-bold text-ink';
  const errClass = 'mt-1.5 text-[13px] font-medium text-orange-hover';
  /** Joins the ids of whichever hints and errors are actually on screen. */
  const describedBy = (...ids: Array<string | false | undefined>) => {
    const list = ids.filter(Boolean) as string[];
    return list.length > 0 ? list.join(' ') : undefined;
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-card-lg border border-subtle bg-tan/40 p-6 sm:p-7">
      {!HAS_API && (
        <p className="mb-6 rounded-card border border-orange/40 bg-orange/10 px-4 py-3 text-[13.5px] leading-relaxed text-ink">
          {t.previewNotice}
        </p>
      )}

      <fieldset disabled={!HAS_API || status === 'submitting'} className="disabled:opacity-60">
        <div className="mb-5">
          <label htmlFor={id('name')} className={labelClass}>
            {t.nameLabel}
          </label>
          <input
            id={id('name')}
            ref={refs.name}
            name="name"
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            maxLength={LIMITS.name}
            value={values.name}
            onChange={set('name')}
            aria-invalid={invalid('name')}
            aria-describedby={describedBy(invalid('name') && id('name-err'))}
            className={fieldClass('name')}
          />
          {invalid('name') && (
            <p id={id('name-err')} className={errClass}>
              {t.errName}
            </p>
          )}
        </div>

        <div className="mb-2 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={id('email')} className={labelClass}>
              {t.emailLabel}
            </label>
            <input
              id={id('email')}
              ref={refs.email}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={LIMITS.email}
              value={values.email}
              onChange={set('email')}
              aria-invalid={invalid('email') || invalid('contact')}
              aria-describedby={describedBy(
                id('contact-hint'),
                invalid('email') && id('email-err'),
                invalid('contact') && id('contact-err'),
              )}
              className={fieldClass(invalid('email') ? 'email' : 'contact')}
            />
            {invalid('email') && (
              <p id={id('email-err')} className={errClass}>
                {t.errEmail}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={id('phone')} className={labelClass}>
              {t.phoneLabel}
            </label>
            <input
              id={id('phone')}
              ref={refs.phone}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={LIMITS.phone}
              value={values.phone}
              onChange={set('phone')}
              aria-invalid={invalid('phone') || invalid('contact')}
              aria-describedby={describedBy(
                id('contact-hint'),
                invalid('phone') && id('phone-err'),
                invalid('contact') && id('contact-err'),
              )}
              className={fieldClass(invalid('phone') ? 'phone' : 'contact')}
            />
            {invalid('phone') && (
              <p id={id('phone-err')} className={errClass}>
                {t.errPhone}
              </p>
            )}
          </div>
        </div>
        <p id={id('contact-hint')} className="mb-5 text-[13px] text-slate-muted">
          {t.contactHint}
        </p>
        {invalid('contact') && (
          <p id={id('contact-err')} className={`${errClass} -mt-4 mb-5`}>
            {t.errContact}
          </p>
        )}

        <div className="mb-6">
          <label htmlFor={id('message')} className={labelClass}>
            {copy.messageLabel}{' '}
            <span className="font-medium text-slate-muted">({t.optional})</span>
          </label>
          <textarea
            id={id('message')}
            name="message"
            rows={5}
            maxLength={LIMITS.message}
            placeholder={copy.messagePlaceholder}
            value={values.message}
            onChange={set('message')}
            className={`${fieldClass('message')} resize-y`}
          />
        </div>

        <div className="mb-6 rounded-card border border-subtle bg-cream-card p-4.5">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-[.08em] text-navy">
            {t.privacyHeading}
          </div>
          <p className="mb-4 text-[13.5px] leading-relaxed text-slate">{t.privacyBody}</p>
          <label htmlFor={id('consent')} className="flex cursor-pointer items-start gap-3">
            <input
              id={id('consent')}
              ref={refs.consent}
              name="consent"
              type="checkbox"
              required
              aria-required="true"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={invalid('consent')}
              aria-describedby={describedBy(invalid('consent') && id('consent-err'))}
              className="mt-0.5 h-4.5 w-4.5 flex-none accent-navy"
            />
            <span className="text-[13.5px] leading-relaxed text-ink">{t.consentLabel}</span>
          </label>
          {invalid('consent') && (
            <p id={id('consent-err')} className={errClass}>
              {t.errConsent}
            </p>
          )}
        </div>

        {/*
          The human check (C-21). Rendered only where a site key was inlined;
          elsewhere the form submits exactly as before. Explicitly rendered by
          the effect above — this div is the mount point, not the widget.
        */}
        {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="cf-turnstile mb-6 flex justify-center" />}

        <button
          type="submit"
          className="w-full rounded-pill bg-orange px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-orange-hover disabled:cursor-not-allowed"
        >
          {status === 'submitting' ? t.submitting : copy.submit}
        </button>
      </fieldset>

      {status === 'error' && message && (
        // Keyed on attempt so a repeated failure is re-announced.
        <p
          key={attempt}
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="mt-5 rounded-card border border-orange-hover/40 bg-orange/10 px-4 py-3 text-[13.5px] leading-relaxed text-ink focus:outline-none focus:ring-2 focus:ring-navy/25"
        >
          {message}
        </p>
      )}
    </form>
  );
}
