/**
 * Lets the Node test runner import the app's own modules.
 *
 * Source files import each other without an extension (`../data/site`), which
 * Vite resolves and Node's ESM loader does not. Rather than rewrite every
 * import in src/ to suit the test runner, this hook retries a failed relative
 * resolution with the extensions TypeScript would have tried.
 *
 * Node strips the types itself — 22.18+ and 24 both do it without a flag, and
 * .nvmrc pins 24.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.')) throw error;
    for (const suffix of ['.ts', '.tsx', '/index.ts', '.js']) {
      try {
        return await nextResolve(specifier + suffix, context);
      } catch {
        // try the next one
      }
    }
    throw error;
  }
}
