/**
 * Fragment-wise formatting for .sdoc files: the file <script> and <style>
 * and every Svelte block body format independently through prettier with
 * prettier-plugin-svelte, [DOC] bodies through prettier's markdown parser
 * (prose lines are preserved, never re-wrapped), then reassemble at the
 * structural indentation: entity tags at column 0, sub-block tags one level
 * in, bodies one level deeper.
 *
 * Width and indentation come from the project's Prettier config (.prettierrc)
 * when present, so a .sdoc island wraps like a sibling .svelte file. The same
 * printWidth decides opener layout: an entity/block opener that would exceed
 * it breaks onto one attribute per line (attributes copied verbatim); shorter
 * openers stay on one line.
 */

import * as prettier from 'prettier';
// The standalone plugin build: parser resolution must not depend on
// prettier's lazy disk loading once bundled into dist/server.js.
import * as markdownPlugin from 'prettier/plugins/markdown';
import * as sveltePlugin from 'prettier-plugin-svelte';
import type { FormattingOptions } from 'vscode-languageserver-protocol';
import { scanSdoc, segmentPageBody, type SdocFile, type Span } from 'sdocs/language';

interface Region {
	/** First and last source line index (inclusive) to replace */
	firstLine: number;
	lastLine: number;
	/** Replacement lines */
	lines: string[];
}

function lineIndex(source: string, offset: number): number {
	let line = 0;
	for (let i = 0; i < offset && i < source.length; i++) {
		if (source[i] === '\n') line++;
	}
	return line;
}

/**
 * Lay out an entity/block opener. One line when it fits printWidth; otherwise
 * the tag alone, each attribute on its own line indented one level, and the
 * closing `]` back at the tag indent. Attributes are copied verbatim from the
 * source (never reformatted) — the scanner parses the multi-line form back
 * identically, so it round-trips.
 */
function formatOpener(
	source: string,
	kind: string,
	attrs: Record<string, { span: Span }>,
	tagIndent: string,
	oneLevel: string,
	printWidth: number,
): string[] {
	// Attrs copy verbatim, minus any CR: assembly is LF-space and the final
	// join re-applies the document's EOL uniformly.
	const parts = Object.values(attrs).map((a) =>
		source.slice(a.span.start, a.span.end).replace(/\r\n/g, '\n'),
	);
	const single = `${tagIndent}[${kind}${parts.length ? ' ' + parts.join(' ') : ''}]`;
	if (parts.length === 0 || single.length <= printWidth) return [single];
	const inner = tagIndent + oneLevel;
	return [`${tagIndent}[${kind}`, ...parts.map((p) => inner + p), `${tagIndent}]`];
}

/** Strip the common leading indentation; returns the dedented text. */
function dedent(lines: string[]): { lines: string[]; indent: string } {
	let common: string | null = null;
	for (const line of lines) {
		if (line.trim() === '') continue;
		const indent = line.match(/^[ \t]*/)![0];
		if (common === null) {
			common = indent;
		} else {
			let k = 0;
			while (k < common.length && k < indent.length && common[k] === indent[k]) k++;
			common = common.slice(0, k);
		}
	}
	const cut = common?.length ?? 0;
	return {
		lines: lines.map((l) => (l.trim() === '' ? '' : l.slice(cut))),
		indent: common ?? '',
	};
}

