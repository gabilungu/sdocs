<script lang="ts" module>
	import BoxJS from './BoxJS.svelte';
	import type { DocMeta } from '$lib/types.js';

	export const meta: DocMeta = {
		title: 'BoxJS',
		component: BoxJS,
	};

	export { Default, CustomColors };
</script>

{#snippet Default(args: any)}
	<BoxJS {...args} />
{/snippet}

{#snippet CustomColors()}
	<div style="display: flex; flex-direction: column; gap: 12px;">
		<BoxJS var2="pink" --bg="#fdf2f8" />
		<BoxJS var1={false} var2="blue" --bg="#eff6ff" />
		<BoxJS var2="abc">children</BoxJS>
	</div>
{/snippet}
