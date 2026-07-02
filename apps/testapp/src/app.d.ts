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
	import type { DocEntry } from 'sdocs';
	export const docs: DocEntry[];
	export const cssNames: string[];
	export default docs;
}

export {};
