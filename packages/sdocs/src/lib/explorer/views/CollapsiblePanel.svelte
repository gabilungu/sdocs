<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '../../ui/Icon/index.js';

	interface Props {
		title: string;
		defaultExpanded?: boolean;
		/** No padding around the body — content (code blocks) sits edge to edge. */
		flush?: boolean;
		children: Snippet;
	}

	let { title, defaultExpanded = true, flush = false, children }: Props = $props();
	let expanded = $state(defaultExpanded);
</script>

<div class="sdocs-panel">
	<button class="sdocs-panel-header" onclick={() => (expanded = !expanded)}>
		<span class="sdocs-panel-title">{title}</span>
		<span class="sdocs-panel-chevron">
			<Icon name={expanded ? 'chevron-down' : 'chevron-right'} --w="14px" --h="14px" />
		</span>
	</button>
	{#if expanded}
		<div class="sdocs-panel-body" class:flush>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.sdocs-panel {
		/* border: 1px solid var(--color-base-200); */
		/* border-radius: 8px; */
		overflow: hidden;
		background: var(--color-base-0);
	}
	.sdocs-panel-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px 6px 12px;
		border: none;
		background: var(--color-base-50);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-base-700);
		cursor: pointer;
		text-align: left;
	}
	.sdocs-panel-header:hover {
		background: var(--color-base-100);
	}
	.sdocs-panel-chevron {
		margin-left: auto;
		display: flex;
		align-items: center;
	}
	.sdocs-panel-body {
		padding: 14px;
		border-top: 1px solid var(--color-base-100);
	}
	.sdocs-panel-body.flush {
		padding: 0;
	}
</style>
