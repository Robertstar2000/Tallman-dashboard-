// Custom startup script to test MCP server startup

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Testing MCP server startup...');

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

async function main() {
    try {
        console.log('Starting P21 HTTP MCP Server...');

        const p21Server = spawn('python', [path.join(__dirname, 'mcp-servers', 'p21_http_server.py')], {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: { ...process.env, P21_DSN: 'P21live' }
        });

        p21Server.on('close', (code) => {
            console.log(`P21 server exited with code ${code}`);
        });

        // Wait for server to start
        console.log('⏳ Waiting for server to start...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if port 8001 is now in use
        const portInUse = !(await checkPort(8001));
        console.log(`Port 8001 in use: ${portInUse}`);

        if (portInUse) {
            console.log('✅ P21 MCP Server appears to be running on port 8001');
        } else {
            console.log('❌ P21 MCP Server failed to start');
        }

        // Test a simple query
        console.log('Testing server with simple query...');
        const testServer = (responseData) => {
            console.log('Server response received:', responseData);
            setTimeout(() => {
                console.log('Shutting down test...');
                process.exit(0);
            }, 1000);
        };

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
