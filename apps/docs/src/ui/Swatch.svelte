<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * @cssvar {color} --accent - Accent used for the fill and the ring.
	 */
	interface Props extends HTMLAttributes<HTMLSpanElement> {
		/** Swatch label. */
		label?: string;
		/** Size — a named step, a number (px), or any CSS length. */
		size?: 'sm' | 'md' | number | string;
	}

	let { label = 'Swatch', size = 'md', class: className, ...rest }: Props = $props();

	const resolved = $derived(
		size === 'sm' ? '24px' : size === 'md' ? '36px' : typeof size === 'number' ? `${size}px` : size,
	);
</script>

<span class={['Swatch', className]} style:--size={resolved} {...rest}>{label}</span>

<style>
	.Swatch {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		min-height: var(--size, 36px);
		border-radius: 8px;
		font: 13px/1.2 system-ui, sans-serif;
		/* The same var with two different fallbacks — the docs report "Mixed" */
		background: var(--accent, #fde68a);
		border: 2px solid var(--accent, #f59e0b);
	}
</style>
