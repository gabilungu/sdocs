<script lang="ts" module>
	import SegmentControl from './SegmentControl.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'SegmentControl',
		component: SegmentControl,
		args: {
			options: ['Option 1', 'Option 2', 'Option 3'],
			value: 'Option 1',
			size: 'm',
			disabled: false
		}
	};

	export { Default, Sizes, Disabled };
</script>

{#snippet Default(args: any)}
	<SegmentControl {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; flex-direction: column; gap: 16px;">
		<SegmentControl
			options={['XS', 'S', 'M', 'L']}
			value="XS"
			size="xs"
		/>
		<SegmentControl
			options={['XS', 'S', 'M', 'L']}
			value="S"
			size="s"
		/>
		<SegmentControl
			options={['XS', 'S', 'M', 'L']}
			value="M"
			size="m"
		/>
		<SegmentControl
			options={['XS', 'S', 'M', 'L']}
			value="L"
			size="l"
		/>
	</div>
{/snippet}

{#snippet Disabled()}
	<SegmentControl
		options={['One', 'Two', 'Three']}
		value="Two"
		disabled
	/>
{/snippet}
