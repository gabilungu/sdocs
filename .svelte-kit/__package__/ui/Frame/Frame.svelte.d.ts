import type { Snippet } from 'svelte';
/**
 * A flexible layout component with slots for top, bottom, left, right, and center content.
 */
interface Props {
    top?: Snippet;
    bottom?: Snippet;
    left?: Snippet;
    right?: Snippet;
    children?: Snippet;
    class?: string;
}
declare const Frame: import("svelte").Component<Props, {}, "">;
type Frame = ReturnType<typeof Frame>;
export default Frame;
