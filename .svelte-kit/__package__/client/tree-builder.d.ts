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
export declare function buildTree(docs: DocEntry[], sidebar?: SidebarConfig): TreeNode[];
/** Check if a path matches a tree node (for active state) */
export declare function pathMatchesNode(currentPath: string[], node: TreeNode): boolean;
/** Find the doc entry for a given path */
export declare function findDocByPath(docs: DocEntry[], path: string[]): {
    doc: DocEntry;
    snippetName?: string;
} | null;
export {};
