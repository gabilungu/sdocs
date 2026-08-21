/**
 * The one ranking of note types, worst first.
 *
 * Its own module because both halves of sdocs need it and neither should pull
 * in the other: the parser validates against it, and the Explorer's sidebar
 * ranks rows by it. It lived in both places before, which is how two lists
 * that must agree stop agreeing.
 *
 * Not in `types.ts` — that module is types only, so nothing importing a type
 * from it pays for a runtime import.
 *
 * The axis is **how much it costs the reader to not know**:
 *
 * - `bug` — it is broken.
 * - `a11y` — it is broken *for some people*, which is a defect with a specific
 *   blast radius. Under `bug` because it is narrower, above `warning` because
 *   it is still a defect rather than a caveat.
 * - `warning` — it works, but it will bite you.
 * - `perf` — it works, and it costs you something. A caveat with a known
 *   shape, so it sits directly under the general one.
 * - *no type* — a plain remark. Above `tip` and `info` deliberately: an author
 *   who did not reach for a word was not being reassuring.
 * - `tip` — advice worth taking.
 * - `info` — a neutral fact.
 */

import type { NoteType } from './types.js';

export const NOTE_TYPES: readonly NoteType[] = ['bug', 'a11y', 'warning', 'perf', 'tip', 'info'];

/** Worst first, with the typeless note in its place among them. */
export const NOTE_TYPE_ORDER: readonly (NoteType | null)[] = [
	'bug',
	'a11y',
	'warning',
	'perf',
	null,
	'tip',
	'info',
];

/** Where a note sits in the order. An unknown type ranks last rather than
 * letting `indexOf`'s -1 make it the worst thing in the tree. */
export function noteRank(type: NoteType | null): number {
	const at = NOTE_TYPE_ORDER.indexOf(type);
	return at === -1 ? NOTE_TYPE_ORDER.length : at;
}
