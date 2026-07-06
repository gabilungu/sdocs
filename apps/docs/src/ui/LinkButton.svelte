<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Where the button links to */
		href: string;
		/** Visual weight */
		variant?: 'primary' | 'secondary';
		/** Open in a new tab */
		external?: boolean;
		children: Snippet;
	}

	let { href, variant = 'primary', external = false, children }: Props = $props();
</script>

<a
	{href}
	class="link-button {variant}"
	target={external ? '_blank' : undefined}
	rel={external ? 'noopener' : undefined}
>
	{@render children()}
</a>

<style>
	.link-button {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-weight: 600;
		text-decoration: none;
	}

	.link-button:hover {
		text-decoration: none;
		filter: brightness(1.1);
	}

	.primary {
		background: var(--accent, hsl(221 83% 53%));
		color: #fff;
	}

	.secondary {
		border: 1px solid var(--border, hsl(240 6% 90%));
		color: var(--text, hsl(240 6% 10%));
	}
</style>
