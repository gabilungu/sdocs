import type { Snippet } from 'svelte';
/**
 * A table header cell. Use inside Row.
 */
interface Props {
    /** Cell content */
    children: Snippet;
    /** Number of columns to span */
    colspan?: number;
    /** Text alignment */
    align?: 'left' | 'center' | 'right';
    /** Column width (e.g. '20%', '200px') */
    width?: string;
}
declare const Header: import("svelte").Component<Props, {}, "">;
type Header = ReturnType<typeof Header>;
export default Header;
