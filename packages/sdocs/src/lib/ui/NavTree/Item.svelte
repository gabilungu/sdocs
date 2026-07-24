<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '../Icon/index.js';

	interface Props {
		label: string;
		href?: string;
		active?: boolean;
		left?: Snippet;
		right?: Snippet;
		expanded?: boolean;
		children?: Snippet;
		class?: string;
		onclick?: () => void;
		/** Chevron click — defaults to toggling `expanded` internally. */
		ontoggle?: () => void;
	}

	let {
		label,
		href,
		active = false,
		left,
		right,
		expanded = $bindable(false),
		children,
		class: className = '',
		onclick,
		ontoggle,
	}: Props = $props();

	const isFolder = $derived(!!children);

	function toggle() {
		expanded = !expanded;
	}
</script>

{#snippet content()}
	{#if left}<span class="NavTree-left">{@render left()}</span>{/if}
	<span class="NavTree-item-label" title={label}>{label}</span>
	{#if right}<span class="NavTree-right">{@render right()}</span>{/if}
{/snippet}

{#if isFolder}
	<div class="NavTree-item-wrapper {className}">
		<!-- Two independent controls in one row: the main button (the page)
		     and the chevron (the expand toggle) with its own hover/press. -->
		<div class="NavTree-item NavTree-row" class:active>
			<button class="NavTree-main" onclick={onclick ?? toggle}>
				{@render content()}
			</button>
			<button
				class="NavTree-chevron-btn"
				aria-label={expanded ? 'Collapse' : 'Expand'}
				aria-expanded={expanded}
				onclick={ontoggle ?? toggle}
			>
				<Icon name={expanded ? 'chevron-down' : 'chevron-right'} --w="var(--expander-size, 14px)" --h="var(--expander-size, 14px)" --fill="var(--expander-color, var(--color-base-300))" />
			</button>
		</div>
		{#if expanded}
			<div class="NavTree-children">
				{@render children?.()}
			</div>
		{/if}
	</div>
{:else if href}
	<a {href} class="NavTree-item {className}" class:active {onclick}>
		{@render content()}
	</a>
{:else}
	<button class="NavTree-item {className}" class:active {onclick}>
		{@render content()}
	</button>
{/if}

<style>
	.NavTree-item {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		height: 28px;
		padding: var(--p, 0 5px 0 8px);
		margin: var(--m, 0);
		border-radius: var(--r, 0);
		border: var(--b, none);
		font: inherit;
		color: var(--font-color, inherit);
		font-weight: var(--font-weight, inherit);
		background: var(--bg, none);
		text-decoration: none;
		cursor: pointer;
		text-align: left;
		box-sizing: border-box;
	}

	.NavTree-item:hover {
		background: var(--bg-hover, var(--color-base-150));
		color: var(--font-color-hover, inherit);
		--expander-color: var(--expander-color-hover, var(--color-base-400));
	}

	.NavTree-item.active {
		background: var(--bg-active, var(--color-base-100));
		color: var(--font-color-active, inherit);
		font-weight: 500;
		--expander-color: var(--expander-color-active, var(--color-base-400));
	}

	.NavTree-item.active:hover {
		background: var(--bg-active-hover, var(--color-base-150));
		--expander-color: var(--expander-color-hover, var(--color-base-500));
	}

	/* The main button fills the row; the chevron rides beside it. */
	.NavTree-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		height: 100%;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.NavTree-item-label {
		flex: 1;
		/* A long name trims to an ellipsis instead of wrapping or pushing the
		   chevron out; the title attribute keeps the full name reachable. */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.NavTree-left {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
	}

	.NavTree-right {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
	}

	/* The chevron: a rounded-square toggle with its own hover/press. */
	.NavTree-chevron-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: none;
		cursor: pointer;
		transition: background-color 0.1s ease;
	}
	.NavTree-chevron-btn:hover {
		background: rgb(255 255 255 / 0.5);
	}
	.NavTree-chevron-btn:active {
		background: rgb(255 255 255 / 0.7);
	}

	.NavTree-item-wrapper {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.NavTree-children {
		padding-left: 16px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
</style>
