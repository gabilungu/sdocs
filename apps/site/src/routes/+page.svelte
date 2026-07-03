<script lang="ts">
	import { base } from '$app/paths';

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
		<a class="primary" href="{base}/explorer/getting-started">Get started</a>
		<a class="secondary" href="{base}/explorer">Documentation</a>
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
	<a class="card" href="{base}/explorer">
		<h3>Explorer</h3>
		<p>
			The interactive component browser built from your <code>.sdoc</code> files — live
			previews, prop controls, theming, and search.
		</p>
		<span class="more">Explore the docs →</span>
	</a>
	<a class="card" href="{base}/cli">
		<h3>CLI</h3>
		<p>
			<code>npx sdocs run</code> starts the Explorer in any project with zero install, and
			<code>sdocs build</code> ships it as a static site.
		</p>
		<span class="more">Command reference →</span>
	</a>
	<a class="card" href="{base}/extension">
		<h3>VS Code Extension</h3>
		<p>
			Full Svelte IntelliSense in <code>.sdoc</code> files, plus a Projects view that runs
			and shows your docs inside the editor.
		</p>
		<span class="more">Extension guide →</span>
	</a>
</section>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
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

	.actions a {
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-weight: 600;
	}

	.actions a:hover {
		text-decoration: none;
		filter: brightness(1.1);
	}

	.primary {
		background: var(--accent);
		color: #fff;
	}

	.secondary {
		border: 1px solid var(--border);
		color: var(--text);
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

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
	}

	.card:hover {
		text-decoration: none;
		border-color: var(--accent);
	}

	.card h3 {
		margin: 0;
		font-size: 1.0625rem;
	}

	.card p {
		margin: 0;
		flex: 1;
		font-size: 0.9375rem;
		color: var(--text-soft);
	}

	.card .more {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--accent);
	}

	@media (max-width: 48rem) {
		.example,
		.entities {
			grid-template-columns: 1fr;
		}
	}
</style>
