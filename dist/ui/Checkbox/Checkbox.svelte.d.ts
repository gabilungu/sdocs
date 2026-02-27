/**
 * A customizable checkbox component with support for labels, sizes, and disabled states.
 */
interface Props {
    /** Whether the checkbox is checked */
    checked?: boolean;
    /** Label text */
    label?: string;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Disable the checkbox */
    disabled?: boolean;
    /** Callback when checked state changes */
    onchange?: (checked: boolean) => void;
}
declare const Checkbox: import("svelte").Component<Props, {}, "">;
type Checkbox = ReturnType<typeof Checkbox>;
export default Checkbox;
