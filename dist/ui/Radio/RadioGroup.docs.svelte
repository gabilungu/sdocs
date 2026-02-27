<script lang="ts" module>
	import RadioGroup from './RadioGroup.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'RadioGroup',
		component: RadioGroup,
		args: {
			options: ['Option A', 'Option B', 'Option C'],
			value: 'Option A',
			size: 'm',
			direction: 'vertical',
			disabled: false
		}
	};

	export { Default, Sizes, Horizontal, Disabled, WithDisabledOption };
</script>

{#snippet Default(args: any)}
	<RadioGroup {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; gap: 48px;">
		<div>
			<p style="margin: 0 0 8px; font-size: 12px; color: var(--base-500);">Extra small</p>
			<RadioGroup options={['Yes', 'No', 'Maybe']} value="Yes" size="xs" />
		</div>
		<div>
			<p style="margin: 0 0 8px; font-size: 12px; color: var(--base-500);">Small</p>
			<RadioGroup options={['Yes', 'No', 'Maybe']} value="Yes" size="s" />
		</div>
		<div>
			<p style="margin: 0 0 8px; font-size: 12px; color: var(--base-500);">Medium</p>
			<RadioGroup options={['Yes', 'No', 'Maybe']} value="Yes" size="m" />
		</div>
		<div>
			<p style="margin: 0 0 8px; font-size: 12px; color: var(--base-500);">Large</p>
			<RadioGroup options={['Yes', 'No', 'Maybe']} value="Yes" size="l" />
		</div>
	</div>
{/snippet}

{#snippet Horizontal()}
	<RadioGroup
		options={['Daily', 'Weekly', 'Monthly', 'Yearly']}
		value="Weekly"
		direction="horizontal"
	/>
{/snippet}

{#snippet Disabled()}
	<RadioGroup
		options={['Option 1', 'Option 2', 'Option 3']}
		value="Option 1"
		disabled
	/>
{/snippet}

{#snippet WithDisabledOption()}
	<RadioGroup
		options={[
			{ value: 'free', label: 'Free Plan' },
			{ value: 'pro', label: 'Pro Plan' },
			{ value: 'enterprise', label: 'Enterprise (Coming Soon)', disabled: true }
		]}
		value="pro"
	/>
{/snippet}
