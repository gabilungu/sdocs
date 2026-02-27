interface Props {
    label: string;
    value: string;
    onchange: (value: string) => void;
}
declare const Text: import("svelte").Component<Props, {}, "">;
type Text = ReturnType<typeof Text>;
export default Text;
