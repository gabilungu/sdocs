<script lang="ts">
	import { base } from '$app/paths';
	import PanelsTopLeft from '@lucide/svelte/icons/panels-top-left';
	import Terminal from '@lucide/svelte/icons/terminal';
	import Blocks from '@lucide/svelte/icons/blocks';
	import LinkButton from '$lib/ui/LinkButton.svelte';
	import Card from '$lib/ui/Card.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>sdocs — documentation tool for Svelte 5 components</title>
	<meta name="description" content="A lightweight documentation tool for Svelte 5 components." />
</svelte:head>

<section class="hero">
	<img src="{base}/favicon.svg" alt="sdocs logo" width="96" height="96" />
	<h1>sdocs</h1>
	<p class="tagline">A lightweight documentation tool for Svelte 5 components.</p>
	<pre>npm install -D sdocs</pre>
	<div class="actions">
		<LinkButton href="{base}/explorer/getting-started">Get started</LinkButton>
		<LinkButton href="{base}/explorer" variant="secondary">Documentation</LinkButton>
	</div>
</section>

<section class="example">
	<div class="example-copy">
		<h2>One small file per component</h2>
		<p>
			Drop a <code>.sdoc</code> file next to a component and it appears in an interactive
			explorer: live preview, controls generated from <code>meta.args</code>, and a prop
			table extracted from the component itself.
		</p>
		<p>
			No stories API to learn — a doc file <em>is</em> a Svelte file, with snippets for
			every state you want to show.
		</p>
	</div>
	<div class="example-code">
		{@html data.example}
	</div>
</section>

<section class="entities">
	<Card href="{base}/explorer" title="Explorer" linkText="Explore the docs">
		{#snippet icon()}<PanelsTopLeft size={22} />{/snippet}
		The interactive component browser built from your <code>.sdoc</code> files — live
		previews, prop controls, theming, and search.
	</Card>
	<Card href="{base}/cli" title="CLI" linkText="Command reference">
		{#snippet icon()}<Terminal size={22} />{/snippet}
		<code>npx sdocs run</code> starts the Explorer in any project with zero install, and
		<code>sdocs build</code> ships it as a static site.
	</Card>
	<Card href="{base}/extension" title="VS Code Extension" linkText="Extension guide">
		{#snippet icon()}<Blocks size={22} />{/snippet}
		Full Svelte IntelliSense in <code>.sdoc</code> files, plus a Projects view that runs
		and shows your docs inside the editor.
	</Card>
</section>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		max-width: 62rem;
		margin: 0 auto;
		padding: 4rem 1.5rem 3rem;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: 3rem;
		line-height: 1.1;
	}

	.tagline {
		margin: 0;
		font-size: 1.25rem;
		color: var(--text-soft);
		max-width: 32rem;
	}

	.hero pre {
		margin: 1.5rem 0 0;
		padding: 0.75rem 1.5rem;
		background: var(--bg-code);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.example {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 2.5rem;
		align-items: center;
		width: 100%;
		max-width: 62rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.example-copy h2 {
		margin: 0 0 0.75rem;
		font-size: 1.5rem;
	}

	.example-copy p {
		margin: 0 0 0.75rem;
		color: var(--text-soft);
	}

	.example-code :global(pre) {
		margin: 0;
		padding: 1rem 1.25rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow-x: auto;
		font-size: 0.8125rem;
		line-height: 1.55;
	}

	.entities {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.25rem;
		width: 100%;
		max-width: 62rem;
		margin: 0 auto;
		padding: 1rem 1.5rem 4rem;
	}

	@media (max-width: 48rem) {
		.example,
		.entities {
			grid-template-columns: 1fr;
		}
	}
</style>
