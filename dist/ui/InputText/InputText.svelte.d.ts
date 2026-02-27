/**
 * A text input field with size variants and event callbacks.
 */
interface Props {
    /** Input value */
    value?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Callback when value changes */
    onchange?: (value: string) => void;
    /** Callback on input */
    oninput?: (value: string) => void;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Disable the input */
    disabled?: boolean;
    /** Input type */
    type?: 'text' | 'email' | 'password';
}
declare const InputText: import("svelte").Component<Props, {}, "">;
type InputText = ReturnType<typeof InputText>;
export default InputText;
