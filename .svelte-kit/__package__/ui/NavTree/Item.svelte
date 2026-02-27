<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '../Icon/index.js';

	/**
	 * @cssvar {shorthand} --p - Padding
	 * @cssvar {shorthand} --m - Margin
	 * @cssvar {length} --r - Border radius
	 * @cssvar {shorthand} --b - Border
	 * @cssvar {color} --bg - Background color
	 * @cssvar {color} --bg-active - Background when active
	 * @cssvar {color} --bg-active-hover - Background when active and hovered
	 * @cssvar {color} --bg-hover - Background on hover
	 * @cssvar {color} --expander-color - Expander icon color
	 * @cssvar {color} --expander-color-active - Expander icon color when active
	 * @cssvar {color} --expander-color-hover - Expander icon color on hover
	 * @cssvar {length} --expander-size - Expander icon size
	 * @cssvar {color} --font-color - Text color
	 * @cssvar {color} --font-color-active - Text color when active
	 * @cssvar {color} --font-color-hover - Text color on hover
	 * @cssvar {string} --font-weight - Font weight
	 */
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
	}: Props = $props();

	const isFolder = $derived(!!children);

	function toggle() {
		expanded = !expanded;
	}
</script>

{#snippet content()}
	{#if left}<span class="NavTree-left">{@render left()}</span>{/if}
	<span class="NavTree-item-label">{label}</span>
	{#if right}<span class="NavTree-right">{@render right()}</span>{/if}
	<span class="NavTree-chevron" class:visible={isFolder}>
		<Icon name={expanded ? 'chevron-down' : 'chevron-right'} --w="var(--expander-size, 14px)" --h="var(--expander-size, 14px)" --fill="var(--expander-color, var(--color-base-300))" />
	</span>
{/snippet}

{#if isFolder}
	<div class="NavTree-item-wrapper {className}">
		<button class="NavTree-item" class:active onclick={onclick ?? toggle}>
			{@render content()}
		</button>
		{#if expanded}
			<div class="NavTree-children">
				{@render children()}
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
		padding: var(--p, 0 12px);
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

	.NavTree-item-label {
		flex: 1;
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

	.NavTree-chevron {
		display: inline-flex;
		align-items: center;
		width: var(--expander-size, 14px);
		color: var(--expander-color, var(--color-base-300));
		flex-shrink: 0;
		visibility: hidden;
	}

	.NavTree-chevron.visible {
		visibility: visible;
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
