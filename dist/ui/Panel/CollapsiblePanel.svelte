<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';

	interface Props {
		/** Title displayed in header */
		title?: string;
		/** Whether the panel is open */
		open?: boolean;
		/** Remove content padding */
		no_content_padding?: boolean;
		/** Panel content */
		children?: Snippet;
	}

	let { title, open = $bindable(true), no_content_padding = false, children }: Props = $props();

	function toggle() {
		open = !open;
	}
</script>

<div class="CollapsiblePanel">
	{#if title}
		<button type="button" class="CollapsiblePanel-header" onclick={toggle}>
			<h3 class="CollapsiblePanel-title">{title}</h3>
			<span class="CollapsiblePanel-icon" class:open>
				<ChevronRight size={14} strokeWidth={2} />
			</span>
		</button>
	{/if}
	{#if open && children}
		<div class="CollapsiblePanel-content" class:no_content_padding>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.CollapsiblePanel {
		/* background: var(--color-bg-elevated); */
		background: var(--base-100);
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.CollapsiblePanel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 8px 16px;
		background: var(--base-50);
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.CollapsiblePanel-header:hover {
		background: var(--color-bg-hover);
	}

	.CollapsiblePanel-title {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--base-500);
	}

	.CollapsiblePanel-icon {
		display: flex;
		align-items: center;
		color: var(--color-text-muted);
		transition: transform 0.15s ease;
	}

	.CollapsiblePanel-icon.open {
		transform: rotate(90deg);
	}

	.CollapsiblePanel-content {
		background: var(--base-0);
		padding: 16px;
	}

	.CollapsiblePanel-content.no_content_padding {
		padding: 0;
	}
</style>
