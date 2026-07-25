import { resolve } from 'node:path';
import { loadConfig } from '../server/config.js';
import { discoverDocFiles } from '../server/discovery.js';
import { measureCoverage } from '../server/coverage.js';

/**
 * `sdocs coverage` — which components have a `[component]` preview and which
 * don't. A report, not a gate: it always exits 0, since undocumented
 * components are a normal state of a project in progress.
 */
export async function coverageCommand(): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);
	const result = await measureCoverage(files, config.components, cwd);

	if (result.counts.components === 0) {
		console.log(
			`[sdocs] No component files matched ${result.componentGlobs.join(', ')}.\n` +
				'        Set `components` in sdocs.config.js to the globs locating them.',
		);
		return;
	}

	const { components, documented, undocumented } = result.counts;
	const percent = Math.round((documented / components) * 100);

	if (undocumented > 0) {
		console.log(`\nUndocumented (${undocumented}):`);
		for (const file of result.undocumented) console.log(`  ${file}`);
	}

	if (result.multiplyDocumented.length > 0) {
		console.log(`\nDocumented in more than one file (${result.multiplyDocumented.length}):`);
		for (const c of result.multiplyDocumented) {
			console.log(`  ${c.component}`);
			for (const file of c.files) console.log(`    ${file}`);
		}
	}

	if (result.unresolved.length > 0) {
		console.log(`\nUnresolved component references (${result.unresolved.length}):`);
		for (const u of result.unresolved) {
			console.log(`  ${u.file} › ${u.entity} › ${u.stage} — component={${u.component}}`);
		}
	}

	if (result.documentedOutsideGlobs.length > 0) {
		console.log(`\nDocumented but outside the component globs (${result.documentedOutsideGlobs.length}):`);
		for (const file of result.documentedOutsideGlobs) console.log(`  ${file}`);
	}

	console.log(
		`\n[sdocs] ${documented}/${components} components documented (${percent}%) — ` +
			`matched ${result.componentGlobs.join(', ')}.`,
	);
}
