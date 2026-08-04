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
		/** This dev server serves the MCP endpoint — show the MCP button. */
		mcp?: boolean;
		/** Narrow viewport with somewhere to navigate: show the drawer toggle. */
		showBurger?: boolean;
		/** Whether the nav drawer is currently open. */
		navOpen?: boolean;
		onToggleNav?: () => void;
		/** The bar stays above the scrim, so its own links have to dismiss the
		 * drawer themselves or they'd load a page behind it. */
		onCloseNav?: () => void;
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
		mcp = false,
		showBurger = false,
		navOpen = false,
		onToggleNav,
		onCloseNav,
		onToggleFullscreen,
		onStylesheetChange,
		onThemeChange,
	}: Props = $props();

	// Closing the drawer hands focus back to the control that opened it, so a
	// keyboard user isn't dropped at the top of the document.
	let burgerEl = $state<HTMLButtonElement>();
	let wasNavOpen = false;
	$effect(() => {
		if (navOpen) {
			wasNavOpen = true;
		} else if (wasNavOpen) {
			wasNavOpen = false;
			burgerEl?.focus();
		}
	});

	const themeIcons: Record<ThemeMode, string> = { light: '☀', dark: '☽' };
	const themeLabels: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark' };

	// MCP info modal — endpoint resolved from the page, so it's right for any
	// host/port the dev server actually runs on.
	let mcpDialog: HTMLDialogElement | undefined = $state();
	let mcpUrl = $state('');
	let copied = $state('');
	const MCP_STDIO = 'npx sdocs mcp';
	const MCP_TOOLS = [
		['validate_sdoc', 'parse .sdoc text, return diagnostics and entities'],
		['scaffold_component_doc', 'a starter .sdoc from a component’s extracted props'],
		['get_authoring_guide', 'the full format reference (also at /llms.txt on the sdocs site)'],
		['list_docs', 'this project’s .sdoc files and the components they document'],
		['get_component_api', 'a component’s full extracted API'],
	];

	function openMcp() {
		mcpUrl = `${location.origin}/mcp`;
		copied = '';
		mcpDialog?.showModal();
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			setTimeout(() => (copied = ''), 1500);
		} catch {
			// Clipboard unavailable — the text is visible to select manually.
		}
	}
</script>

