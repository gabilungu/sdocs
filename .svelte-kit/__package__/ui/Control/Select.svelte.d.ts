interface Props {
    label: string;
    value: string;
    options: string[];
    onchange: (value: string) => void;
}
declare const Select: import("svelte").Component<Props, {}, "">;
type Select = ReturnType<typeof Select>;
export default Select;
