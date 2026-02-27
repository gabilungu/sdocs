/**
 * A native radio input with customizable styling. Use the name prop to group radios together.
 */
interface Props {
    /** Whether this radio is selected */
    checked?: boolean;
    /** The value of this radio */
    value: string;
    /** Label text */
    label?: string;
    /** Group name (for native radio behavior) */
    name?: string;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Disable the radio */
    disabled?: boolean;
    /** Callback when selected */
    onchange?: (value: string) => void;
}
declare const Radio: import("svelte").Component<Props, {}, "">;
type Radio = ReturnType<typeof Radio>;
export default Radio;
