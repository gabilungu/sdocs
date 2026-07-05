<script lang="ts">
	import type { Component } from 'svelte';
	import type { DocEntry } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import PreviewFrame from './PreviewFrame.svelte';
	import { displayTitle } from '../tree-builder.js';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
		/** Native page components from `virtual:sdocs`, keyed by contentKey. */
		pageModules?: Record<string, () => Promise<{ default: unknown }>>;
	}

	let { doc, activeStylesheet, pageModules = {} }: Props = $props();

	const meta = $derived(doc.meta);
	const toc = $derived(doc.toc ?? []);

	// The page body compiles to its own component (prose + islands + example
	// markers); it renders here, natively — sdocs styling, no iframe. Only the
	// [example] stages load the project's css, each in its own PreviewFrame.
	let PageComponent = $state<Component | null>(null);
	let container: HTMLElement | undefined = $state();

	$effect(() => {
		const load = doc.contentKey ? pageModules[doc.contentKey] : undefined;
		PageComponent = null;
		if (!load) return;
		let stale = false;
		load().then((mod) => {
			if (!stale) PageComponent = mod.default as Component;
		});
		return () => {
			stale = true;
		};
	});

	function scrollToHeading(id: string) {
		container?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth' });
	}
</script>

{#snippet exampleFrame(index: number)}
	{@const example = doc.examples?.[index]}
	{#if example}
		<div class="sdocs-page-example">
			{#if example.name}
				<h3 class="sdocs-example-title">
					<Icon name="bookmark" --w="14px" --h="14px" --fill="var(--color-example-500)" />
					{example.name}
				</h3>
			{/if}
			<div class="sdocs-panels">
				<div class="sdocs-preview-wrapper">
					<PreviewFrame src={example.previewUrl ?? ''} {activeStylesheet} />
				</div>
				<CollapsiblePanel title="Code" defaultExpanded={false}>
					<div class="sdocs-code-block">{@html example.highlightedHtml ?? ''}</div>
				</CollapsiblePanel>
			</div>
		</div>
	{/if}
{/snippet}

<div class="sdocs-page-view" style:padding={doc.padding}>
	<div class="sdocs-page-main" style:max-width={doc.maxWidth}>
		<!-- Header -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
			{#if meta.description}
				<p class="sdocs-view-description">{meta.description}</p>
			{/if}
		</div>

		<!-- Content -->
		<div class="sdocs-page-content" bind:this={container}>
			{#if PageComponent}
				<PageComponent __sdocsExample={exampleFrame} />
			{/if}
		</div>
	</div>

	<!-- Table of Contents -->
	{#if toc.length > 0 && doc.showToc !== false}
		<aside class="sdocs-toc">
			<h3 class="sdocs-toc-title">On this page</h3>
			<nav>
				<ul class="sdocs-toc-list">
					{#each toc as heading (heading.id)}
						<li class="sdocs-toc-item" style:padding-left="{(heading.level - 2) * 12}px">
							<button
								class="sdocs-toc-link"
								onclick={() => scrollToHeading(heading.id)}
							>
								{heading.text}
							</button>
						</li>
					{/each}
				</ul>
			</nav>
		</aside>
	{/if}
</div>

<style>
	.sdocs-page-view {
		display: flex;
		gap: 24px;
		/* padding comes from the doc entry (config/entity cascade) */
		font-family: var(--sans);
	}
	.sdocs-page-main {
		flex: 1;
		min-width: 0;
	}
	.sdocs-view-header {
		margin-bottom: 24px;
	}
	.sdocs-view-title {
		font-size: 24px;
		font-weight: 700;
		color: var(--color-base-900);
		margin: 0;
	}
	.sdocs-view-description {
		font-size: 14px;
		color: var(--color-base-500);
		margin: 6px 0 0;
	}

	/* ── Page prose: the docs app's own typography ── */
	.sdocs-page-content {
		font-size: 14px;
		line-height: 1.7;
		color: var(--color-base-800);
	}
	.sdocs-page-content :global(h1),
	.sdocs-page-content :global(h2),
	.sdocs-page-content :global(h3),
	.sdocs-page-content :global(h4),
	.sdocs-page-content :global(h5),
	.sdocs-page-content :global(h6) {
		color: var(--color-base-900);
		font-weight: 650;
		line-height: 1.3;
		margin: 1.6em 0 0.5em;
		scroll-margin-top: 16px;
	}
	.sdocs-page-content :global(h1) { font-size: 22px; }
	.sdocs-page-content :global(h2) { font-size: 18px; }
	.sdocs-page-content :global(h3) { font-size: 15px; }
	.sdocs-page-content :global(h4),
	.sdocs-page-content :global(h5),
	.sdocs-page-content :global(h6) { font-size: 14px; }
	.sdocs-page-content :global(h1:first-child),
	.sdocs-page-content :global(h2:first-child),
	.sdocs-page-content :global(h3:first-child) {
		margin-top: 0;
	}
	.sdocs-page-content :global(p) {
		margin: 0.7em 0;
	}
	.sdocs-page-content :global(a) {
		color: var(--color-action-500, var(--color-base-900));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.sdocs-page-content :global(ul),
	.sdocs-page-content :global(ol) {
		margin: 0.7em 0;
		padding-left: 1.6em;
	}
	.sdocs-page-content :global(li) {
		margin: 0.25em 0;
	}
	.sdocs-page-content :global(blockquote) {
		margin: 0.9em 0;
		padding: 2px 16px;
		border-left: 3px solid var(--color-base-200);
		color: var(--color-base-600);
	}
	.sdocs-page-content :global(hr) {
		border: none;
		border-top: 1px solid var(--color-base-200);
		margin: 24px 0;
	}
	.sdocs-page-content :global(code) {
		font-family: var(--mono);
		font-size: 0.92em;
	}
	.sdocs-page-content :global(:not(pre) > code) {
		background: var(--color-base-100);
		border-radius: 4px;
		padding: 1px 5px;
	}
	.sdocs-page-content :global(pre) {
		margin: 0.9em 0;
		padding: 12px;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
		tab-size: 4;
	}
	.sdocs-page-content :global(table) {
		border-collapse: collapse;
		margin: 0.9em 0;
	}
	.sdocs-page-content :global(th),
	.sdocs-page-content :global(td) {
		border: 1px solid var(--color-base-200);
		padding: 6px 12px;
		text-align: left;
	}
	.sdocs-page-content :global(th) {
		background: var(--color-base-50);
		font-weight: 600;
	}
	.sdocs-page-content :global(img) {
		max-width: 100%;
	}

	/* ── Example stages in the page flow ── */
	.sdocs-page-example {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 16px 0;
	}
	.sdocs-example-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 15px;
		font-weight: 600;
		color: var(--color-base-800);
		margin: 0;
	}
	.sdocs-panels {
		display: flex;
		flex-direction: column;
		gap: 1px;
		border: 1px solid var(--color-base-200);
		background: var(--color-base-200);
		border-radius: 8px;
		overflow: hidden;
	}
	.sdocs-preview-wrapper {
		/* stage padding lives inside the iframe (config/block cascade) */
		background: var(--color-base-0);
	}
	.sdocs-code-block {
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
		tab-size: 4;
	}
	.sdocs-code-block :global(pre) {
		margin: 0;
		padding: 12px;
		border-radius: 6px;
		overflow-x: auto;
	}
	.sdocs-code-block :global(code) {
		font-family: var(--mono);
	}

	/* ── Table of contents ── */
	.sdocs-toc {
		width: 200px;
		flex-shrink: 0;
		position: sticky;
		top: 24px;
		align-self: flex-start;
	}
	.sdocs-toc-title {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-base-400);
		margin: 0 0 8px;
	}
	.sdocs-toc-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.sdocs-toc-item {
		margin: 0;
	}
	.sdocs-toc-link {
		display: block;
		padding: 4px 0;
		font-size: 13px;
		color: var(--color-base-500);
		text-decoration: none;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}
	.sdocs-toc-link:hover {
		color: var(--color-action-500);
	}
</style>
