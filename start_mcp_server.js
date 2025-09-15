// Simple script to start the P21 MCP server

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting P21 MCP Server...');
console.log('Working directory:', __dirname);

// Start the MCP server
const mcpServer = spawn('python', [
    path.join(__dirname, 'mcp-servers', 'p21_http_server.py')
], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
    env: { ...process.env, P21_DSN: 'P21live' }
});

let serverOutput = '';
let serverErrors = '';

mcpServer.stdout.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    console.log('[MCP SERVER]', output.trim());
});

mcpServer.stderr.on('data', (data) => {
    const error = data.toString();
    serverErrors += error;
    console.error('[MCP SERVER ERROR]', error.trim());
});

mcpServer.on('close', (code) => {
    console.log(`MCP server exited with code ${code}`);
    if (code !== 0) {
        console.error('Server errors:', serverErrors);
    }
    process.exit(code);
});

mcpServer.on('error', (error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
});

// Keep the process alive
setInterval(() => {
    // Ping to keep alive
}, 10000);

console.log('✅ P21 MCP Server starting...');
console.log('📋 You can now test connections to http://localhost:8001');
