import { createHighlighter } from 'shiki';
let highlighterPromise = null;
/** Get or create the shared Shiki highlighter instance */
async function getHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['github-light', 'github-dark'],
            langs: ['svelte', 'typescript', 'javascript', 'css', 'html'],
        });
    }
    return highlighterPromise;
}
/** Highlight source code and return HTML */
export async function highlight(code, lang = 'svelte') {
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, {
        lang,
        themes: {
            light: 'github-light',
            dark: 'github-dark',
        },
    });
}
/** Dispose the highlighter (for cleanup) */
export async function disposeHighlighter() {
    if (highlighterPromise) {
        const highlighter = await highlighterPromise;
        highlighter.dispose();
        highlighterPromise = null;
    }
}
