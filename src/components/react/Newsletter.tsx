import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { withBase } from '../../lib/base';

const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
const copy = {
  af: { title: 'Bly op hoogte', description: 'Ontvang maandelikse nuus oor die kerk en kwartaallikse terugvoer oor wat ons doen.', email: 'E-posadres', consent: 'Ek stem in om die maandelikse en kwartaallikse nuusbriewe te ontvang.', privacy: 'Privaatheidsbeleid', button: 'Teken in', sending: 'Besig om te stuur…', success: 'Kyk asseblief na jou e-pos en bevestig jou inskrywing.', error: 'Ons kon nie jou inskrywing verwerk nie. Probeer asseblief weer.', captcha: 'Voltooi asseblief die sekuriteitskontrole.' },
  en: { title: 'Stay in touch', description: 'Receive monthly church news and quarterly updates on what we have been doing.', email: 'Email address', consent: 'I agree to receive the monthly and quarterly newsletters.', privacy: 'Privacy policy', button: 'Subscribe', sending: 'Sending…', success: 'Please check your email and confirm your subscription.', error: 'We could not process your subscription. Please try again.', captcha: 'Please complete the security check.' },
};

export function Newsletter() {
  const { lang } = useLanguage();
  const t = copy[lang];
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error' | 'captcha'>('idle');
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey) return;
    fetch(withBase('/api/newsletter')).then((r) => r.ok ? r.json() as Promise<{ enabled?: boolean }> : null).then((data) => setEnabled(data?.enabled === true)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !widget.current || status === 'success') return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !widget.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(widget.current, { sitekey: siteKey, action: 'newsletter', callback: (value: string) => setToken(value), 'expired-callback': () => setToken(''), 'error-callback': () => setToken('') });
    };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = '1';
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
      return () => { cancelled = true; script?.removeEventListener('load', render); };
    }
    return () => { cancelled = true; };
  }, [enabled, status === 'success']);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) { setStatus('captcha'); return; }
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    try {
      const res = await fetch(withBase('/api/newsletter'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), consent: form.get('consent') === 'on', token }) });
      if (!res.ok) throw new Error('Subscription failed');
      setStatus('success');
    } catch {
      setStatus('error');
      setToken('');
      window.turnstile?.reset(widgetId.current);
    }
  }

  if (!enabled) return null;
  return <section aria-labelledby="newsletter-title" className="mx-auto max-w-content px-7 pt-12">
    <div className="rounded-card border border-subtle bg-cream-card p-6 sm:p-8">
      <h2 id="newsletter-title" className="font-serif text-3xl text-ink">{t.title}</h2>
      <p className="mt-2 text-slate">{t.description}</p>
      {status === 'success' ? <p role="status" className="mt-5 text-slate">{t.success}</p> : <form onSubmit={submit} className="mt-5">
        <label htmlFor="newsletter-email" className="block font-bold text-slate">{t.email}</label>
        <div className="mt-2 flex flex-wrap gap-3"><input id="newsletter-email" name="email" type="email" autoComplete="email" required maxLength={254} className="min-w-0 flex-1 rounded border border-subtle bg-white px-4 py-3 text-ink" /><button type="submit" disabled={status === 'sending'} className="rounded-full bg-orange px-6 py-3 font-bold text-white disabled:opacity-50">{status === 'sending' ? t.sending : t.button}</button></div>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate"><input name="consent" type="checkbox" required className="mt-1" /> <span>{t.consent} <a className="underline" href={withBase('/privacy/')}>{t.privacy}</a></span></label>
        <div ref={widget} className="mt-4" />
        {(status === 'error' || status === 'captcha') && <p role="alert" className="mt-3 text-slate">{status === 'captcha' ? t.captcha : t.error}</p>}
      </form>}
    </div>
  </section>;
}
