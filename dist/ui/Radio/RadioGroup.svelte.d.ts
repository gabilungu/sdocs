interface RadioOption {
    value: string;
    label: string;
    disabled?: boolean;
}
/**
 * A managed group of radio buttons with built-in state handling and layout options.
 */
interface Props {
    /** Array of options to display */
    options: RadioOption[] | string[];
    /** Currently selected value */
    value?: string;
    /** Group name */
    name?: string;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Disable all radios */
    disabled?: boolean;
    /** Layout direction */
    direction?: 'horizontal' | 'vertical';
    /** Callback when selection changes */
    onchange?: (value: string) => void;
}
declare const RadioGroup: import("svelte").Component<Props, {}, "">;
type RadioGroup = ReturnType<typeof RadioGroup>;
export default RadioGroup;
