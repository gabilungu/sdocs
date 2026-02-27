import type { Snippet } from 'svelte';
/**
 * A container for previewing components with consistent styling.
 */
interface Props {
    /** Padding size */
    padding?: 's' | 'm' | 'l';
    /** Whether to center content */
    centered?: boolean;
    /** CSS custom properties to apply */
    cssVars?: Record<string, string>;
    /** Children content */
    children?: Snippet;
}
declare const ComponentPreview: import("svelte").Component<Props, {}, "">;
type ComponentPreview = ReturnType<typeof ComponentPreview>;
export default ComponentPreview;
