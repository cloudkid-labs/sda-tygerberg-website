#!/usr/bin/env node
/**
 * Provisions the Zero Trust gate for the devtest preview (C-62).
 *
 * It creates — or updates, if it already exists — a Cloudflare Access
 * self-hosted application in front of `tygerberg-sda.cloudkid.link`, with two
 * policies:
 *
 *   1. an ALLOW policy for the identities you list (emails and/or email
 *      domains) — the humans who may open the preview; and
 *   2. a NON-IDENTITY policy for a CI service token — so the deploy smoke test
 *      can reach the gated site without a browser login.
 *
 * Everything not on those lists is denied by default: that is the whole inbound
 * control. Outbound is untouched — the Worker still reaches YouTube and R2.
 *
 * It does NOT touch production. `sdatygerberg.co.za` is a public site (C-20) and
 * this script never names it.
 *
 * This is the one piece of the gate that lives on Cloudflare's side rather than
 * in the Worker, so it cannot ship in a deploy; run it once, by hand, with a
 * token that can write Access config. Re-running is safe — it reconciles the
 * app to the lists you pass rather than creating a second one.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=...  CLOUDFLARE_ACCOUNT_ID=... \
 *   ACCESS_ALLOWED_EMAILS="you@example.com,her@example.com" \
 *   node scripts/access-setup.mjs [--dry-run] [--rotate-service-token]
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN   (required) needs, at minimum:
 *                            Access: Apps and Policies  — Edit
 *                            Access: Service Tokens     — Edit
 *                            Access: Organizations, Identity Providers, and Groups — Read
 *   CLOUDFLARE_ACCOUNT_ID  (required)
 *   ACCESS_ALLOWED_EMAILS         comma-separated allow-list emails
 *   ACCESS_ALLOWED_EMAIL_DOMAINS  comma-separated allow-list domains (optional)
 *   ACCESS_APP_HOSTNAME    default tygerberg-sda.cloudkid.link
 *   ACCESS_APP_NAME        default "Tygerberg SDA — devtest"
 *   ACCESS_SERVICE_TOKEN_NAME  default tygerberg-devtest-ci-smoke
 *   ACCESS_SESSION_DURATION    default 24h
 *
 * Flags:
 *   --dry-run                print the API calls it would make and exit; makes
 *                            no network request, so it runs with placeholder env
 *   --rotate-service-token   force a new service token even if one by that name
 *                            exists (the only way to obtain a fresh secret — the
 *                            old one is shown once, at creation, and never again)
 *
 * On success it prints the four values the rest of the setup needs: the app's
 * AUD tag and your team domain (for wrangler.jsonc env.devtest.vars), and the
 * service token's Client ID and Secret (for the CF_ACCESS_CLIENT_* repo
 * secrets). See SETUP-INSTRUCTIONS §3.7.
 */

const API = 'https://api.cloudflare.com/client/v4';

const dryRun = process.argv.includes('--dry-run');
const rotate = process.argv.includes('--rotate-service-token');

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const emails = split(process.env.ACCESS_ALLOWED_EMAILS);
const emailDomains = split(process.env.ACCESS_ALLOWED_EMAIL_DOMAINS);
const hostname = process.env.ACCESS_APP_HOSTNAME || 'tygerberg-sda.cloudkid.link';
const appName = process.env.ACCESS_APP_NAME || 'Tygerberg SDA — devtest';
const serviceTokenName = process.env.ACCESS_SERVICE_TOKEN_NAME || 'tygerberg-devtest-ci-smoke';
const sessionDuration = process.env.ACCESS_SESSION_DURATION || '24h';

