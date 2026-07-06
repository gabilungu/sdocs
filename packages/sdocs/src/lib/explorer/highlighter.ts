import type { HighlighterCore } from 'shiki/core';

// Client-side Shiki for code that's generated in the browser (the usage
// snippet re-renders as controls change). Everything loads lazily on first
// use so the Explorer bundle stays lean, and the JavaScript regex engine
// avoids shipping wasm — highlighting works the same on the dev server and
// in static builds.
let highlighterPromise: Promise<HighlighterCore> | undefined;

async function getHighlighter(): Promise<HighlighterCore> {
	highlighterPromise ??= (async () => {
		const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, { bundledLanguages }, { bundledThemes }] =
			await Promise.all([
				import('shiki/core'),
				import('shiki/engine/javascript'),
				import('shiki/langs'),
				import('shiki/themes'),
			]);
		return createHighlighterCore({
			langs: [bundledLanguages.svelte],
			themes: [bundledThemes['github-light'], bundledThemes['github-dark']],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		});
	})();
	return highlighterPromise;
}

/** Highlight Svelte code, matching the build-time highlighter's output shape */
export async function highlightSvelte(code: string): Promise<string> {
	return highlightCode(code, 'svelte');
}

/** Load a fence language into the shared highlighter on demand. Unknown
 * names fall back to plaintext; 'sdoc' loads the shipped grammar plus the
 * scopes it embeds. */
async function ensureLanguage(highlighter: HighlighterCore, lang: string): Promise<string> {
	if (lang === 'text' || lang === 'plain' || lang === 'txt') return 'text';
	if (highlighter.getLoadedLanguages().includes(lang)) return lang;
	if (lang === 'sdoc') {
		const [{ bundledLanguages }, grammar] = await Promise.all([
			import('shiki/langs'),
			import('../grammar/sdoc.tmLanguage.json'),
		]);
		await highlighter.loadLanguage(
			bundledLanguages.javascript,
			bundledLanguages.typescript,
			bundledLanguages.css,
			bundledLanguages.html,
			bundledLanguages.markdown,
			bundledLanguages.svelte,
			{ ...(grammar.default ?? grammar), name: 'sdoc' } as never,
		);
		return 'sdoc';
	}
	const { bundledLanguages } = await import('shiki/langs');
	const loader = (bundledLanguages as Record<string, unknown>)[lang];
	if (!loader) return 'text';
	await highlighter.loadLanguage(loader as never);
	return lang;
}

/** Highlight code in any bundled shiki language (plus 'sdoc'), lazily
 * loading the grammar on first use. Matches the build-time output shape. */
export async function highlightCode(code: string, lang: string = 'svelte'): Promise<string> {
	const highlighter = await getHighlighter();
	const resolved = await ensureLanguage(highlighter, lang);
	return highlighter.codeToHtml(code, {
		lang: resolved,
		themes: {
			light: 'github-light',
			dark: 'github-dark',
		},
	});
}
