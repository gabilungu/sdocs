import { resolve } from 'node:path';
import { loadConfig } from '../server/config.js';
import { discoverDocFiles } from '../server/discovery.js';
import { checkDocFiles } from '../server/check.js';

/**
 * `sdocs check` — compile every documentation stage and report what breaks,
 * without starting a server or writing a build. Exits non-zero on the first
 * error so CI can gate on it.
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

	const errors = result.problems.filter((p) => p.severity === 'error').length;
	const warnings = result.problems.length - errors;
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
