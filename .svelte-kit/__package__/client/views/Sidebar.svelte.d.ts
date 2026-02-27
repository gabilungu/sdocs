import type { TreeNode } from '../tree-builder.js';
type ThemeMode = 'light' | 'dark';
interface Props {
    tree: TreeNode[];
    currentPath: string[];
    logo: string;
    cssNames?: string[];
    activeStylesheet?: string;
    theme?: ThemeMode;
    onToggleFullscreen?: () => void;
    onStylesheetChange?: (name: string) => void;
    onThemeChange?: (theme: ThemeMode) => void;
}
declare const Sidebar: import("svelte").Component<Props, {}, "">;
type Sidebar = ReturnType<typeof Sidebar>;
export default Sidebar;
