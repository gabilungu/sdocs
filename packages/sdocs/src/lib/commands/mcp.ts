import { serveStdio } from '../mcp/stdio.js';

/**
 * `sdocs mcp` — serve the sdocs MCP server on stdio: authoring tools
 * (validate_sdoc, scaffold_component_doc, get_authoring_guide) for agent
 * clients. The dev server exposes the same server over HTTP at /mcp.
 */
export async function mcpCommand(): Promise<void> {
	// stdout belongs to the protocol; greet on stderr only.
	console.error('[sdocs] MCP server on stdio — authoring tools for .sdoc files');
	await serveStdio();
}
