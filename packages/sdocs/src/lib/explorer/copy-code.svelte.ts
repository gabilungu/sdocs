/**
 * A copy button on every block of code.
 *
 * Nothing in sdocs could be copied before this: not the fences in `[DOC]`
 * prose, not the Explorer's own Code / Preview Code / Component Source panels.
 * Both are the same shape — a `<pre>` inside a container the component fills
 * with `{@html}` — so one attachment covers them, walking the DOM rather than
 * taking the text as a prop.
 *
 * The button is revealed on hover, matching the width bar, the height bar and
 * the note corner button, and on focus, so it is reachable without a pointer.
 */

import type { Attachment } from 'svelte/attachments';

const COPY_ICON =
	'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const DONE_ICON =
	'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/**
 * Attach a copy button to every `<pre>` under the element.
 *
 * Re-runs whenever the rendered HTML changes: `{@html}` replaces the children
 * wholesale, so buttons from a previous render are gone with them and each new
 * `<pre>` needs its own.
 */
export function copyCode(): Attachment<HTMLElement> {
	return (root) => {
		const observer = new MutationObserver(() => decorate(root));
		observer.observe(root, { childList: true, subtree: true });
		decorate(root);
		return () => observer.disconnect();
	};
}

const DECORATED = 'sdocsCopy';

function decorate(root: HTMLElement): void {
	const blocks = root.matches('pre') ? [root] : root.querySelectorAll('pre');
	for (const pre of blocks) {
		const el = pre as HTMLElement;
		if (el.dataset[DECORATED]) continue;
		el.dataset[DECORATED] = 'true';
		// The button is positioned against the <pre>, so the <pre> has to be
		// the containing block. Shiki sets no position of its own.
		if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
		el.classList.add('sdocs-copy-host');
		el.append(button(el));
	}
}

function button(pre: HTMLElement): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'sdocs-copy';
	btn.title = 'Copy code';
	btn.setAttribute('aria-label', 'Copy code');
	btn.innerHTML = COPY_ICON;

	let timer: ReturnType<typeof setTimeout> | undefined;
	btn.addEventListener('click', async () => {
		// The button lives inside the <pre>, so its own text would be copied
		// with the code if it had any — it has an icon and a label instead.
		const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
		if (!code.trim()) return;
		try {
			await navigator.clipboard.writeText(code.replace(/\n$/, ''));
		} catch {
			// Clipboard unavailable — the code is on screen to select by hand.
			return;
		}
		btn.innerHTML = DONE_ICON;
		btn.classList.add('is-copied');
		btn.title = 'Copied';
		btn.setAttribute('aria-label', 'Copied');
		clearTimeout(timer);
		timer = setTimeout(() => {
			btn.innerHTML = COPY_ICON;
			btn.classList.remove('is-copied');
			btn.title = 'Copy code';
			btn.setAttribute('aria-label', 'Copy code');
		}, 1500);
	});
	return btn;
}
