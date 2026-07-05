<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { TreeNode } from '../tree-builder.js';
	import { routeHref, navigate } from '../router.svelte.js';
	import { Icon } from '../../ui/Icon/index.js';
	import { NavTree } from '../../ui/index.js';

	type ThemeMode = 'light' | 'dark';

	interface Props {
		tree: TreeNode[];
		currentRoute: string[];
		title: string;
		logo?: string | false;
		/** Brand + actions render here unless a top bar already shows them */
		showHeader?: boolean;
		cssNames?: string[];
		activeStylesheet?: string;
		theme?: ThemeMode;
		onToggleFullscreen?: () => void;
		onStylesheetChange?: (name: string) => void;
		onThemeChange?: (theme: ThemeMode) => void;
	}

	let { tree, currentRoute, title, logo = 'sdocs', showHeader = true, cssNames = [], activeStylesheet, theme = 'light', onToggleFullscreen, onStylesheetChange, onThemeChange }: Props = $props();

	const themeIcons: Record<ThemeMode, string> = { light: '\u2600', dark: '\u263D' };
	const themeLabels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark' };

	function toggleTheme() {
		onThemeChange?.(theme === 'light' ? 'dark' : 'light');
	}
	let searchQuery = $state('');

	// Track expanded state by path key (SvelteSet for reactivity)
	let expandedSet = new SvelteSet<string>();
	let initialized = false;

	// Initialize expanded state from tree defaults
	$effect(() => {
		if (!initialized && tree.length > 0) {
			collectDefaults(tree, expandedSet);
			initialized = true;
		}
	});

	function collectDefaults(nodes: TreeNode[], set: SvelteSet<string>) {
		for (const node of nodes) {
			if (node.defaultExpanded || node.type === 'group') {
				set.add(node.path.join('/'));
			}
			if (node.children.length > 0) {
				collectDefaults(node.children, set);
			}
		}
	}

	function toggleExpanded(pathKey: string) {
		if (expandedSet.has(pathKey)) {
			expandedSet.delete(pathKey);
		} else {
			expandedSet.add(pathKey);
		}
	}

	function isExpanded(pathKey: string): boolean {
		if (searchQuery.trim()) return true; // Auto-expand when searching
		return expandedSet.has(pathKey);
	}

	const filteredTree = $derived(
		searchQuery.trim() ? filterTree(tree, searchQuery.trim().toLowerCase()) : tree,
	);

	function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
		const result: TreeNode[] = [];
		for (const node of nodes) {
			if (node.name.toLowerCase().includes(query)) {
				result.push(node);
			} else if (node.children.length > 0) {
				const filtered = filterTree(node.children, query);
				if (filtered.length > 0) {
					result.push({ ...node, children: filtered });
				}
			}
		}
		return result;
	}

	function isActive(nodeRoute: string[]): boolean {
		if (nodeRoute.length > currentRoute.length) return false;
		return nodeRoute.every((seg, i) => seg === currentRoute[i]);
	}

	function isExactActive(nodeRoute: string[]): boolean {
		return (
			nodeRoute.length === currentRoute.length &&
			nodeRoute.every((seg, i) => seg === currentRoute[i])
		);
	}

	function iconName(node: TreeNode, expanded: boolean): string {
		switch (node.type) {
			case 'folder': return expanded ? 'folder-open' : 'folder';
			case 'component':
				if (node.children.length > 0) {
					const hasChildComponent = node.children.some(c => c.type === 'component' && c.children.length > 0);
					return hasChildComponent ? 'component' : 'diamond';
				}
				if (node.name === 'Docs') return 'file-code';
				return 'bookmark';
			case 'page': return 'file-text';
			case 'layout': return 'panels-top-left';
			default: return 'file';
		}
	}

	function iconColor(node: TreeNode): string {
		switch (node.type) {
			case 'folder': return 'var(--color-base-400)';
			case 'component':
				if (node.children.length > 0) return 'var(--color-component-500)';
				if (node.name === 'Docs') return 'var(--color-docs-500)';
				return 'var(--color-example-500)';
			case 'page': return 'var(--color-page-550)';
			case 'layout': return 'var(--color-layout-500)';
			default: return 'inherit';
		}
	}

	function expanderActiveColor(node: TreeNode): string {
		switch (node.type) {
			case 'component': return 'var(--color-component-400)';
			case 'page': return 'var(--color-page-400)';
			case 'layout': return 'var(--color-layout-400)';
			default: return 'var(--color-base-400)';
		}
	}

	function expanderHoverColor(node: TreeNode): string {
		switch (node.type) {
			case 'component': return 'var(--color-component-600)';
			case 'page': return 'var(--color-page-600)';
			case 'layout': return 'var(--color-layout-600)';
			default: return 'var(--color-base-500)';
		}
	}

	function hoverBg(node: TreeNode): string {
		switch (node.type) {
			case 'component':
				if (node.children.length > 0) return 'var(--color-component-50)';
				if (node.name === 'Docs') return 'var(--color-docs-50)';
				return 'var(--color-example-50)';
			case 'page': return 'var(--color-page-50)';
			case 'layout': return 'var(--color-layout-50)';
			default: return 'var(--color-base-100)';
		}
	}

	function activeBg(node: TreeNode): string {
		switch (node.type) {
			case 'component':
				if (node.children.length > 0) return 'var(--color-component-100)';
				if (node.name === 'Docs') return 'var(--color-docs-100)';
				return 'var(--color-example-100)';
			case 'page': return 'var(--color-page-100)';
			case 'layout': return 'var(--color-layout-100)';
			default: return 'var(--color-base-100)';
		}
	}

	function activeHoverBg(node: TreeNode): string {
		switch (node.type) {
			case 'component':
				if (node.children.length > 0) return 'var(--color-component-150)';
				if (node.name === 'Docs') return 'var(--color-docs-150)';
				return 'var(--color-example-150)';
			case 'page': return 'var(--color-page-150)';
			case 'layout': return 'var(--color-layout-150)';
			default: return 'var(--color-base-150)';
		}
	}

	function leafWeight(node: TreeNode): string {
		if (node.type === 'page' || node.type === 'layout') return '500';
		return '400';
	}
