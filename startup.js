#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Tallman Dashboard with MCP servers...');

// Function to spawn a process and handle output
function spawnProcess(command, args, options = {}) {
    const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
    });
    
    child.stdout.on('data', (data) => {
        console.log(`[${options.name || 'Process'}] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
        console.error(`[${options.name || 'Process'}] ${data.toString().trim()}`);
    });
    
    child.on('close', (code) => {
        console.log(`[${options.name || 'Process'}] Process exited with code ${code}`);
    });
    
    child.on('error', (error) => {
        console.error(`[${options.name || 'Process'}] Error: ${error.message}`);
    });
    
    return child;
}

// Start P21 MCP Server on port 8001
console.log('📊 Starting P21 HTTP MCP Server on port 8001...');
const p21Server = spawnProcess('python', [path.join('mcp-servers', 'p21_http_server.py')], {
    name: 'P21-MCP',
    cwd: process.cwd()
});

// Start POR MCP Server on port 8002
console.log('🗃️ Starting POR HTTP MCP Server on port 8002...');
const porServer = spawnProcess('python', [path.join('mcp-servers', 'por_http_server.py')], {
    name: 'POR-MCP',
    cwd: process.cwd()
});

// Wait a bit for MCP servers to start, then start Vite
setTimeout(() => {
    console.log('🌐 Starting Vite development server on port 8080...');
    const viteServer = spawnProcess('cmd', ['/c', 'npm', 'run', 'dev'], {
        name: 'Vite',
        cwd: process.cwd(),
        shell: true
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down all servers...');
        p21Server.kill('SIGTERM');
        porServer.kill('SIGTERM');
        viteServer.kill('SIGTERM');
        setTimeout(() => process.exit(0), 1000);
    });
    
    process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down all servers...');
        p21Server.kill('SIGTERM');
        porServer.kill('SIGTERM');
        viteServer.kill('SIGTERM');
        setTimeout(() => process.exit(0), 1000);
    });
}, 3000);

console.log('✅ All services starting...');
console.log('📱 Dashboard will be available at: http://127.0.0.1:8080');
console.log('🔌 P21 MCP Server: http://localhost:8001');
console.log('🔌 POR MCP Server: http://localhost:8002');
console.log('\n💡 Press Ctrl+C to stop all services');
