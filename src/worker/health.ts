import packageJson from '../../package.json' with { type: 'json' };
import lockfile from '../../package-lock.json' with { type: 'json' };

/**
 * `GET /api/health` reports the released site version, locked Core version,
 * and deployed GitHub commit. `/health` is the human-readable status page.
 *
 * The body carries `status: 204` as the signal value, served over HTTP 200: a
 * real 204 response cannot carry a body by spec, so the status line stays 200
 * and the 204 lives in the payload. C-63
 */
export const HEALTH_STATUS = 204;

/** Baked at bundle time from package.json — identical on devtest and prod. */
export const APP_VERSION: string = packageJson.version;
/** Resolved Core release installed by the lockfile (not its semver range). */
export const CORE_VERSION: string = lockfile.packages['node_modules/@cloudkid-labs/sda-church-site-core'].version;
/** Local Worker runs have no deploy metadata; deploy workflows pass APP_COMMIT. */
export const APP_COMMIT = 'unknown';

export interface HealthBody {
  status: number;
  version: string;
  templateVersion: string;
  coreVersion: string;
  commit: string;
}

export function healthBody(
  version: string = APP_VERSION,
  coreVersion: string = CORE_VERSION,
  commit: string = APP_COMMIT,
): HealthBody {
  return { status: HEALTH_STATUS, version, templateVersion: version, coreVersion, commit: commit.slice(0, 7) };
}

export function healthResponse(commit?: string): Response {
  return Response.json(healthBody(APP_VERSION, CORE_VERSION, commit), {
    headers: {
      // No store anywhere: a post-deploy poll must read the just-deployed
      // version, never a cached stale one. Without this the CI gate below
      // would pass against the previous release. C-63
      'Cache-Control': 'no-store',
    },
  });
}
