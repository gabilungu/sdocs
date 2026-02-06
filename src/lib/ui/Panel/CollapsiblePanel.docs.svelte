<script lang="ts" module>
	import CollapsiblePanel from './CollapsiblePanel.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Layout/CollapsiblePanel',
		component: CollapsiblePanel,
		args: {
			title: 'Settings',
			open: true
		}
	};

	export { Default, Closed, CustomContent };
</script>

{#snippet Default(args: any)}
	<CollapsiblePanel {...args}>
		<p style="margin: 0; color: #666;">Panel content goes here.</p>
	</CollapsiblePanel>
{/snippet}

{#snippet Closed()}
	<CollapsiblePanel title="Collapsed by default" open={false}>
		<p style="margin: 0; color: #666;">This content is hidden until you click the header.</p>
	</CollapsiblePanel>
{/snippet}

{#snippet CustomContent()}
	<CollapsiblePanel title="User Profile">
		<div style="display: flex; flex-direction: column; gap: 12px;">
			<div style="display: flex; align-items: center; gap: 12px;">
				<div style="width: 48px; height: 48px; background: #e5e5e5; border-radius: 50%;"></div>
				<div>
					<div style="font-weight: 600;">John Doe</div>
					<div style="font-size: 13px; color: #666;">john@example.com</div>
				</div>
			</div>
			<div style="display: flex; gap: 8px;">
				<button style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">Edit</button>
				<button style="padding: 6px 12px; background: #f3f4f6; color: #374151; border: none; border-radius: 6px; font-size: 13px; cursor: pointer;">Settings</button>
			</div>
		</div>
	</CollapsiblePanel>
{/snippet}
