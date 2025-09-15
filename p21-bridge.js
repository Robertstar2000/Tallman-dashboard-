#!/usr/bin/env node

/**
 * P21 Bridge Service
 * Node.js bridge to handle P21 database communication
 * Totally bypasses browser fetch() issues
 */

import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class P21Bridge {
    constructor() {
        this.pythonServer = null;
        this.requests = new Map();
        this.requestCounter = 0;
    }

    async start() {
        console.log('🔸 [P21 BRIDGE] Starting Node.js P21 Bridge Service...');

        // Kill any existing Python servers
        this.killExistingPythonServers();

        // Give time for old servers to terminate
        await this.sleep(2000);

        // Start fresh P21 Python server
        this.startPythonServer();

        // Wait for server to start
        await this.sleep(5000);

        // Start Node.js HTTP server
        this.startHTTPServer();

        console.log('✅ [P21 BRIDGE] P21 Bridge Service started successfully');
        console.log('📡 [P21 BRIDGE] Bridge API: http://localhost:8002');
    }

    killExistingPythonServers() {
        console.log('🔸 [P21 BRIDGE] Killing existing Python servers...');

        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/FI', 'IMAGENAME eq python.exe'], { stdio: 'inherit' });
            } else {
                spawn('pkill', ['-f', 'p21_http_server.py'], { stdio: 'inherit' });
            }
        } catch (error) {
            console.log('⚠️  [P21 BRIDGE] Could not kill existing servers:', error.message);
        }
    }

    startPythonServer() {
        console.log('🔸 [P21 BRIDGE] Starting P21 Python server...');

        const serverPath = path.join(__dirname, 'mcp-servers', 'p21_http_server.py');

        this.pythonServer = spawn('python', [serverPath], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, P21_DSN: 'P21live' }
        });

        this.pythonServer.stdout.on('data', (data) => {
            console.log('📝 [PYTHON] ' + data.toString().trim());
        });

        this.pythonServer.stderr.on('data', (data) => {
            console.log('⚠️  [PYTHON ERR] ' + data.toString().trim());
        });

        this.pythonServer.on('close', (code) => {
            console.log(`❌ [P21 BRIDGE] Python server exited with code ${code}`);
        });

        this.pythonServer.on('error', (error) => {
            console.log('❌ [P21 BRIDGE] Python server error:', error.message);
        });
    }

    startHTTPServer() {
        console.log('🔸 [P21 BRIDGE] Starting Node.js HTTP server on port 8002...');

        const server = http.createServer(async (req, res) => {
            this.handleRequest(req, res);
        });

        server.listen(8002, '127.0.0.1', () => {
            console.log('✅ [P21 BRIDGE] HTTP server listening on http://127.0.0.1:8002');
        });

        server.on('error', (error) => {
            console.log('❌ [P21 BRIDGE] HTTP server error:', error.message);
            // Try port 8003 if 8002 is busy
            if (error.code === 'EADDRINUSE') {
                console.log('⚠️  [P21 BRIDGE] Port 8002 busy, trying 8003...');
                server.listen(8003, '127.0.0.1');
            }
        });
    }

    async handleRequest(req, res) {
        console.log(`📡 [P21 BRIDGE] ${req.method} ${req.url}`);

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/json');

        // Handle preflight OPTIONS request
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Handle health check
        if (req.url === '/health') {
            const response = {
                status: 'healthy',
                service: 'P21 Bridge',
                pythonServer: this.pythonServer ? 'running' : 'stopped',
                timestamp: new Date().toISOString()
            };

            res.writeHead(200);
            res.end(JSON.stringify(response));
            return;
        }

        // Handle MCP tool calls
        if (req.url === '/call_tool' && req.method === 'POST') {
            await this.handleToolCall(req, res);
            return;
        }

        // Handle other requests
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found', url: req.url }));
    }

    async handleToolCall(req, res) {
        try {
            // Read request body
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const requestData = JSON.parse(body);
                    console.log('📋 [P21 BRIDGE] Tool call:', requestData.name);

                    // Forward to Python server
                    const result = await this.callPythonServer(requestData);

                    res.writeHead(200);
                    res.end(JSON.stringify(result));

                } catch (parseError) {
                    console.log('❌ [P21 BRIDGE] JSON parse error:', parseError.message);
                    res.writeHead(400);
                    res.end(JSON.stringify({
                        error: 'Invalid JSON',
                        message: parseError.message
                    }));
                }
            });

        } catch (error) {
            console.log('❌ [P21 BRIDGE] Tool call error:', error.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    async callPythonServer(requestData) {
        return new Promise((resolve, reject) => {
            console.log('🌐 [P21 BRIDGE] Calling Python server...');

            // Make HTTP request to Python server
            const postData = JSON.stringify(requestData);

            const options = {
                hostname: '127.0.0.1',
                port: 8001,
                path: '/call_tool',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

const req = http.request(options, (res) => {
    let data = '';

    console.log(`⚡ [P21 BRIDGE] Python response: ${res.statusCode}`);

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(`💾 [P21 BRIDGE] Full response received (${data.length} characters)`);
                    try {
                        const result = JSON.parse(data);
                        console.log('✅ [P21 BRIDGE] Python result received');
                        resolve(result);
                    } catch (parseError) {
                        console.log('❌ [P21 BRIDGE] Response parse error:', parseError.message);
                        resolve({
                            success: false,
                            error: 'Response parse error',
                            rawData: data
                        });
                    }
                });
            });

            req.on('error', (error) => {
                console.log('❌ [P21 BRIDGE] HTTP request error:', error.message);
                // Python server might not be ready, try to restart it
                if (this.pythonServer) {
                    console.log('🔄 [P21 BRIDGE] Attempting to restart Python server...');
                    this.pythonServer.kill();
                    setTimeout(() => {
                        this.startPythonServer();
                    }, 3000);
                }

                resolve({
                    success: false,
                    error: 'Python server communication error: ' + error.message,
                    serverStatus: this.pythonServer ? 'running' : 'stopped'
                });
            });

            req.setTimeout(90000, () => {
                console.log('⏱️  [P21 BRIDGE] Request timeout after 90 seconds');
                req.destroy();
                resolve({
                    success: false,
                    error: 'Request timeout after 90 seconds'
                });
            });

            req.write(postData);
            req.end();
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        console.log('🛑 [P21 BRIDGE] Stopping P21 Bridge Service...');

        if (this.pythonServer) {
            console.log('🛑 [P21 BRIDGE] Stopping Python server...');
            this.pythonServer.kill('SIGTERM');
        }

        console.log('✅ [P21 BRIDGE] P21 Bridge Service stopped');
    }
}

// Handle process signals
const bridge = new P21Bridge();

process.on('SIGINT', () => {
    console.log('🔸 [P21 BRIDGE] Received SIGINT, stopping...');
    bridge.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🔸 [P21 BRIDGE] Received SIGTERM, stopping...');
    bridge.stop();
    process.exit(0);
});

// Start the bridge service
console.log('🚀 [P21 BRIDGE] Initializing P21 Bridge Service...');
bridge.start().catch(error => {
    console.log('❌ [P21 BRIDGE] Failed to start:', error.message);
    process.exit(1);
});

module.exports = P21Bridge;
