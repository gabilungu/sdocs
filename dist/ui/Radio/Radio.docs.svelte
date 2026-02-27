<script lang="ts" module>
	import Radio from './Radio.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Radio',
		component: Radio,
		args: {
			value: 'option1',
			label: 'Select this option',
			checked: false,
			size: 'm',
			disabled: false
		}
	};

	export { Default, Sizes, GroupedByName, WithoutLabel, Disabled };
</script>

{#snippet Default(args: any)}
	<Radio {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; gap: 24px; align-items: center;">
		<Radio name="sizes" value="xs" label="Extra small" size="xs" />
		<Radio name="sizes" value="s" label="Small" size="s" />
		<Radio name="sizes" value="m" label="Medium" size="m" checked />
		<Radio name="sizes" value="l" label="Large" size="l" />
	</div>
{/snippet}

{#snippet GroupedByName()}
	<div style="display: flex; gap: 48px;">
		<div>
			<p style="margin: 0 0 12px; font-size: 13px; font-weight: 500;">Favorite fruit</p>
			<div style="display: flex; flex-direction: column; gap: 10px;">
				<Radio name="fruit" value="apple" label="Apple" checked />
				<Radio name="fruit" value="banana" label="Banana" />
				<Radio name="fruit" value="cherry" label="Cherry" />
			</div>
		</div>
		<div>
			<p style="margin: 0 0 12px; font-size: 13px; font-weight: 500;">Favorite color</p>
			<div style="display: flex; flex-direction: column; gap: 10px;">
				<Radio name="color" value="red" label="Red" />
				<Radio name="color" value="blue" label="Blue" checked />
				<Radio name="color" value="green" label="Green" />
			</div>
		</div>
	</div>
{/snippet}

{#snippet WithoutLabel()}
	<div style="display: flex; gap: 16px;">
		<Radio name="nolabel" value="1" size="m" />
		<Radio name="nolabel" value="2" size="m" checked />
		<Radio name="nolabel" value="3" size="m" />
	</div>
{/snippet}

{#snippet Disabled()}
	<div style="display: flex; flex-direction: column; gap: 10px;">
		<Radio name="disabled-demo" value="1" label="Disabled unchecked" disabled />
		<Radio name="disabled-demo" value="2" label="Disabled checked" checked disabled />
	</div>
{/snippet}
