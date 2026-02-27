<script lang="ts" module>
	import InputText from './InputText.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'InputText',
		component: InputText,
		args: {
			value: '',
			placeholder: 'Enter text...',
			size: 'm',
			disabled: false,
			type: 'text'
		}
	};

	export { Default, Sizes, Disabled, Types };
</script>

{#snippet Default(args: any)}
	<InputText {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
		<InputText placeholder="XS size" size="xs" />
		<InputText placeholder="S size" size="s" />
		<InputText placeholder="M size" size="m" />
		<InputText placeholder="L size" size="l" />
	</div>
{/snippet}

{#snippet Types()}
	<div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px;">
		<InputText placeholder="Text input" type="text" />
		<InputText placeholder="Email input" type="email" />
		<InputText placeholder="Password input" type="password" />
	</div>
{/snippet}

{#snippet Disabled()}
	<InputText placeholder="Disabled input" value="Can't edit this" disabled />
{/snippet}
