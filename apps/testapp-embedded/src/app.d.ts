// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module 'virtual:sdocs' {
	import type { AxisConfig, DocEntry, ScaleConfig } from 'sdocs';
	export const docs: DocEntry[];
	export const cssNames: string[];
	export const axes: Required<AxisConfig>[];
	export const scale: Required<ScaleConfig> | null;
	export const pageModules: Record<string, () => Promise<{ default: unknown }>>;
	export default docs;
}

export {};
