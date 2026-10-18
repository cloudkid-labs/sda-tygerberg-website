# Sending as `sdatygerberg.co.za` from a mail client

**Status: pending — requires the Workers Paid plan.** Nothing on this page is
active yet. The Worker's `send_email` binding already delivers the contact
form's mail on the free plan (to verified destination addresses only), but a
human sending **as** the role address — and to arbitrary visitors — needs Email
Sending enabled for the domain.

## Why Cloudflare, and not a relay

Cloudflare Email Service exposes authenticated SMTP submission on
`smtp.mx.cloudflare.net:465`. It is the same sending pipeline, DKIM keys and
logs as the Worker's `send_email` binding, so mail from the clerk and mail from
the site align identically and DMARC can finally be tightened. Inbound stays on
Email Routing (C-65) — no MX change, no third party.

What this replaces: a Gmail "Send mail as" alias authenticates with an App
Password but signs with `d=gmail.com`, so it never DKIM-aligns to the domain,
and Google retires "Send as" for third-party addresses in **January 2027**
(Workspace aliases and Gmail-owned addresses are unaffected).

## Prerequisites

1. **Workers Paid.** Email Sending is not available on Free.
   (Verified 2026-10: the Cloudkid Labs account is on Workers Free. SMTP
   submission authenticates with a valid token, then `MAIL FROM` returns
   `550 5.7.1 Email sending is not enabled for domain sdatygerberg.co.za`.)
2. The domain onboarded under **Compute → Email Service → Email Sending →
   Onboard Domain**.
3. A Cloudflare **API token with `Email Sending: Edit`** (account-scoped). It
   is the SMTP password.

## DNS

Once onboarded, Email Sending owns — and locks — these on the domain. Today the
`cf-bounce` DKIM record already exists (it is what DKIM-aligns the Worker's
`welkom@` From) and is not locked. Do not hand-edit them
while locked; unlock from the Email Sending settings page first if a migration
is ever needed.

| Record | Value |
|---|---|
| `MX cf-bounce.sdatygerberg.co.za` | `route1/2/3.mx.cloudflare.net` |
| `TXT cf-bounce.sdatygerberg.co.za` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| `TXT cf-bounce._domainkey.sdatygerberg.co.za` | the sending DKIM key |
| `TXT _dmarc.sdatygerberg.co.za` | the DMARC policy |

Keep the apex SPF record's `include:_spf.mx.cloudflare.net`; drop
`include:_spf.google.com` once the Gmail alias is retired. Never publish two
`v=spf1` records.

## Mail client configuration

**Receive.** The role mail is forwarded to the church inbox by the Worker
(`inboundEmail.ts`), so the client reads that inbox over IMAP — its Gmail,
OAuth, no app password.

**Send** as `welkom@sdatygerberg.co.za`:

| Setting | Value |
|---|---|
| Host | `smtp.mx.cloudflare.net` |
| Port | `465` |
| Security | implicit TLS (SMTPS) |
| Username | `api_token` (the literal string) |
| Password | the `Email Sending: Edit` API token |
| From | `welkom@sdatygerberg.co.za` |

Port 465 is the only option — Cloudflare does not offer STARTTLS on 587 or
plaintext submission. The same settings serve scripts (Nodemailer, Python
`smtplib`, PHPMailer, or `curl --ssl-reqd smtps://smtp.mx.cloudflare.net:465`).

## Verify

Send one message from the client and one through the Worker, then read the
recipient's headers:

```
Authentication-Results: ... spf=pass ...
  dkim=pass header.d=sdatygerberg.co.za ...
  dmarc=pass header.from=sdatygerberg.co.za
```

## DMARC progression

`p=none` → watch `rua` for **every** legitimate sender → `p=quarantine; pct=10`
→ 25 → 50 → 100 → `p=reject`. Tighten only once both the Worker and the clerk
align, and only after the Gmail alias is gone.

## Security

The API token is an account credential: anyone holding it can send from any
onboarded domain on the account. Mint a dedicated token, store it only in the
client (never in this repo or CI), give each person their own token, and rotate
it if a device is lost or someone leaves.
