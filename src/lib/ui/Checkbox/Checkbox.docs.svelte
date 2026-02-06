<script lang="ts" module>
	import Checkbox from './Checkbox.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Checkbox',
		component: Checkbox,
		args: {
			checked: false,
			label: 'Accept terms and conditions',
			size: 'm',
			disabled: false
		}
	};

	export { Default, Sizes, WithoutLabel, Disabled, Checked };
</script>

{#snippet Default(args: any)}
	<Checkbox {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; flex-direction: column; gap: 12px;">
		<Checkbox label="Extra small" size="xs" />
		<Checkbox label="Small" size="s" />
		<Checkbox label="Medium (default)" size="m" />
		<Checkbox label="Large" size="l" />
	</div>
{/snippet}

{#snippet WithoutLabel()}
	<div style="display: flex; gap: 12px;">
		<Checkbox size="m" />
		<Checkbox size="m" checked />
	</div>
{/snippet}

{#snippet Disabled()}
	<div style="display: flex; flex-direction: column; gap: 12px;">
		<Checkbox label="Disabled unchecked" disabled />
		<Checkbox label="Disabled checked" checked disabled />
	</div>
{/snippet}

{#snippet Checked()}
	<div style="display: flex; flex-direction: column; gap: 12px;">
		<Checkbox label="Remember me" checked />
		<Checkbox label="Subscribe to newsletter" checked />
	</div>
{/snippet}
