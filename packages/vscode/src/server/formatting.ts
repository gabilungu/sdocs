/**
 * Fragment-wise formatting for .sdoc files: the file <script> and <style>
 * and every Svelte block body format independently through prettier with
 * prettier-plugin-svelte, [DOC] bodies through prettier's markdown parser
 * (prose lines are preserved, never re-wrapped), then reassemble at the
 * structural indentation: entity tags at column 0, sub-block tags one level
 * in, bodies one level deeper. Tag lines re-indent to that structure; their
 * attributes are never reformatted.
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

function prettierOptions(options: FormattingOptions): prettier.Options {
	return {
		parser: 'svelte',
		plugins: [sveltePlugin],
		useTabs: !options.insertSpaces,
		tabWidth: options.tabSize,
		svelteSortOrder: 'options-scripts-markup-styles',
	} as prettier.Options;
}

/** [DOC] bodies are markdown; normalize markup, never re-wrap prose. */
function markdownOptions(options: FormattingOptions): prettier.Options {
	return {
		parser: 'markdown',
		plugins: [markdownPlugin],
		useTabs: !options.insertSpaces,
		tabWidth: options.tabSize,
		proseWrap: 'preserve',
	};
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
): Promise<string | null> {
	const sourceLines = source.split('\n');
	const opts = prettierOptions(options);
	const oneLevel = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
	const regions: Region[] = [];

	const spanLines = (span: Span) => ({
		first: lineIndex(source, span.start),
		last: lineIndex(source, Math.max(span.start, span.end - 1)),
	});

	const formatFragment = async (text: string, fragmentOpts = opts): Promise<string[] | null> => {
		try {
			const formatted = await prettier.format(text, fragmentOpts);
			return formatted.replace(/\n+$/, '').split('\n');
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
			const formatted = await prettier.format('<script lang="ts"></script>\n' + text, opts);
			const stripped = formatted.replace(/^<script lang="ts"><\/script>\n+/, '');
			if (stripped === formatted) return null;
			return stripped.replace(/\n+$/, '').split('\n');
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
				const formatted = await formatFragment(prose.join('\n'), markdownOptions(options));
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

	// Tag lines re-indent to the structure: entity tags at column 0,
	// sub-block tags one level in. A closer moves only when the scanner
	// actually found it (unclosed blocks stay verbatim), and only whole-line
	// indentation changes — attributes are never reformatted.
	const retag = (offset: number, indent: string, closer?: string) => {
		const lineIdx = lineIndex(source, offset);
		const text = sourceLines[lineIdx];
		if (closer !== undefined && text.trim() !== closer) return;
		const normalized = indent + text.trim();
		if (normalized !== text) {
			regions.push({ firstLine: lineIdx, lastLine: lineIdx, lines: [normalized] });
		}
	};
	for (const entity of file.entities) {
		retag(entity.openerSpan.start, '');
		retag(Math.max(entity.openerSpan.end, entity.span.end - 1), '', `[/${entity.kind}]`);
		for (const block of entity.blocks) {
			retag(block.openerSpan.start, oneLevel);
			retag(Math.max(block.openerSpan.end, block.span.end - 1), oneLevel, `[/${block.kind}]`);
		}
	}

	if (regions.length === 0) return null;

	// Splice bottom-up so earlier line indexes stay valid.
	regions.sort((a, b) => b.firstLine - a.firstLine);
	const out = [...sourceLines];
	for (const region of regions) {
		out.splice(region.firstLine, region.lastLine - region.firstLine + 1, ...region.lines);
	}
	const result = out.join('\n');
	return result === source ? null : result;
}
