<script lang="ts">
	import type { DocEntry, SectionConfig } from '../types.js';
	import { initRouter, getRoute, navigate, type RoutingMode } from './router.svelte.js';
	import { buildSections, resolveRoute } from './tree-builder.js';
	import Sidebar from './views/Sidebar.svelte';
	import TopBar from './views/TopBar.svelte';
	import ComponentView from './views/ComponentView.svelte';
	import DocView from './views/DocView.svelte';
	import PageView from './views/PageView.svelte';
	import LayoutView from './views/LayoutView.svelte';
	import AboutPage from './views/AboutPage.svelte';
	import ErrorScreen from './views/ErrorScreen.svelte';
	import { onMount, setContext } from 'svelte';
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
	}

	let {
		docs,
		title,
		logo = 'sdocs',
		icon,
		cssNames = [],
		previewBase = '',
		pageModules = {},
		sections,
		home = null,
		routing = 'hash',
		basePath = '',
		sdocsVersion
	}: Props = $props();

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

	let sidebarHidden = $state(false);
	let activeStylesheet = $state<string | undefined>(undefined);
	let theme = $state<ThemeMode>('light');

	// Initialize active stylesheet to first named CSS (if any)
	$effect(() => {
		if (cssNames.length > 0 && !activeStylesheet) {
			activeStylesheet = cssNames[0];
		}
	});

	onMount(() => {
		initRouter(routing, basePath);
		const saved = localStorage.getItem('sdocs-theme') as ThemeMode | null;
		if (saved && (saved === 'light' || saved === 'dark')) {
			theme = saved;
		}
	});

	// Apply theme attribute and persist
	$effect(() => {
		const root = document.querySelector('.sdocs-app');
		if (!root) return;
		root.setAttribute('data-sdocs-theme', theme);
		localStorage.setItem('sdocs-theme', theme);
	});

	const currentRoute = $derived(getRoute());
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

<svelte:window onclick={onLinkClick} />

<div class="sdocs-app">
	{#if sectionMap.errors.length > 0}
		<ErrorScreen errors={sectionMap.errors} />
	{:else}
	<TopBar
		title={headerTitle}
		logo={headerLogo}
		sections={sectionMap.sections}
		activeSlug={routeSection?.slug}
		{cssNames}
		{activeStylesheet}
		{theme}
		onToggleFullscreen={() => (sidebarHidden = true)}
		onStylesheetChange={(name) => (activeStylesheet = name)}
		onThemeChange={(t) => (theme = t)}
	/>
	<div class="sdocs-body">
		{#if sidebarHidden}
			<button class="sdocs-exit-fullscreen" onclick={() => (sidebarHidden = false)}>
				&#9664; Exit fullscreen
			</button>
		{:else if activeSection}
			<Sidebar tree={activeSection.tree} {currentRoute} />
		{/if}
		<main class="sdocs-main" class:sdocs-main-fullscreen={sidebarHidden}>
			{#if resolved}
				{#if resolved.doc.kind === 'doc'}
					<DocView doc={resolved.doc} {activeStylesheet} {pageModules} />
				{:else if resolved.doc.kind === 'page'}
					<PageView doc={resolved.doc} {pageModules} />
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
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		height: 100vh;
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
		overflow-y: auto;
		background: var(--color-base-0);
	}
	.sdocs-main-fullscreen {
		overflow-y: auto;
	}
	.sdocs-exit-fullscreen {
		position: fixed;
		top: 12px;
		left: 12px;
		z-index: 100;
		padding: 6px 12px;
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		background: var(--color-base-0);
		font-size: 12px;
		color: var(--color-base-600);
		cursor: pointer;
		font-family: var(--sans);
	}
	.sdocs-exit-fullscreen:hover {
		background: var(--color-base-100);
	}
</style>
