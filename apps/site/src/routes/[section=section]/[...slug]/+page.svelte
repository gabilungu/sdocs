<script lang="ts">
	import { base } from '$app/paths';

	let { data } = $props();

	const docHref = (slug: string) => `${base}/${data.section}${slug ? `/${slug}` : ''}`;
</script>

<svelte:head>
	<title>{data.title} • sdocs</title>
</svelte:head>

<div class="docs">
	<aside class="sidebar">
		<nav aria-label="Documentation">
			{#each data.nav as section (section.slug)}
				<div class="section">
					<a class="section-link" class:active={data.slug === section.slug} href={docHref(section.slug)}>
						{section.title}
					</a>
					{#if section.children.length}
						<ul>
							{#each section.children as item (item.slug)}
								<li>
									<a class:active={data.slug === item.slug} href={docHref(item.slug)}>{item.title}</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</nav>
	</aside>

	<article class="prose">
		<h1>{data.title}</h1>
		{@html data.html}
		<nav class="pager" aria-label="Previous and next page">
			{#if data.prev}
				<a class="pager-link" href={docHref(data.prev.slug)}>
					<span class="pager-label">Previous</span>
					{data.prev.title}
				</a>
			{:else}
				<span></span>
			{/if}
			{#if data.next}
				<a class="pager-link next" href={docHref(data.next.slug)}>
					<span class="pager-label">Next</span>
					{data.next.title}
				</a>
			{/if}
		</nav>
	</article>

	<aside class="toc">
		{#if data.toc.length}
			<span class="toc-title">On this page</span>
			<ul>
				{#each data.toc as entry (entry.id)}
					<li class:nested={entry.depth === 3}>
						<a href="#{entry.id}">{entry.text}</a>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>
</div>

<style>
	.docs {
		flex: 1;
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr) 13rem;
		gap: 2.5rem;
		width: 100%;
		max-width: 82rem;
		margin: 0;
		padding: 0 1.5rem;
	}

	aside {
		position: sticky;
		top: var(--header-height);
		align-self: start;
		max-height: calc(100dvh - var(--header-height));
		overflow-y: auto;
		padding: 1.5rem 0 2rem;
		font-size: 0.9375rem;
	}

	.sidebar {
		border-right: 1px solid var(--border);
		padding-right: 1.25rem;
	}

	.section {
		margin-bottom: 1.25rem;
	}

	.section-link {
		display: block;
		font-weight: 600;
		color: var(--text);
	}

	.sidebar ul,
	.toc ul {
		list-style: none;
		margin: 0.375rem 0 0;
		padding: 0;
	}

	.sidebar li a {
		display: block;
		padding: 0.1875rem 0 0.1875rem 0.875rem;
		border-left: 1px solid var(--border);
		color: var(--text-soft);
	}

	.sidebar a:hover {
		color: var(--text);
		text-decoration: none;
	}

	.sidebar a.active {
		color: var(--accent);
	}

	.sidebar li a.active {
		border-left-color: var(--accent);
	}

	article {
		padding: 2rem 0 4rem;
		min-width: 0;
	}

	.toc-title {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-soft);
	}

	.toc li a {
		display: block;
		padding: 0.1875rem 0;
		color: var(--text-soft);
	}

	.toc li.nested a {
		padding-left: 0.875rem;
	}

	.toc a:hover {
		color: var(--text);
		text-decoration: none;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}

	.pager-link {
		display: flex;
		flex-direction: column;
		font-weight: 600;
	}

	.pager-link.next {
		text-align: right;
	}

	.pager-label {
		font-size: 0.8125rem;
		font-weight: 400;
		color: var(--text-soft);
	}

	@media (max-width: 64rem) {
		.docs {
			grid-template-columns: 15rem minmax(0, 1fr);
		}

		.toc {
			display: none;
		}
	}

	@media (max-width: 48rem) {
		.docs {
			grid-template-columns: minmax(0, 1fr);
		}

		.sidebar {
			position: static;
			max-height: none;
			border-right: none;
			border-bottom: 1px solid var(--border);
			padding: 1.5rem 0 1rem;
		}
	}
</style>
