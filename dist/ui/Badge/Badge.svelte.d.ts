/**
 * A small inline label for displaying metadata like types, status, or categories.
 *
 * @cssvar {color} --Badge-bg - Background color (default: var(--base-100))
 * @cssvar {color} --Badge-color - Text color (default: var(--base-600))
 */
interface Props {
    /** Text to display */
    label: string;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Border radius in pixels */
    radius?: number;
}
declare const Badge: import("svelte").Component<Props, {}, "">;
type Badge = ReturnType<typeof Badge>;
export default Badge;
