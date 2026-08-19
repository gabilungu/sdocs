<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { SectionTree, TreeNode } from '../tree-builder.js';
	import type { AxisConfig, ScaleConfig } from '../../types.js';
	import { routeHref, navigate } from '../router.svelte.js';
	import { Icon } from '../../ui/Icon/index.js';
	import { NavTree } from '../../ui/index.js';

	interface Props {
		tree: TreeNode[];
		currentRoute: string[];
		/** Narrow viewport: this is an off-canvas drawer, not a fixed column. */
		narrow?: boolean;
		/** Drawer open state (ignored when not narrow). */
		open?: boolean;
		/** The site's sections — shown in the drawer, where the top bar's tabs
		 * would otherwise have nowhere to go. */
		sections?: SectionTree[];
		activeSlug?: string;
		cssNames?: string[];
		activeStylesheet?: string;
		/** Design-system dimensions — rehoused here on narrow viewports. */
		axes?: Required<AxisConfig>[];
		axisValues?: Record<string, string>;
		/** The scale slider — rehoused here on narrow viewports like the pickers. */
		scale?: Required<ScaleConfig> | null;
		scaleValue?: number;
		onStylesheetChange?: (name: string) => void;
		onAxisChange?: (id: string, value: string) => void;
		onScaleChange?: (value: number) => void;
		onClose?: () => void;
	}

	let {
		tree,
		currentRoute,
		narrow = false,
		open = false,
		sections = [],
		activeSlug,
		cssNames = [],
		activeStylesheet,
		axes = [],
		axisValues = {},
		scale = null,
		scaleValue = 1,
		onStylesheetChange,
		onAxisChange,
		onScaleChange,
		onClose,
	}: Props = $props();

	let searchQuery = $state('');

	// Opening the drawer moves focus into it — onto Close, not the search box,
	// since focusing a text field on a phone throws the keyboard up over the
	// nav the user just asked to see.
	let closeEl = $state<HTMLButtonElement>();
	$effect(() => {
		if (narrow && open) closeEl?.focus();
	});

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
			if (node.defaultExpanded) {
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

	/** A compound component: several [component] previews, or sub-components
	 * nested under it in the tree. */
	function isCompound(node: TreeNode): boolean {
		return (node.doc?.previews?.length ?? 0) > 1 || node.children.some((c) => c.entity);
	}

	function iconName(node: TreeNode, expanded: boolean): string {
		switch (node.type) {
			case 'folder': return expanded ? 'folder-open' : 'folder';
			case 'component':
				if (node.entity) return isCompound(node) ? 'component' : 'diamond';
				return 'bookmark';
			case 'doc':
			case 'page': return 'file-text';
			case 'layout': return 'panels-top-left';
			default: return 'file';
		}
	}

	function iconColor(node: TreeNode): string {
		switch (node.type) {
			case 'folder': return 'var(--color-base-400)';
			case 'component':
				return node.entity ? 'var(--color-component-500)' : 'var(--color-example-500)';
			case 'doc':
			case 'page': return 'var(--color-page-550)';
			case 'layout': return 'var(--color-layout-500)';
			default: return 'inherit';
		}
	}

	function expanderActiveColor(node: TreeNode): string {
		switch (node.type) {
			case 'component': return 'var(--color-component-400)';
			case 'doc':
			case 'page': return 'var(--color-page-400)';
			case 'layout': return 'var(--color-layout-400)';
			default: return 'var(--color-base-400)';
		}
	}

	function expanderHoverColor(node: TreeNode): string {
		switch (node.type) {
			case 'component': return 'var(--color-component-600)';
			case 'doc':
			case 'page': return 'var(--color-page-600)';
			case 'layout': return 'var(--color-layout-600)';
			default: return 'var(--color-base-500)';
		}
	}

	function hoverBg(node: TreeNode): string {
		switch (node.type) {
			case 'component':
				return node.entity ? 'var(--color-component-50)' : 'var(--color-example-50)';
			case 'doc':
			case 'page': return 'var(--color-page-50)';
			case 'layout': return 'var(--color-layout-50)';
			default: return 'var(--color-base-100)';
		}
	}

	function activeBg(node: TreeNode): string {
		switch (node.type) {
			case 'component':
				return node.entity ? 'var(--color-component-100)' : 'var(--color-example-100)';
			case 'doc':
			case 'page': return 'var(--color-page-100)';
			case 'layout': return 'var(--color-layout-100)';
			default: return 'var(--color-base-100)';
		}
	}

	function activeHoverBg(node: TreeNode): string {
		switch (node.type) {
			case 'component':
				return node.entity ? 'var(--color-component-150)' : 'var(--color-example-150)';
			case 'doc':
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

<aside id="sdocs-nav" class="sdocs-sidebar" class:is-open={open}>
	{#if narrow}
		<div class="sdocs-drawer-head">
			{#if sections.length > 0}
				<nav class="sdocs-drawer-sections" aria-label="Sections">
					{#each sections as section (section.slug)}
						<a
							class="sdocs-drawer-section"
							class:is-active={section.slug === activeSlug}
							aria-current={section.slug === activeSlug ? 'page' : undefined}
							href={routeHref(section.firstRoute ?? [section.slug])}
						>
							{section.title}
						</a>
					{/each}
				</nav>
			{/if}
			<button
				bind:this={closeEl}
				class="sdocs-drawer-close"
				aria-label="Close navigation"
				onclick={() => onClose?.()}
			>
				<Icon name="x" --w="18px" --h="18px" />
			</button>
		</div>
	{/if}

	{#if tree.length > 0}
		<div class="sdocs-sidebar-search">
			<input
				type="text"
				placeholder="Search..."
				bind:value={searchQuery}
				class="sdocs-search-input"
			/>
		</div>
	{/if}

	<nav class="sdocs-sidebar-tree">
		{#each filteredTree as node (node.path.join('/'))}
			{@render treeNode(node)}
		{/each}
	</nav>

	{#if narrow}
		<!-- The top bar's pickers, rehoused where there's room. Here they can
		     afford the visible labels the bar has no width for. -->
		{#each axes as axis (axis.id)}
			<div class="sdocs-drawer-foot">
				<label class="sdocs-drawer-foot-label" for="sdocs-drawer-axis-{axis.id}">
					{axis.label}
				</label>
				<select
					id="sdocs-drawer-axis-{axis.id}"
					class="sdocs-drawer-css"
					value={axisValues[axis.id] ?? axis.values[0]}
					onchange={(e) => onAxisChange?.(axis.id, e.currentTarget.value)}
				>
					{#each axis.values as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
			</div>
		{/each}
		{#if scale?.presets.length}
			<div class="sdocs-drawer-foot">
				<span class="sdocs-drawer-foot-label">{scale.label}</span>
				{#each scale.presets as preset (preset.label)}
					<button
						type="button"
						class="sdocs-drawer-preset"
						class:is-active={Math.abs(scaleValue - preset.value) < scale.step / 2}
						onclick={() => onScaleChange?.(preset.value)}
					>
						{preset.label}
					</button>
				{/each}
			</div>
		{/if}
		{#if scale}
			<div class="sdocs-drawer-foot">
				<label class="sdocs-drawer-foot-label" for="sdocs-drawer-scale">{scale.label}</label>
				<input
					id="sdocs-drawer-scale"
					class="sdocs-drawer-css"
					type="range"
					min={scale.min}
					max={scale.max}
					step={scale.step}
					value={scaleValue}
					oninput={(e) => onScaleChange?.(e.currentTarget.valueAsNumber)}
				/>
				<span class="sdocs-drawer-foot-label">{scaleValue}</span>
			</div>
		{/if}
		{#if cssNames.length > 1}
			<div class="sdocs-drawer-foot">
				<label class="sdocs-drawer-foot-label" for="sdocs-drawer-css">Stylesheet</label>
				<select
					id="sdocs-drawer-css"
					class="sdocs-drawer-css"
					value={activeStylesheet}
					onchange={(e) => onStylesheetChange?.(e.currentTarget.value)}
				>
					{#each cssNames as name (name)}
						<option value={name}>{name}</option>
					{/each}
				</select>
			</div>
		{/if}
	{/if}
</aside>

{#if narrow && open}
	<!-- After the drawer in the DOM so the tab order runs through the nav
	     first; a real button, so "tap outside to dismiss" is also a stop for
	     keyboard and screen-reader users rather than pointer-only. -->
	<button class="sdocs-nav-scrim" aria-label="Close navigation" onclick={() => onClose?.()}
	></button>
{/if}

{#snippet treeNode(node: TreeNode)}
	{@const pathKey = node.path.join('/')}
	{@const expanded = isExpanded(pathKey)}

	{#if node.type === 'group'}
		<NavTree.Group label={node.name} static>
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
				// Folders only toggle. For a page item: navigate and expand it,
				// but clicking the item you're already on collapses it (a second
				// click closes what the first opened).
				if (node.type === 'folder') {
					toggleExpanded(pathKey);
					return;
				}
				if (isExactActive(node.route)) {
					toggleExpanded(pathKey);
					return;
				}
				if (!expandedSet.has(pathKey)) toggleExpanded(pathKey);
				navigate(node.route);
				// Only the branch that navigates dismisses the drawer —
				// expanding a folder is still browsing.
				onClose?.();
			}}
			ontoggle={() => toggleExpanded(pathKey)}
			--font-weight="500"
			--bg-hover={hoverBg(node)}
			--bg-active={activeBg(node)}
			--bg-active-hover={activeHoverBg(node)}
			--r="6px"
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
			onclick={() => onClose?.()}
			--font-weight={leafWeight(node)}
			--bg-hover={hoverBg(node)}
			--bg-active={activeBg(node)}
			--bg-active-hover={activeHoverBg(node)}
			--r="6px"
		>
			{#snippet left()}<Icon name={iconName(node, false)} --w="14px" --h="14px" --fill={iconColor(node)} />{/snippet}
		</NavTree.Item>
	{/if}
{/snippet}

<style>
	.sdocs-sidebar {
		width: 260px;
		/* A fixed-width nav column, not a share of the row. Without this the
		   sidebar is an ordinary flex item that gives up width whenever the
		   content beside it refuses to get narrower — a wide table, an
		   unwrappable code line, a layout stage with a min-width. Those live on
		   DOC and LAYOUT pages, so the tree appeared to shrink for exactly
		   those kinds and not for component pages. */
		flex-shrink: 0;
		height: 100%;
		overflow-y: auto;
		border-right: 1px solid var(--color-base-200);
		background: var(--color-base-0);
		display: flex;
		flex-direction: column;
		font-family: var(--sans);
		font-size: 13px;
	}
	.sdocs-sidebar-search {
		padding: 8px;
		border-bottom: 1px solid var(--color-base-200);
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
		overflow-x: hidden;
		/* Reserve the scrollbar's width whether or not one is showing. Without
		   this the pane loses ~15px the moment the tree outgrows it, so every
		   row narrows and the longer labels start truncating — a reflow caused
		   by expanding a folder, not by anything about the item itself. */
		scrollbar-gutter: stable;
		padding: 8px;
		/* Root items stack with the same 1px gap group children get. */
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	/* ── Drawer head: sections + close ── */
	.sdocs-drawer-head {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 8px 8px 10px;
		border-bottom: 1px solid var(--color-base-200);
	}
	.sdocs-drawer-sections {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
	}
	.sdocs-drawer-section {
		display: flex;
		align-items: center;
		min-height: 36px;
		padding: 0 12px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-base-600);
		text-decoration: none;
	}
	.sdocs-drawer-section:hover {
		background: var(--color-base-100);
	}
	.sdocs-drawer-section.is-active {
		background: var(--color-action-100);
		color: var(--color-action-500);
	}
	.sdocs-drawer-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--color-base-500);
		cursor: pointer;
	}
	.sdocs-drawer-close:hover {
		background: var(--color-base-100);
		color: var(--color-base-900);
	}

	/* ── Drawer foot: the top bar's stylesheet picker ── */
	.sdocs-drawer-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px;
		border-top: 1px solid var(--color-base-200);
	}
	.sdocs-drawer-foot-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-base-400);
	}
	.sdocs-drawer-preset {
		flex: 1;
		min-height: 36px;
		padding: 4px 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.sdocs-drawer-preset.is-active {
		border-color: var(--color-action-500);
		color: var(--color-base-900);
	}

	.sdocs-drawer-css {
		flex: 1;
		min-width: 0;
		min-height: 36px;
		padding: 4px 8px;
		border: 1px solid var(--color-base-200);
		border-radius: 6px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		font-size: 13px;
	}

	/* ── Off-canvas below the breakpoint ──
	   Driven by the media query, not a class, so a prerendered page paints
	   with the drawer already parked instead of flashing a 260px column while
	   it waits for hydration. Only `is-open` comes from state. */
	@media (max-width: 860px) {
		.sdocs-sidebar {
			position: fixed;
			top: var(--sdocs-topbar-h, 48px);
			left: 0;
			bottom: 0;
			z-index: 50;
			width: min(320px, 86vw);
			transform: translateX(-100%);
			/* Parked off-screen it must also leave the tab order and the
			   accessibility tree — a translated element is still both. The
			   flip back to visible happens up front so the slide is watchable;
			   on the way out it waits for the slide to finish. */
			visibility: hidden;
			overscroll-behavior: contain;
			transition:
				transform 0.22s ease,
				visibility 0s linear 0.22s;
		}
		.sdocs-sidebar.is-open {
			transform: translateX(0);
			visibility: visible;
			box-shadow: 0 8px 32px rgb(0 0 0 / 0.18);
			transition:
				transform 0.22s ease,
				visibility 0s;
		}
		.sdocs-nav-scrim {
			position: fixed;
			top: var(--sdocs-topbar-h, 48px);
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 40;
			border: none;
			padding: 0;
			background: rgb(0 0 0 / 0.35);
			cursor: pointer;
		}
		.sdocs-sidebar-tree {
			font-size: 14px;
			/* A 28px row is a comfortable pointer target and a poor thumb one. */
			--item-h: 40px;
		}
		.sdocs-search-input {
			/* iOS Safari zooms the page for any font under 16px it focuses. */
			font-size: 16px;
			min-height: 40px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sdocs-sidebar {
			transition: none;
		}
	}
</style>
