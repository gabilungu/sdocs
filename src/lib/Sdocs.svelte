<script lang="ts">
	import { docs as virtualDocs } from 'virtual:sdocs';
	import type { SdocsProps, DocFile, Example, DocMeta } from './types.js';
	import { propsToArgTypes, propsToDefaultArgs, cssVarsToCssProps, docgenToMethods, type ComponentDocgen } from './docgen.js';
	import Showcase from './internal/Showcase.svelte';
	import { CodeBlock, CollapsiblePanel } from './ui/index.js';
	import ComponentPreview from './internal/ComponentPreview.svelte';
	import Home from './internal/Home.svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Folder from 'lucide-svelte/icons/folder';
	import FolderOpen from 'lucide-svelte/icons/folder-open';
	import Component from 'lucide-svelte/icons/component';
	import FileText from 'lucide-svelte/icons/file-text';
	import Bookmark from 'lucide-svelte/icons/bookmark';
	import './ui/css/global.css';

	const browser = typeof window !== 'undefined';

	let { docs, options }: SdocsProps = $props();

	// Use provided docs or fall back to virtual module
	const docModules = $derived(docs ?? virtualDocs ?? {});

	type ViewMode = 'docs' | 'story';

	// Tree node for hierarchical navigation
	interface NavNode {
		name: string;
		children: NavNode[];
		file?: DocFile;  // Only leaf nodes have a file
	}

	// Parse doc files from the glob import
	function parseDocs(
		docModulesInput: Record<string, unknown>
	): DocFile[] {
		return Object.entries(docModulesInput).map(([path, mod]) => {
			const module = mod as Record<string, unknown>;
			const isMarkdown = path.endsWith('.svx');
			const rawMeta = (module.meta as DocMeta) ?? { component: null };

			// Get snippet sources and example order (injected by vite plugin)
			const snippetSources = (module.__snippetSources as Record<string, string>) ?? {};
			const exampleOrder = (module.__exampleOrder as string[]) ?? [];

			// Extract examples from the module
			const exampleEntries: Example[] = Object.entries(module)
				.filter(([key, value]) => key !== 'meta' && key !== 'default' && key !== '__snippetSources' && key !== '__exampleOrder' && typeof value === 'function')
				.map(([name, render]) => ({
					name,
					render: render as Example['render'],
					source: snippetSources[name]
				}));

			// Sort examples by export order if available
			if (exampleOrder.length > 0) {
				exampleEntries.sort((a, b) => {
					const aIndex = exampleOrder.indexOf(a.name);
					const bIndex = exampleOrder.indexOf(b.name);
					// Put examples not in order list at the end
					if (aIndex === -1 && bIndex === -1) return 0;
					if (aIndex === -1) return 1;
					if (bIndex === -1) return -1;
					return aIndex - bIndex;
				});
			}

			// Try to get auto-generated docgen from component
			const component = rawMeta.component as { __docgen?: ComponentDocgen } | undefined;
			const docgen = component?.__docgen;

			// Auto-generate argTypes from docgen
			const argTypes = docgen ? propsToArgTypes(docgen) : {};

			// Extract default args from docgen, merge with manual args (manual overrides auto)
			const autoArgs = docgen ? propsToDefaultArgs(docgen) : {};
			const args = rawMeta.args ? { ...autoArgs, ...rawMeta.args } : autoArgs;

			// Get description from docgen (auto-generated from JSDoc)
			const description = rawMeta.description ?? docgen?.description;

			// Auto-generate cssProps from @cssvar JSDoc tags
			const cssProps = docgen ? cssVarsToCssProps(docgen) : undefined;

			// Auto-generate methods from exported functions
			const methods = docgen ? docgenToMethods(docgen) : undefined;

			// Determine type: 'page' for standalone docs, 'component' for component documentation
			const hasExamples = exampleEntries.length > 0;
			const type = isMarkdown && !hasExamples ? 'page' : 'component';

			return {
				path,
				meta: {
					title: rawMeta.title ?? pathToTitle(path),
					description,
					component: rawMeta.component,
					args,
					argTypes,
					cssProps,
					methods
				},
				examples: exampleEntries,
				module,
				type,
				isMarkdown
			};
		});
	}

	// Expand args references in source code with actual prop values
	function expandArgsInSource(source: string, args: Record<string, unknown>): string {
		let result = source;

		// Replace {...args} with individual prop="value" pairs
		result = result.replace(/\{\s*\.\.\.args\s*\}/g, () => {
			const props = Object.entries(args)
				.map(([key, value]) => {
					if (typeof value === 'string') {
						return `${key}="${value}"`;
					} else if (typeof value === 'boolean') {
						return value ? key : `${key}={false}`;
					} else {
						return `${key}={${JSON.stringify(value)}}`;
					}
				})
				.join(' ');
			return props;
		});

		// Replace {args.propName as Type} or {args.propName} with actual values
		result = result.replace(/\{args\.(\w+)(?:\s+as\s+[^}]+)?\}/g, (_, propName) => {
			const value = args[propName];
			if (value === undefined) return `{args.${propName}}`;
			if (typeof value === 'string') {
				return `"${value}"`;
			} else if (typeof value === 'boolean') {
				return `{${value}}`;
			} else {
				return `{${JSON.stringify(value)}}`;
			}
		});

		return result;
	}

	// Convert file path to readable title
	function pathToTitle(path: string): string {
		const filename = path.split('/').pop() ?? path;
		return filename
			.replace('.docs.svelte', '')
			.replace('.docs.svx', '')
			.replace(/([A-Z])/g, ' $1')
			.trim();
	}

	// Build navigation tree from flat doc files
	function buildNavTree(files: DocFile[]): NavNode[] {
		const root: NavNode[] = [];

		for (const file of files) {
			const parts = (file.meta.title ?? '').split('/').map(p => p.trim());
			let currentLevel = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const isLast = i === parts.length - 1;

				let existing = currentLevel.find(n => n.name === part);
				if (!existing) {
					existing = {
						name: part,
						children: [],
						file: isLast ? file : undefined
					};
					currentLevel.push(existing);
				} else if (isLast) {
					// Update existing folder node to also be a file
					existing.file = file;
				}

				currentLevel = existing.children;
			}
		}

		// Sort tree with custom order support (supports any depth via path keys)
		// Order format: ['First', 'Second', '*', 'Last'] - items before * come first, after * come last
		function sortTree(nodes: NavNode[], order?: string[], orderMap?: Record<string, string[]>, currentPath = ''): void {
			nodes.sort((a, b) => {
				if (order && order.length > 0) {
					const starIndex = order.indexOf('*');
					const aIndex = order.findIndex((o) => o === '*' ? false : o.toLowerCase() === a.name.toLowerCase());
					const bIndex = order.findIndex((o) => o === '*' ? false : o.toLowerCase() === b.name.toLowerCase());

					// Determine position category: -1 = before *, 0 = is *, 1 = after *
					const aPos = aIndex === -1 ? 0 : (starIndex === -1 || aIndex < starIndex ? -1 : 1);
					const bPos = bIndex === -1 ? 0 : (starIndex === -1 || bIndex < starIndex ? -1 : 1);

					// Different categories: before * < * group < after *
					if (aPos !== bPos) return aPos - bPos;

					// Same category
					if (aPos === 0) {
						// Both in * group - alphabetical
						return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
					}
					// Both explicitly ordered (both before or both after *) - by index
					return aIndex - bIndex;
				}
				// No order specified - alphabetical
				return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
			});
			// Recursively sort children with their specific order if available
			for (const node of nodes) {
				if (node.children.length > 0) {
					const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
					// Try path-based key first, then just the node name
					const childOrder = orderMap?.[nodePath] ?? orderMap?.[node.name];
					sortTree(node.children, childOrder, orderMap, nodePath);
				}
			}
		}

		// Normalize sidebar order to extract top-level order and folder-specific orders
		const sidebarOrder = options?.sidebar?.order;
		let topLevelOrder: string[] | undefined;
		let orderMap: Record<string, string[]> | undefined;

		if (Array.isArray(sidebarOrder)) {
			topLevelOrder = sidebarOrder;
		} else if (sidebarOrder) {
			topLevelOrder = sidebarOrder['root'];
			orderMap = sidebarOrder;
		}

		sortTree(root, topLevelOrder, orderMap);

		return root;
	}

	// Get the display name (last part of title)
	function getDisplayName(title: string | undefined): string {
		if (!title) return '';
		const parts = title.split('/');
		return parts[parts.length - 1].trim();
	}

	let docFiles = $derived(parseDocs(docModules));
	let navTree = $derived(buildNavTree(docFiles));

	// Count components and pages for Home
	let componentCount = $derived(docFiles.filter(f => f.type === 'component').length);
	let pageCount = $derived(docFiles.filter(f => f.type === 'page').length);

	let selectedFile = $state<DocFile | null>(null);
	let selectedExample = $state<Example | null>(null);
	let viewMode = $state<ViewMode>('docs');
	let args = $state<Record<string, unknown>>({});
	let showCode = $state(false);
	let initialized = $state(false);
	let expandedFolders = $state<Set<string>>(new Set());
	let collapsedFolders = $state<Set<string>>(new Set()); // Track explicitly collapsed folders

	// Active file is the selected file (can be null to show Home)
	let activeFile = $derived(selectedFile);

	function toggleFolder(path: string) {
		if (expandedFolders.has(path)) {
			expandedFolders.delete(path);
		} else {
			expandedFolders.add(path);
		}
		expandedFolders = new Set(expandedFolders); // Trigger reactivity
	}

	function selectComponent(file: DocFile, nodePath: string) {
		const isCurrentlySelected = activeFile?.path === file.path && viewMode === 'docs';
		const isExpanded = isFolderExpanded(nodePath);

		if (isCurrentlySelected && isExpanded) {
			// Clicking again: deselect and close
			selectedFile = null;
			toggleFolder(nodePath);
		} else {
			// Select and show docs
			selectDocs(file);
		}
	}

	function isFolderExpanded(path: string): boolean {
		return effectiveExpandedFolders.has(path);
	}

	// Auto-expand folders that contain the selected file AND the file itself
	function expandPathToFile(file: DocFile) {
		const parts = (file.meta.title ?? '').split('/').map(p => p.trim());
		let path = '';
		// Expand all parts including the component itself
		for (let i = 0; i < parts.length; i++) {
			path = path ? `${path}/${parts[i]}` : parts[i];
			expandedFolders.add(path);
		}
		expandedFolders = new Set(expandedFolders);
	}

	// Get argTypes from active file's meta
	let currentArgTypes = $derived(activeFile?.meta.argTypes ?? {});

	// Default args from active file (for SSR)
	let defaultArgs = $derived(activeFile?.meta.args ?? {});

	// Paths to open by default from options
	let configuredOpenPaths = $derived(new Set(options?.sidebar?.open ?? []));

	// Compute expanded folders for the active file (works during SSR)
	let defaultExpandedPaths = $derived.by(() => {
		if (!activeFile) return new Set<string>();
		const parts = (activeFile.meta.title ?? '').split('/').map(p => p.trim());
		const paths = new Set<string>();
		let path = '';
		for (let i = 0; i < parts.length; i++) {
			path = path ? `${path}/${parts[i]}` : parts[i];
			paths.add(path);
		}
		return paths;
	});

	// Merge explicit expanded folders with defaults and configured open paths, excluding explicitly collapsed ones
	let effectiveExpandedFolders = $derived.by(() => {
		const merged = new Set([...configuredOpenPaths, ...defaultExpandedPaths, ...expandedFolders]);
		for (const path of collapsedFolders) {
			merged.delete(path);
		}
		return merged;
	});

	// Create a plain object snapshot of args for rendering
	// Use defaultArgs during SSR when args is empty
	let argsSnapshot = $derived(
		Object.keys(args).length > 0 ? $state.snapshot(args) : defaultArgs
	);

	// Read URL params and initialize selection
	function initFromUrl() {
		if (!browser) return;

		const params = new URLSearchParams(window.location.search);
		const componentName = params.get('component');
		const storyName = params.get('story');

		if (componentName) {
			const file = docFiles.find(f => f.meta.title === componentName);
			if (file) {
				selectedFile = file;
				args = { ...(file.meta.args ?? {}) };
				expandPathToFile(file);

				if (storyName) {
					const example = file.examples.find(s => s.name === storyName);
					if (example) {
						selectedExample = example;
						viewMode = 'story';
					} else {
						viewMode = 'docs';
					}
				} else {
					viewMode = 'docs';
				}
			}
		}
		// No component param = show Home (selectedFile stays null)
		initialized = true;
	}

	// Update URL when selection changes
	function updateUrl() {
		if (!browser || !initialized) return;

		if (!selectedFile) {
			// Going home - clear params
			window.history.replaceState({}, '', window.location.pathname);
			return;
		}

		const params = new URLSearchParams();
		params.set('component', selectedFile.meta.title ?? '');

		if (viewMode === 'story' && selectedExample) {
			params.set('story', selectedExample.name);
		}

		const newUrl = `${window.location.pathname}?${params.toString()}`;
		window.history.replaceState({}, '', newUrl);
	}

	// Initialize from URL when docs load (use $effect.pre to run before render)
	$effect.pre(() => {
		if (docFiles.length > 0 && !initialized) {
			initFromUrl();
		}
	});

	// Handle browser back/forward
	$effect(() => {
		if (!browser) return;

		const handlePopState = () => {
			initialized = false;
			initFromUrl();
		};

		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	});

	function goHome() {
		selectedFile = null;
		selectedExample = null;
		viewMode = 'docs';
		args = {};
		showCode = false;
		updateUrl();
	}

	function selectDocs(file: DocFile) {
		selectedFile = file;
		selectedExample = null;
		viewMode = 'docs';
		args = { ...(file.meta.args ?? {}) };
		showCode = false;
		expandPathToFile(file);
		updateUrl();
	}

	function selectExample(file: DocFile, example: Example) {
		selectedFile = file;
		selectedExample = example;
		viewMode = 'story';
		args = { ...(file.meta.args ?? {}) };
		showCode = false;
		expandPathToFile(file);
		updateUrl();
	}

	function handleArgsChange(newArgs: Record<string, unknown>) {
		args = newArgs;
	}

	function toggleCode() {
		showCode = !showCode;
	}
