<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '../Icon/index.js';

	interface Props {
		label: string;
		expanded?: boolean;
		children?: Snippet;
		class?: string;
		onclick?: () => void;
		/** Always expanded: no chevron, no toggle, no pointer affordance. */
		static?: boolean;
	}

	let {
		label,
		expanded = $bindable(true),
		children,
		class: className = '',
		onclick,
		static: isStatic = false,
	}: Props = $props();

	const open = $derived(isStatic || expanded);

	function toggle() {
		expanded = !expanded;
	}
</script>

<div class="NavTree-group {className}">
	{#if isStatic}
		<div class="NavTree-group-label is-static">
			<span class="NavTree-group-text" title={label}>{label}</span>
		</div>
	{:else}
		<button class="NavTree-group-label" onclick={onclick ?? toggle}>
			<span class="NavTree-group-text" title={label}>{label}</span>
			<span class="NavTree-chevron">
				<Icon name={expanded ? 'chevron-down' : 'chevron-right'} --w="14px" --h="14px" />
			</span>
		</button>
	{/if}
	{#if open && children}
		<div class="NavTree-group-children">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.NavTree-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--p, 0);
		margin: var(--m, 12px 0);
		border-radius: var(--r, 0);
		border: var(--b, none);
	}

	.NavTree-group-label {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0 12px;
		border: none;
		background: none;
		font: inherit;
		font-size: 11px;
		font-weight: var(--font-weight, 600);
		color: var(--color-base-400);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		cursor: pointer;
		text-align: left;
	}

	.NavTree-group-label:not(.is-static):hover {
		color: var(--color-base-600);
	}
	.NavTree-group-label.is-static {
		cursor: default;
	}

	.NavTree-group-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.NavTree-chevron {
		display: inline-flex;
		align-items: center;
		margin-left: auto;
	}

	.NavTree-group-children {
		padding-left: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
</style>
