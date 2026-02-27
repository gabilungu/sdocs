<script lang="ts" module>
	import Placeholder from './Placeholder.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Placeholder',
		component: Placeholder,
		args: {
			text: 'Placeholder',
			radius: 0,
			color: 'pink',
			width: '200px',
			height: '100px'
		}
	};

	let bangRef: Placeholder;

	export { Default, Colors, InLayout, Bang };
</script>

{#snippet Default(args: any)}
	<Placeholder {...args} />
{/snippet}

{#snippet Colors()}
	<div style="display: flex; gap: 16px;">
		<Placeholder text="Pink" color="pink" width="120px" height="80px" />
		<Placeholder text="Green" color="green" width="120px" height="80px" />
		<Placeholder text="Blue" color="blue" width="120px" height="80px" />
	</div>
{/snippet}

{#snippet InLayout()}
	<div style="display: flex; flex-direction: column; gap: 8px; width: 300px; height: 200px;">
		<Placeholder text="Header" color="blue" height="40px" />
		<div style="display: flex; gap: 8px; flex: 1;">
			<Placeholder text="Nav" color="green" width="80px" />
			<Placeholder text="Main" color="pink" />
		</div>
	</div>
{/snippet}

{#snippet Bang()}
	<div style="display: flex; align-items: center; gap: 12px;">
		<Placeholder bind:this={bangRef} text="Click the button" width="200px" height="80px" />
		<button style="height: 32px; padding: 0 12px; font-family: var(--font-sans); font-size: 13px; font-weight: 500; background: var(--base-800); color: var(--base-50); border: none; border-radius: 6px; cursor: pointer; white-space: nowrap;" onclick={() => bangRef?.bang()}>bang()</button>
	</div>
{/snippet}
