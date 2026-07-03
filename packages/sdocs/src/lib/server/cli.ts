import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
	try {
		const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
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
  dev       Start the Explorer dev server with live reload
  run       Same as dev — works with npx and no local install
  build     Build the Explorer as a static site
  preview   Serve built site locally
  init      Scaffold sdocs.config.js

Options:
  --help     Show this help message
  --version  Show version number
`.trim();

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === '--help' || command === '-h') {
		console.log(HELP);
		return;
	}

	if (command === '--version' || command === '-v') {
		console.log(getVersion());
		return;
	}

	switch (command) {
		case 'dev':
		case 'run': {
			const { devCommand } = await import('../commands/dev.js');
			await devCommand();
			break;
		}
		case 'build': {
			const { buildCommand } = await import('../commands/build.js');
			await buildCommand();
			break;
		}
		case 'preview': {
			const { previewCommand } = await import('../commands/preview.js');
			await previewCommand();
			break;
		}
		case 'init': {
			const { initCommand } = await import('../commands/init.js');
			await initCommand();
			break;
		}
		default:
			console.error(`Unknown command: ${command}`);
			console.log(HELP);
			process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
