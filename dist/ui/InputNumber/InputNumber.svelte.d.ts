/**
 * A number input field with custom stepper buttons and size variants.
 */
interface Props {
    /** Input value */
    value?: number;
    /** Minimum value */
    min?: number;
    /** Maximum value */
    max?: number;
    /** Step increment */
    step?: number;
    /** Placeholder text */
    placeholder?: string;
    /** Callback when value changes */
    onchange?: (value: number) => void;
    /** Callback on input */
    oninput?: (value: number) => void;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Disable the input */
    disabled?: boolean;
}
declare const InputNumber: import("svelte").Component<Props, {}, "">;
type InputNumber = ReturnType<typeof InputNumber>;
export default InputNumber;
