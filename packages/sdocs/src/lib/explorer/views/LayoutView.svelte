<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import PreviewFrame from './PreviewFrame.svelte';

	interface Props {
		doc: DocEntry;
		activeStylesheet?: string;
	}

	let { doc, activeStylesheet }: Props = $props();

	const contentSnippet = $derived(doc.content);
</script>

<div class="sdocs-layout-view">
	{#if contentSnippet}
		<PreviewFrame src={contentSnippet.previewUrl} {activeStylesheet} fullHeight />
	{/if}
</div>

<style>
	.sdocs-layout-view {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
</style>
