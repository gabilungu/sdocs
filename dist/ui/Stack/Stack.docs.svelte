<script lang="ts" module>
	import Stack from './Stack.svelte';
	import { Placeholder } from '../Placeholder/index.js';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Layout/Stack',
		component: Stack,
		args: {
			direction: 'column',
			gap: '8px',
			padding: '0',
			bg: ''
		}
	};

	export { Default, Row, Reversed, WithBackground };
</script>

{#snippet Default(args: any)}
	<Stack {...args}>
		<Placeholder text="1" width="80px" height="40px" />
		<Placeholder text="2" width="80px" height="40px" />
		<Placeholder text="3" width="80px" height="40px" />
	</Stack>
{/snippet}

{#snippet Row()}
	<Stack direction="row" gap="12px">
		<Placeholder text="Left" width="100px" height="60px" color="blue" />
		<Placeholder text="Center" width="100px" height="60px" color="green" />
		<Placeholder text="Right" width="100px" height="60px" color="pink" />
	</Stack>
{/snippet}

{#snippet Reversed()}
	<div style="display: flex; gap: 32px;">
		<div>
			<p style="margin: 0 0 8px; font-size: 12px; color: var(--base-500);">Column reversed</p>
			<Stack direction="column-reverse" gap="8px">
				<Placeholder text="1" width="80px" height="40px" />
				<Placeholder text="2" width="80px" height="40px" />
				<Placeholder text="3" width="80px" height="40px" />
			</Stack>
		</div>
		<div>
			<p style="margin: 0 0 8px; font-size: 12px; color: var(--base-500);">Row reversed</p>
			<Stack direction="row-reverse" gap="8px">
				<Placeholder text="1" width="80px" height="40px" />
				<Placeholder text="2" width="80px" height="40px" />
				<Placeholder text="3" width="80px" height="40px" />
			</Stack>
		</div>
	</div>
{/snippet}

{#snippet WithBackground()}
	<Stack direction="column" gap="12px" padding="16px" bg="var(--base-100)">
		<Placeholder text="Item 1" height="50px" color="blue" />
		<Placeholder text="Item 2" height="50px" color="green" />
		<Placeholder text="Item 3" height="50px" color="pink" />
	</Stack>
{/snippet}
