import { ConfigError } from './config.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
	try {
		// This file sits at dist/server/cli.js; package.json is two levels up.
		const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));
		return pkg.version;
	} catch {
		return 'unknown';
	}
}

const HELP = `
sdocs — A lightweight documentation tool for Svelte 5 components

Usage:
  sdocs <command>

Commands:
  dev             Start the Explorer dev server with live reload
  run             Same as dev — works with npx and no local install
  build           Build the Explorer as a static site
  preview         Serve built site locally
  check           Compile every doc stage and report what breaks (exits 1 on error)
  coverage        Report which components have a [component] preview
  init            Scaffold sdocs.config.js
  mcp             Serve the sdocs MCP server on stdio (authoring tools for agents)

Options:
  --port <n>      Port for dev / preview (overrides the config)
  --open          Open a browser on start; --no-open to suppress it
  --base <path>   Public base path for build (e.g. /repo/ for project Pages)
  --out-dir <d>   Where build writes (overrides the config; default dist)
  --help          Show this help message
  --version       Show version number
`.trim();

/** Value of a `--flag value` or `--flag=value` option, if present. */
function flag(args: string[], name: string): string | undefined {
	const eq = args.find((a) => a.startsWith(`--${name}=`));
	if (eq) return eq.slice(name.length + 3);
	const i = args.indexOf(`--${name}`);
	return i !== -1 ? args[i + 1] : undefined;
}

/**
 * Which options each command reads. Anything else is a mistake worth saying
 * out loud: an ignored `--bse /repo/` builds every asset URL at the wrong
 * prefix and the only symptom is a blank page on the deploy.
 */
const COMMAND_FLAGS: Record<string, string[]> = {
	dev: ['port', 'open', 'no-open'],
	run: ['port', 'open', 'no-open'],
	build: ['base', 'out-dir'],
	preview: ['port', 'open', 'no-open'],
	check: [],
	coverage: [],
	init: [],
	mcp: [],
};

/** Options that take a value, so `--port 3000` doesn't read 3000 as a flag. */
const VALUE_FLAGS = new Set(['port', 'base', 'out-dir']);

/** Exits with a message naming the offending option and what the command does
 * accept. Returns nothing when every option is understood. */
function rejectUnknownFlags(command: string, args: string[]): void {
	const allowed = COMMAND_FLAGS[command];
	if (!allowed) return;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith('--')) continue;
		const name = arg.slice(2).split('=')[0];
		if (allowed.includes(name)) {
			// Skip a separated value so it is never read as an option itself.
			if (VALUE_FLAGS.has(name) && !arg.includes('=')) i++;
			continue;
		}
		console.error(`[sdocs] Unknown option for \`sdocs ${command}\`: --${name}`);
		console.error(
			allowed.length
				? `[sdocs] It accepts ${allowed.map((f) => `--${f}`).join(', ')}.`
				: `[sdocs] It takes no options.`,
		);
		process.exit(1);
	}
}

/** A `--port` value, validated. A typo'd port is worth stopping for: falling
 * back to the config's would serve on an address the caller is not watching. */
function portFlag(args: string[]): number | undefined {
	const raw = flag(args, 'port');
	if (raw === undefined) return undefined;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		console.error(`[sdocs] --port needs a number between 1 and 65535, got "${raw}".`);
		process.exit(1);
	}
	return port;
}

/** `--open` / `--no-open`, or undefined to leave the config's choice alone. */
function openFlag(args: string[]): boolean | undefined {
	if (args.includes('--no-open')) return false;
	if (args.includes('--open')) return true;
	return undefined;
}

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	// Asking for help or the version never runs a command — `sdocs build
	// --help` must print help, not start a build and overwrite dist/.
	if (!command || args.includes('--help') || args.includes('-h')) {
		console.log(HELP);
		return;
	}

	if (args.includes('--version') || args.includes('-v')) {
		console.log(getVersion());
		return;
	}

	rejectUnknownFlags(command, args.slice(1));

	switch (command) {
		case 'dev':
		case 'run': {
			const { devCommand } = await import('../commands/dev.js');
			await devCommand({ port: portFlag(args), open: openFlag(args) });
			break;
		}
		case 'build': {
			const { buildCommand } = await import('../commands/build.js');
			await buildCommand({ base: flag(args, 'base'), outDir: flag(args, 'out-dir') });
			break;
		}
		case 'preview': {
			const { previewCommand } = await import('../commands/preview.js');
			await previewCommand({ port: portFlag(args), open: openFlag(args) });
			break;
		}
		case 'check': {
			const { checkCommand } = await import('../commands/check.js');
			await checkCommand();
			break;
		}
		case 'coverage': {
			const { coverageCommand } = await import('../commands/coverage.js');
			await coverageCommand();
			break;
		}
		case 'init': {
			const { initCommand } = await import('../commands/init.js');
			await initCommand();
			break;
		}
		case 'mcp': {
			const { mcpCommand } = await import('../commands/mcp.js');
			await mcpCommand();
			break;
		}
		default:
			console.error(`Unknown command: ${command}`);
			console.log(HELP);
			process.exit(1);
	}
}

/** Vite's listen failure for an occupied port, however it is worded. */
function isPortInUse(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return (
		(err as NodeJS.ErrnoException).code === 'EADDRINUSE' || /is already in use/.test(err.message)
	);
}

main().catch((err) => {
	// A ConfigError already says what is wrong and which file it is in; the
	// stack behind it is sdocs' own internals and helps nobody. Everything
	// else keeps its stack, because an unexpected throw is a bug worth
	// reporting in full.
	if (err instanceof ConfigError) {
		console.error(`[sdocs] ${err.message}`);
		console.error(`  ${err.configPath}`);
	} else if (isPortInUse(err)) {
		// Someone else holds the port. That is a thing to fix, not a bug to
		// report, and Vite's own listen stack says nothing the message doesn't.
		console.error(`[sdocs] ${(err as Error).message}`);
		console.error('[sdocs] Pass a free one with --port, or stop what is on that one.');
	} else {
		console.error(err);
	}
	process.exit(1);
});
