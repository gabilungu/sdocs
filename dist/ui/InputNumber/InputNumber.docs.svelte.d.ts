import InputNumber from './InputNumber.svelte';
import type { DocMeta } from '../../types.js';
declare const Default: (args: any) => ReturnType<import("svelte").Snippet>;
declare const Sizes: () => ReturnType<import("svelte").Snippet>;
declare const WithConstraints: () => ReturnType<import("svelte").Snippet>;
declare const Disabled: () => ReturnType<import("svelte").Snippet>;
export declare const meta: DocMeta;
export { Default, Sizes, WithConstraints, Disabled };
interface $$__sveltets_2_IsomorphicComponent<Props extends Record<string, any> = any, Events extends Record<string, any> = any, Slots extends Record<string, any> = any, Exports = {}, Bindings = string> {
    new (options: import('svelte').ComponentConstructorOptions<Props>): import('svelte').SvelteComponent<Props, Events, Slots> & {
        $$bindings?: Bindings;
    } & Exports;
    (internal: unknown, props: {
        $$events?: Events;
        $$slots?: Slots;
    }): Exports & {
        $set?: any;
        $on?: any;
    };
    z_$$bindings?: Bindings;
}
declare const InputNumber: $$__sveltets_2_IsomorphicComponent<Record<string, never>, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type InputNumber = InstanceType<typeof InputNumber>;
export default InputNumber;
