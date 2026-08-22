<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import PreviewFrame from './PreviewFrame.svelte';
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import { copyCode } from '../copy-code.svelte.js';
	import { displayTitle } from '../tree-builder.js';
	import { renderInlineMarkdown } from './format.js';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
	}

	let { doc, activeStylesheet }: Props = $props();

	const meta = $derived(doc.meta);
	const content = $derived(doc.content);
</script>

<!--
	A composition, documented as one thing.

	Deliberately the smallest of the views: a title, a description, the stage,
	and the source. A [SHOWCASE] earns its tab strip and controls panel because
	it documents one component's API; a pattern has no single API to document,
	so the same furniture here would only suggest one exists.
-->
<div class="sdocs-pattern-view">
	<div class="sdocs-view-header">
		<h1 class="sdocs-view-title">{displayTitle(meta.title)}</h1>
		{#if meta.description}
			<p class="sdocs-view-description">{@html renderInlineMarkdown(meta.description)}</p>
		{/if}
	</div>

	{#if content?.previewUrl}
		<div class="sdocs-pattern-stage">
			<PreviewFrame src={content.previewUrl} {activeStylesheet} stage={content} />
		</div>

		{#if content.highlightedHtml}
			<div class="sdocs-pattern-code">
				<CollapsiblePanel title="Code" defaultExpanded={false} flush>
					<div class="sdocs-code-block" {@attach copyCode()}>
						{@html content.highlightedHtml}
					</div>
				</CollapsiblePanel>
			</div>
		{/if}
	{/if}
</div>

<style>
	.sdocs-pattern-view {
		padding: 24px;
		box-sizing: border-box;
		font-family: var(--sans);
	}
	.sdocs-view-header {
		margin-bottom: 20px;
	}
	.sdocs-view-title {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		color: var(--color-base-900);
	}
	.sdocs-view-description {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--color-base-600);
	}
	.sdocs-pattern-stage {
		border: 1px solid var(--color-base-150);
		border-radius: 8px;
		overflow: hidden;
		background: var(--color-base-0);
	}
	.sdocs-pattern-code {
		margin-top: 12px;
	}
</style>
