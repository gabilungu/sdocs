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
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, {
		lang: 'svelte',
		themes: {
			light: 'github-light',
			dark: 'github-dark',
		},
	});
}
