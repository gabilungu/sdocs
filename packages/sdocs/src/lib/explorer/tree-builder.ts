import type { DocEntry, SectionConfig } from '../types.js';

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
	/** True on the entity's own node (not its Docs/example children) */
	entity?: boolean;
	/** Set on example child nodes: the example this node opens */
	snippetName?: string;
	/** Example titles for component nodes (sidebar sub-pages) */
	examples?: string[];
	/** Whether this node should be expanded by default */
	defaultExpanded?: boolean;
}

/** One top-bar section: a tab label and its own sidebar tree */
export interface SectionTree {
	slug: string;
	title: string;
	tree: TreeNode[];
	/** Route of the section's first document (top-bar tab target) */
	firstRoute: string[] | null;
}

/** What a URL route resolves to */
export interface RouteTarget {
	doc: DocEntry;
	snippetName?: string;
}

/** A site-structure problem: shown full-page in dev, fails the build. */
export interface SiteError {
	message: string;
	/** Absolute .sdoc path when the error points at one file */
	file?: string;
}

/** Everything the Explorer needs to render sections and resolve URLs */
export interface SectionMap {
	sections: SectionTree[];
	routes: Map<string, RouteTarget>;
	/** True when the config declared sections — routes carry the section slug */
	active: boolean;
	/** What the root route renders (from the config `home` path) */
	home: RouteTarget | null;
	/** Structure problems: unknown sections, route collisions, a bad home path */
	errors: SiteError[];
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

/** Sections with defaults filled in; the implicit `docs` section when none
 * are declared. */
export function normalizeSections(sections: SectionConfig[] | undefined): Required<SectionConfig>[] {
	if (!sections || sections.length === 0) return [{ slug: 'docs', title: 'Docs', order: [] }];
	return sections.map((s) => {
		const slug = String(s.slug ?? '');
		return {
			slug,
			title: s.title ?? (slug ? slug[0].toUpperCase() + slug.slice(1) : slug),
			order: s.order ?? [],
		};
	});
}

/** Split an optional `@section-slug` first segment off a title. */
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

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface BuildSectionsOptions {
	/** Declared sections in top-bar order (raw config shape is accepted) */
	sections?: SectionConfig[];
	/** Route path of the landing page, e.g. 'guides/introduction' */
	home?: string | null;
}

/**
 * Group docs into their declared sections, build each section's tree, apply
 * the per-section `order` arrays, and register every navigable route.
 * Structure problems — an unknown `@section`, two entities on one route, a
 * `home` path that resolves nowhere — are collected as errors, not repaired:
 * the Explorer shows them full-page and `sdocs build` fails on them.
 */
export function buildSections(docs: DocEntry[], opts?: BuildSectionsOptions): SectionMap {
	const sections = normalizeSections(opts?.sections);
	const active = (opts?.sections?.length ?? 0) > 0;
	const errors: SiteError[] = [];

	// Config-level checks: slugs must be URL-safe and unique.
	const seenSlugs = new Set<string>();
	for (const s of sections) {
		if (!SLUG_RE.test(s.slug)) {
			errors.push({
				message: `Section slug "${s.slug}" must be lowercase letters, digits, and hyphens.`,
			});
		}
		if (seenSlugs.has(s.slug)) {
			errors.push({ message: `Two sections share the slug "${s.slug}".` });
		}
		seenSlugs.add(s.slug);
	}

	// Partition docs by section slug. Unprefixed titles belong to `docs`.
	const bySlug = new Map<string, DocEntry[]>(sections.map((s) => [s.slug, []]));
	for (const doc of docs) {
		const { section } = splitSection(doc.meta.title);
		const slug = section ?? 'docs';
		const list = bySlug.get(slug);
		if (!list) {
			const declared = sections.map((s) => `"${s.slug}"`).join(', ');
			errors.push({
				message:
					section === null
						? `"${doc.meta.title}" has no @section prefix and no "docs" section is declared (sections: ${declared}).`
						: `Unknown section "@${section}" in title "${doc.meta.title}" (sections: ${declared}).`,
				file: doc.filePath,
			});
			continue;
		}
		list.push(doc);
	}

	const routes = new Map<string, RouteTarget>();
	const routeOwners = new Map<string, DocEntry>();

	const sectionTrees: SectionTree[] = sections.map((section) => {
		const prefix = active ? [section.slug] : [];
		const tree = buildTree(bySlug.get(section.slug) ?? [], prefix, errors);
		registerRoutes(tree, routes, routeOwners, errors);
		orderTree(tree, section.order, prefix.length);
		return {
			slug: section.slug,
			title: section.title,
			tree: pruneHidden(tree),
			firstRoute: null,
		};
	});
	for (const s of sectionTrees) s.firstRoute = firstDocRoute(s.tree);

	// The root route: the configured home entity, or the About page when unset.
	let home: RouteTarget | null = null;
	if (opts?.home) {
		home = routes.get(opts.home.replace(/^\/+|\/+$/g, '')) ?? null;
		if (!home) {
			errors.push({
				message: `home "${opts.home}" doesn't match any entity route.`,
			});
		}
	}

	return { sections: sectionTrees, routes, active, home, errors };
}

/** Resolve URL segments to a doc. */
export function resolveRoute(map: SectionMap, segments: string[]): RouteTarget | null {
	if (segments.length === 0) return map.home;
	return map.routes.get(segments.join('/')) ?? null;
}

/** Build a tree from flat doc entries; routes get `routePrefix` prepended. */
export function buildTree(
	docs: DocEntry[],
	routePrefix: string[] = [],
	errors?: SiteError[],
): TreeNode[] {
	const root: TreeNode[] = [];
	const folderMap = new Map<string, TreeNode>();

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
						route: [...parentRoute, slugifySegment(segName)],
						children: [],
						defaultExpanded: isGroup,
					};
					parent.push(folder);
				}
				folderMap.set(key, folder);
			}
			parent = folder.children;
			parentRoute = folder.route;
		}

		// The route leaf: the explicit slug attribute, or the slugified segment.
		const leaf = doc.routeSlug ?? slugifySegment(itemName);
		if (doc.routeSlug && !SLUG_RE.test(doc.routeSlug) && errors) {
			errors.push({
				message: `slug="${doc.routeSlug}" in "${doc.meta.title}" must be lowercase letters, digits, and hyphens.`,
				file: doc.filePath,
			});
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
				route: [...parentRoute, leaf],
				children: [],
			};

			// Upgrade folder to component and attach doc data
			componentNode.type = 'component';
			componentNode.doc = doc;
			componentNode.entity = true;
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
				route: [...parentRoute, leaf],
				children: [],
				doc,
				entity: true,
			});
		}
	}

	// Reorder component children: Docs → examples → sub-components (sorted by name)
	reorderComponentChildren(root);

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

