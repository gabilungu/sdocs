<script lang="ts" module>
	import { Table } from './index.js';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Layout / Table',
		component: Table
	};

	export { Default, Striped, Compact, WithCaption, WithFooter, SectionHeaders };
</script>

{#snippet Default(args: any)}
	<Table {...args}>
		<Table.Head>
			<Table.Row>
				<Table.Header>Name</Table.Header>
				<Table.Header>Type</Table.Header>
				<Table.Header>Description</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			<Table.Row>
				<Table.Cell>label</Table.Cell>
				<Table.Cell>string</Table.Cell>
				<Table.Cell>Button text</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>disabled</Table.Cell>
				<Table.Cell>boolean</Table.Cell>
				<Table.Cell>Disable the button</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>size</Table.Cell>
				<Table.Cell>'s' | 'm' | 'l'</Table.Cell>
				<Table.Cell>Size variant</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table>
{/snippet}

{#snippet Striped()}
	<Table striped>
		<Table.Head>
			<Table.Row>
				<Table.Header>Name</Table.Header>
				<Table.Header>Role</Table.Header>
				<Table.Header>Status</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			<Table.Row>
				<Table.Cell>Alice</Table.Cell>
				<Table.Cell>Admin</Table.Cell>
				<Table.Cell>Active</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>Bob</Table.Cell>
				<Table.Cell>Editor</Table.Cell>
				<Table.Cell>Active</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>Carol</Table.Cell>
				<Table.Cell>Viewer</Table.Cell>
				<Table.Cell>Inactive</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>Dave</Table.Cell>
				<Table.Cell>Editor</Table.Cell>
				<Table.Cell>Active</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table>
{/snippet}

{#snippet Compact()}
	<Table compact>
		<Table.Head>
			<Table.Row>
				<Table.Header>Property</Table.Header>
				<Table.Header>Value</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			<Table.Row>
				<Table.Cell>font-size</Table.Cell>
				<Table.Cell>14px</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>line-height</Table.Cell>
				<Table.Cell>1.5</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>font-weight</Table.Cell>
				<Table.Cell>400</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table>
{/snippet}

{#snippet WithCaption()}
	<Table>
		<Table.Caption>Team members and their roles</Table.Caption>
		<Table.Head>
			<Table.Row>
				<Table.Header>Name</Table.Header>
				<Table.Header>Role</Table.Header>
				<Table.Header align="right">Hours</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			<Table.Row>
				<Table.Cell>Alice</Table.Cell>
				<Table.Cell>Lead</Table.Cell>
				<Table.Cell align="right">40</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>Bob</Table.Cell>
				<Table.Cell>Developer</Table.Cell>
				<Table.Cell align="right">32</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table>
{/snippet}

{#snippet WithFooter()}
	<Table>
		<Table.Head>
			<Table.Row>
				<Table.Header>Product</Table.Header>
				<Table.Header align="right">Price</Table.Header>
				<Table.Header align="right">Qty</Table.Header>
				<Table.Header align="right">Total</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			<Table.Row>
				<Table.Cell>Widget A</Table.Cell>
				<Table.Cell align="right">$10</Table.Cell>
				<Table.Cell align="right">3</Table.Cell>
				<Table.Cell align="right">$30</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>Widget B</Table.Cell>
				<Table.Cell align="right">$25</Table.Cell>
				<Table.Cell align="right">2</Table.Cell>
				<Table.Cell align="right">$50</Table.Cell>
			</Table.Row>
		</Table.Body>
		<Table.Foot>
			<Table.Row>
				<Table.Header colspan={3}>Total</Table.Header>
				<Table.Cell align="right"><strong>$80</strong></Table.Cell>
			</Table.Row>
		</Table.Foot>
	</Table>
{/snippet}

{#snippet SectionHeaders()}
	<Table>
		<Table.Head>
			<Table.Row>
				<Table.Header>Name</Table.Header>
				<Table.Header>Type</Table.Header>
				<Table.Header>Default</Table.Header>
			</Table.Row>
		</Table.Head>
		<Table.Body>
			<Table.Row>
				<Table.Header colspan={3}>Appearance</Table.Header>
			</Table.Row>
			<Table.Row>
				<Table.Cell>size</Table.Cell>
				<Table.Cell>'s' | 'm' | 'l'</Table.Cell>
				<Table.Cell>'m'</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>variant</Table.Cell>
				<Table.Cell>'solid' | 'outline'</Table.Cell>
				<Table.Cell>'solid'</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Header colspan={3}>Behavior</Table.Header>
			</Table.Row>
			<Table.Row>
				<Table.Cell>disabled</Table.Cell>
				<Table.Cell>boolean</Table.Cell>
				<Table.Cell>false</Table.Cell>
			</Table.Row>
			<Table.Row>
				<Table.Cell>loading</Table.Cell>
				<Table.Cell>boolean</Table.Cell>
				<Table.Cell>false</Table.Cell>
			</Table.Row>
		</Table.Body>
	</Table>
{/snippet}
