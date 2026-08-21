import { resolve } from 'node:path';
import { loadConfig } from '../server/config.js';
import { discoverDocFiles } from '../server/discovery.js';
import { checkDocFiles } from '../server/check.js';
import { buildSiteMap } from '../server/site-map.js';

/**
 * `sdocs check` — compile every documentation stage and validate the site
 * structure, reporting what breaks without starting a server or writing a
 * build. Exits non-zero on any error so CI can gate on it.
 *
 * The structure half matters as much as the compile half, and used to be
 * missing: an unknown `@section`, two entities claiming one route, or a `home`
 * pointing nowhere all fail `sdocs build`, so a `check` that ignored them
 * passed sites that could not be built — in the one command CI is told to run.
 */
export async function checkCommand(): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);
	const files = await discoverDocFiles(
		config.include.map((p) => resolve(cwd, p)),
		cwd,
	);

	if (files.length === 0) {
		console.log('[sdocs] No .sdoc files matched the include patterns.');
		return;
	}

	const result = await checkDocFiles(files, cwd);
	const map = await buildSiteMap(config, cwd);

	for (const e of map.errors) {
		console.log(`\nerror  ${e.file ?? 'site structure'}`);
		console.log(`  ${e.message}`);
	}

	for (const p of result.problems) {
		const where = [p.file + (p.line ? `:${p.line}` : ''), p.entity, p.stage]
			.filter(Boolean)
			.join(' › ');
		const label = p.severity === 'error' ? 'error' : 'warning';
		// One line per problem, message indented under it — compile messages
		// are often multi-line (the compiler's own frame).
		console.log(`\n${label}  ${where}`);
		for (const line of p.message.split('\n')) console.log(`  ${line}`);
	}

	const compileErrors = result.problems.filter((p) => p.severity === 'error').length;
	const errors = compileErrors + map.errors.length;
	const warnings = result.problems.length - compileErrors;
	const summary = `${result.checked.stages} stage(s) in ${result.checked.files} file(s)`;

	if (errors > 0) {
		console.log(
			`\n[sdocs] ${errors} error(s), ${warnings} warning(s) — checked ${summary}.`,
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		warnings > 0
			? `\n[sdocs] No errors, ${warnings} warning(s) — checked ${summary}.`
			: `[sdocs] All good — checked ${summary}.`,
	);
}
