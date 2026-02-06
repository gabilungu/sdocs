<script lang="ts">
	import type { MethodType } from '../types.js';
	import { Table } from '../ui/index.js';

	interface Props {
		methods: MethodType[];
	}

	let { methods }: Props = $props();
</script>

{#if methods.length > 0}
	<Table compact borderless>
		<Table.Head>
			<Table.Row>
				<Table.Header width="20%">Name</Table.Header>
				<Table.Header width="30%">Params</Table.Header>
				<Table.Header width="15%">Returns</Table.Header>
				<Table.Header width="35%">Description</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			{#each methods as method (method.name)}
				<Table.Row>
					<Table.Cell>
						<code class="method-name">{method.name}()</code>
					</Table.Cell>
					<Table.Cell>
						<code class="method-params">{method.params || '-'}</code>
					</Table.Cell>
					<Table.Cell>
						<code class="method-return">{method.returnType || 'void'}</code>
					</Table.Cell>
					<Table.Cell>
						<span class="method-description">{method.description || '-'}</span>
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table>
{/if}

<style>
	.method-name {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--color-text);
		background: none;
		padding: 0;
		white-space: nowrap;
	}

	.method-params {
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		font-size: 12px;
	}

	.method-return {
		font-family: var(--font-mono);
		color: var(--sky-600);
		background: var(--sky-50);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
	}

	.method-description {
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
</style>
