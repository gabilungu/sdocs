interface Props {
    label: string;
    value: boolean;
    onchange: (value: boolean) => void;
}
declare const Checkbox: import("svelte").Component<Props, {}, "">;
type Checkbox = ReturnType<typeof Checkbox>;
export default Checkbox;
