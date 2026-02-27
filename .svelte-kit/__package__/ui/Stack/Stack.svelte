<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * @cssvar {string} --direction - Flex direction (row | column)
	 * @cssvar {length} --gap - Gap between items
	 * @cssvar {string} --align - Align items
	 * @cssvar {string} --justify - Justify content
	 * @cssvar {string} --wrap - Flex wrap
	 * @cssvar {shorthand} --p - Padding
	 * @cssvar {color} --bg - Background color
	 * @cssvar {length} --r - Border radius
	 * @cssvar {shorthand} --b - Border
	 */
	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<div class="Stack {className}">
	{@render children()}
</div>

<style>
	.Stack {
		display: flex;
		flex-direction: var(--direction, column);
		gap: var(--gap, 0px);
		align-items: var(--align, stretch);
		justify-content: var(--justify, flex-start);
		flex-wrap: var(--wrap, nowrap);
		padding: var(--p, 0);
		background: var(--bg, transparent);
		border-radius: var(--r, 0);
		border: var(--b, none);
		box-sizing: border-box;
	}
</style>
