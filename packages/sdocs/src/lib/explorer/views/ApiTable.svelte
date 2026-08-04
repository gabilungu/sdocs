<script lang="ts" module>
	/** One API-table row — also the parameter of the `control` snippet. */
	export interface Row {
		name: string;
		type?: string | null;
		default?: string | null;
		/** Divergent var() fallbacks — rendered as "Mixed" with a breakdown */
		defaultUses?: { property: string; value: string }[];
		description?: string | null;
		required?: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { renderInlineMarkdown, typeClass, typeParts, valueClass } from './format.js';

	interface Props {
		rows: Row[];
		/** Renders the per-row control in the fixed right rail */
		control?: Snippet<[Row]>;
		/** Show the Default column (rows without defaults, e.g. events, turn it off) */
		showDefault?: boolean;
		/** Header label of the Default column (e.g. "Current value" for states) */
		defaultLabel?: string;
	}

	let { rows, control, showDefault = true, defaultLabel = 'Default' }: Props = $props();

	// The default/value column widens to the control-rail width when it is the
	// last column, so section right edges align.
	const gridColumns = $derived(
		['200px', 'minmax(0, 1fr)', ...(showDefault ? [control ? '120px' : '200px'] : []), ...(control ? ['200px'] : [])].join(' '),
	);
</script>

{#if rows.length > 0}
	<div class="sdocs-api-list">
		<div class="sdocs-api-header" style:grid-template-columns={gridColumns}>
			<div>Name</div>
			<div>Details</div>
			{#if showDefault}<div>{defaultLabel}</div>{/if}
			{#if control}<div>Control</div>{/if}
		</div>
		{#each rows as row (row.name)}
			<div class="sdocs-api-row" style:grid-template-columns={gridColumns}>
				<div class="sdocs-api-name">
					{row.name}{#if row.required}<span class="sdocs-api-required" title="Required">*</span>{/if}
				</div>
				<div class="sdocs-api-middle">
					{#if row.type}
						<div class="sdocs-api-meta">
							{#each typeParts(row.type) as part, i (i)}
								{#if i > 0}<span class="sdocs-typesep">|</span>{/if}
								<code class="sdocs-type-{typeClass(part)}">{part}</code>
							{/each}
						</div>
					{/if}
				</div>
				{#if showDefault}
					<div class="sdocs-api-default">
						<!-- Stacked on a phone the column header is gone, so each
						     cell carries its own label there. -->
						<span class="sdocs-api-cell-label">{defaultLabel}</span>
						{#if row.defaultUses?.length}
							<span
								class="sdocs-value sdocs-value-mixed"
								title={row.defaultUses.map((u) => `${u.property} → ${u.value}`).join('\n')}
							>Mixed</span>
						{:else if row.default != null}
							<span class="sdocs-value sdocs-value-{valueClass(row.default)}">{row.default}</span>
						{:else}
							<span class="sdocs-api-empty">—</span>
						{/if}
					</div>
				{/if}
				{#if control}
					<div class="sdocs-api-control">
						<span class="sdocs-api-cell-label">Control</span>
						{@render control(row)}
					</div>
				{/if}
				{#if row.description}
					<!-- The description runs the full row width, under every column,
					     so a long or multi-line text isn't clipped to one cell. -->
					<div class="sdocs-api-desc">{@html renderInlineMarkdown(row.description)}</div>
				{/if}
			</div>
		{/each}
	</div>
{:else}
	<p class="sdocs-api-none">None</p>
{/if}

<style>
	.sdocs-api-list {
		display: flex;
		flex-direction: column;
	}
	.sdocs-api-header {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr) 120px 200px;
		gap: 20px;
		padding: 6px 12px;
		border-bottom: 2px solid var(--color-base-200);
		font-size: 12px;
		font-weight: 600;
		color: var(--color-base-600);
	}
	.sdocs-api-row {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr) 120px 200px;
		/* Tighter row gap: the full-width description sits on its own grid row */
		gap: 8px 20px;
		align-items: start;
		padding: 12px 12px;
		border-bottom: 1px solid var(--color-base-100);
		font-size: 13px;
	}
	.sdocs-api-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-base-900);
		overflow-wrap: break-word;
	}
	.sdocs-api-required {
		color: var(--color-red-500);
	}
	.sdocs-api-middle {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.sdocs-api-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
	}
	.sdocs-api-desc {
		grid-column: 1 / -1;
		color: var(--color-base-500);
		/* Reflowed JSDoc keeps deliberate breaks (lists, paragraphs) as \n */
		white-space: pre-line;
	}
	.sdocs-api-default {
		overflow-wrap: break-word;
		min-width: 0;
	}
	.sdocs-api-empty {
		color: var(--color-base-300);
	}
	.sdocs-api-control {
		min-width: 0;
	}
	.sdocs-api-none {
		color: var(--color-base-400);
		font-size: 13px;
		font-style: italic;
		margin: 0;
	}
	/* Only the stacked layout needs per-cell labels; the columns have headers. */
	.sdocs-api-cell-label {
		display: none;
	}

	/* Below the breakpoint the columns add up to 520px of fixed track in a
	   ~350px viewport, so the row stops being a table row and becomes a card:
	   one column, name first, the control last where a thumb expects it.
	   `display: flex` also neutralises the inline grid-template-columns. */
	@media (max-width: 860px) {
		.sdocs-api-header {
			display: none;
		}
		.sdocs-api-row {
			display: flex;
			flex-direction: column;
			gap: 5px;
			padding: 12px 0;
			/* The grid's `start` would shrink each cell to its content, leaving
			   the controls at a fraction of the width they now have. */
			align-items: stretch;
		}
		.sdocs-api-name {
			order: 1;
		}
		.sdocs-api-middle {
			order: 2;
		}
		.sdocs-api-desc {
			order: 3;
		}
		.sdocs-api-default {
			order: 4;
		}
		.sdocs-api-control {
			order: 5;
		}
		.sdocs-api-default,
		.sdocs-api-control {
			display: flex;
			flex-direction: column;
			gap: 4px;
			align-items: stretch;
		}
		/* Stacked, a labelled "—" is a line of nothing. The em-dash only earns
		   its place in the grid, where it holds the column open. */
		.sdocs-api-default:has(.sdocs-api-empty) {
			display: none;
		}
		.sdocs-api-cell-label {
			display: block;
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.05em;
			text-transform: uppercase;
			color: var(--color-base-400);
		}
	}
</style>
