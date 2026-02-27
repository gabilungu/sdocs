import { loadConfig } from './config.js';
import { startServer } from './server.js';
const args = process.argv.slice(2);
const command = args[0];
function parseFlags(args) {
    const flags = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            }
            else {
                flags[key] = true;
            }
        }
    }
    return flags;
}
function printHelp() {
    console.log(`
  sdocs — Svelte component documentation

  Usage:
    sdocs dev          Start dev server
    sdocs help         Show this help

  Options:
    --port <number>    Dev server port (default: 5174)
    --open             Open browser on start

  Config:
    Create sdocs.config.js in your project root:

      export default {
        include: ['src/**/*.docs.{svelte,svx}'],
        port: 5174,
        options: {
          sidebar: { order: { root: ['Layout', '*'] } }
        }
      }
`);
}
async function main() {
    if (!command || command === 'help' || command === '--help') {
        printHelp();
        return;
    }
    if (command === 'dev') {
        const flags = parseFlags(args.slice(1));
        const config = await loadConfig();
        if (flags.port) {
            config.port = Number(flags.port);
        }
        if (flags.open) {
            config.open = true;
        }
        await startServer(config);
    }
    else {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
