<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { SECTIONS } from '$lib/sections';
	import Package from '@lucide/svelte/icons/package';
	import Blocks from '@lucide/svelte/icons/blocks';
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
		<nav class="external">
			<a
				href="https://www.npmjs.com/package/sdocs"
				target="_blank"
				rel="noopener"
				title="sdocs on npm"
				aria-label="sdocs on npm"
			>
				<Package size={20} />
			</a>
			<a
				href="https://marketplace.visualstudio.com/items?itemName=gabilungu.sdocs"
				target="_blank"
				rel="noopener"
				title="VS Code extension on the Marketplace"
				aria-label="VS Code extension on the Marketplace"
			>
				<Blocks size={20} />
			</a>
			<a
				href="https://github.com/gabilungu/sdocs"
				target="_blank"
				rel="noopener"
				title="Source on GitHub"
				aria-label="Source on GitHub"
			>
				<!-- GitHub mark (lucide no longer ships brand icons) -->
				<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
					/>
				</svg>
			</a>
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

	nav.external {
		gap: 0.875rem;
	}

	nav.external a {
		display: inline-flex;
		align-items: center;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
</style>
