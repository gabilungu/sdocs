<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * @cssvar {shorthand} --p - Padding
	 * @cssvar {length} --r - Border radius
	 * @cssvar {length} --h - Height
	 * @cssvar {length} --gap - Gap between left, label, right
	 * @cssvar {color} --bg - Background color
	 * @cssvar {color} --bg-hover - Background on hover
	 * @cssvar {color} --bg-active - Background when pressed
	 * @cssvar {color} --border - Border color
	 * @cssvar {color} --color - Text/icon color
	 * @cssvar {color} --color-hover - Text/icon color on hover
	 * @cssvar {string} --font-weight - Font weight
	 * @cssvar {length} --font-size - Font size
	 */
	interface Props {
		onclick?: (e: MouseEvent) => void;
		title?: string;
		disabled?: boolean;
		left?: Snippet;
		right?: Snippet;
		children?: Snippet;
		class?: string;
	}

	let {
		onclick,
		title,
		disabled = false,
		left,
		right,
		children,
		class: className = '',
	}: Props = $props();
</script>

<button class="Button {className}" {onclick} {title} {disabled}>
	{#if left}<span class="Button-left">{@render left()}</span>{/if}
	{#if children}<span class="Button-label">{@render children()}</span>{/if}
	{#if right}<span class="Button-right">{@render right()}</span>{/if}
</button>

<style>
	.Button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--gap, 6px);
		height: var(--h, auto);
		padding: var(--p, 4px 8px);
		border-radius: var(--r, 4px);
		border: 1px solid var(--border, var(--color-base-200));
		background: var(--bg, var(--color-base-0));
		color: var(--color, var(--color-base-600));
		font: inherit;
		font-size: var(--font-size, inherit);
		font-weight: var(--font-weight, inherit);
		cursor: pointer;
		line-height: 1;
		box-sizing: border-box;
	}

	.Button:hover:not(:disabled) {
		background: var(--bg-hover, var(--color-base-100));
		color: var(--color-hover, var(--color, var(--color-base-600)));
	}

	.Button:active:not(:disabled) {
		background: var(--bg-active, var(--bg-hover, var(--color-base-100)));
	}

	.Button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.Button-left,
	.Button-right {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
	}

	.Button-label {
		display: inline-flex;
		align-items: center;
	}
</style>
