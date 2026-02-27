<script lang="ts">
	import type { DocEntry } from '../types.js';
	import { initRouter, getPath } from './router.svelte.js';
	import { buildTree, findDocByPath } from './tree-builder.js';
	import Sidebar from './views/Sidebar.svelte';
	import ComponentView from './views/ComponentView.svelte';
	import PageView from './views/PageView.svelte';
	import LayoutView from './views/LayoutView.svelte';
	import HomePage from './views/HomePage.svelte';
	import { onMount } from 'svelte';
	import '../ui/styles/theme.css';

	type ThemeMode = 'light' | 'dark';

	interface Props {
		docs: DocEntry[];
		logo?: string;
		cssNames?: string[];
		sidebarConfig?: {
			order?: Record<string, string[]>;
			open?: string[];
		};
	}

	let { docs, logo = 'sdocs', cssNames = [], sidebarConfig }: Props = $props();

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
		initRouter();
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

	const currentPath = $derived(getPath());
	const tree = $derived(buildTree(docs, sidebarConfig));
	const resolved = $derived(findDocByPath(docs, currentPath));
</script>

<div class="sdocs-app">
	{#if !sidebarHidden}
		<Sidebar
			{tree}
			{currentPath}
			{logo}
			{cssNames}
			{activeStylesheet}
			{theme}
			onToggleFullscreen={() => sidebarHidden = true}
			onStylesheetChange={(name) => activeStylesheet = name}
			onThemeChange={(t) => theme = t}
		/>
	{:else}
		<button class="sdocs-exit-fullscreen" onclick={() => sidebarHidden = false}>
			&#9664; Exit fullscreen
		</button>
	{/if}
	<main class="sdocs-main" class:sdocs-main-fullscreen={sidebarHidden}>
		{#if resolved}
			{#if resolved.doc.kind === 'page'}
				<PageView doc={resolved.doc} {activeStylesheet} />
			{:else if resolved.doc.kind === 'layout'}
				<LayoutView doc={resolved.doc} {activeStylesheet} />
			{:else}
				<ComponentView doc={resolved.doc} snippetName={resolved.snippetName} {activeStylesheet} />
			{/if}
		{:else}
			<HomePage {docs} {logo} />
		{/if}
	</main>
</div>

<style>
	.sdocs-app {
		margin: 0;
		padding: 0;
		display: flex;
		height: 100vh;
		overflow: hidden;
		position: relative;
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