<header class="sdocs-topbar">
	{#if showBurger}
		<button
			bind:this={burgerEl}
			class="sdocs-burger"
			aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
			aria-expanded={navOpen}
			aria-controls="sdocs-nav"
			onclick={() => onToggleNav?.()}
		>
			<!-- Stays a burger while open: the drawer carries its own close,
			     and two X's a few pixels apart read as two different exits.
			     aria-expanded is what announces the state. -->
			<Icon name="menu" --w="20px" --h="20px" />
		</button>
	{/if}
	<a href={routeHref([])} class="sdocs-topbar-brand" onclick={() => onCloseNav?.()}>
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
				{section.title}
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
		{#if mcp}
			<button class="sdocs-topbar-btn sdocs-mcp-btn" onclick={openMcp} title="MCP server">
				MCP
			</button>
		{/if}
		<button class="sdocs-topbar-btn" onclick={() => onThemeChange?.(theme === 'light' ? 'dark' : 'light')} title="{themeLabels[theme]} theme">
			{themeIcons[theme]}
		</button>
		<button
			class="sdocs-topbar-btn sdocs-fullscreen-btn"
			onclick={() => onToggleFullscreen?.()}
			title="Fullscreen"
		>
			&#x26F6;
		</button>
		<!-- A real link: middle-click and open-in-new-tab work, and history
		     mode routes it client-side like any other internal anchor. -->
		<a
			class="sdocs-topbar-btn sdocs-about-btn"
			href={routeHref(['about'])}
			title="About"
			onclick={() => onCloseNav?.()}
		>
			&#9432;
		</a>
	</div>
</header>

{#if mcp}
	<dialog
		class="sdocs-mcp-dialog"
		bind:this={mcpDialog}
		onclick={(e) => e.target === mcpDialog && mcpDialog?.close()}
	>
		<div class="sdocs-mcp-body">
			<div class="sdocs-mcp-head">
				<h2>MCP server</h2>
				<button class="sdocs-topbar-btn" onclick={() => mcpDialog?.close()} title="Close">✕</button>
			</div>
			<p class="sdocs-mcp-lead">
				This dev server also serves the sdocs MCP server — authoring tools an
				agent can use to read this project's components and write valid
				<code>.sdoc</code> docs.
			</p>

			<div class="sdocs-mcp-row">
				<span class="sdocs-mcp-label">HTTP</span>
				<code>{mcpUrl}</code>
				<button class="sdocs-topbar-btn" onclick={() => copy(mcpUrl)}>
					{copied === mcpUrl ? 'Copied' : 'Copy'}
				</button>
			</div>
			<div class="sdocs-mcp-row">
				<span class="sdocs-mcp-label">stdio</span>
				<code>{MCP_STDIO}</code>
				<button class="sdocs-topbar-btn" onclick={() => copy(MCP_STDIO)}>
					{copied === MCP_STDIO ? 'Copied' : 'Copy'}
				</button>
			</div>

			<h3>Tools</h3>
			<ul class="sdocs-mcp-tools">
				{#each MCP_TOOLS as [name, blurb] (name)}
					<li><code>{name}</code> — {blurb}</li>
				{/each}
			</ul>

			<p class="sdocs-mcp-note">
				Turn this off with <code>mcp: false</code> in <code>sdocs.config.js</code>.
				Built sites never serve an MCP endpoint.
			</p>
		</div>
	</dialog>
{/if}

<style>
	.sdocs-topbar {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 16px;
		height: var(--sdocs-topbar-h, 48px);
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-base-200);
		background: var(--color-base-0);
		font-family: var(--sans);
	}
	.sdocs-burger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		margin-left: -8px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--color-base-600);
		cursor: pointer;
	}
	.sdocs-burger:hover {
		background: var(--color-base-100);
		color: var(--color-base-900);
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
	/* The About link wears the button's chrome. */
	.sdocs-about-btn {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}
	.sdocs-mcp-btn {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	@media (max-width: 860px) {
		.sdocs-topbar {
			gap: 8px;
			padding: 0 12px;
		}
		/* The tabs move into the drawer, so the actions take the free space. */
		.sdocs-topbar-sections {
			display: none;
		}
		.sdocs-topbar-actions {
			margin-left: auto;
		}
		/* A long site name gives way rather than pushing the actions off. */
		.sdocs-topbar-brand {
			min-width: 0;
			font-size: 16px;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		/* The stylesheet picker moves into the drawer: it's the one control
		   here wide enough to crowd out everything else. */
		.sdocs-css-picker {
			display: none;
		}
		.sdocs-topbar-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 40px;
			min-height: 40px;
			border-color: transparent;
			font-size: 16px;
		}
		.sdocs-mcp-btn {
			font-size: 11px;
			border-color: var(--color-base-200);
		}
		/* Fullscreen hides chrome to free the stage — on a phone there is no
		   chrome worth the trade, and its exit is a hover-only hot corner.
		   After the .sdocs-topbar-btn block, which also sets `display`. */
		.sdocs-fullscreen-btn {
			display: none;
		}
	}

	/* MCP info modal */
	.sdocs-mcp-dialog {
		width: min(560px, calc(100vw - 48px));
		padding: 0;
		border: 1px solid var(--color-base-200);
		border-radius: 10px;
		background: var(--color-base-0);
		color: var(--color-base-800);
		font-family: var(--sans);
		font-size: 13px;
	}
	.sdocs-mcp-dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.sdocs-mcp-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px 24px;
	}
	.sdocs-mcp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sdocs-mcp-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--color-base-900);
	}
	.sdocs-mcp-lead {
		margin: 0;
		color: var(--color-base-600);
		line-height: 1.5;
	}
	.sdocs-mcp-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.sdocs-mcp-label {
		flex-shrink: 0;
		width: 40px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-base-400);
	}
	.sdocs-mcp-row code {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 5px 8px;
		border: 1px solid var(--color-base-150);
		border-radius: 6px;
		background: var(--color-base-50);
		font-size: 12px;
	}
	.sdocs-mcp-body h3 {
		margin: 6px 0 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-base-400);
	}
	.sdocs-mcp-tools {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		color: var(--color-base-600);
	}
	.sdocs-mcp-tools code,
	.sdocs-mcp-lead code,
	.sdocs-mcp-note code {
		font-size: 12px;
		color: var(--color-base-800);
	}
	.sdocs-mcp-note {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--color-base-500);
	}
</style>
