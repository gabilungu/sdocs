<!--
@component
A linked card: an icon tile, a line of body text, and a call-to-action. The
whole card is the link, so nothing inside it should be clickable on its own.
-->
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
		border: 1px solid var(--border, hsl(240 6% 90%));
		border-radius: 10px;
		color: var(--text, hsl(240 6% 10%));
		text-decoration: none;
	}

	.card:hover {
		text-decoration: none;
		border-color: var(--accent, hsl(221 83% 53%));
	}

	.card-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 8px;
		background: var(--bg-code, hsl(240 5% 96%));
		color: var(--accent, hsl(221 83% 53%));
	}

	h3 {
		margin: 0;
		font-size: 1.0625rem;
	}

	p {
		margin: 0;
		flex: 1;
		font-size: 0.9375rem;
		color: var(--text-soft, hsl(240 4% 46%));
	}

	.more {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--accent, hsl(221 83% 53%));
	}
</style>
