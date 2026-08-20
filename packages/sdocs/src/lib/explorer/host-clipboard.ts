/**
 * Copy, cut, paste and select-all inside an editor-hosted frame.
 *
 * An editor built on Electron — VS Code and its relatives — answers Cmd/Ctrl+C
 * from the application menu rather than leaving it to the browser. For a
 * webview the editor turns it into `execCommand('copy')` against the webview's
 * own document, and the Explorer runs one level deeper, in a cross-origin
 * frame that document cannot reach. The command finds no selection there, so
 * the shortcut lands nowhere and the page looks like it forbids copying.
 *
 * The key event itself does arrive here — a key event doesn't cross origins,
 * which is also why the editor never sees it — so the frame is free to answer
 * the shortcuts itself. Only when framed inside such a host: an ordinary
 * browser already does all of this, natively and better.
 */
export function initHostClipboard(): () => void {
	if (typeof window === 'undefined') return () => {};
	const framed = window.parent !== window;
	if (!framed || !/\bElectron\//.test(navigator.userAgent)) return () => {};

	window.addEventListener('keydown', onKeyDown);
	return () => window.removeEventListener('keydown', onKeyDown);
}

function onKeyDown(event: KeyboardEvent) {
	// The editor binds Cmd on macOS and Ctrl elsewhere; Alt is never part of
	// the clipboard shortcuts, so a combination carrying it belongs elsewhere.
	if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

	switch (event.key.toLowerCase()) {
		case 'c':
			return handle(event, copy);
		case 'x':
			return handle(event, cut);
		case 'v':
			return handle(event, paste);
		case 'a':
			return handle(event, selectAll);
		case 'z':
			return handle(event, () => void document.execCommand(event.shiftKey ? 'redo' : 'undo'));
		case 'y':
			return handle(event, () => void document.execCommand('redo'));
	}
}

/** The host's own menu accelerator still fires — harmlessly, against a
 * document with nothing in it — so the default is stopped here only to keep
 * the page from acting on the key twice. */
function handle(event: KeyboardEvent, action: () => void) {
	event.preventDefault();
	action();
}

/** `execCommand` is the one that already knows what the selection is, caret
 * included; the clipboard API covers the case where the host refuses it. */
function copy() {
	if (document.execCommand('copy')) return;
	const text = selectionText();
	if (text) void navigator.clipboard?.writeText(text);
}

function cut() {
	if (document.execCommand('cut')) return;
	const el = document.activeElement;
	if (!isTextField(el)) return;
	const text = selectionText();
	if (text) void navigator.clipboard?.writeText(text);
	replaceSelection(el, '');
}

/** Chromium refuses `execCommand('paste')` to page content whatever the host
 * permits, so the text is read through the clipboard API and inserted by hand.
 * Both frames carry `clipboard-read`, which is what makes the read succeed. */
async function paste() {
	const el = document.activeElement;
	if (!isTextField(el)) return;
	const text = await navigator.clipboard?.readText().catch(() => '');
	if (text) replaceSelection(el, text);
}

function selectAll() {
	const el = document.activeElement;
	if (isTextField(el)) el.select();
	else document.execCommand('selectAll');
}

function selectionText(): string {
	const el = document.activeElement;
	if (isTextField(el)) {
		try {
			return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
		} catch {
			// A field with no caret (see below) reports no selection either.
			return '';
		}
	}
	return window.getSelection()?.toString() ?? '';
}

function replaceSelection(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
	// `insertText` is the faithful one: it replaces exactly what is selected,
	// leaves the caret where typing would, keeps the field's own undo history
	// and raises `input` itself. A number field has no caret to address from
	// script, and this is what still gets the digits in the right place.
	if (document.execCommand('insertText', false, text)) return;
	try {
		el.setRangeText(text, el.selectionStart ?? 0, el.selectionEnd ?? 0, 'end');
	} catch {
		// A field with nowhere to put text — a colour swatch — takes none,
		// which is what an ordinary paste does there too.
		return;
	}
	// Svelte's bindings listen for `input`, and a value set from script raises
	// no event of its own.
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

function isTextField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}
