/**
 * The shared layout width. Dragging any [LAYOUT] stage handle sets it for
 * every layout page and it survives reloads (localStorage, like the theme).
 * Null means "no override": layouts sit at full width. Clicking a layout's
 * width readout clears it. Component previews and examples keep their own
 * per-page widths — sketch pages are where a remembered viewport pays off.
 */

const KEY = 'sdocs-layout-width';

let width = $state<number | null>(null);

/** Load the persisted width (Explorer calls this on mount). */
export function initLayoutWidth(): void {
	try {
		const v = localStorage.getItem(KEY);
		width = v ? Number(v) || null : null;
	} catch {
		// SSR / blocked storage — keep the default.
	}
}

/** The override in px, or null when stages sit at their defaults. Reactive. */
export function layoutWidth(): number | null {
	return width;
}

export function setLayoutWidth(v: number): void {
	width = Math.round(v);
	try {
		localStorage.setItem(KEY, String(width));
	} catch {
		// Storage unavailable — the override still applies for this session.
	}
}

export function clearLayoutWidth(): void {
	width = null;
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Storage unavailable — nothing persisted anyway.
	}
}
