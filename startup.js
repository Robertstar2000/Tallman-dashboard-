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

    // Check if child process is valid before attaching event handlers
    if (child) {
        child.stdout && child.stdout.on('data', (data) => {
            console.log(`[${options.name || 'Process'}] ${data.toString().trim()}`);
        });

        child.stderr && child.stderr.on('data', (data) => {
            console.error(`[${options.name || 'Process'}] ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
            console.log(`[${options.name || 'Process'}] Process exited with code ${code}`);
        });

        child.on('error', (error) => {
            console.error(`[${options.name || 'Process'}] Error: ${error.message}`);
        });
    } else {
        console.error(`[${options.name || 'Process'}] Failed to spawn process`);
    }

    return child;
}

// Start servers with the new bridge architecture
async function startServers() {
    try {
        // Find available ports
        const vitePort = await findAvailablePort(8080);

        // Start P21 Bridge Server (includes Python MCP server inside it)
        console.log(`🌉 Starting P21 Bridge Service...`);
        const p21Bridge = spawnProcess('node', ['start-p21-bridge.js'], {
            name: 'P21-BRIDGE',
            cwd: process.cwd()
        });

        // Wait for bridge to start up, then start Vite
        setTimeout(() => {
            console.log(`🌐 Starting Vite development server on port ${vitePort}...`);
            const viteServer = spawnProcess('cmd', ['/c', 'npx vite --port', vitePort.toString()], {
                name: 'Vite',
                cwd: process.cwd(),
                shell: true,
                stdio: 'inherit'
            });

            // Update console output with service information
            console.log('✅ All services starting...');
            console.log(`📱 Dashboard will be available at: http://127.0.0.1:${vitePort}`);
            console.log(`🌉 P21 Bridge Server: http://localhost:8002`);
            console.log(`🐍 P21 Python Server: http://localhost:8001`);
            console.log('\n💡 The dashboard is now fully operational with P21 MCP functionality!');
            console.log('💡 Press Ctrl+C to stop all services');

            // Handle graceful shutdown
            const cleanup = () => {
                console.log('\n🛑 Shutting down all servers...');
                if (p21Bridge && !p21Bridge.killed) {
                    p21Bridge.kill('SIGTERM');
                }
                if (viteServer && !viteServer.killed) {
                    viteServer.kill('SIGTERM');
                }
                setTimeout(() => process.exit(0), 2000);
            };

            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);

        }, 5000); // Give bridge more time to start

    } catch (error) {
        console.error('❌ Error starting servers:', error.message);
        process.exit(1);
    }
}

// Start the servers
startServers();