/** Format the whole document; returns the new text or null when unchanged/failed. */
export async function formatSdoc(
	source: string,
	options: FormattingOptions,
	file: SdocFile = scanSdoc(source),
	filePath?: string,
): Promise<string | null> {
	// Formatting happens in LF space (prettier emits LF); the result re-joins
	// uniformly in the document's dominant EOL, so a CRLF document never comes
	// out with mixed line endings.
	const crlfCount = source.match(/\r\n/g)?.length ?? 0;
	const lfCount = (source.match(/\n/g)?.length ?? 0) - crlfCount;
	const eol = crlfCount > lfCount ? '\r\n' : '\n';
	const sourceLines = source.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
	// The project's Prettier config (.prettierrc) is the source of truth for
	// width and indentation when present; the editor's options are the
	// fallback, printWidth 80 the last resort.
	const cfg = filePath ? await prettier.resolveConfig(filePath).catch(() => null) : null;
	const useTabs = cfg?.useTabs ?? !options.insertSpaces;
	const tabWidth = cfg?.tabWidth ?? options.tabSize;
	const printWidth = cfg?.printWidth ?? 80;
	const oneLevel = useTabs ? '\t' : ' '.repeat(tabWidth);
	const opts: prettier.Options = {
		parser: 'svelte',
		plugins: [sveltePlugin],
		useTabs,
		tabWidth,
		printWidth,
		svelteSortOrder: 'options-scripts-markup-styles',
		// Demo bodies read better without whitespace-hugging (`…}}\n>text` /
		// `</Tag\n>`): block content is normal-flow text whose whitespace
		// collapses, so 'ignore' is the shipped default. An explicit
		// .prettierrc setting still wins.
		htmlWhitespaceSensitivity:
			(cfg?.htmlWhitespaceSensitivity as prettier.Options['htmlWhitespaceSensitivity']) ?? 'ignore',
	};
	// [DOC] bodies are markdown; normalize markup, never re-wrap prose.
	const mdOpts: prettier.Options = {
		parser: 'markdown',
		plugins: [markdownPlugin],
		useTabs,
		tabWidth,
		printWidth,
		proseWrap: 'preserve',
	};
	const regions: Region[] = [];

	const spanLines = (span: Span) => ({
		first: lineIndex(source, span.start),
		last: lineIndex(source, Math.max(span.start, span.end - 1)),
	});

	// prettier-plugin-svelte is not always idempotent (with whitespace
	// sensitivity 'ignore' some fragments only settle on a second pass), and
	// format-on-save must be stable — so every fragment formats to a fixpoint:
	// re-run prettier while the output keeps changing, capped at 3 passes.
	const fixpoint = async (text: string, fragmentOpts: prettier.Options): Promise<string> => {
		let prev = text;
		let out = await prettier.format(prev, fragmentOpts);
		for (let pass = 1; pass < 3 && out !== prev; pass++) {
			prev = out;
			out = await prettier.format(prev, fragmentOpts);
		}
		return out;
	};

	const formatFragment = async (text: string, fragmentOpts = opts): Promise<string[] | null> => {
		try {
			const formatted = await fixpoint(text, fragmentOpts);
			return formatted.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
		} catch {
			return null; // fragment doesn't parse — leave it exactly as written
		}
	};

	// File-level <script> and <style>: format the whole tag block in place.
	for (const tag of [file.script, file.style]) {
		if (!tag) continue;
		const { first, last } = spanLines(tag.span);
		const text = sourceLines.slice(first, last + 1).join('\n');
		const lines = await formatFragment(text);
		if (lines) regions.push({ firstLine: first, lastLine: last, lines });
	}

	// Block bodies: Svelte fragments in [preview]/[example] and [LAYOUT];
	// [DOC] bodies are markdown, except their [example] blocks — those are
	// Svelte fragments like any example, with the prose around them markdown.
	const bodies: { span: Span; indent: string; markdown?: boolean }[] = [];
	const pushBlockBodies = (blocks: SdocFile['entities'][number]['blocks']) => {
		for (const block of blocks) {
			if (block.bodySpan.end > block.bodySpan.start) {
				bodies.push({ span: block.bodySpan, indent: oneLevel });
			}
		}
	};
	const pushProse = (start: number, end: number, indent: string) => {
		if (end <= start) return;
		const text = source.slice(start, end);
		if (text.trim() === '') return;
		// Tighten to whole non-blank lines: the blank padding that separates
		// prose from the [example] tags stays exactly as authored.
		const lead = text.match(/^(?:[ \t]*\r?\n)+/)?.[0].length ?? 0;
		const trail = text.match(/(?:\r?\n[ \t]*)+$/)?.[0].length ?? 0;
		bodies.push({ span: { start: start + lead, end: end - trail }, indent, markdown: true });
	};
	for (const entity of file.entities) {
		if (entity.kind === 'SHOWCASE') {
			pushBlockBodies(entity.blocks);
		} else if (entity.kind === 'DOC' && entity.blocks.length > 0) {
			let from = entity.bodySpan.start;
			for (const block of entity.blocks) {
				let openerLineStart = block.openerSpan.start;
				while (openerLineStart > 0 && source[openerLineStart - 1] !== '\n') openerLineStart--;
				pushProse(from, openerLineStart, '');
				const nl = source.indexOf('\n', block.span.end);
				from = nl === -1 ? entity.bodySpan.end : nl + 1;
			}
			pushBlockBodies(entity.blocks);
			pushProse(from, entity.bodySpan.end, '');
		} else if (entity.bodySpan.end > entity.bodySpan.start) {
			bodies.push({
				span: entity.bodySpan,
				indent: '',
				markdown: entity.kind === 'DOC',
			});
		}
	}

	// Islands are Svelte fragments, but typed snippet params ({#snippet x(a:
	// string)}) only parse with a TS context — format behind a synthetic empty
	// script tag and strip it back out. Unparseable islands stay verbatim.
	const formatIsland = async (text: string): Promise<string[] | null> => {
		try {
			const formatted = await fixpoint('<script lang="ts"></script>\n' + text, opts);
			const stripped = formatted.replace(/^<script lang="ts"><\/script>\n+/, '');
			if (stripped === formatted) return null;
			return stripped.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
		} catch {
			return null;
		}
	};

	// [DOC] bodies: prose formats as markdown, Svelte islands (snippets, HTML
	// sections, component tags) as Svelte fragments — markdown tooling never
	// touches an island. Segments reassemble with one blank line between.
	const formatPageBody = async (dedented: string[]): Promise<string[]> => {
		const chunks: string[][] = [];
		for (const segment of segmentPageBody(dedented.join('\n'))) {
			if (segment.kind === 'island') {
				chunks.push((await formatIsland(segment.lines.join('\n'))) ?? segment.lines);
			} else {
				// Segments dedent independently: when islands and prose sit at
				// different depths, the whole-body common indent is empty, and a
				// still-indented prose line would read as a markdown code block.
				const prose = dedent(segment.lines).lines;
				const formatted = await formatFragment(prose.join('\n'), mdOpts);
				const lines = formatted ?? prose;
				// prettier trims a blank-only segment to a single empty line
				if (lines.some((l) => l.trim() !== '')) chunks.push(lines);
			}
		}
		const out: string[] = [];
		chunks.forEach((chunk, i) => {
			if (i > 0) out.push('');
			out.push(...chunk);
		});
		return out;
	};

	for (const body of bodies) {
		const { first, last } = spanLines(body.span);
		const raw = sourceLines.slice(first, last + 1);
		const { lines: dedented } = dedent(raw);
		const formatted = body.markdown
			? await formatPageBody(dedented)
			: await formatFragment(dedented.join('\n'));
		if (!formatted) continue;
		const indent = body.indent + oneLevel;
		regions.push({
			firstLine: first,
			lastLine: last,
			lines: formatted.map((l) => (l === '' ? '' : indent + l)),
		});
	}

	// Closer tag lines re-indent to the structure. A closer moves only when the
	// scanner actually found it (unclosed blocks stay verbatim), and only
	// whole-line indentation changes.
	const retag = (offset: number, indent: string, closer: string) => {
		const lineIdx = lineIndex(source, offset);
		const text = sourceLines[lineIdx];
		if (text.trim() !== closer) return;
		const normalized = indent + text.trim();
		if (normalized !== text) {
			regions.push({ firstLine: lineIdx, lastLine: lineIdx, lines: [normalized] });
		}
	};
	// Opener lines re-indent and wrap: a too-wide opener breaks to one
	// attribute per line, a short one stays (or collapses back to) one line.
	const reopen = (
		openerSpan: Span,
		attrs: Record<string, { span: Span }>,
		kind: string,
		tagIndent: string,
	) => {
		const first = lineIndex(source, openerSpan.start);
		const last = lineIndex(source, Math.max(openerSpan.start, openerSpan.end - 1));
		const lines = formatOpener(source, kind, attrs, tagIndent, oneLevel, printWidth);
		if (lines.join('\n') !== sourceLines.slice(first, last + 1).join('\n')) {
			regions.push({ firstLine: first, lastLine: last, lines });
		}
	};
	for (const entity of file.entities) {
		reopen(entity.openerSpan, entity.attrs, entity.kind, '');
		retag(Math.max(entity.openerSpan.end, entity.span.end - 1), '', `[/${entity.kind}]`);
		for (const block of entity.blocks) {
			reopen(block.openerSpan, block.attrs, block.kind, oneLevel);
			retag(Math.max(block.openerSpan.end, block.span.end - 1), oneLevel, `[/${block.kind}]`);
		}
	}

	// Any line carrying a scanner error stays byte-identical: what the scan
	// recovered there is lossy (a duplicate attribute keeps only the first;
	// stray text after "]" is no attribute at all), so re-emitting from the
	// parse would delete authored text. 'unclosed-block' is the exception:
	// its span points at a perfectly well-formed opener — the problem (the
	// missing closer) lies elsewhere, and the closer handling above is
	// already safe for it.
	const frozen = new Set<number>();
	for (const err of file.errors) {
		if (err.code === 'unclosed-block') continue;
		const first = lineIndex(source, err.span.start);
		const last = lineIndex(source, Math.max(err.span.start, err.span.end - 1));
		for (let l = first; l <= last; l++) frozen.add(l);
	}
	const safe = regions.filter((region) => {
		for (let l = region.firstLine; l <= region.lastLine; l++) {
			if (frozen.has(l)) return false;
		}
		return true;
	});
	if (safe.length === 0) return null;

	// Splice bottom-up so earlier line indexes stay valid.
	safe.sort((a, b) => b.firstLine - a.firstLine);
	const out = [...sourceLines];
	for (const region of safe) {
		out.splice(region.firstLine, region.lastLine - region.firstLine + 1, ...region.lines);
	}
	let result = out.join('\n');
	if (eol === '\r\n') result = result.replaceAll('\n', '\r\n');
	return result === source ? null : result;
}
