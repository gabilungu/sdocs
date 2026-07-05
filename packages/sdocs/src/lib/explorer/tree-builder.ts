import type { DocEntry } from '../types.js';

export type TreeNodeType = 'folder' | 'group' | 'component' | 'page' | 'layout';

export interface TreeNode {
	name: string;
	type: TreeNodeType;
	/** Display path segments from the section root */
	path: string[];
	/** URL route segments from the site root (slugified, section included) */
	route: string[];
	/** Children nodes */
	children: TreeNode[];
	/** The doc entry (only for component/page/layout nodes) */
	doc?: DocEntry;
	/** Set on example child nodes: the example this node opens */
	snippetName?: string;
	/** Example titles for component nodes (sidebar sub-pages) */
	examples?: string[];
	/** Whether this node should be expanded by default */
	defaultExpanded?: boolean;
}

interface SidebarConfig {
	order?: Record<string, string[]>;
	open?: string[];
}

/** One top-bar section: a name and its own sidebar tree */
export interface SectionTree {
	name: string;
	slug: string;
	isDefault: boolean;
	tree: TreeNode[];
	/** Route of the section's first document (top-bar tab target) */
	firstRoute: string[] | null;
}

/** What a URL route resolves to */
export interface RouteTarget {
	doc: DocEntry;
	snippetName?: string;
}

/** Everything the Explorer needs to render sections and resolve URLs */
export interface SectionMap {
	sections: SectionTree[];
	routes: Map<string, RouteTarget>;
	/** True once any doc declares an `@Section` — routes carry the section slug */
	active: boolean;
}

/** Slug for one route segment — same rules as page heading anchors. */
export function slugifySegment(text: string): string {
	return (
		text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/[\s_]+/g, '-') || 'item'
	);
}

/** Split an optional `@Section` first segment off a title. */
export function splitSection(title: string | null | undefined): {
	section: string | null;
	rest: string;
} {
	const trimmed = (title ?? '').trim();
	if (!trimmed.startsWith('@')) return { section: null, rest: trimmed };
	const slash = trimmed.indexOf('/');
	if (slash === -1) return { section: trimmed.slice(1).trim() || null, rest: '' };
	return {
		section: trimmed.slice(1, slash).trim() || null,
		rest: trimmed.slice(slash + 1).trim(),
	};
}

/**
 * Group docs into sections (from `@Section/` title prefixes, the rest into the
 * default section), build each section's tree, and register every navigable
 * route. Section order: the config list first, unlisted after (default
 * section first, then alphabetical).
 */
export function buildSections(
	docs: DocEntry[],
	sidebar?: SidebarConfig,
	opts?: { defaultSection?: string; order?: string[] },
): SectionMap {
	const defaultName = opts?.defaultSection ?? 'Docs';
	const byName = new Map<string, DocEntry[]>();
	let active = false;

	for (const doc of docs) {
		const { section } = splitSection(doc.meta.title);
		if (section) active = true;
		const name = section ?? defaultName;
		const list = byName.get(name);
		if (list) list.push(doc);
		else byName.set(name, [doc]);
	}

	const configOrder = opts?.order ?? [];
	const names = [...byName.keys()].sort((a, b) => {
		const ai = configOrder.indexOf(a);
		const bi = configOrder.indexOf(b);
		if (ai !== -1 || bi !== -1) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
		if (a === defaultName) return -1;
		if (b === defaultName) return 1;
		return a.localeCompare(b);
	});

	const routes = new Map<string, RouteTarget>();
	const usedSectionSlugs = new Set<string>();
	const sections: SectionTree[] = names.map((name) => {
		const slug = uniqueSlug(slugifySegment(name), usedSectionSlugs);
		const prefix = active ? [slug] : [];
		const tree = buildTree(byName.get(name)!, sidebar, prefix);
		registerRoutes(tree, routes);
		return {
			name,
			slug,
			isDefault: name === defaultName,
			tree,
			firstRoute: firstDocRoute(tree),
		};
	});

	return { sections, routes, active };
}

/**
 * Resolve URL segments to a doc. Links that omit the section — bookmarks from
 * before sections existed — fall back into the default section.
 */
