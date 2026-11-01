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

/**
 * `.tsx` is the one thing Node's type stripping cannot do: JSX is syntax, not
 * types. The members area and the CMS render React on the Worker, so their
 * tests import components — this compiles them with esbuild, which already
 * arrives with both Vite and wrangler (not a direct dependency, like sharp).
 * The automatic runtime matches tsconfig's `jsx: react-jsx`.
 */
let esbuild;
export async function load(url, context, nextLoad) {
  const tsx = url.endsWith('.tsx');
  if (!tsx && !(url.endsWith('.ts') && url.includes('/src/'))) return nextLoad(url, context);
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL(url), 'utf8');
  // Plain .ts stays on Node's own type stripping unless it reads
  // `import.meta.env`, which only Vite defines.
  if (!tsx && !source.includes('import.meta.env')) return nextLoad(url, context);
  esbuild ??= await import('esbuild');
  const { code } = await esbuild.transform(source, {
    loader: tsx ? 'tsx' : 'ts',
    jsx: 'automatic',
    format: 'esm',
    sourcefile: url,
    // Vite inlines these at build; under the test runner they are unset.
    // A fixed build date keeps rendered output deterministic.
    define: {
      'import.meta.env': JSON.stringify({ BASE_URL: '/', PUBLIC_BUILD_DATE: '2026-10-31' }),
    },
  });
  return { format: 'module', source: code, shortCircuit: true };
}
