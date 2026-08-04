/**
 * The narrow-viewport flag — the one place the mobile breakpoint is defined.
 *
 * Below `NARROW_MAX` the Explorer folds its chrome into one off-canvas nav:
 * the top bar's section tabs join the sidebar tree behind a burger, and the
 * resizable preview stages drop their drag handles — there is no room to drag
 * into and no pointer to do it with.
 *
 * Anything that is only paint keys off `@media (max-width: 860px)` directly,
 * so a prerendered page comes up narrow on the first frame instead of
 * reflowing once hydration runs. This module covers the rest: markup that must
 * not exist at all on a phone, and behaviour (a stored desktop stage width) a
 * media query cannot reach. `tests/explorer/viewport.test.ts` asserts every
 * max-width query in the package equals NARROW_MAX, so the two cannot drift.
 */

/** Widest viewport still treated as a phone, in px. */
export const NARROW_MAX = 860;

let narrow = $state(false);

/**
 * Start tracking the viewport (Explorer calls this on mount).
 * Returns the unsubscribe callback.
 */
export function initViewport(): () => void {
	const mq = window.matchMedia(`(max-width: ${NARROW_MAX}px)`);
	narrow = mq.matches;
	const onChange = (e: MediaQueryListEvent) => (narrow = e.matches);
	mq.addEventListener('change', onChange);
	return () => mq.removeEventListener('change', onChange);
}

/** True on phone-width viewports. Reactive; false until `initViewport`. */
export function isNarrow(): boolean {
	return narrow;
}

/** Widest side padding a page keeps on a narrow screen. */
const NARROW_PAD_MAX = '16px';

/**
 * Cap a page's horizontal padding for a narrow screen.
 *
 * `padding` is authored for a desktop column, where 32px a side reads as a
 * margin; on a 390px screen it is a sixth of the width. Each horizontal slot
 * of the shorthand becomes `min(<authored>, 16px)`, so a page that asked for
 * *less* keeps less and a full-bleed page stays full-bleed. Vertical slots are
 * untouched. Zero lengths pass through — `min(0, 16px)` mixes a number with a
 * length and would invalidate the declaration. A value built from calc()/var()
 * is returned as authored rather than mis-parsed.
 */
export function capSidePadding(padding: string | undefined): string | undefined {
	if (!padding || padding.includes('(')) return padding;
	const parts = padding.trim().split(/\s+/);
	if (parts.length === 0 || parts.length > 4) return padding;
	const cap = (v: string) => (/^0[a-z%]*$/i.test(v) ? v : `min(${v}, ${NARROW_PAD_MAX})`);
	// The shorthand's horizontal slots: [all] / [y x] / [t x b] / [t r b l]
	if (parts.length === 1) return `${parts[0]} ${cap(parts[0])}`;
	const capped = [...parts];
	for (const i of parts.length === 4 ? [1, 3] : [1]) capped[i] = cap(parts[i]);
	return capped.join(' ');
}
