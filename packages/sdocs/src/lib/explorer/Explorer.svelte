<script lang="ts">
	import type { AxisConfig, DocEntry, ScaleConfig, SectionConfig } from '../types.js';
	import { initRouter, getRoute, navigate, type RoutingMode } from './router.svelte.js';
	import { buildSections, resolveRoute, displayTitle } from './tree-builder.js';
	import Sidebar from './views/Sidebar.svelte';
	import TopBar from './views/TopBar.svelte';
	import ComponentView from './views/ComponentView.svelte';
	import DocView from './views/DocView.svelte';
	import PageView from './views/PageView.svelte';
	import LayoutView from './views/LayoutView.svelte';
	import AboutPage from './views/AboutPage.svelte';
	import ErrorScreen from './views/ErrorScreen.svelte';
	import { onMount, setContext, type Component } from 'svelte';
	import { initLayoutWidth } from './layout-width.svelte.js';
	import { initViewport, isNarrow } from './viewport.svelte.js';
	import { initHostClipboard } from './host-clipboard.js';
	import '../ui/styles/sdocs.css';

	type ThemeMode = 'light' | 'dark';

	interface Props {
		docs: DocEntry[];
		/** Header title text */
		title?: string;
		/** Header logo: 'sdocs' for the built-in mascot, an image URL, or false to hide */
		logo?: string | false;
		/** @deprecated pre-0.0.61 name for `logo` */
		icon?: string | false;
		cssNames?: string[];
		/** URL prefix for preview pages when the host app is served under a sub-path (e.g. SvelteKit's base). */
		previewBase?: string;
		/** Native doc/page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
		/** Already-resolved content components (prerendering + hydration boot). */
		preloaded?: Record<string, Component>;
		/** The site's sections, in top-bar order (titles reference their slugs) */
		sections?: SectionConfig[];
		/** Route path of the landing page (e.g. 'guides/introduction') */
		home?: string | null;
		/** 'history' for real paths (server must fall back to the shell),
		 * 'hash' for #/ URLs. Embedded default: 'hash'. */
		routing?: RoutingMode;
		/** Path prefix for history-mode routes (host app sub-path) */
		basePath?: string;
		/** Version of sdocs that built the site, shown on the About page */
		sdocsVersion?: string;
		/** The dev server serves the MCP endpoint — shows the top-bar MCP
		 * button. Only ever true in `sdocs dev` (config `mcp`, default on). */
		mcp?: boolean;
		/** Design-system dimensions the reader can switch between. Each renders
		 * a dropdown and lands on every preview as `data-<id>`. */
		axes?: Required<AxisConfig>[];
		/** A continuous knob rendered as a slider; its value lands on every
		 * preview as a CSS custom property. */
		scale?: Required<ScaleConfig> | null;
	}

	let {
		docs,
		title,
		logo = 'sdocs',
		icon,
		cssNames = [],
		previewBase = '',
		pageModules = {},
		preloaded = {},
		sections,
		home = null,
		routing = 'hash',
		basePath = '',
		sdocsVersion,
		mcp = false,
		axes = [],
		scale = null
	}: Props = $props();

	// svelte-ignore state_referenced_locally -- static config for this app
	// instance; context is written once at init by design.
	setContext('sdocs-preview-base', previewBase);

	// Pre-0.0.61 props: `logo` was the header text and `icon` the image. An
	// `icon` prop — or a logo value that can't be an asset path — is the old
	// shape; map it onto the new semantics so embedded apps keep rendering.
	const logoLooksLikeText = $derived(
		typeof logo === 'string' && logo !== 'sdocs' && !/[./:]/.test(logo),
	);
	const headerTitle = $derived(title ?? (logoLooksLikeText ? (logo as string) : 'sdocs'));
	const rawLogo = $derived(icon !== undefined ? icon : logoLooksLikeText ? 'sdocs' : logo);
	// A root-absolute logo path (from the project's `static` folder) must carry
	// the build's base prefix, or it 404s under a sub-path deploy. 'sdocs', an
	// external URL, or a relative path pass through untouched.
	const headerLogo = $derived(
		typeof rawLogo === 'string' && rawLogo.startsWith('/') && !rawLogo.startsWith('//')
			? basePath.replace(/\/$/, '') + rawLogo
			: rawLogo,
	);

	// Fullscreen: the top bar and sidebar leave; only the content remains.
	let fullscreen = $state(false);
	let activeStylesheet = $state<string | undefined>(undefined);
	let theme = $state<ThemeMode>('light');

	// Customization axes: the reader's current pick per axis, defaulting to
	// each axis's first value. Read from storage in onMount rather than here,
	// so the first client render still matches the prerendered HTML.
	// svelte-ignore state_referenced_locally -- static config for this app instance
	let axisValues = $state<Record<string, string>>(
		Object.fromEntries(axes.map((a) => [a.id, a.values[0]])),
	);
	// A getter, not the object: `axisValues` is reassigned when storage loads,
	// and a context holding the original object would keep serving stale picks.
	setContext('sdocs-axes', {
		get values() {
			return axisValues;
		},
	});
	setContext('sdocs-scale', {
		get value() {
			return scale ? { var: scale.var, value: scaleValue } : null;
		},
	});

	// svelte-ignore state_referenced_locally -- static config for this app instance
	let scaleValue = $state<number>(scale?.default ?? 1);

	/** Mirror onto the window so a preview iframe can read the current picks at
	 * boot — before it has mounted enough to be messaged, which is what keeps a
	 * late-mounting stage from painting the defaults and then correcting. */
	function publishAxes(values: Record<string, string>) {
		if (typeof window === 'undefined') return;
		(window as Window & { __sdocsAxes?: Record<string, string> }).__sdocsAxes = values;
	}

	/** The scale travels the same way, as `{ var, value }` — a stage sets a
	 * custom property rather than an attribute, so it cannot ride along in the
	 * axis record. */
	function publishScale(value: number) {
		if (typeof window === 'undefined' || !scale) return;
		(window as Window & { __sdocsScale?: { var: string; value: number } }).__sdocsScale = {
			var: scale.var,
			value,
		};
	}
	// svelte-ignore state_referenced_locally -- seeds the default; the effect below keeps it current
	publishScale(scaleValue);
	// svelte-ignore state_referenced_locally -- seeds the defaults; the effect below keeps it current
	publishAxes({ ...axisValues });

	// On a phone the sidebar is an off-canvas drawer holding the section tabs
	// too — closed by default, and never open on a desktop-width window.
	const narrow = $derived(isNarrow());
	let navOpen = $state(false);

	// Initialize active stylesheet to first named CSS (if any)
	$effect(() => {
		if (cssNames.length > 0 && !activeStylesheet) {
			activeStylesheet = cssNames[0];
		}
	});

	/** Restore the stored stylesheet, validated against what this site offers.
	 * Kept like the axes rather than as page state: comparing two themes across
	 * several component pages is the whole point of naming them, and losing the
	 * pick on every reload makes that a chore. */
	function restoreStylesheet() {
		if (cssNames.length < 2) return;
		const saved = localStorage.getItem('sdocs-stylesheet');
		if (saved && cssNames.includes(saved)) activeStylesheet = saved;
	}

	/** Written when the reader picks, never from an effect watching the value.
	 * An effect also fires for the startup default, which lands before the
	 * stored pick is read and overwrites it — the saved choice would be
	 * destroyed by the very load that was meant to restore it. */
	/** Restore the stored scale, clamped to the range the config now declares —
	 * a project that narrows its range must not leave readers pinned outside it. */
	function restoreScale() {
		if (!scale) return;
		const saved = Number(localStorage.getItem('sdocs-scale'));
		if (!Number.isFinite(saved) || saved === 0) return;
		scaleValue = Math.min(scale.max, Math.max(scale.min, saved));
	}

	function chooseScale(value: number) {
		scaleValue = value;
		localStorage.setItem('sdocs-scale', String(value));
	}

	function chooseStylesheet(name: string) {
		activeStylesheet = name;
		if (cssNames.length > 1) localStorage.setItem('sdocs-stylesheet', name);
	}

	onMount(() => {
		initRouter(routing, basePath);
		initLayoutWidth();
		const stopViewport = initViewport();
		// Framed by an editor, the clipboard shortcuts arrive here unanswered.
		const stopClipboard = initHostClipboard();
		const saved = localStorage.getItem('sdocs-theme') as ThemeMode | null;
		if (saved && (saved === 'light' || saved === 'dark')) {
			theme = saved;
		}
		restoreAxes();
		restoreStylesheet();
		restoreScale();
		return () => {
			stopViewport();
			stopClipboard();
		};
	});

	/** Restore the stored picks, validated against the axes this site actually
	 * declares. A value the config no longer lists — an axis renamed, a palette
	 * dropped — falls back to the default instead of writing an attribute no
	 * stylesheet matches, which would render every preview unstyled and look
	 * like a sdocs bug rather than a stale entry. Validating also makes the key
	 * safe to share across projects on the same dev-server origin. */
	function restoreAxes() {
		if (axes.length === 0) return;
		let saved: Record<string, unknown> = {};
		try {
			saved = JSON.parse(localStorage.getItem('sdocs-axes') ?? '{}') ?? {};
		} catch {
			// Corrupt entry — the defaults are already in place.
		}
		axisValues = Object.fromEntries(
			axes.map((a) => [
				a.id,
				a.values.includes(saved[a.id] as string) ? (saved[a.id] as string) : a.values[0],
			]),
		);
	}

	// Apply theme attribute and persist
	$effect(() => {
		const root = document.querySelector('.sdocs-app');
		if (!root) return;
		root.setAttribute('data-sdocs-theme', theme);
		localStorage.setItem('sdocs-theme', theme);
	});

	// Publish and persist the axis picks. Frames already on screen are updated
	// by PreviewFrame; the window mirror is for the ones that mount later.
	$effect(() => {
		if (axes.length === 0) return;
		const values = { ...axisValues };
		publishAxes(values);
		localStorage.setItem('sdocs-axes', JSON.stringify(values));
	});

	$effect(() => {
		publishScale(scaleValue);
	});

	const currentRoute = $derived(getRoute());

	// The drawer closes where the user *arrives* — a tree leaf, a top-bar link
	// — and each of those says so itself. Closing on any route change instead
	// would also dismiss it on a section chip, whose whole job is to swap which
	// tree the drawer shows so browsing can continue.

	// Widening the window puts the sidebar back in the flow; a drawer left
	// "open" would otherwise re-appear the next time it narrows.
	$effect(() => {
		if (!narrow) navOpen = false;
	});

	// When framed (the editor's docs tab), announce every route change to the
	// parent, so a refresh or server restart can come back to the same page.
	$effect(() => {
		void currentRoute;
		if (window.parent !== window) {
			window.parent.postMessage({ type: 'sdocs:route', href: location.href }, '*');
		}
	});

	const sectionMap = $derived(buildSections(docs, { sections, home }));
	// The About page (mascot + stats + sdocs version) lives at /about and is
	// the landing page whenever the config sets no `home`.
	const isAboutRoute = $derived(currentRoute.length === 1 && currentRoute[0] === 'about');
	// The root route resolves to the configured home entity (or null → About).
	const resolved = $derived(isAboutRoute ? null : resolveRoute(sectionMap, currentRoute));
	// The tab the current route sits in. With declared sections that's the
	// route's first segment; the implicit lone `docs` section is active on any
	// doc route. Home/About highlight no tab.
	const routeSection = $derived(
		sectionMap.active
			? sectionMap.sections.find((s) => s.slug === currentRoute[0])
			: resolved
				? sectionMap.sections[0]
				: undefined,
	);
	// The section whose sidebar to show: the resolved target's own section
	// when it has one (covers the home route rendering a section entity), the
	// URL's section otherwise, and the first section as a fallback for About
	// and unknown routes. A sectionless page has no section — no sidebar.
	const isSectionlessPage = $derived(!!resolved && !resolved.section);
	const activeSection = $derived(
		resolved?.section
			? sectionMap.sections.find((s) => s.slug === resolved.section)
			: isSectionlessPage
				? undefined
				: (routeSection ?? sectionMap.sections[0]),
	);

	// Tab title tracks the route — same "Page – Site" shape the static build
	// prerenders into each page's <title>; the root shows the site title alone.
	$effect(() => {
		let page: string | null = null;
		if (isAboutRoute) {
			page = 'About';
		} else if (resolved && currentRoute.length > 0) {
			const name = displayTitle(resolved.doc.meta.title);
			page = resolved.snippetName ? `${name} / ${resolved.snippetName}` : name;
		}
		document.title = page ? `${page} – ${headerTitle}` : headerTitle;
	});

	// The drawer is worth opening when it holds something: this section's tree,
	// or the section list itself (a sectionless page has no tree, but the tabs
	// it replaces still need somewhere to live).
	const hasDrawerNav = $derived(!!activeSection || sectionMap.sections.length > 0);

	/** History mode: internal <a> clicks route client-side instead of reloading. */
	function onLinkClick(e: MouseEvent) {
		if (routing !== 'history') return;
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
			return;
		const anchor = (e.target as Element | null)?.closest?.('a');
		if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
		const href = anchor.getAttribute('href');
		if (!href || href.startsWith('#')) return;
		const url = new URL(anchor.href, location.href);
		if (url.origin !== location.origin) return;
		const base = basePath.replace(/\/$/, '');
		if (base && !url.pathname.startsWith(base + '/')) return;
		e.preventDefault();
		navigate(url.pathname.slice(base.length).split('/').filter(Boolean).map(decodeURIComponent));
	}
