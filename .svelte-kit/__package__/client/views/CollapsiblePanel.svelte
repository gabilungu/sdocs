<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		defaultExpanded?: boolean;
		children: Snippet;
	}

	let { title, defaultExpanded = true, children }: Props = $props();
	let expanded = $state(defaultExpanded);
</script>

<div class="sdocs-panel">
	<button class="sdocs-panel-header" onclick={() => expanded = !expanded}>
		<span class="sdocs-panel-arrow" class:expanded>&#9654;</span>
		<span class="sdocs-panel-title">{title}</span>
	</button>
	{#if expanded}
		<div class="sdocs-panel-body">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.sdocs-panel {
		border: 1px solid var(--color-base-200);
		border-radius: 8px;
		overflow: hidden;
	}
	.sdocs-panel-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: var(--color-base-50);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-base-900);
		cursor: pointer;
		text-align: left;
	}
	.sdocs-panel-header:hover {
		background: var(--color-base-100);
	}
	.sdocs-panel-arrow {
		font-size: 8px;
		transition: transform 0.15s;
		display: inline-block;
		width: 10px;
	}
	.sdocs-panel-arrow.expanded {
		transform: rotate(90deg);
	}
	.sdocs-panel-body {
		padding: 14px;
		border-top: 1px solid var(--color-base-200);
	}
</style>
