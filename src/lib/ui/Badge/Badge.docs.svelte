<script lang="ts" module>
	import Badge from './Badge.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Badge',
		component: Badge,
		args: {
			label: 'Badge',
			size: 'm',
			radius: 4
		}
	};

	export { Default, Sizes, Colors, Rounded };
</script>

{#snippet Default(args: any)}
	<Badge {...args} />
{/snippet}

{#snippet Sizes()}
	<div style="display: flex; align-items: center; gap: 8px;">
		<Badge label="xs" size="xs" />
		<Badge label="s" size="s" />
		<Badge label="m" size="m" />
		<Badge label="l" size="l" />
	</div>
{/snippet}

{#snippet Colors()}
	<div style="display: flex; align-items: center; gap: 8px;">
		<Badge label="string" --Badge-bg="var(--pink-50)" --Badge-color="var(--pink-600)" />
		<Badge label="number" --Badge-bg="var(--sky-50)" --Badge-color="var(--sky-600)" />
		<Badge label="boolean" --Badge-bg="var(--success-50)" --Badge-color="var(--success-600)" />
		<Badge label="any" />
	</div>
{/snippet}

{#snippet Rounded()}
	<div style="display: flex; align-items: center; gap: 8px;">
		<Badge label="default" radius={4} --Badge-bg="var(--pink-50)" --Badge-color="var(--pink-600)" />
		<Badge label="rounded" radius={8} --Badge-bg="var(--sky-50)" --Badge-color="var(--sky-600)" />
		<Badge label="pill" radius={100} --Badge-bg="var(--success-50)" --Badge-color="var(--success-600)" />
	</div>
{/snippet}
