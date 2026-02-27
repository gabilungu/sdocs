import type { Snippet } from 'svelte';
/**
 * @cssvar {shorthand} --p - Padding
 * @cssvar {shorthand} --m - Margin
 * @cssvar {length} --r - Border radius
 * @cssvar {shorthand} --b - Border
 * @cssvar {color} --bg - Background color
 * @cssvar {color} --bg-active - Background when active
 * @cssvar {color} --bg-active-hover - Background when active and hovered
 * @cssvar {color} --bg-hover - Background on hover
 * @cssvar {color} --expander-color - Expander icon color
 * @cssvar {color} --expander-color-active - Expander icon color when active
 * @cssvar {color} --expander-color-hover - Expander icon color on hover
 * @cssvar {length} --expander-size - Expander icon size
 * @cssvar {color} --font-color - Text color
 * @cssvar {color} --font-color-active - Text color when active
 * @cssvar {color} --font-color-hover - Text color on hover
 * @cssvar {string} --font-weight - Font weight
 */
interface Props {
    label: string;
    href?: string;
    active?: boolean;
    left?: Snippet;
    right?: Snippet;
    expanded?: boolean;
    children?: Snippet;
    class?: string;
    onclick?: () => void;
}
declare const Item: import("svelte").Component<Props, {}, "expanded">;
type Item = ReturnType<typeof Item>;
export default Item;
