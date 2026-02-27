import type { Snippet } from 'svelte';
/**
 * @cssvar {shorthand} --p - Padding
 * @cssvar {length} --r - Border radius
 * @cssvar {length} --h - Height
 * @cssvar {length} --gap - Gap between left, label, right
 * @cssvar {color} --bg - Background color
 * @cssvar {color} --bg-hover - Background on hover
 * @cssvar {color} --bg-active - Background when pressed
 * @cssvar {color} --border - Border color
 * @cssvar {color} --color - Text/icon color
 * @cssvar {color} --color-hover - Text/icon color on hover
 * @cssvar {string} --font-weight - Font weight
 * @cssvar {length} --font-size - Font size
 */
interface Props {
    onclick?: (e: MouseEvent) => void;
    title?: string;
    disabled?: boolean;
    left?: Snippet;
    right?: Snippet;
    children?: Snippet;
    class?: string;
}
declare const Button: import("svelte").Component<Props, {}, "">;
type Button = ReturnType<typeof Button>;
export default Button;
