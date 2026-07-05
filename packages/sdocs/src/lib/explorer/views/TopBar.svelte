<script lang="ts">
	import type { SectionTree } from '../tree-builder.js';
	import { routeHref } from '../router.svelte.js';
	import { Icon } from '../../ui/Icon/index.js';

	type ThemeMode = 'light' | 'dark';

	interface Props {
		title: string;
		logo: string | false;
		sections: SectionTree[];
		activeSlug?: string;
		cssNames?: string[];
		activeStylesheet?: string;
		theme?: ThemeMode;
		onToggleFullscreen?: () => void;
		onStylesheetChange?: (name: string) => void;
		onThemeChange?: (theme: ThemeMode) => void;
	}

	let {
		title,
		logo,
		sections,
		activeSlug,
		cssNames = [],
		activeStylesheet,
		theme = 'light',
		onToggleFullscreen,
		onStylesheetChange,
		onThemeChange,
	}: Props = $props();

	const themeIcons: Record<ThemeMode, string> = { light: '☀', dark: '☽' };
	const themeLabels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark' };
</script>

<header class="sdocs-topbar">
	<a href={routeHref([])} class="sdocs-topbar-brand">
		{#if logo === 'sdocs'}
			<Icon name="sdocs" --w="22px" --h="22px" --fill="#FC1D29" />
		{:else if logo}
			<img class="sdocs-topbar-logo" src={logo} alt="" />
		{/if}
		{title}
	</a>
	<nav class="sdocs-topbar-sections">
		{#each sections as section (section.slug)}
			<a
				class="sdocs-topbar-tab"
				class:is-active={section.slug === activeSlug}
				aria-current={section.slug === activeSlug ? 'page' : undefined}
				href={routeHref(section.firstRoute ?? [section.slug])}
			>
				{section.name}
			</a>
		{/each}
	</nav>
	<div class="sdocs-topbar-actions">
		{#if cssNames.length > 1}
			<select
				class="sdocs-css-picker"
				value={activeStylesheet}
				onchange={(e) => onStylesheetChange?.(e.currentTarget.value)}
			>
				{#each cssNames as name (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
		{/if}
		<button class="sdocs-topbar-btn" onclick={() => onThemeChange?.(theme === 'light' ? 'dark' : 'light')} title="{themeLabels[theme]} theme">
			{themeIcons[theme]}
		</button>
		<button class="sdocs-topbar-btn" onclick={() => onToggleFullscreen?.()} title="Fullscreen">
			&#x26F6;
		</button>
	</div>
</header>

<style>
	.sdocs-topbar {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 16px;
		height: 48px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-base-200);
		background: var(--color-base-0);
		font-family: var(--sans);
	}
	.sdocs-topbar-brand {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 18px;
		color: var(--color-base-900);
		text-decoration: none;
	}
	.sdocs-topbar-logo {
		width: 22px;
		height: 22px;
		object-fit: contain;
	}
	.sdocs-topbar-sections {
		display: flex;
		align-items: stretch;
		gap: 4px;
		height: 100%;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}
	.sdocs-topbar-tab {
		display: flex;
		align-items: center;
		padding: 0 12px;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-base-500);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
	}
	.sdocs-topbar-tab:hover {
		color: var(--color-base-900);
	}
	.sdocs-topbar-tab.is-active {
		color: var(--color-action-500);
		border-bottom-color: var(--color-action-500);
	}
	.sdocs-topbar-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sdocs-css-picker {
		font-size: 12px;
		padding: 2px 4px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
	}
	.sdocs-topbar-btn {
		padding: 2px 6px;
		border: 1px solid var(--color-base-200);
		border-radius: 4px;
		background: var(--color-base-0);
		color: var(--color-base-600);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.sdocs-topbar-btn:hover {
		background: var(--color-base-100);
	}
</style>
