// Injected by esbuild: bundled ESM modules (prettier) read import.meta.url,
// which doesn't exist in a CJS bundle — point it at the bundle file itself.
const { pathToFileURL } = require('node:url');
export const import_meta_url = pathToFileURL(__filename).href;