export function resolveRoute(map: SectionMap, segments: string[]): RouteTarget | null {
	if (segments.length === 0) return null;
	const hit = map.routes.get(segments.join('/'));
	if (hit) return hit;
	if (map.active) {
		const def = map.sections.find((s) => s.isDefault);
		if (def && segments[0] !== def.slug) {
			return map.routes.get([def.slug, ...segments].join('/')) ?? null;
		}
	}
	return null;
}

/** Build a tree from flat doc entries; routes get `routePrefix` prepended. */
export function buildTree(
	docs: DocEntry[],
	sidebar?: SidebarConfig,
	routePrefix: string[] = [],
): TreeNode[] {
	const root: TreeNode[] = [];
	const folderMap = new Map<string, TreeNode>();
	// Slugs claimed per parent (keyed by display path) — collisions get -2, -3…
	const claimed = new Map<string, Set<string>>();

	const childRoute = (parentPath: string[], parentRoute: string[], name: string): string[] => {
		const key = parentPath.join('/');
		let used = claimed.get(key);
		if (!used) {
			used = new Set();
			claimed.set(key, used);
		}
		return [...parentRoute, uniqueSlug(slugifySegment(name), used)];
	};

	for (const doc of docs) {
		const title = splitSection(doc.meta.title).rest || 'Untitled';
		const segments = title.split('/').map((s) => s.trim()).filter(Boolean);
		if (segments.length === 0) continue;

		const kind = doc.kind;
		const itemName = segments[segments.length - 1];
		const folderSegments = segments.slice(0, -1);

		// Ensure all parent folders exist
		let parent = root;
		let parentRoute = routePrefix;
		const currentPath: string[] = [];
		for (let i = 0; i < folderSegments.length; i++) {
			let segName = folderSegments[i];
			const isGroup = i === 0 && segName.startsWith(':');
			if (isGroup) segName = segName.slice(1).trim();

			const parentPath = [...currentPath];
			currentPath.push(segName);
			const key = currentPath.join('/');

			let folder = folderMap.get(key);
			if (!folder) {
				// Check if a node with this name already exists (e.g. a component node)
				const existing = parent.find((n) => n.name === segName);
				if (existing) {
					folder = existing;
				} else {
					folder = {
						name: segName,
						type: isGroup ? 'group' : 'folder',
						path: [...currentPath],
						route: childRoute(parentPath, parentRoute, segName),
						children: [],
						defaultExpanded: isGroup || sidebar?.open?.includes(segName),
					};
					parent.push(folder);
				}
				folderMap.set(key, folder);
			}
			parent = folder.children;
			parentRoute = folder.route;
		}

		// Create the item node
		const itemPath = [...currentPath, itemName];

		if (kind === 'component') {
			const examples = doc.examples?.map((s) => s.name) ?? [];

			// Check if a folder node with this name already exists (created by a child doc)
			const existing = parent.find((n) => n.name === itemName);
			const componentNode: TreeNode = existing ?? {
				name: itemName,
				type: 'component',
				path: itemPath,
				route: childRoute(currentPath, parentRoute, itemName),
				children: [],
			};

			// Upgrade folder to component and attach doc data
			componentNode.type = 'component';
			componentNode.doc = doc;
			componentNode.examples = examples;

			// Add "Docs" child — same doc, same route as the component itself
			componentNode.children.unshift({
				name: 'Docs',
				type: 'component',
				path: itemPath,
				route: componentNode.route,
				children: [],
				doc,
			});

			// Add example children
			const usedExampleSlugs = new Set<string>();
			for (const ex of examples) {
				componentNode.children.push({
					name: ex,
					type: 'component',
					path: [...itemPath, ex],
					route: [...componentNode.route, uniqueSlug(slugifySegment(ex), usedExampleSlugs)],
					children: [],
					doc,
					snippetName: ex,
				});
			}

			if (!existing) {
				parent.push(componentNode);
			}
		} else {
			parent.push({
				name: itemName,
				type: kind,
				path: itemPath,
				route: childRoute(currentPath, parentRoute, itemName),
				children: [],
				doc,
			});
		}
	}

	// Reorder component children: Docs → examples → sub-components (sorted by name)
	reorderComponentChildren(root);

	// Apply ordering
	if (sidebar?.order) {
		applyOrder(root, 'root', sidebar.order);
	}

	return root;
}

