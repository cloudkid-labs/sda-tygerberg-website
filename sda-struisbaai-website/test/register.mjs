/** Installs ts-resolve.mjs as a module resolution hook. See `npm test`. */
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);
