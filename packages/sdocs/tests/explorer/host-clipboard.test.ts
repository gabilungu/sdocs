/**
 * The clipboard shim answers the editing shortcuts itself, which is the right
 * thing in an editor's webview and the wrong thing everywhere else — a browser
 * already does it, and doing it twice is worse than not at all. So the guard
 * matters more than the shortcuts do: it decides whether a listener exists.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { initHostClipboard } from '../../src/lib/explorer/host-clipboard.js';

const ELECTRON_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.104.0 Chrome/132.0.6834.210 Electron/34.5.8 Safari/537.36';
const BROWSER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

interface Host {
	/** Keydown handlers the shim has registered, if any. */
	listeners: Array<(event: unknown) => void>;
	/** Every `execCommand` the shim asked for, in order. */
	commands: string[];
}

/** Enough of a window for the shim to decide against, or to run in. */
function fakeHost({ framed, ua }: { framed: boolean; ua: string }): Host {
	const listeners: Array<(event: unknown) => void> = [];
	const commands: string[] = [];

	const win: Record<string, unknown> = {
		addEventListener: (type: string, fn: (event: unknown) => void) => {
			if (type === 'keydown') listeners.push(fn);
		},
		removeEventListener: (type: string, fn: (event: unknown) => void) => {
			if (type !== 'keydown') return;
			const at = listeners.indexOf(fn);
			if (at >= 0) listeners.splice(at, 1);
		},
		getSelection: () => ({ toString: () => '' }),
	};
	// An unframed window is its own parent — that is the whole check.
	win.parent = framed ? {} : win;

	define('window', win);
	define('navigator', { userAgent: ua, clipboard: { writeText: async () => {} } });
	define('document', {
		activeElement: null,
		execCommand: (command: string) => {
			commands.push(command);
			return true;
		},
	});
	// `isTextField` asks `instanceof`, which needs the constructors to exist.
	define('HTMLInputElement', class {});
	define('HTMLTextAreaElement', class {});

	return { listeners, commands };
}

function define(name: string, value: unknown) {
	Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function press(host: Host, key: string, modifiers: Record<string, boolean> = {}) {
	let prevented = false;
	host.listeners.forEach((fn) =>
		fn({
			key,
			metaKey: true,
			altKey: false,
			shiftKey: false,
			...modifiers,
			preventDefault: () => (prevented = true),
		}),
	);
	return prevented;
}

afterEach(() => {
	for (const name of ['window', 'navigator', 'document', 'HTMLInputElement', 'HTMLTextAreaElement']) {
		Reflect.deleteProperty(globalThis, name);
	}
});

describe('editor-hosted clipboard', () => {
	it('stays out of an ordinary browser', () => {
		const host = fakeHost({ framed: false, ua: BROWSER_UA });
		initHostClipboard();
		expect(host.listeners).toHaveLength(0);
	});

	it('stays out of a page that merely embeds the Explorer', () => {
		const host = fakeHost({ framed: true, ua: BROWSER_UA });
		initHostClipboard();
		expect(host.listeners).toHaveLength(0);
	});

	it('stays out of an editor window that is not a frame', () => {
		const host = fakeHost({ framed: false, ua: ELECTRON_UA });
		initHostClipboard();
		expect(host.listeners).toHaveLength(0);
	});

	it('answers the shortcuts when framed by an editor', () => {
		const host = fakeHost({ framed: true, ua: ELECTRON_UA });
		initHostClipboard();
		expect(host.listeners).toHaveLength(1);

		expect(press(host, 'c')).toBe(true);
		expect(press(host, 'x')).toBe(true);
		expect(press(host, 'a')).toBe(true);
		expect(press(host, 'z')).toBe(true);
		expect(press(host, 'z', { shiftKey: true })).toBe(true);
		expect(host.commands).toEqual(['copy', 'cut', 'selectAll', 'undo', 'redo']);
	});

	it('leaves every other combination alone', () => {
		const host = fakeHost({ framed: true, ua: ELECTRON_UA });
		initHostClipboard();

		// Somebody else's shortcut, and a plain letter.
		expect(press(host, 'c', { altKey: true })).toBe(false);
		expect(press(host, 'c', { metaKey: false, ctrlKey: false })).toBe(false);
		expect(press(host, 'b')).toBe(false);
		expect(host.commands).toEqual([]);
	});

	it('takes its listener back down', () => {
		const host = fakeHost({ framed: true, ua: ELECTRON_UA });
		const stop = initHostClipboard();
		expect(host.listeners).toHaveLength(1);
		stop();
		expect(host.listeners).toHaveLength(0);
	});
});
