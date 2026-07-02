<script lang="ts">
	import { base } from '$app/paths';
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
		<a class="primary" href="{base}/docs/getting-started">Get started</a>
		<a class="secondary" href="{base}/docs">Documentation</a>
	</div>
</section>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: 0.5rem;
		padding: 4rem 1.5rem;
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

	pre {
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
</style>
