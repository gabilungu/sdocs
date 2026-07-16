import { createInterface } from 'node:readline';
import { handleMcpMessage } from './handler.js';

/**
 * The MCP stdio transport: newline-delimited JSON-RPC on stdin/stdout.
 * stdout carries protocol messages only — anything human goes to stderr.
 */
export async function serveStdio(): Promise<void> {
	const rl = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });

	rl.on('line', (line) => {
		const text = line.trim();
		if (!text) return;
		void (async () => {
			let msg: unknown;
			try {
				msg = JSON.parse(text);
			} catch {
				process.stdout.write(
					JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) +
						'\n',
				);
				return;
			}
			const response = await handleMcpMessage(msg);
			if (response) process.stdout.write(JSON.stringify(response) + '\n');
		})();
	});

	// Serve until the client closes stdin.
	await new Promise<void>((done) => rl.on('close', done));
}