</script>

<svelte:window
	onclick={onLinkClick}
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		// The drawer is the innermost layer — it goes first.
		if (navOpen) navOpen = false;
		else if (fullscreen) fullscreen = false;
	}}
/>

<div class="sdocs-app">
	{#if sectionMap.errors.length > 0}
		<ErrorScreen errors={sectionMap.errors} />
	{:else}
	{#if !fullscreen}
		<TopBar
			title={headerTitle}
			logo={headerLogo}
			sections={sectionMap.sections}
			activeSlug={routeSection?.slug}
			{cssNames}
			{activeStylesheet}
			{theme}
			{mcp}
			{axes}
			{axisValues}
			{scale}
			{scaleValue}
			onScaleChange={chooseScale}
			showBurger={narrow && hasDrawerNav}
			{navOpen}
			onToggleNav={() => (navOpen = !navOpen)}
			onCloseNav={() => (navOpen = false)}
			onToggleFullscreen={() => (fullscreen = true)}
			onStylesheetChange={(name) => chooseStylesheet(name)}
			onThemeChange={(t) => (theme = t)}
			onAxisChange={(id, value) => (axisValues = { ...axisValues, [id]: value })}
		/>
	{:else}
		<!-- A hot corner: invisible until the pointer (or focus) reaches it. -->
		<div class="sdocs-exit-zone">
			<button class="sdocs-exit-fullscreen" onclick={() => (fullscreen = false)}>
				&#9664; Exit fullscreen
			</button>
		</div>
	{/if}
	<div class="sdocs-body">
		{#if !fullscreen && (activeSection || (narrow && hasDrawerNav))}
			<Sidebar
				tree={activeSection?.tree ?? []}
				{currentRoute}
				{narrow}
				open={navOpen}
				sections={sectionMap.sections}
				activeSlug={routeSection?.slug}
				{cssNames}
				{activeStylesheet}
				{axes}
				{axisValues}
				{scale}
				{scaleValue}
				onScaleChange={chooseScale}
				onStylesheetChange={(name) => chooseStylesheet(name)}
				onAxisChange={(id, value) => (axisValues = { ...axisValues, [id]: value })}
				onClose={() => (navOpen = false)}
			/>
		{/if}
		<!-- With the drawer over it, the content behind is out of reach for the
		     pointer (the scrim) and for the keyboard (inert) alike. -->
		<main
			class="sdocs-main"
			class:sdocs-main-fullscreen={fullscreen}
			class:sdocs-main-flush={resolved?.doc.kind === 'layout'}
			inert={narrow && navOpen}
		>
			{#if resolved}
				{#if resolved.doc.kind === 'doc'}
					<DocView doc={resolved.doc} {activeStylesheet} {pageModules} {preloaded} />
				{:else if resolved.doc.kind === 'page'}
					<PageView doc={resolved.doc} {pageModules} {preloaded} />
				{:else if resolved.doc.kind === 'layout'}
					<LayoutView doc={resolved.doc} {activeStylesheet} />
				{:else}
					<ComponentView doc={resolved.doc} snippetName={resolved.snippetName} {activeStylesheet} />
				{/if}
			{:else}
				<AboutPage {docs} title={headerTitle} logo={headerLogo} {sdocsVersion} />
			{/if}
		</main>
	</div>
	{/if}
</div>

<style>
	.sdocs-app {
		/* The top bar's height, shared: the drawer hangs off the bottom of it. */
		--sdocs-topbar-h: 48px;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		height: 100vh;
		/* Mobile browsers shrink the visual viewport as their toolbars slide
		   away — dvh tracks that, 100vh would leave the last rows cut off. */
		height: 100dvh;
		overflow: hidden;
		position: relative;
	}
	.sdocs-body {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.sdocs-main {
		flex: 1;
		/* The other half: a flex item's automatic minimum is its content, so
		   without this the content column can't shrink below whatever its
		   widest child demands and pushes on its sibling instead. It scrolls
		   its own overflow now rather than taking width from the nav. */
		min-width: 0;
		overflow-y: auto;
		/* Same reservation as the sidebar tree: a long DOC scrolls and a short
		   component page doesn't, so without this the content column changed
		   width as you moved between them. */
		scrollbar-gutter: stable;
		background: var(--color-base-0);
	}
	.sdocs-main-fullscreen {
		overflow-y: auto;
	}
	/* A layout page is exactly the height of the view and never scrolls, so
	   the reserved gutter is dead space at the right edge — and it holds the
	   layout's resize handle that far off the edge of the window. */
	.sdocs-main-flush {
		scrollbar-gutter: auto;
		overflow: hidden;
	}
	/* The hover target: big enough to find blind, small enough to not sit on
	   content clicks (the content's top-left padding area). */
	.sdocs-exit-zone {
		position: fixed;
		top: 0;
		left: 0;
		width: 160px;
		height: 56px;
		z-index: 100;
	}
	.sdocs-exit-fullscreen {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 6px 12px;
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		background: var(--color-base-0);
		font-size: 12px;
		color: var(--color-base-600);
		cursor: pointer;
		font-family: var(--sans);
		opacity: 0;
		transform: translateY(-4px);
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}
	.sdocs-exit-zone:hover .sdocs-exit-fullscreen,
	.sdocs-exit-fullscreen:focus-visible {
		opacity: 1;
		transform: translateY(0);
	}
	.sdocs-exit-fullscreen:hover {
		background: var(--color-base-100);
	}

	@media (max-width: 860px) {
		.sdocs-app {
			/* A taller bar so its controls can carry 40px touch targets. */
			--sdocs-topbar-h: 52px;
		}
		/* Reveal-on-hover is a pointer affordance. Touch never hovers, so the
		   way out of fullscreen has to be visible from the start. */
		.sdocs-exit-fullscreen {
			opacity: 1;
			transform: none;
			padding: 10px 14px;
		}
	}
</style>
