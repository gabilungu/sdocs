import { readFileSync } from 'fs';
const ENTRY_ID = '/@sdocs/entry';
const RESOLVED_ENTRY_ID = '\0' + ENTRY_ID;
const USER_CSS_ID = '/@sdocs/user.css';
const RESOLVED_USER_CSS_ID = '\0' + USER_CSS_ID;
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>sdocs</title>
</head>
<body>
  <div id="sdocs-app"></div>
  <script type="module" src="${ENTRY_ID}"></script>
</body>
</html>`;
/**
 * At-rules that can be nested inside CSS selectors per CSS Nesting spec.
 * Everything else (@font-face, @keyframes, @import, etc.) must stay at top level.
 */
const NESTABLE_AT_RULES = ['@media', '@supports', '@container', '@layer', '@scope', '@starting-style'];
function isNestableAtRule(text) {
    for (const rule of NESTABLE_AT_RULES) {
        if (text.startsWith(rule) && (text.length === rule.length || /[\s({]/.test(text[rule.length]))) {
            return true;
        }
    }
    return false;
}
/**
 * Find the index of the matching closing brace for an opening brace,
 * skipping over comments and string literals.
 */
function findClosingBrace(css, openIndex) {
    const len = css.length;
    let depth = 0;
    let j = openIndex;
    while (j < len) {
        // Skip /* ... */ comments
        if (css[j] === '/' && css[j + 1] === '*') {
            const end = css.indexOf('*/', j + 2);
            if (end === -1)
                return len - 1;
            j = end + 2;
            continue;
        }
        // Skip string literals
        if (css[j] === '"' || css[j] === "'") {
            const quote = css[j];
            j++;
            while (j < len && css[j] !== quote) {
                if (css[j] === '\\')
                    j++;
                j++;
            }
            j++;
            continue;
        }
        if (css[j] === '{')
            depth++;
        else if (css[j] === '}') {
            depth--;
            if (depth === 0)
                return j;
        }
        j++;
    }
    return len - 1;
}
/**
 * Wraps user CSS for preview isolation.
 * - Style rules and nestable at-rules (@media, @supports, etc.) get wrapped in .ComponentPreview { }
 * - Non-nestable at-rules (@font-face, @keyframes, @import) stay at top level
 */
function wrapUserCss(css) {
    const hoisted = [];
    const wrapped = [];
    let i = 0;
    const len = css.length;
    while (i < len) {
        // Skip whitespace
        while (i < len && /\s/.test(css[i]))
            i++;
        if (i >= len)
            break;
        // Skip comments
        if (css[i] === '/' && css[i + 1] === '*') {
            const end = css.indexOf('*/', i + 2);
            if (end === -1)
                break;
            i = end + 2;
            continue;
        }
        const isAtRule = css[i] === '@';
        const blockText = css.slice(i);
        const nestable = isAtRule && isNestableAtRule(blockText);
        // Check if this is a statement (ends with ;) rather than a block (has { })
        const nextSemicolon = css.indexOf(';', i);
        const nextBrace = css.indexOf('{', i);
        if (nextSemicolon !== -1 && (nextBrace === -1 || nextSemicolon < nextBrace)) {
            // Statement — no block
            const statement = css.slice(i, nextSemicolon + 1);
            if (isAtRule && !nestable) {
                hoisted.push(statement);
            }
            else {
                wrapped.push(statement);
            }
            i = nextSemicolon + 1;
            continue;
        }
        if (nextBrace === -1) {
            // No more braces or semicolons — trailing content
            const remaining = css.slice(i).trim();
            if (remaining)
                wrapped.push(remaining);
            break;
        }
        // Find matching closing brace
        const closeIndex = findClosingBrace(css, nextBrace);
        const block = css.slice(i, closeIndex + 1);
        if (isAtRule && !nestable) {
            hoisted.push(block);
        }
        else {
            wrapped.push(block);
        }
        i = closeIndex + 1;
    }
    const parts = [];
    if (hoisted.length > 0) {
        parts.push(hoisted.join('\n\n'));
    }
    if (wrapped.length > 0) {
        parts.push(`.ComponentPreview {\n${wrapped.join('\n\n')}\n}`);
    }
    return parts.join('\n\n');
}
function generateEntry(options, hasCss) {
    const optionsJson = JSON.stringify(options);
    const cssImport = hasCss ? `import '${USER_CSS_ID}';\n` : '';
    return `
import { mount } from 'svelte';
import Sdocs from 'sdocs/Sdocs.svelte';
import 'sdocs/ui/css/global.css';
${cssImport}
mount(Sdocs, {
  target: document.getElementById('sdocs-app'),
  props: { options: ${optionsJson} }
});
`;
}
/**
 * Vite plugin that provides the virtual HTML shell and Svelte app entry
 * for standalone mode. Also handles SPA fallback routing.
 */
export function sdocsAppPlugin({ sdocsOptions = {}, cssPath } = {}) {
    return {
        name: 'sdocs-app',
        resolveId(id) {
            if (id === ENTRY_ID) {
                return RESOLVED_ENTRY_ID;
            }
            if (id === USER_CSS_ID) {
                return RESOLVED_USER_CSS_ID;
            }
        },
        load(id) {
            if (id === RESOLVED_ENTRY_ID) {
                return generateEntry(sdocsOptions, !!cssPath);
            }
            if (id === RESOLVED_USER_CSS_ID && cssPath) {
                this.addWatchFile(cssPath);
                const css = readFileSync(cssPath, 'utf-8');
                return wrapUserCss(css);
            }
        },
        configureServer(server) {
            // Return a function so the middleware runs AFTER Vite's internal ones.
            // This ensures static files and module requests are handled first,
            // and only unmatched requests fall through to the SPA fallback.
            return () => {
                server.middlewares.use(async (req, res, next) => {
                    const url = req.url ?? '/';
                    // Skip Vite internal paths and file requests
                    if (url.startsWith('/@') ||
                        url.startsWith('/__') ||
                        url.startsWith('/node_modules') ||
                        url.startsWith('/src') ||
                        url.includes('.')) {
                        return next();
                    }
                    // SPA fallback: serve the HTML shell for all other routes
                    const html = await server.transformIndexHtml(url, HTML);
                    res.setHeader('Content-Type', 'text/html');
                    res.statusCode = 200;
                    res.end(html);
                });
            };
        },
    };
}
