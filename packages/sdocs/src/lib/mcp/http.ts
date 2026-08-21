import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMcpMessage } from './handler.js';

const BODY_LIMIT = 8 * 1024 * 1024;

/**
 * The MCP streamable-HTTP transport, stateless: each POST carries one
 * JSON-RPC message and gets a JSON response (no sessions, no SSE stream —
 * the spec allows a plain JSON reply, and every tool here answers at once).
 * Mounted at /mcp by the dev server; never part of a build.
 */
export function mcpHttpHandler() {
	return (req: IncomingMessage, res: ServerResponse): void => {
		// DNS-rebinding protection: a browser page on a foreign origin must not
		// drive the local server. Non-browser clients send no Origin at all.
		const origin = req.headers.origin;
		if (origin && !isLocalOrigin(origin)) {
			res.statusCode = 403;
			res.end('Forbidden');
			return;
		}

		if (req.method !== 'POST') {
			res.statusCode = 405;
			res.setHeader('Allow', 'POST');
			res.end('The sdocs MCP endpoint accepts JSON-RPC over POST.');
			return;
		}

		let size = 0;
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => {
			size += chunk.length;
			if (size > BODY_LIMIT) {
				res.statusCode = 413;
				res.end();
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => {
			void (async () => {
				let msg: unknown;
				try {
					msg = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
				} catch {
					respondJson(res, 400, {
						jsonrpc: '2.0',
						id: null,
						error: { code: -32700, message: 'Parse error' },
					});
					return;
				}
				const response = await handleMcpMessage(msg);
				if (!response) {
					// A notification or client response — acknowledge with no body.
					res.statusCode = 202;
					res.end();
					return;
				}
				respondJson(res, 200, response);
			})();
		});
	};
}

/**
 * A same-machine Origin. The dev server's write endpoints share this with the
 * MCP route: both accept requests that edit the user's source, so both need
 * the same DNS-rebinding guard.
 */
export function isLocalOrigin(origin: string): boolean {
	try {
		const host = new URL(origin).hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
	} catch {
		return false;
	}
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body));
}
