import type { DocEntry } from '../types.js';

export type TreeNodeType = 'folder' | 'group' | 'component' | 'page' | 'layout';

export interface TreeNode {
	name: string;
	type: TreeNodeType;
	/** Full path segments from root (for routing) */
	path: string[];
	/** Children nodes */
	children: TreeNode[];
	/** The doc entry (only for component/page/layout nodes) */
	doc?: DocEntry;
	/** Snippet names for component nodes (excludes Default) */
	examples?: string[];
	/** Whether this node should be expanded by default */
	defaultExpanded?: boolean;
}

interface SidebarConfig {
	order?: Record<string, string[]>;
	open?: string[];
}

/** Build a tree from flat doc entries */
export function buildTree(docs: DocEntry[], sidebar?: SidebarConfig): TreeNode[] {
	const root: TreeNode[] = [];
	const folderMap = new Map<string, TreeNode>();

	for (const doc of docs) {
		const title = doc.meta.title ?? 'Untitled';
		const segments = title.split('/').map((s) => s.trim()).filter(Boolean);
		if (segments.length === 0) continue;

		const kind = doc.kind;
		const itemName = segments[segments.length - 1];
		const folderSegments = segments.slice(0, -1);

		// Ensure all parent folders exist
		let parent = root;
		const currentPath: string[] = [];
		for (let i = 0; i < folderSegments.length; i++) {
			let segName = folderSegments[i];
			const isGroup = i === 0 && segName.startsWith(':');
			if (isGroup) segName = segName.slice(1);

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
						children: [],
						defaultExpanded: isGroup || sidebar?.open?.includes(segName),
					};
					parent.push(folder);
				}
				folderMap.set(key, folder);
			}
			parent = folder.children;
		}

		// Create the item node
		const itemPath = [...currentPath, itemName];

		if (kind === 'component') {
			const examples = doc.snippets
				?.filter((s) => s.name !== 'Default')
				.map((s) => s.name) ?? [];

			// Check if a folder node with this name already exists (created by a child doc)
			const existing = parent.find((n) => n.name === itemName);
			const componentNode: TreeNode = existing ?? {
				name: itemName,
				type: 'component',
				path: itemPath,
				children: [],
			};

			// Upgrade folder to component and attach doc data
			componentNode.type = 'component';
			componentNode.doc = doc;
			componentNode.examples = examples;

			// Add "Docs" child
			componentNode.children.unshift({
				name: 'Docs',
				type: 'component',
				path: itemPath,
				children: [],
				doc,
			});

			// Add example children
			for (const ex of examples) {
				componentNode.children.push({
					name: ex,
					type: 'component',
					path: [...itemPath, ex],
					children: [],
					doc,
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

/** Check if a path matches a tree node (for active state) */
export function pathMatchesNode(currentPath: string[], node: TreeNode): boolean {
	if (node.path.length !== currentPath.length) return false;
	return node.path.every((seg, i) => seg === currentPath[i]);
}

/** Find the doc entry for a given path */
export function findDocByPath(
	docs: DocEntry[],
	path: string[],
): { doc: DocEntry; snippetName?: string } | null {
	if (path.length === 0) return null;

	for (const doc of docs) {
		const title = doc.meta.title ?? '';
		const segments = title.split('/').map((s) => s.trim()).filter(Boolean)
			.map((s) => s.startsWith(':') ? s.slice(1) : s);

		// Exact match → component docs view
		if (segments.length === path.length && segments.every((s, i) => s === path[i])) {
			return { doc };
		}

		// One extra segment → example
		if (segments.length === path.length - 1 && segments.every((s, i) => s === path[i])) {
			const snippetName = path[path.length - 1];
			const hasSnippet = doc.snippets?.some((s) => s.name === snippetName);
			if (hasSnippet) {
				return { doc, snippetName };
			}
		}
	}

	return null;
}
