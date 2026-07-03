<script lang="ts">
	import type { Snippet } from 'svelte';
	import { typeClass, typeParts, valueClass } from './format.js';

	interface Column {
		key: string;
		label: string;
		/** 'name' renders as bold plain text, 'text' as plain text,
		 * 'type' as a code chip color-coded by the type,
		 * 'value' as mono text color-coded by the literal; default is a code chip */
		kind?: 'name' | 'text' | 'type' | 'value';
	}

	interface Props {
		columns: Column[];
		rows: Record<string, unknown>[];
		/** When set, adds a Control column rendering this snippet per row */
		control?: Snippet<[Record<string, unknown>]>;
	}

	let { columns, rows, control }: Props = $props();


</script>

{#if rows.length > 0}
	<table class="sdocs-table">
		<thead>
			<tr>
				{#each columns as col (col.key)}
					<th>{col.label}</th>
				{/each}
				{#if control}
					<th class="sdocs-table-control-col">Control</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, i (i)}
				<tr>
					{#each columns as col (col.key)}
						<td>
							{#if row[col.key] == null}
								<span class="sdocs-table-empty">—</span>
							{:else if col.kind === 'name'}
								<span class="sdocs-table-name">
									{row[col.key]}{#if row.required === true}<span class="sdocs-table-required" title="Required">*</span>{/if}
								</span>
							{:else if col.kind === 'text'}
								{row[col.key]}
							{:else if col.kind === 'type'}
								{#each typeParts(row[col.key]) as part, i (i)}
									{#if i > 0}<span class="sdocs-typesep">|</span>{/if}
									<code class="sdocs-type-{typeClass(row[col.key])}">{part}</code>
								{/each}
							{:else if col.kind === 'value'}
								<span class="sdocs-value sdocs-value-{valueClass(row[col.key])}">{row[col.key]}</span>
							{:else}
								<code>{row[col.key]}</code>
							{/if}
						</td>
					{/each}
					{#if control}
						<td class="sdocs-table-control-col">
							{@render control(row)}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="sdocs-table-none">None</p>
{/if}

<style>
	.sdocs-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	.sdocs-table th {
		text-align: left;
		padding: 6px 12px;
		border-bottom: 2px solid var(--color-base-200);
		font-weight: 600;
		color: var(--color-base-600);
		font-size: 12px;
	}
	.sdocs-table td {
		padding: 6px 12px;
		border-bottom: 1px solid var(--color-base-100);
		color: var(--color-base-800);
	}
	.sdocs-table code {
		font-family: var(--mono);
		font-size: 12px;
		background: var(--color-base-100);
		padding: 1px 4px;
		border-radius: 3px;
	}
	.sdocs-table-name {
		font-weight: 600;
	}
	.sdocs-table-required {
		color: var(--color-red-500);
	}
	.sdocs-table-control-col {
		width: 220px;
		min-width: 180px;
	}
	.sdocs-table-empty {
		color: var(--color-base-300);
	}
	.sdocs-table-none {
		color: var(--color-base-400);
		font-size: 13px;
		font-style: italic;
		margin: 0;
	}
</style>
