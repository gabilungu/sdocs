import type { Snippet } from 'svelte';
/**
 * A flexible Stack layout component for arranging elements vertically or horizontally.
 */
interface Props {
    /** Stack direction (CSS flex-direction) */
    direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    /** Gap between items (any CSS dimension) */
    gap?: string;
    /** Padding (any CSS dimension) */
    padding?: string;
    /** Background color (any CSS color) */
    bg?: string;
    /** Children content */
    children?: Snippet;
}
declare const Stack: import("svelte").Component<Props, {}, "">;
type Stack = ReturnType<typeof Stack>;
export default Stack;
