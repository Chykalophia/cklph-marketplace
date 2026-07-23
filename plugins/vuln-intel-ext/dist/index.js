#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { getDb } from "./db.js";
async function main() {
    getDb();
    const server = new McpServer({
        name: "vuln-intel-ext",
        version: "1.0.0",
    });
    registerTools(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("[vuln-intel-ext] Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map