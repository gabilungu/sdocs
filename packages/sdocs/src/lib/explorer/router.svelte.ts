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

/** Get the current route segments */
export function getRoute(): string[] {
	return currentRoute;
}

/** Navigate to a route (segments are slugs) */
export function navigate(segments: string[], opts?: { replace?: boolean }): void {
	const url = routeHref(segments);
	if (mode === 'history') {
		if (opts?.replace) history.replaceState(null, '', url);
		else history.pushState(null, '', url);
		currentRoute = segments;
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

/**
 * Initialize the router — call once on app startup.
 * In history mode a leftover `#/…` URL (a pre-history bookmark) is translated
 * in place: its segments were display names with spaces as hyphens, which
 * lowercased are today's slugs for almost every title.
 */
export function initRouter(routingMode: RoutingMode, basePath = ''): void {
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

	const onChange = () => {
		currentRoute = parseLocation();
	};
	if (mode === 'history') window.addEventListener('popstate', onChange);
	else window.addEventListener('hashchange', onChange);
}
