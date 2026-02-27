<script lang="ts" module>
	import Frame from './Frame.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'Layout/Frame',
		component: Frame,
	};

	export { Default, WithSidebars, Nested, AppLayout };
</script>

{#snippet Default()}
	<div style="height: 300px; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
		<Frame>
			{#snippet top()}
				<div style="padding: 12px 16px; background: #f5f5f5; border-bottom: 1px solid #e5e5e5;">Header</div>
			{/snippet}

			<div style="padding: 16px;">Main content goes here. This is the middle area.</div>

			{#snippet bottom()}
				<div style="padding: 12px 16px; background: #f5f5f5; border-top: 1px solid #e5e5e5;">Footer</div>
			{/snippet}
		</Frame>
	</div>
{/snippet}

{#snippet WithSidebars()}
	<div style="height: 300px; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
		<Frame>
			{#snippet top()}
				<div style="padding: 12px 16px; background: #3b82f6; color: white;">App Header</div>
			{/snippet}

			{#snippet left()}
				<div style="width: 180px; padding: 16px; background: #f8fafc; border-right: 1px solid #e5e5e5;">
					<div style="font-weight: 600; margin-bottom: 12px;">Navigation</div>
					<div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: #666;">
						<span>Dashboard</span>
						<span>Settings</span>
						<span>Profile</span>
					</div>
				</div>
			{/snippet}

			<div style="padding: 16px;">
				<h2 style="margin: 0 0 8px;">Welcome</h2>
				<p style="color: #666; margin: 0;">This is the main content area with left sidebar.</p>
			</div>

			{#snippet right()}
				<div style="width: 200px; padding: 16px; background: #fefce8; border-left: 1px solid #e5e5e5;">
					<div style="font-weight: 600; margin-bottom: 8px;">Info Panel</div>
					<p style="font-size: 13px; color: #666; margin: 0;">Additional context or widgets.</p>
				</div>
			{/snippet}
		</Frame>
	</div>
{/snippet}

{#snippet Nested()}
	<div style="height: 400px; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
		<Frame>
			{#snippet top()}
				<div style="padding: 12px 16px; background: #1e293b; color: white;">Outer Frame Header</div>
			{/snippet}

			{#snippet left()}
				<div style="width: 160px; padding: 16px; background: #f1f5f9; border-right: 1px solid #e5e5e5;">Outer Left</div>
			{/snippet}

			<Frame>
				{#snippet top()}
					<div style="padding: 8px 12px; background: #e0f2fe; border-bottom: 1px solid #bae6fd; font-size: 14px;">Inner Frame Header</div>
				{/snippet}

				<div style="padding: 16px;">
					<p style="margin: 0; color: #666;">Nested frames allow complex layouts.</p>
				</div>

				{#snippet bottom()}
					<div style="padding: 8px 12px; background: #e0f2fe; border-top: 1px solid #bae6fd; font-size: 14px;">Inner Frame Footer</div>
				{/snippet}
			</Frame>
		</Frame>
	</div>
{/snippet}

{#snippet AppLayout()}
	<div style="height: 400px; border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden;">
		<Frame>
			{#snippet top()}
				<div style="padding: 12px 20px; background: linear-gradient(to right, #6366f1, #8b5cf6); color: white; display: flex; justify-content: space-between; align-items: center;">
					<span style="font-weight: 600;">MyApp</span>
					<div style="display: flex; gap: 16px; font-size: 14px;">
						<span>Docs</span>
						<span>Blog</span>
						<span>Login</span>
					</div>
				</div>
			{/snippet}

			{#snippet left()}
				<div style="width: 220px; padding: 20px; background: #fafafa; border-right: 1px solid #e5e5e5;">
					<div style="font-size: 12px; text-transform: uppercase; color: #999; margin-bottom: 12px;">Menu</div>
					<div style="display: flex; flex-direction: column; gap: 4px;">
						<div style="padding: 8px 12px; background: #6366f1; color: white; border-radius: 6px; font-size: 14px;">Home</div>
						<div style="padding: 8px 12px; color: #666; font-size: 14px;">Projects</div>
						<div style="padding: 8px 12px; color: #666; font-size: 14px;">Team</div>
						<div style="padding: 8px 12px; color: #666; font-size: 14px;">Settings</div>
					</div>
				</div>
			{/snippet}

			<div style="padding: 24px; background: white;">
				<h1 style="margin: 0 0 8px; font-size: 24px;">Dashboard</h1>
				<p style="color: #666; margin: 0 0 20px;">Welcome back! Here's what's happening.</p>
				<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
					<div style="padding: 16px; background: #f0fdf4; border-radius: 8px;">
						<div style="font-size: 24px; font-weight: 600; color: #16a34a;">128</div>
						<div style="font-size: 13px; color: #666;">Active Users</div>
					</div>
					<div style="padding: 16px; background: #eff6ff; border-radius: 8px;">
						<div style="font-size: 24px; font-weight: 600; color: #2563eb;">42</div>
						<div style="font-size: 13px; color: #666;">Projects</div>
					</div>
					<div style="padding: 16px; background: #fef3c7; border-radius: 8px;">
						<div style="font-size: 24px; font-weight: 600; color: #d97706;">7</div>
						<div style="font-size: 13px; color: #666;">Pending</div>
					</div>
				</div>
			</div>

			{#snippet bottom()}
				<div style="padding: 12px 20px; background: #fafafa; border-top: 1px solid #e5e5e5; font-size: 13px; color: #999; text-align: center;">© 2025 MyApp. All rights reserved.</div>
			{/snippet}
		</Frame>
	</div>
{/snippet}