/** Register every doc-bearing node's route; two entities on one route is an
 * error (the component's own "Docs" child shares its parent's route by design). */
function registerRoutes(
	nodes: TreeNode[],
	routes: Map<string, RouteTarget>,
	owners: Map<string, DocEntry>,
	errors: SiteError[],
): void {
	for (const node of nodes) {
		if (node.doc) {
			const key = node.route.join('/');
			const owner = owners.get(key);
			if (owner === undefined) {
				owners.set(key, node.doc);
				routes.set(
					key,
					node.snippetName ? { doc: node.doc, snippetName: node.snippetName } : { doc: node.doc },
				);
			} else if (owner !== node.doc) {
				errors.push({
					message: `Two entities share the route "/${key}": "${owner.meta.title}" and "${node.doc.meta.title}". Give one a slug="…".`,
					file: node.doc.filePath,
				});
			}
		}
		if (node.children.length > 0) registerRoutes(node.children, routes, owners, errors);
	}
}

/** Drop hidden entities (and their subtrees) from the sidebar; their routes
 * stay registered. Folders left empty disappear with them. */
function pruneHidden(nodes: TreeNode[]): TreeNode[] {
	const out: TreeNode[] = [];
	for (const node of nodes) {
		if (node.entity && node.doc?.hide) continue;
		const children = pruneHidden(node.children);
		if ((node.type === 'folder' || node.type === 'group') && children.length === 0) continue;
		out.push({ ...node, children });
	}
	return out;
}

/**
 * Sort each level: items whose section-relative route path appears in the
 * section's `order` array come first (in array order), the rest follow
 * alphabetically. Component children keep their Docs → examples order.
 */
function orderTree(nodes: TreeNode[], order: string[], prefixLen: number): void {
	const rank = (node: TreeNode): number => {
		const rel = node.route.slice(prefixLen).join('/');
		const i = order.indexOf(rel);
		return i === -1 ? Number.MAX_SAFE_INTEGER : i;
	};
	nodes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
	for (const node of nodes) {
		if (node.children.length > 0 && (node.type === 'folder' || node.type === 'group')) {
			orderTree(node.children, order, prefixLen);
		}
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

/**
 * The title shown to users. The `@section/` prefix routes to a top-bar
 * section and a leading ':' on the first segment is a sidebar grouping
 * directive (see buildTree) — neither is part of the displayed title.
 */
export function displayTitle(title: string | null | undefined): string {
	return splitSection(title).rest.replace(/^:\s*/, '');
}
