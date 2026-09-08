import packageJson from '../../package.json' with { type: 'json' };

/**
 * The deployment-health signal. `GET /health` answers
 * `{ "status": 204, "version": "X.Y.Z" }`, where the version is the released
 * version baked in at deploy time — `package.json` is the single source of
 * truth (README "Versioning and releases"), so what /health reports is what
 * the deploy tags.
 *
 * The body carries `status: 204` as the signal value, served over HTTP 200: a
 * real 204 response cannot carry a body by spec, so the status line stays 200
 * and the 204 lives in the payload. C-63
 */
export const HEALTH_STATUS = 204;

/** Baked at bundle time from package.json — identical on devtest and prod. */
export const APP_VERSION: string = packageJson.version;

export function healthBody(version: string = APP_VERSION): { status: number; version: string } {
  return { status: HEALTH_STATUS, version };
}

export function healthResponse(version: string = APP_VERSION): Response {
  return Response.json(healthBody(version), {
    headers: {
      // No store anywhere: a post-deploy poll must read the just-deployed
      // version, never a cached stale one. Without this the CI gate below
      // would pass against the previous release. C-63
      'Cache-Control': 'no-store',
    },
  });
}
