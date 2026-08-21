/**
 * The most common `@section/` prefix across some `.sdoc` sources, as a prefix
 * ready to concatenate — `'@components/'`, or `''` when they carry none.
 *
 * Separated from the file reading so it can be tested: the rule is the part
 * worth checking, and the I/O around it needs an editor to exist.
 */
export function sectionPrefixOf(sources: string[]): string {
	const counts = new Map<string, number>();
	for (const text of sources) {
		// Entity openers only: `[SHOWCASE title="@components/Forms / Button"]`.
		// `[^\]]` crosses newlines, so a wrapped opener counts too.
		for (const [, slug] of text.matchAll(/\[[A-Z]+\s[^\]]*title="@([\w-]+)\//g)) {
			counts.set(slug, (counts.get(slug) ?? 0) + 1);
		}
	}
	let best = '';
	let most = 0;
	for (const [slug, n] of counts) {
		if (n > most) {
			best = slug;
			most = n;
		}
	}
	return best ? `@${best}/` : '';
}
