/**
 * Island segmentation for [PAGE] bodies.
 *
 * A page body is markdown prose interleaved with Svelte "islands" — component
 * tags, HTML sections, and template blocks like {#snippet}…{/snippet}. Markdown
 * tooling (the renderer, prettier) must never look inside an island: markdown's
 * paragraph and HTML-block rules split Svelte structure apart (a snippet opened
 * inside a <p> and closed outside fails to compile; a blank line cuts a <div>
 * section in half; a formatter re-indents block lines it can't understand).
 *
 * The rule an author sees: a line that starts a Svelte block ({#…}, {@render …})
 * or an HTML/component tag, sitting at the start of a markdown block (preceded
 * by a blank line or the body edge), begins an island. The island runs until
 * its Svelte blocks and HTML tags are balanced — blank lines inside are part of
 * the island. Everything else is prose.
 */

import { stepFence, type FenceState } from './fences.js';

export interface PageSegment {
	kind: 'prose' | 'island';
	/** Verbatim lines of the segment */
	lines: string[];
}

/** Void elements never contribute to tag depth. */
const VOID_TAGS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** Does this line begin an island (at a markdown block start)? */
function startsIsland(line: string): boolean {
	const t = line.trimStart();
	return /^\{[#/@]/.test(t) || /^<[A-Za-z]/.test(t) || /^<\//.test(t);
}

/**
 * Net Svelte block depth and HTML tag depth contributed by one line.
 * Line-based and heuristic by design: quoted attribute values are skipped,
 * self-closing and void tags are neutral. Unbalanced input never throws —
 * the island simply extends (and Svelte reports the real error).
 */
function lineDepths(line: string): { svelte: number; html: number } {
	let svelte = 0;
	let html = 0;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"' || ch === "'" || ch === '`') {
			for (i++; i < line.length && line[i] !== ch; i++) {
				if (line[i] === '\\') i++;
			}
			continue;
		}
		if (ch === '{') {
			if (line[i + 1] === '#') svelte++;
			else if (line[i + 1] === '/') svelte--;
			continue;
		}
		if (ch !== '<') continue;
		const rest = line.slice(i);
		const close = rest.match(/^<\/([A-Za-z][A-Za-z0-9-]*)/);
		if (close) {
			if (!VOID_TAGS.has(close[1].toLowerCase())) html--;
			continue;
		}
		const open = rest.match(/^<([A-Za-z][A-Za-z0-9-]*)/);
		if (!open) continue;
		if (VOID_TAGS.has(open[1].toLowerCase())) continue;
		// Find the tag's own '>' (skipping quoted attrs) to detect self-closing.
		let j = i + open[0].length;
		for (; j < line.length; j++) {
			const c = line[j];
			if (c === '"' || c === "'") {
				for (j++; j < line.length && line[j] !== c; j++);
			} else if (c === '>') break;
		}
		if (j >= line.length || line[j - 1] !== '/') html++;
		// Self-closing (`/>`) is neutral; an unterminated tag counts as open.
	}
	return { svelte, html };
}

/** Split a page body into prose and island segments. Lines inside markdown
 * code fences are always prose — a component tag shown in a fence must stay
 * displayed code, never a live island. */
export function segmentPageBody(body: string): PageSegment[] {
	const lines = body.split('\n');
	const segments: PageSegment[] = [];
	let current: PageSegment | null = null;

	const push = (kind: PageSegment['kind'], line: string) => {
		if (current?.kind !== kind) {
			current = { kind, lines: [] };
			segments.push(current);
		}
		current.lines.push(line);
	};

	const fenceState: { fence: FenceState } = { fence: null };
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (stepFence(fenceState, line).inside) {
			push('prose', line);
			i++;
			continue;
		}
		const prevBlank = i === 0 || lines[i - 1].trim() === '';
		if (prevBlank && line.trim() !== '' && startsIsland(line)) {
			// Consume the island: until Svelte blocks and HTML tags balance out.
			let svelte = 0;
			let html = 0;
			let j = i;
			for (; j < lines.length; j++) {
				const d = lineDepths(lines[j]);
				svelte += d.svelte;
				html += d.html;
				if (svelte <= 0 && html <= 0) break;
			}
			const end = Math.min(j, lines.length - 1);
			for (let k = i; k <= end; k++) push('island', lines[k]);
			current = null; // consecutive islands stay separate segments
			i = end + 1;
			continue;
		}
		push('prose', line);
		i++;
	}
	return segments;
}
