import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;

/** Get or create the shared Shiki highlighter instance */
async function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ['github-light', 'github-dark'],
			langs: ['svelte', 'typescript', 'javascript', 'css', 'html'],
		});
	}
	return highlighterPromise;
}

/** Highlight source code and return HTML */
export async function highlight(
	code: string,
	lang: string = 'svelte',
): Promise<string> {
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
export async function disposeHighlighter(): Promise<void> {
	if (highlighterPromise) {
		const highlighter = await highlighterPromise;
		highlighter.dispose();
		highlighterPromise = null;
	}
}
