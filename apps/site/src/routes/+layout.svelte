<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { SECTIONS } from '$lib/sections';
	import '../app.css';

	let { children } = $props();

	const isActive = (slug: string) => page.url.pathname.startsWith(`${base}/${slug}`);
</script>

<div class="app">
	<header>
		<div class="header-left">
			<a class="brand" href="{base}/">
				<img src="{base}/favicon.svg" alt="" width="26" height="26" />
				<span>sdocs</span>
			</a>
			<nav>
				{#each SECTIONS as section (section.slug)}
					<a href="{base}/{section.slug}" class:active={isActive(section.slug)}>{section.title}</a>
				{/each}
			</nav>
		</div>
		<nav>
			<a href="https://github.com/gabilungu/sdocs">GitHub</a>
		</nav>
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--header-height);
		padding: 0 1.5rem;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--text);
	}

	.brand:hover {
		text-decoration: none;
	}

	nav {
		display: flex;
		gap: 1.25rem;
	}

	nav a {
		color: var(--text-soft);
		font-weight: 500;
	}

	nav a:hover {
		color: var(--text);
		text-decoration: none;
	}

	nav a.active {
		color: var(--text);
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
</style>
