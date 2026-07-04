/**
 * Fragment-wise formatting for .sdoc files: the file <script> and <style>
 * and every Svelte block body format independently through prettier with
 * prettier-plugin-svelte, then reassemble with the block's indentation.
 * Block tags and [PAGE] prose are never touched.
 */

import * as prettier from 'prettier';
import * as sveltePlugin from 'prettier-plugin-svelte';
import type { FormattingOptions } from 'vscode-languageserver-protocol';
import { scanSdoc, type SdocFile, type Span } from 'sdocs/language';

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
	const regions: Region[] = [];

	const spanLines = (span: Span) => ({
		first: lineIndex(source, span.start),
		last: lineIndex(source, Math.max(span.start, span.end - 1)),
	});

	const formatFragment = async (text: string): Promise<string[] | null> => {
		try {
			const formatted = await prettier.format(text, opts);
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

	// Block bodies: Svelte fragments in [preview]/[example] and [LAYOUT].
	const bodies: { span: Span; indent: string }[] = [];
	for (const entity of file.entities) {
		if (entity.kind === 'DOCS') {
			for (const block of entity.blocks) {
				if (block.bodySpan.end > block.bodySpan.start) {
					bodies.push({ span: block.bodySpan, indent: openerIndent(source, block.openerSpan) });
				}
			}
		} else if (entity.kind === 'LAYOUT' && entity.bodySpan.end > entity.bodySpan.start) {
			bodies.push({ span: entity.bodySpan, indent: openerIndent(source, entity.openerSpan) });
		}
		// PAGE prose is never reformatted.
	}

	for (const body of bodies) {
		const { first, last } = spanLines(body.span);
		const raw = sourceLines.slice(first, last + 1);
		const { lines: dedented } = dedent(raw);
		const formatted = await formatFragment(dedented.join('\n'));
		if (!formatted) continue;
		const indent = body.indent + (options.insertSpaces ? ' '.repeat(options.tabSize) : '\t');
		regions.push({
			firstLine: first,
			lastLine: last,
			lines: formatted.map((l) => (l === '' ? '' : indent + l)),
		});
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

function openerIndent(source: string, openerSpan: Span): string {
	let lineStart = openerSpan.start;
	while (lineStart > 0 && source[lineStart - 1] !== '\n') lineStart--;
	return source.slice(lineStart, openerSpan.start).match(/^[ \t]*/)![0];
}
