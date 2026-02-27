/**
 * A segmented toggle control for selecting one option from a set of choices.
 */
interface Props {
    /** Available options */
    options: string[];
    /** Initially selected value */
    value?: string;
    /** Callback when selection changes */
    onchange?: (value: string) => void;
    /** Size variant */
    size?: 'xs' | 's' | 'm' | 'l';
    /** Disable the control */
    disabled?: boolean;
}
declare const SegmentControl: import("svelte").Component<Props, {}, "">;
type SegmentControl = ReturnType<typeof SegmentControl>;
export default SegmentControl;
