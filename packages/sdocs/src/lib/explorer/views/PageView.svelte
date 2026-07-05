<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import PreviewFrame from './PreviewFrame.svelte';
	import { displayTitle } from '../tree-builder.js';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
	}

	let { doc, activeStylesheet }: Props = $props();

	const meta = $derived(doc.meta);
	const contentSnippet = $derived(doc.content);
	const toc = $derived(doc.toc ?? []);

	function scrollToHeading(id: string) {
		const iframe = document.querySelector('.sdocs-page-content .sdocs-iframe') as HTMLIFrameElement;
		if (iframe?.contentWindow) {
			iframe.contentWindow.postMessage({ type: 'sdocs:scroll-to', id }, '*');
		}
	}
</script>

<div class="sdocs-page-view">
	<div class="sdocs-page-main" style:max-width={doc.maxWidth}>
		<!-- Header -->
		<div class="sdocs-view-header">
			<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
			{#if meta.description}
				<p class="sdocs-view-description">{meta.description}</p>
			{/if}
		</div>

		<!-- Content -->
		{#if contentSnippet}
			<div class="sdocs-page-content">
				<PreviewFrame src={contentSnippet.previewUrl} {activeStylesheet} />
			</div>
		{/if}
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
		padding: 24px 32px;
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
	.sdocs-page-content {
		flex: 1;
	}
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
