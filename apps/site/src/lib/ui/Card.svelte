<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	interface Props {
		/** Where the whole card links to */
		href: string;
		/** Card heading */
		title: string;
		/** Text of the call-to-action line at the bottom */
		linkText?: string;
		/** Icon area, rendered in a tinted tile above the heading */
		icon?: Snippet;
		children: Snippet;
	}

	let { href, title, linkText = 'Learn more', icon, children }: Props = $props();
</script>

<a class="card" {href}>
	{#if icon}
		<span class="card-icon">{@render icon()}</span>
	{/if}
	<h3>{title}</h3>
	<p>{@render children()}</p>
	<span class="more">{linkText} <ArrowRight size={15} /></span>
</a>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.25rem;
		border: 1px solid var(--border, oklch(0.92 0.004 286.32));
		border-radius: 10px;
		color: var(--text, oklch(0.21 0.006 285.885));
		text-decoration: none;
	}

	.card:hover {
		text-decoration: none;
		border-color: var(--accent, oklch(0.546 0.245 262.881));
	}

	.card-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 8px;
		background: var(--bg-code, oklch(0.967 0.001 286.375));
		color: var(--accent, oklch(0.546 0.245 262.881));
	}

	h3 {
		margin: 0;
		font-size: 1.0625rem;
	}

	p {
		margin: 0;
		flex: 1;
		font-size: 0.9375rem;
		color: var(--text-soft, oklch(0.552 0.016 285.938));
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--accent, oklch(0.546 0.245 262.881));
	}
</style>