function split(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function die(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// In a real run the two credentials and at least one identity are required. In
// --dry-run they are optional, so the payloads can be previewed with nothing
// configured yet.
if (!dryRun) {
  if (!token) die('CLOUDFLARE_API_TOKEN is not set.');
  if (!account) die('CLOUDFLARE_ACCOUNT_ID is not set.');
  if (!emails.length && !emailDomains.length) {
    die('Set ACCESS_ALLOWED_EMAILS (and/or ACCESS_ALLOWED_EMAIL_DOMAINS) — the app must allow someone.');
  }
}

/** A Cloudflare API call that unwraps `{ success, result, errors }`. */
async function cf(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const detail = (json.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${res.status}`;
    die(`${method} ${path} failed: ${detail}`);
  }
  return json.result;
}

/** The allow-list, as Access policy `include` selectors. */
function identityIncludes() {
  return [
    ...emails.map((email) => ({ email: { email } })),
    ...emailDomains.map((domain) => ({ email_domain: { domain } })),
  ];
}

function policies(serviceTokenId) {
  return [
    {
      name: 'Allow the devtest allow-list',
      decision: 'allow',
      include: identityIncludes(),
    },
    {
      // non_identity: a service token is machine auth, it carries no user
      // identity. This is what lets CI's smoke test through the same gate.
      name: 'Allow the CI service token',
      decision: 'non_identity',
      include: [{ service_token: { token_id: serviceTokenId } }],
    },
  ];
}

function appPayload(serviceTokenId) {
  return {
    name: appName,
    type: 'self_hosted',
    domain: hostname,
    session_duration: sessionDuration,
    // A preview, not something to advertise in anyone's app launcher.
    app_launcher_visible: false,
    // Show Cloudflare's own login screen rather than bouncing straight to one
    // IdP — one-time-PIN email works with no identity provider configured.
    auto_redirect_to_identity: false,
    policies: policies(serviceTokenId),
  };
}

if (dryRun) {
  const placeholderTokenId = '<SERVICE_TOKEN_UUID>';
  console.log('\n--dry-run: no network calls. The run would:\n');
  console.log(`1. GET  ${API}/accounts/${account ?? '<ACCOUNT_ID>'}/access/organizations`);
  console.log('   → read the team domain (auth_domain) for the issuer/JWKS.\n');
  console.log(`2. ${rotate ? 'POST (rotate)' : 'GET then POST if absent'}  ${API}/accounts/${account ?? '<ACCOUNT_ID>'}/access/service_tokens`);
  console.log(`   body: ${JSON.stringify({ name: serviceTokenName })}\n`);
  console.log(`3. POST/PUT  ${API}/accounts/${account ?? '<ACCOUNT_ID>'}/access/apps`);
  console.log(`   body: ${JSON.stringify(appPayload(placeholderTokenId), null, 2)}\n`);
  console.log('Identity allow-list:');
  console.log(`   emails:  ${emails.length ? emails.join(', ') : '(none set)'}`);
  console.log(`   domains: ${emailDomains.length ? emailDomains.join(', ') : '(none set)'}`);
  console.log(`\nHostname: ${hostname}    Session: ${sessionDuration}`);
  process.exit(0);
}

// 1. Team domain — the token issuer and JWKS host the Worker validates against.
const org = await cf('GET', `/accounts/${account}/access/organizations`);
const authDomain = org?.auth_domain;
if (!authDomain) die('Could not read the team auth domain from the organization — check the token has Organizations: Read.');
const teamDomain = `https://${authDomain}`;

// 2. Service token — reuse by name, or create/rotate.
const existingTokens = await cf('GET', `/accounts/${account}/access/service_tokens`);
let serviceToken = (existingTokens ?? []).find((t) => t.name === serviceTokenName);
let freshSecret = null;
let freshClientId = null;
if (!serviceToken || rotate) {
  const created = await cf('POST', `/accounts/${account}/access/service_tokens`, { name: serviceTokenName });
  // client_secret is returned ONLY here, once. If it is lost, --rotate-service-token.
  freshSecret = created.client_secret;
  freshClientId = created.client_id;
  serviceToken = created;
}
const serviceTokenId = serviceToken.id;

// 3. Access application — reconcile by hostname.
const existingApps = await cf('GET', `/accounts/${account}/access/apps`);
const existingApp = (existingApps ?? []).find((a) => a.domain === hostname);
const app = existingApp
  ? await cf('PUT', `/accounts/${account}/access/apps/${existingApp.id}`, appPayload(serviceTokenId))
  : await cf('POST', `/accounts/${account}/access/apps`, appPayload(serviceTokenId));

// ---- report ------------------------------------------------------------
console.log(`\n✔ Access application ${existingApp ? 'updated' : 'created'}: ${app.name} → ${hostname}\n`);
console.log('Put these two in wrangler.jsonc under env.devtest.vars (uncomment them):');
console.log(`   "ACCESS_AUD": "${app.aud}",`);
console.log(`   "ACCESS_TEAM_DOMAIN": "${teamDomain}"\n`);

console.log('Add these two as repository secrets (Settings → Secrets and variables → Actions):');
if (freshClientId && freshSecret) {
  console.log(`   CF_ACCESS_CLIENT_ID       ${freshClientId}`);
  console.log(`   CF_ACCESS_CLIENT_SECRET   ${freshSecret}`);
  console.log('\n   ↑ The secret is shown ONCE. Copy it now; re-run with --rotate-service-token if lost.');
} else {
  console.log(`   CF_ACCESS_CLIENT_ID       ${serviceToken.client_id}`);
  console.log('   CF_ACCESS_CLIENT_SECRET   (unchanged — reused the existing token; its secret was');
  console.log('                              shown only when it was first created. --rotate-service-token');
  console.log('                              mints a new pair if you no longer have it.)');
}
console.log(`\nAllowed identities: ${[...emails, ...emailDomains].join(', ')}`);
console.log('\nNext: push the wrangler.jsonc change to `dev`, and the devtest deploy will enforce the gate.');
console.log('Verify with:  npm run smoke -- https://' + hostname + ' --expect-noindex');
console.log('  (export CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET first, or the runner is blocked by design.)\n');
