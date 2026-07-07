/**
 * Router for the Explorer. Two modes over the same slug-segment routes:
 * - 'history': real paths (/guides/installation). The standalone CLI default —
 *   its dev server and static build guarantee every path serves the shell.
 * - 'hash': #/guides/installation. The embedded default — works under any
 *   host routing without server cooperation.
 */

export type RoutingMode = 'history' | 'hash';

// Reactive: initRouter runs on mount, after hrefs were first rendered — they
// recompute when the mode lands.
let mode = $state<RoutingMode>('hash');
let base = $state('');

/** Current route segments (reactive) */
let currentRoute = $state<string[]>([]);

/** The query string (`location.search`, reactive) — updated on init,
 * popstate/hashchange, and setQueryParam. Query params live alongside the
 * route (they don't change which entity resolves) — used for in-page state
 * like the selected preview tab, so a tab is shareable by URL. */
let search = $state('');

/** Get the current route segments */
export function getRoute(): string[] {
	return currentRoute;
}

/** Reactive read of a URL query parameter (null when absent). */
export function getQueryParam(key: string): string | null {
	return new URLSearchParams(search).get(key);
}

/** Set (or clear, when value is null/'') a query parameter, preserving the
 * path and hash. Replaces history by default so in-page toggles don't stack
 * back-button entries. */
export function setQueryParam(
	key: string,
	value: string | null,
	opts?: { replace?: boolean },
): void {
	const params = new URLSearchParams(location.search);
	if (value === null || value === '') params.delete(key);
	else params.set(key, value);
	const qs = params.toString();
	const url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
	if (opts?.replace ?? true) history.replaceState(null, '', url);
	else history.pushState(null, '', url);
	search = location.search;
}

/** Navigate to a route (segments are slugs). Changing entity drops any query
 * params (a preview tab, say) — routeHref carries none, so the URL is clean. */
export function navigate(segments: string[], opts?: { replace?: boolean }): void {
	const url = routeHref(segments);
	if (mode === 'history') {
		if (opts?.replace) history.replaceState(null, '', url);
		else history.pushState(null, '', url);
		currentRoute = segments;
		search = location.search;
	} else {
		if (opts?.replace) location.replace(url);
		else location.hash = url;
		// hashchange fires and re-parses; set eagerly for same-hash calls
		currentRoute = segments;
	}
}

/** Href string for a route, in the active mode (for <a href>) */
export function routeHref(segments: string[]): string {
	const path = segments.map(encodeURIComponent).join('/');
	return mode === 'history' ? `${base}/${path}` : `#/${path}`;
}

function parseLocation(): string[] {
	const raw =
		mode === 'history'
			? location.pathname.startsWith(base)
				? location.pathname.slice(base.length)
				: location.pathname
			: location.hash.replace(/^#/, '');
	return raw.split('/').filter(Boolean).map(decodeURIComponent);
}

let initialized = false;

/**
 * Initialize the router — call once on app startup. Idempotent: the built
 * app's entry initializes before hydration (the first render must already
 * know the route), and the Explorer's own onMount call then no-ops.
 * In history mode a leftover `#/…` URL (a pre-history bookmark) is translated
 * in place: its segments were display names with spaces as hyphens, which
 * lowercased are today's slugs for almost every title.
 */
export function initRouter(routingMode: RoutingMode, basePath = ''): void {
	if (initialized) return;
	initialized = true;
	mode = routingMode;
	base = basePath.replace(/\/$/, '');

	if (mode === 'history' && location.hash.startsWith('#/')) {
		const legacy = location.hash
			.slice(2)
			.split('/')
			.filter(Boolean)
			.map((s) => decodeURIComponent(s).toLowerCase());
		history.replaceState(null, '', `${base}/${legacy.join('/')}`);
	}

	currentRoute = parseLocation();
	search = location.search;

	const onChange = () => {
		currentRoute = parseLocation();
		search = location.search;
	};
	if (mode === 'history') window.addEventListener('popstate', onChange);
	else window.addEventListener('hashchange', onChange);
}

/**
 * Server-side route state for prerendering: sets mode/base/route without
 * touching browser APIs. The build's static renderer calls this before each
 * route render; hrefs and route resolution then match the client exactly.
 */
export function setServerRoute(segments: string[], basePath = ''): void {
	mode = 'history';
	base = basePath.replace(/\/$/, '');
	currentRoute = segments;
}