/** Append -2, -3… until the slug is free within `used`; claims it. */
function uniqueSlug(slug: string, used: Set<string>): string {
	let candidate = slug;
	for (let n = 2; used.has(candidate); n++) {
		candidate = `${slug}-${n}`;
	}
	used.add(candidate);
	return candidate;
}

/** Register every doc-bearing node's route; example children carry the name. */
function registerRoutes(nodes: TreeNode[], routes: Map<string, RouteTarget>): void {
	for (const node of nodes) {
		if (node.doc) {
			const key = node.route.join('/');
			if (!routes.has(key)) {
				routes.set(
					key,
					node.snippetName ? { doc: node.doc, snippetName: node.snippetName } : { doc: node.doc },
				);
			}
		}
		if (node.children.length > 0) registerRoutes(node.children, routes);
	}
}

/** The first document route in tree order (for section tab targets). */
function firstDocRoute(nodes: TreeNode[]): string[] | null {
	for (const node of nodes) {
		if (node.doc) return node.route;
		const inChildren = firstDocRoute(node.children);
		if (inChildren) return inChildren;
	}
	return null;
}

/** Reorder component children: Docs first, then examples, then sub-components sorted by name */
function reorderComponentChildren(nodes: TreeNode[]): void {
	for (const node of nodes) {
		if (node.type === 'component' && node.doc && node.children.length > 0) {
			const docs: TreeNode[] = [];
			const examples: TreeNode[] = [];
			const subComponents: TreeNode[] = [];

			for (const child of node.children) {
				if (child.name === 'Docs') {
					docs.push(child);
				} else if (child.doc === node.doc) {
					examples.push(child);
				} else {
					subComponents.push(child);
				}
			}

			subComponents.sort((a, b) => a.name.localeCompare(b.name));

			node.children.length = 0;
			node.children.push(...docs, ...examples, ...subComponents);
		}

		if (node.children.length > 0) {
			reorderComponentChildren(node.children);
		}
	}
}

/** Apply sort order to children at each level */
function applyOrder(
	nodes: TreeNode[],
	folderKey: string,
	orderConfig: Record<string, string[]>,
): void {
	const order = orderConfig[folderKey];
	if (order) {
		sortByOrder(nodes, order);
	} else {
		// Default: alphabetical
		nodes.sort((a, b) => a.name.localeCompare(b.name));
	}

	// Recurse into folders/groups
	for (const node of nodes) {
		if (node.children.length > 0 && (node.type === 'folder' || node.type === 'group')) {
			const childKey = folderKey === 'root' ? node.name : `${folderKey}/${node.name}`;
			applyOrder(node.children, childKey, orderConfig);
		}
	}
}

/** Sort nodes by explicit order, with * as wildcard for the rest */
function sortByOrder(nodes: TreeNode[], order: string[]): void {
	const wildcardIndex = order.indexOf('*');
	const before = wildcardIndex >= 0 ? order.slice(0, wildcardIndex) : order;
	const after = wildcardIndex >= 0 ? order.slice(wildcardIndex + 1) : [];

	const named = new Map<string, TreeNode>();
	const rest: TreeNode[] = [];

	for (const node of nodes) {
		if (before.includes(node.name) || after.includes(node.name)) {
			named.set(node.name, node);
		} else {
			rest.push(node);
		}
	}

	// Rest sorted alphabetically
	rest.sort((a, b) => a.name.localeCompare(b.name));

	nodes.length = 0;
	for (const name of before) {
		const node = named.get(name);
		if (node) nodes.push(node);
	}
	nodes.push(...rest);
	for (const name of after) {
		const node = named.get(name);
		if (node) nodes.push(node);
	}
}

/**
 * The title shown to users. The `@Section/` prefix routes to a top-bar
 * section and a leading ':' on the first segment is a sidebar grouping
 * directive (see buildTree) — neither is part of the displayed title.
 */
export function displayTitle(title: string | null | undefined): string {
	return splitSection(title).rest.replace(/^:\s*/, '');
}
