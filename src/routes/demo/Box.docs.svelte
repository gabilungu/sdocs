<script lang="ts" module>
	import Box from './Box.svelte';
	import type { DocMeta } from '$lib/types.js';

	export const meta: DocMeta = {
		title: 'Box',
		component: Box,
	};

	export { Default, CustomColors };
</script>

{#snippet Default(args: any)}
	<Box {...args} />
{/snippet}

{#snippet CustomColors()}
	<div style="display: flex; flex-direction: column; gap: 12px;">
		<Box var2="abc" --bg="#fdf2f8" />
		<Box var1={false} var2="xyz" --bg="#eff6ff" />
		<Box var2="abc">children</Box>
	</div>
{/snippet}
