import { createHighlighter, type Highlighter } from 'shiki';
import sdocGrammar from '../grammar/sdoc.tmLanguage.json' with { type: 'json' };

let highlighterPromise: Promise<Highlighter> | null = null;

/** Get or create the shared Shiki highlighter instance */
async function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ['github-light', 'github-dark'],
			langs: [
				'svelte', 'typescript', 'javascript', 'css', 'html',
				'bash', 'json', 'markdown', 'yaml', 'diff',
				// The tool's own language: ```sdoc fences highlight with the
				// shipped grammar (it embeds the svelte/ts/css scopes above).
				{ ...sdocGrammar, name: 'sdoc' } as never,
			],
		});
	}
	return highlighterPromise;
}

/** Highlight source code and return HTML. Unknown languages render as
 * plaintext, so a fence is always a themed shiki block, never a bare pre. */
export async function highlight(
	code: string,
	lang: string = 'svelte',
): Promise<string> {
	const highlighter = await getHighlighter();
	const resolved = highlighter.getLoadedLanguages().includes(lang) ? lang : 'text';
	return highlighter.codeToHtml(code, {
		lang: resolved,
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
