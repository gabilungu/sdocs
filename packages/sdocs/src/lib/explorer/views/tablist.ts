/**
 * Which tab an arrow key moves to.
 *
 * Separated from the DOM handler because the rules are the part with edge
 * cases — wrapping past either end, Home/End, and leaving every other key
 * alone so typing still reaches the page — and because a component that needs
 * a whole document, component metadata and a live iframe to mount is a poor
 * place to check them.
 *
 * The pattern is the one the ARIA authoring practices describe for a tablist:
 * arrows move and select, Home and End jump to the ends, and focus follows
 * selection so the roving tabindex never leaves focus on an unselected tab.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
	// Nothing to move between.
	if (count < 2) return null;
	const last = count - 1;
	switch (key) {
		case 'ArrowRight':
			return (current + 1) % count;
		case 'ArrowLeft':
			// `+ last` rather than `- 1`, so index 0 wraps to the end instead of
			// going negative.
			return (current + last) % count;
		case 'Home':
			return 0;
		case 'End':
			return last;
		default:
			return null;
	}
}
