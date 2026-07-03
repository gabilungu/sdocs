<script lang="ts">
	interface Column {
		key: string;
		label: string;
	}

	interface Props {
		columns: Column[];
		rows: Record<string, unknown>[];
	}

	let { columns, rows }: Props = $props();
</script>

{#if rows.length > 0}
	<table class="sdocs-table">
		<thead>
			<tr>
				{#each columns as col (col.key)}
					<th>{col.label}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, i (i)}
				<tr>
					{#each columns as col (col.key)}
						<td>
							{#if row[col.key] != null}
								<code>{row[col.key]}</code>
							{:else}
								<span class="sdocs-table-empty">—</span>
							{/if}
						</td>
					{/each}
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
