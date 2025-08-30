#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Tallman Dashboard with MCP servers...');

// Function to check if a port is available
function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
            server.once('close', () => resolve(true));
            server.close();
        });
        server.on('error', () => resolve(false));
    });
}

// Function to find an available port starting from a base port
async function findAvailablePort(basePort, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const port = basePort + i;
        const isAvailable = await checkPort(port);
        if (isAvailable) {
            return port;
        }
        console.log(`Port ${port} is in use, trying another one...`);
    }
    throw new Error(`Could not find an available port starting from ${basePort}`);
}

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

// Start servers with port checking
async function startServers() {
    try {
        // Find available ports
        const p21Port = await findAvailablePort(8001);
        const porPort = await findAvailablePort(8002);
        const vitePort = await findAvailablePort(8080);

        // Start P21 MCP Server
        console.log(`📊 Starting P21 HTTP MCP Server on port ${p21Port}...`);
        const p21Server = spawnProcess('python', [path.join('mcp-servers', 'p21_http_server.py')], {
            name: 'P21-MCP',
            cwd: process.cwd(),
            env: { ...process.env, PORT: p21Port.toString() }
        });

        // Start POR MCP Server
        console.log(`🗃️ Starting POR HTTP MCP Server on port ${porPort}...`);
        const porServer = spawnProcess('python', [path.join('mcp-servers', 'por_http_server.py')], {
            name: 'POR-MCP',
            cwd: process.cwd(),
            env: { ...process.env, PORT: porPort.toString() }
        });

        // Wait a bit for MCP servers to start, then start Vite
        setTimeout(() => {
            console.log(`🌐 Starting Vite development server on port ${vitePort}...`);
            const viteServer = spawnProcess('cmd', ['/c', 'vite', '--port', vitePort.toString()], {
                name: 'Vite',
                cwd: process.cwd(),
                shell: true
            });

            // Update console output with actual ports
            console.log('✅ All services starting...');
            console.log(`📱 Dashboard will be available at: http://127.0.0.1:${vitePort}`);
            console.log(`🔌 P21 MCP Server: http://localhost:${p21Port}`);
            console.log(`🔌 POR MCP Server: http://localhost:${porPort}`);
            console.log('\n💡 Press Ctrl+C to stop all services');
    
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

    } catch (error) {
        console.error('❌ Error starting servers:', error.message);
        process.exit(1);
    }
}

// Start the servers
startServers();
