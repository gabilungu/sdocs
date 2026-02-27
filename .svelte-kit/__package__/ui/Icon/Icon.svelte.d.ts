/**
 * @cssvar {length} --w - Icon width (default: 24px)
 * @cssvar {length} --h - Icon height (default: 24px)
 * @cssvar {color} --fill - Icon color, inherited via currentColor (default: currentColor)
 */
interface Props {
    /** Icon name matching a filename in the icons folder (e.g. "chevron-right") */
    name: string;
    /** Additional CSS class names */
    class?: string;
}
declare const Icon: import("svelte").Component<Props, {
    icons: Record<string, string>;
}, "">;
type Icon = ReturnType<typeof Icon>;
export default Icon;
