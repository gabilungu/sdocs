interface Props {
    label: string;
    value: number;
    onchange: (value: number) => void;
}
declare const Number: import("svelte").Component<Props, {}, "">;
type Number = ReturnType<typeof Number>;
export default Number;