</script>

<aside class="sdocs-sidebar">
	{#if showHeader}
		<div class="sdocs-sidebar-header">
			<a href={routeHref([])} class="sdocs-logo">
				{#if logo === 'sdocs'}
					<Icon name="sdocs" --w="22px" --h="22px" --fill="#FC1D29" />
				{:else if logo}
					<img class="sdocs-logo-img" src={logo} alt="" />
				{/if}
				{title}
			</a>
			<div class="sdocs-header-actions">
				{#if cssNames.length > 1}
					<select
						class="sdocs-css-picker"
						value={activeStylesheet}
						onchange={(e) => onStylesheetChange?.(e.currentTarget.value)}
					>
						{#each cssNames as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				{/if}
				<button class="sdocs-theme-btn" onclick={toggleTheme} title="{themeLabels[theme]} theme">
					{themeIcons[theme]}
				</button>
				<button class="sdocs-fullscreen-btn" onclick={() => onToggleFullscreen?.()} title="Fullscreen">
					&#x26F6;
				</button>
			</div>
		</div>
	{/if}

	<div class="sdocs-sidebar-search">
		<input
			type="text"
			placeholder="Search..."
			bind:value={searchQuery}
			class="sdocs-search-input"
		/>
	</div>

	<nav class="sdocs-sidebar-tree">
		{#each filteredTree as node (node.path.join('/'))}
			{@render treeNode(node)}
		{/each}
	</nav>
</aside>

{#snippet treeNode(node: TreeNode)}
	{@const pathKey = node.path.join('/')}
	{@const expanded = isExpanded(pathKey)}

	{#if node.type === 'group'}
		<NavTree.Group label={node.name} {expanded} onclick={() => toggleExpanded(pathKey)}>
			{#each node.children as child (child.path.join('/'))}
				{@render treeNode(child)}
			{/each}
		</NavTree.Group>
	{:else if node.children.length > 0}
		<NavTree.Item
			label={node.name}
			{expanded}
			active={isActive(node.route)}
			onclick={() => {
				const wasCollapsed = !expandedSet.has(pathKey);
				toggleExpanded(pathKey);
				if (wasCollapsed && node.type !== 'folder') {
					navigate(node.route);
				}
			}}
			--font-weight="500"
			--bg-hover={hoverBg(node)}
			--bg-active={activeBg(node)}
			--bg-active-hover={activeHoverBg(node)}
			--r="4px"
			--expander-color-active={expanderActiveColor(node)}
			--expander-color-hover={expanderHoverColor(node)}
		>
			{#snippet left()}<Icon name={iconName(node, expanded)} --w="14px" --h="14px" --fill={iconColor(node)} />{/snippet}
			{#each node.children as child (child.path.join('/'))}
				{@render treeNode(child)}
			{/each}
		</NavTree.Item>
	{:else}
		<NavTree.Item
			label={node.name}
			href={routeHref(node.route)}
			active={isExactActive(node.route)}
			--font-weight={leafWeight(node)}
			--bg-hover={hoverBg(node)}
			--bg-active={activeBg(node)}
			--bg-active-hover={activeHoverBg(node)}
			--r="4px"
		>
			{#snippet left()}<Icon name={iconName(node, false)} --w="14px" --h="14px" --fill={iconColor(node)} />{/snippet}
		</NavTree.Item>
	{/if}
{/snippet}

<style>
	.sdocs-sidebar {
		width: 260px;
		height: 100%;
		overflow-y: auto;
		border-right: 1px solid var(--color-base-200);
		background: var(--color-base-0);
		display: flex;
		flex-direction: column;
		font-family: var(--sans);
		font-size: 13px;
	}
	.sdocs-sidebar-header {
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-base-200);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sdocs-logo {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 20px;
		color: var(--color-base-900);
		text-decoration: none;
	}
	.sdocs-logo-img {
		width: 22px;
		height: 22px;
		object-fit: contain;
	}
	.sdocs-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sdocs-css-picker {
		font-size: 12px;
		padding: 2px 4px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
	}
	.sdocs-theme-btn {
		padding: 2px 6px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.sdocs-theme-btn:hover {
		background: var(--color-base-100);
	}
	.sdocs-fullscreen-btn {
		padding: 2px 6px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.sdocs-fullscreen-btn:hover {
		background: var(--color-base-100);
	}
	.sdocs-sidebar-search {
		padding: 8px 16px;
	}
	.sdocs-search-input {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		font-size: 13px;
		outline: none;
		box-sizing: border-box;
		background: var(--color-base-0);
		color: var(--color-base-600);
	}
	.sdocs-search-input:focus {
		border-color: var(--color-action-500);
		box-shadow: 0 0 0 2px var(--color-action-100);
	}
	.sdocs-sidebar-tree {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}
</style>
