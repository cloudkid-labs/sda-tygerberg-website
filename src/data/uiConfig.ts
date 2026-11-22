const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';

export const UI_CONFIG = {
  visibility: {
    'home.first-visit.children': true,
  },
  newsletter: {
    enabled: Boolean(turnstileSiteKey),
    endpoint: '/api/newsletter',
    ...(turnstileSiteKey ? { turnstileSiteKey } : {}),
    privacyHref: '/privacy/',
    copy: {
      title: {
        af: 'Bly op hoogte',
        en: 'Subscribe to our newsletter',
      },
      description: {
        af: 'Ontvang maandelikse nuus oor die kerk en kwartaallikse terugvoer oor wat ons doen.',
        en: 'Receive monthly church news and quarterly updates on what we have been doing.',
      },
      email: { af: 'E-posadres', en: 'Email address' },
      consent: {
        af: 'Ek stem in om die maandelikse en kwartaallikse nuusbriewe te ontvang.',
        en: 'I agree to receive the monthly and quarterly newsletters.',
      },
      privacy: { af: 'Privaatheidsbeleid', en: 'Privacy policy' },
      submit: { af: 'Teken in', en: 'Subscribe' },
      sending: { af: 'Besig om te stuur…', en: 'Sending…' },
      success: {
        af: 'Dankie, ons het jou inskrywing ontvang.',
        en: 'Thank you, we have received your signup.',
      },
      error: {
        af: 'Ons kon nie jou inskrywing verwerk nie. Probeer asseblief weer.',
        en: 'We could not process your subscription. Please try again.',
      },
      captcha: {
        af: 'Voltooi asseblief die sekuriteitskontrole.',
        en: 'Please complete the security check.',
      },
    },
  },
} as const;
