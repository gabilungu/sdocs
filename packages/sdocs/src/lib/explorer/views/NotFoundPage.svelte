<script lang="ts">
	import { routeHref } from '../router.svelte.js';

	interface Props {
		/** The route segments that resolved to nothing. */
		route: string[];
		/** Sections to offer as a way back, in sidebar order. A section with no
		 * `firstRoute` holds nothing to link to and is skipped. */
		sections: { slug: string; title: string; firstRoute: string[] | null }[];
	}

	let { route, sections }: Props = $props();

	const path = $derived('/' + route.join('/'));
	const reachable = $derived(sections.filter((s) => s.firstRoute));
</script>

<div class="sdocs-notfound">
	<p class="sdocs-notfound-code">404</p>
	<h1 class="sdocs-notfound-title">No page at this address</h1>
	<p class="sdocs-notfound-path"><code>{path}</code></p>
	<p class="sdocs-notfound-hint">
		The link may be out of date, or the entity may have been renamed — an entity's address comes
		from its <code>title</code>, so renaming one moves its page.
	</p>
	<nav class="sdocs-notfound-links" aria-label="Where to go instead">
		<a href={routeHref([])}>Home</a>
		{#each reachable as section (section.slug)}
			<a href={routeHref(section.firstRoute ?? [])}>{section.title}</a>
		{/each}
	</nav>
</div>

<style>
	.sdocs-notfound {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: 400px;
		padding: 24px;
		box-sizing: border-box;
		text-align: center;
		font-family: var(--sans);
	}
	/* Big enough to read as the reason for the page, quiet enough not to be
	   the loudest thing on it — the way back matters more than the number. */
	.sdocs-notfound-code {
		margin: 0;
		font-size: 64px;
		font-weight: 700;
		line-height: 1;
		color: var(--color-base-200);
	}
	.sdocs-notfound-title {
		margin: 16px 0 0;
		font-size: 24px;
		font-weight: 600;
		color: var(--color-base-900);
	}
	.sdocs-notfound-path {
		margin: 12px 0 0;
	}
	.sdocs-notfound-path code {
		font-family: var(--mono, monospace);
		font-size: 14px;
		padding: 3px 8px;
		border-radius: 4px;
		background: var(--color-base-50);
		color: var(--color-base-700);
		word-break: break-all;
	}
	.sdocs-notfound-hint {
		margin: 16px 0 0;
		max-width: 46ch;
		font-size: 14px;
		line-height: 1.6;
		color: var(--color-base-500);
	}
	.sdocs-notfound-hint code {
		font-family: var(--mono, monospace);
		font-size: 13px;
	}
	.sdocs-notfound-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px 20px;
		margin-top: 28px;
	}
	.sdocs-notfound-links a {
		font-size: 14px;
		color: var(--color-action-500);
		text-decoration: none;
	}
	.sdocs-notfound-links a:hover,
	.sdocs-notfound-links a:focus-visible {
		text-decoration: underline;
	}
</style>
