<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A compound table component with semantic HTML sub-components.
	 *
	 * @cssvar {color} --table-border - Border color (default: var(--color-border))
	 * @cssvar {color} --table-bg - Background color (default: white)
	 * @cssvar {color} --table-header-bg - Header background (default: var(--color-bg))
	 * @cssvar {color} --table-hover-bg - Row hover background (default: var(--color-bg-hover))
	 * @cssvar {color} --table-stripe-bg - Striped row background (default: var(--color-bg))
	 */
	interface Props {
		/** Table content (Head, Body, Foot, Caption) */
		children: Snippet;
		/** Show alternating row colors */
		striped?: boolean;
		/** Compact padding */
		compact?: boolean;
		/** Fixed table layout */
		fixed?: boolean;
		/** Remove outer border */
		borderless?: boolean;
		/** Additional CSS class */
		class?: string;
	}

	let {
		children,
		striped = false,
		compact = false,
		fixed = false,
		borderless = false,
		class: className = ''
	}: Props = $props();
</script>

<div class="Table-wrapper {className}" class:striped class:compact class:fixed class:borderless>
	<table>
		{@render children()}
	</table>
</div>

<style>
	.Table-wrapper {
		width: 100%;
		overflow-x: auto;
		border: 1px solid var(--table-border, var(--color-border));
		border-radius: 0;
		background: var(--table-bg, white);
	}

	.Table-wrapper table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}

	.Table-wrapper.fixed table {
		table-layout: fixed;
	}

	/* Head */
	.Table-wrapper :global(thead th) {
		text-align: left;
		padding: 10px 12px;
		background: var(--table-header-bg, var(--color-bg));
		border-bottom: 1px solid var(--table-border, var(--color-border));
		font-weight: 600;
		color: var(--color-text-secondary);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Body cells */
	.Table-wrapper :global(tbody td),
	.Table-wrapper :global(tbody th) {
		padding: 10px 12px;
		border-bottom: 1px solid var(--color-border-subtle);
		vertical-align: middle;
	}

	.Table-wrapper :global(tbody tr:last-child td),
	.Table-wrapper :global(tbody tr:last-child th) {
		border-bottom: none;
	}

	.Table-wrapper :global(tbody tr:hover) {
		background: var(--table-hover-bg, var(--base-50));
	}

	/* Foot */
	.Table-wrapper :global(tfoot td),
	.Table-wrapper :global(tfoot th) {
		padding: 10px 12px;
		background: var(--table-header-bg, var(--color-bg));
		border-top: 1px solid var(--table-border, var(--color-border));
		font-weight: 600;
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	/* Caption */
	.Table-wrapper :global(caption) {
		padding: 10px 12px;
		font-size: 13px;
		color: var(--color-text-secondary);
		text-align: left;
		caption-side: top;
	}

	/* Compact variant */
	.Table-wrapper.compact :global(thead th) {
		padding: 6px 10px;
		font-size: 11px;
	}

	.Table-wrapper.compact :global(tbody td),
	.Table-wrapper.compact :global(tbody th),
	.Table-wrapper.compact :global(tfoot td),
	.Table-wrapper.compact :global(tfoot th) {
		padding: 6px 10px;
		font-size: 13px;
	}

	/* Borderless variant */
	.Table-wrapper.borderless {
		border: none;
	}

	/* Striped variant */
	.Table-wrapper.striped :global(tbody tr:nth-child(even)) {
		background: var(--table-stripe-bg, var(--color-bg));
	}

	.Table-wrapper.striped :global(tbody tr:nth-child(even):hover) {
		background: var(--table-hover-bg, var(--base-50));
	}
</style>
