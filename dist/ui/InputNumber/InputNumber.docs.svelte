<script lang="ts" module>
	import InputNumber from './InputNumber.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'InputNumber',
		component: InputNumber,
		args: {
			value: 0,
			min: undefined,
			max: undefined,
			step: 1,
			placeholder: 'Enter number...',
			size: 'm',
			disabled: false
		}
	};

	export { Default, Sizes, WithConstraints, Disabled };
</script>

{#snippet Default(args: any)}
	<InputNumber {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; flex-direction: column; gap: 12px; max-width: 200px;">
		<InputNumber placeholder="XS size" size="xs" />
		<InputNumber placeholder="S size" size="s" />
		<InputNumber placeholder="M size" size="m" />
		<InputNumber placeholder="L size" size="l" />
	</div>
{/snippet}

{#snippet WithConstraints()}
	<div style="display: flex; flex-direction: column; gap: 12px; max-width: 200px;">
		<label style="font-size: 12px; color: var(--base-500);">
			Min: 0, Max: 100, Step: 10
			<InputNumber value={50} min={0} max={100} step={10} />
		</label>
		<label style="font-size: 12px; color: var(--base-500);">
			Step: 0.1 (decimals)
			<InputNumber value={0.5} step={0.1} />
		</label>
	</div>
{/snippet}

{#snippet Disabled()}
	<InputNumber placeholder="Disabled" value={42} disabled />
{/snippet}
