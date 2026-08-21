/**
 * Walking markdown code fences, blockquotes included.
 *
 * Three places need to know whether a line sits inside a fence: the scanner
 * (so a `[/DOC]` shown in a fence isn't mistaken for the real closer), the
 * island splitter, and the projection's mask (so `{ a: 1 }` in a fence isn't
 * compiled as a Svelte expression). They agreed on everything except that a
 * fence can also open inside a blockquote — CommonMark allows it, and a
 * GitHub-style callout is the common case:
 *
 *     > [!IMPORTANT]
 *     > ```js
 *     > export default { outDir: 'docs-dist' };
 *     > ```
 *
 * Read as prose, that middle line hands Svelte an object literal and the page
 * fails to compile. One stepper, used by all three, keeps them from drifting.
 */

/** An open fence: its marker char, its length, and whether it opened inside a
 * blockquote. Null when no fence is open. */
export type FenceState = { marker: string; len: number; inQuote: boolean } | null;

/** Indent, then any number of blockquote markers, then the fence run, then
 * whatever follows it on the line — the info string, for an opener. */
const FENCE_RE = /^(\s*(?:>\s?)*)(`{3,}|~{3,})(.*)$/;
const QUOTE_RE = /^\s*>/;

/**
 * Advance `state` by one line.
 *
 * `fence` marks the opener/closer lines themselves; `inside` marks lines the
 * fence covers, openers and closers included. A caller that treats code as
 * opaque can just check `inside`.
 */
export function stepFence(
	state: { fence: FenceState },
	line: string,
): { fence: boolean; inside: boolean } {
	const match = FENCE_RE.exec(line);
	if (match) {
		const inQuote = match[1].includes('>');
		const marker = match[2][0];
		const len = match[2].length;
		const info = match[3].trim();
		if (!state.fence) {
			state.fence = { marker, len, inQuote };
		} else if (marker === state.fence.marker && len >= state.fence.len && !info) {
			// CommonMark: a fence closes only on the SAME marker character, with
			// AT LEAST as many chars, and NO info string. That last clause is
			// what makes ```bash inside a ```sdoc block content rather than a
			// closer — and getting it wrong shifts every fence after it, which
			// is how a doc page lost its highlighting from line 14 to the end.
			state.fence = null;
		} else {
			// An opener-shaped line inside a fence is just more content.
			return { fence: false, inside: true };
		}
		return { fence: true, inside: true };
	}
	// A fence opened inside a blockquote ends with the blockquote — there is no
	// lazy continuation for code. Without this an unclosed one would swallow
	// the rest of the document.
	if (state.fence?.inQuote && !QUOTE_RE.test(line)) {
		state.fence = null;
		return { fence: false, inside: false };
	}
	return { fence: false, inside: state.fence !== null };
}