</script>

{#snippet renderNavNode(node: NavNode, depth: number, parentPath: string)}
	{@const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name}
	{@const isFolder = node.children.length > 0 && !node.file}
	{@const isFolderWithFile = node.children.length > 0 && node.file}
	{@const expanded = isFolderExpanded(nodePath)}

	{#if isFolder || isFolderWithFile}
		<!-- Folder node -->
		<div class="sdocs-folder" style="--depth: {depth}">
			<button
				type="button"
				class="sdocs-folder-btn"
				onclick={() => {
					const wasExpanded = isFolderExpanded(nodePath);
					if (wasExpanded) {
						collapsedFolders.add(nodePath);
						collapsedFolders = new Set(collapsedFolders);
						expandedFolders.delete(nodePath);
						expandedFolders = new Set(expandedFolders);
					} else {
						collapsedFolders.delete(nodePath);
						collapsedFolders = new Set(collapsedFolders);
						expandedFolders.add(nodePath);
						expandedFolders = new Set(expandedFolders);
					}
				}}
			>
				{#if expanded}
					<FolderOpen size={16} strokeWidth={1.75} />
				{:else}
					<Folder size={16} strokeWidth={1.75} />
				{/if}
				<span class="sdocs-item-name">{node.name}</span>
				<span class="sdocs-folder-icon" class:expanded>
					<ChevronRight size={14} strokeWidth={2} />
				</span>
			</button>
			{#if expanded}
				{#if isFolderWithFile && node.file}
					<!-- Folder that is also a component -->
					<ul class="sdocs-story-list">
						<li>
							<button
								type="button"
								class="sdocs-story-btn sdocs-docs-btn"
								class:active={activeFile?.path === node.file.path && viewMode === 'docs'}
								onclick={() => node.file && selectDocs(node.file)}
							>
								<FileText size={14} strokeWidth={1.75} />
								Docs
							</button>
						</li>
						{#each node.file.examples.filter(e => e.name !== 'Default') as example (example.name)}
							<li>
								<button
									type="button"
									class="sdocs-story-btn"
									class:active={activeFile?.path === node.file?.path && selectedExample?.name === example.name && viewMode === 'story'}
									onclick={() => node.file && selectExample(node.file, example)}
								>
									<Bookmark size={14} strokeWidth={1.75} />
									{example.name}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="sdocs-folder-children">
					{#each node.children as child (child.name)}
						{@render renderNavNode(child, depth + 1, nodePath)}
					{/each}
				</div>
			{/if}
		</div>
	{:else if node.file}
		<!-- Leaf node -->
		{#if node.file.type === 'page'}
			<!-- Doc page (markdown) - no expansion needed -->
			<div class="sdocs-doc-item" style="--depth: {depth}">
				<button
					type="button"
					class="sdocs-doc-btn"
					class:active={activeFile?.path === node.file.path}
					onclick={() => node.file && selectDocs(node.file)}
				>
					<FileText size={14} strokeWidth={1.75} />
					{node.name}
				</button>
			</div>
		{:else}
			<!-- Component with examples -->
			<div class="sdocs-component" style="--depth: {depth}">
				<button
					type="button"
					class="sdocs-component-btn"
					onclick={() => {
						const wasExpanded = isFolderExpanded(nodePath);

						if (wasExpanded) {
							// Collapse: add to explicitly collapsed folders
							collapsedFolders.add(nodePath);
							collapsedFolders = new Set(collapsedFolders);
							expandedFolders.delete(nodePath);
							expandedFolders = new Set(expandedFolders);
						} else {
							// Expand: remove from collapsed, add to expanded, select docs
							collapsedFolders.delete(nodePath);
							collapsedFolders = new Set(collapsedFolders);
							expandedFolders.add(nodePath);
							expandedFolders = new Set(expandedFolders);
							if (node.file) {
								selectDocs(node.file);
							}
						}
					}}
				>
					<span class="sdocs-component-icon">
						<Component size={14} strokeWidth={1.75} />
					</span>
					<span class="sdocs-item-name">{node.name}</span>
					<span class="sdocs-folder-icon" class:expanded>
						<ChevronRight size={14} strokeWidth={2} />
					</span>
				</button>
				{#if expanded}
					<ul class="sdocs-story-list">
						<li>
							<button
								type="button"
								class="sdocs-story-btn sdocs-docs-btn"
								class:active={activeFile?.path === node.file.path && viewMode === 'docs'}
								onclick={() => node.file && selectDocs(node.file)}
							>
								<FileText size={14} strokeWidth={1.75} />
								Docs
							</button>
						</li>
						{#each node.file.examples.filter(e => e.name !== 'Default') as example (example.name)}
							<li>
								<button
									type="button"
									class="sdocs-story-btn"
									class:active={activeFile?.path === node.file?.path && selectedExample?.name === example.name && viewMode === 'story'}
									onclick={() => node.file && selectExample(node.file, example)}
								>
									<Bookmark size={14} strokeWidth={1.75} />
									{example.name}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{/if}
{/snippet}

<div class="sdocs">
	<aside class="sdocs-sidebar">
		<button type="button" class="sdocs-title" onclick={goHome}>sdocs</button>
		<nav class="sdocs-nav">
			{#each navTree as node (node.name)}
				{@render renderNavNode(node, 0, '')}
			{/each}
		</nav>
	</aside>

	<main class="sdocs-main">
		{#if !activeFile}
			<!-- Home view -->
			<Home {componentCount} {pageCount} />
		{:else if activeFile.type === 'page' && viewMode === 'docs'}
			<!-- Markdown doc view -->
			{@const DocComponent = activeFile.module.default as import('svelte').Component}
			<div class="sdocs-docs-view sdocs-markdown">
				<DocComponent />
			</div>
		{:else if viewMode === 'docs'}
			<!-- Component docs view -->
			{@const defaultExample = activeFile.examples.find(s => s.name === 'Default')}
			{@const otherExamples = activeFile.examples.filter(s => s.name !== 'Default')}
			<div class="sdocs-docs-view">
				<div class="sdocs-docs-header">
					<h2 class="sdocs-docs-title">{getDisplayName(activeFile.meta.title)}</h2>
				</div>
				{#if activeFile.meta.description}
					<p class="sdocs-docs-description">{activeFile.meta.description}</p>
				{/if}

				<!-- Component Showcase (preview + controls + props) -->
				{#if defaultExample}
					<Showcase
						render={defaultExample.render}
						args={argsSnapshot}
						argTypes={currentArgTypes}
						cssProps={activeFile.meta.cssProps}
						methods={activeFile.meta.methods}
						onchange={handleArgsChange}
						source={defaultExample.source ? expandArgsInSource(defaultExample.source, argsSnapshot) : undefined}
					/>
				{:else}
					<ComponentPreview padding="l">
						<p class="sdocs-no-default">No default example provided</p>
					</ComponentPreview>
				{/if}

				<!-- Markdown content for .svx files (client-only to avoid hydration mismatch) -->
				{#if activeFile.isMarkdown && browser}
					{@const DocComponent = activeFile.module.default as import('svelte').Component}
					<section class="sdocs-section sdocs-markdown">
						<DocComponent />
					</section>
				{/if}

				<!-- Examples section (excludes Default) -->
				{#if otherExamples.length > 0}
				<section class="sdocs-section">
					<h3 class="sdocs-section-title">Examples</h3>
					<div class="sdocs-examples-grid">
						{#each otherExamples as example (example.name)}
							<div class="sdocs-example-card">
								<div class="sdocs-example-card-header">
									<span class="sdocs-example-card-name">{example.name}</span>
									<button
										type="button"
										class="sdocs-link-btn"
										onclick={() => activeFile && selectExample(activeFile, example)}
									>
										Open
									</button>
								</div>
								<ComponentPreview bordered={false}>
									{@render example.render(argsSnapshot)}
								</ComponentPreview>
								{#if example.source}
									<CollapsiblePanel title="Code" open={false} no_content_padding>
										<CodeBlock code={example.source} />
									</CollapsiblePanel>
								{/if}
							</div>
						{/each}
					</div>
				</section>
				{/if}
			</div>
		{:else if selectedExample && viewMode === 'story'}
			<!-- Single example view -->
			<div class="sdocs-example-view">
				<div class="sdocs-example-header">
					<h2 class="sdocs-example-title">{selectedExample.name}</h2>
					<button type="button" class="sdocs-code-btn" onclick={toggleCode}>
						{showCode ? 'Hide Code' : 'Show Code'}
					</button>
				</div>

				<ComponentPreview padding="l">
					{@render selectedExample.render(argsSnapshot)}
				</ComponentPreview>

				{#if showCode && selectedExample?.source}
					<CodeBlock code={expandArgsInSource(selectedExample.source, argsSnapshot)} />
				{:else if showCode}
					<CodeBlock code="Source code not available" />
				{/if}
			</div>
		{/if}
	</main>
</div>

<style>
	/* Reset body margin when Sdocs is used */
	:global(body:has(.sdocs)) {
		margin: 0;
		padding: 0;
	}

	/* Reset all inherited styles for isolation */
	.sdocs,
	.sdocs *,
	.sdocs *::before,
	.sdocs *::after {
		all: revert;
		box-sizing: border-box;
	}

	.sdocs {
		display: grid;
		grid-template-columns: 260px 1fr;
		height: 100vh;
		font-family: var(--font-sans);
		background: var(--color-bg);
		color: var(--color-text);
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}

	.sdocs-sidebar {
		background: var(--color-bg-elevated);
		color: var(--color-text);
		padding: 0;
		overflow-y: auto;
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
	}

	.sdocs-title {
		font-size: 18px;
		font-weight: 700;
		margin: 0;
		padding: 16px 20px;
		color: var(--color-text);
		display: flex;
		align-items: center;
		gap: 8px;
		border: none;
		border-bottom: 1px solid var(--color-border-subtle);
		background: linear-gradient(to bottom, var(--color-bg-elevated), var(--base-50));
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background 0.15s ease;
	}

	.sdocs-title:hover {
		background: linear-gradient(to bottom, var(--base-50), var(--base-100));
	}

	.sdocs-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 16px 12px;
		flex: 1;
	}

	.sdocs-folder {
		margin-left: calc(var(--depth, 0) * 12px);
	}

	.sdocs-folder-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		height: 28px;
		text-align: left;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		padding: 0 8px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		transition: all 0.15s ease;
	}

	.sdocs-folder-btn:hover {
		background: var(--color-bg-hover);
		color: var(--color-text);
	}

	.sdocs-folder-btn :global(svg:not(:first-child)) {
		color: var(--base-500);
	}

	.sdocs-item-name {
		flex: 1;
		text-align: left;
	}

	.sdocs-folder-icon {
		display: flex;
		align-items: center;
		color: var(--color-text-muted);
		transition: transform 0.15s ease;
		margin-left: auto;
	}

	.sdocs-folder-icon.expanded {
		transform: rotate(90deg);
	}

	.sdocs-folder-children {
		margin-top: 2px;
	}

	.sdocs-component {
		margin-left: calc(var(--depth, 0) * 12px);
		margin-bottom: 4px;
	}

	.sdocs-component-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		height: 28px;
		text-align: left;
		background: none;
		border: none;
		font-size: 14px;
		font-weight: 600;
		color: var(--color-text);
		padding: 0 8px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.sdocs-component-btn:hover {
		background: var(--color-bg-hover);
	}

	.sdocs-component-icon {
		display: flex;
		color: var(--pink-500);
	}

	/* Target the component icon SVG */
	:global(.sdocs-component-btn > svg:first-child) {
		color: var(--pink-500);
	}

	.sdocs-doc-item {
		margin-left: calc(var(--depth, 0) * 12px);
		margin-bottom: 4px;
	}

	.sdocs-doc-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 28px;
		text-align: left;
		background: none;
		border: none;
		font-size: 14px;
		font-weight: 500;
		color: var(--color-text-secondary);
		padding: 0 8px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.sdocs-doc-btn:hover {
		background: var(--color-bg-hover);
		color: var(--color-text);
	}

	.sdocs-doc-btn.active {
		background: var(--focus-100);
		color: var(--color-text);
		font-weight: 600;
	}

	.sdocs-doc-btn :global(svg) {
		color: var(--focus-500);
	}

	.sdocs-story-list {
		list-style: none;
		margin: 0;
		padding: 0;
		padding-left: calc(14px + 8px); /* icon width + gap */
	}

	.sdocs-story-list li {
		margin-bottom: 2px;
	}

	.sdocs-story-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		height: 28px;
		text-align: left;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		padding: 0 12px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.15s ease;
	}

	.sdocs-docs-btn {
		color: var(--color-text);
	}

	.sdocs-docs-btn :global(svg) {
		color: var(--warning-500);
	}

	.sdocs-story-btn:not(.sdocs-docs-btn) :global(svg) {
		color: var(--sky-500);
	}

	.sdocs-story-btn:hover {
		background: var(--color-bg-hover);
		color: var(--color-text);
	}

	.sdocs-story-btn.active {
		background: var(--focus-100);
		color: var(--color-text);
		font-weight: 500;
	}

	.sdocs-docs-btn.active {
		font-weight: 500;
	}

	.sdocs-main {
		background: var(--color-bg);
		overflow: auto;
		padding: 24px 32px;
	}

	/* Docs view */
	.sdocs-docs-view {
		max-width: 860px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.sdocs-docs-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.sdocs-docs-title {
		font-size: 30px;
		font-weight: 700;
		margin: 0;
		color: var(--color-text);
		letter-spacing: -0.02em;
	}

	.sdocs-docs-description {
		font-size: 16px;
		color: var(--color-text-secondary);
		margin: -16px 0 0;
		line-height: 1.5;
	}

	.sdocs-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.sdocs-section-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	/* Examples list */
	.sdocs-examples-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.sdocs-example-card {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--color-border);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.sdocs-example-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 12px 12px 16px;
		background: var(--color-bg);
	}

	.sdocs-example-card-name {
		font-weight: 600;
		font-size: 14px;
		color: var(--color-text);
	}

	.sdocs-link-btn {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.sdocs-link-btn:hover {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--base-0);
	}

	/* Example view */
	.sdocs-example-view {
		max-width: 860px;
	}

	.sdocs-example-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
	}

	.sdocs-example-title {
		font-size: 24px;
		font-weight: 700;
		margin: 0;
		color: var(--color-text);
		letter-spacing: -0.01em;
	}

	.sdocs-code-btn {
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		font-size: 12px;
		font-weight: 500;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.sdocs-code-btn:hover {
		background: var(--color-bg-hover);
		border-color: var(--base-300);
	}

	.sdocs-no-default {
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	/* Markdown content styles */
	.sdocs-markdown {
		max-width: 720px;
	}

	.sdocs-markdown :global(h1) {
		font-size: 30px;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 24px;
		letter-spacing: -0.02em;
	}

	.sdocs-markdown :global(h2) {
		font-size: 24px;
		font-weight: 600;
		color: var(--color-text);
		margin: 40px 0 16px;
		letter-spacing: -0.01em;
	}

	.sdocs-markdown :global(h3) {
		font-size: 20px;
		font-weight: 600;
		color: var(--color-text);
		margin: 32px 0 12px;
	}

	.sdocs-markdown :global(p) {
		font-size: 16px;
		color: var(--color-text-secondary);
		line-height: 1.75;
		margin: 0 0 20px;
	}

	.sdocs-markdown :global(ul),
	.sdocs-markdown :global(ol) {
		margin: 0 0 20px;
		padding-left: 24px;
		color: var(--color-text-secondary);
	}

	.sdocs-markdown :global(li) {
		line-height: 1.75;
		margin-bottom: 8px;
	}

	.sdocs-markdown :global(code) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		background: var(--color-bg-hover);
		padding: 0.2em 0.4em;
		border-radius: 4px;
		color: var(--color-text);
	}

	.sdocs-markdown :global(pre) {
		background: var(--base-50);
		border-radius: 10px;
		border: 1px solid var(--base-200);
		padding: 16px 20px;
		overflow-x: auto;
		margin: 0 0 24px;
	}

	.sdocs-markdown :global(pre code) {
		background: none;
		padding: 0;
		color: var(--base-800);
		font-size: 13px;
		line-height: 1.6;
		white-space: pre;
	}

	.sdocs-markdown :global(blockquote) {
		border-left: 3px solid var(--color-primary);
		margin: 0 0 24px;
		padding: 8px 0 8px 20px;
		color: var(--color-text-secondary);
	}

	.sdocs-markdown :global(a) {
		color: var(--color-primary);
		text-decoration: none;
	}

	.sdocs-markdown :global(a:hover) {
		text-decoration: underline;
	}

	.sdocs-markdown :global(hr) {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: 32px 0;
	}
</style>
