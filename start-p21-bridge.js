#!/usr/bin/env node

/**
 * P21 Bridge Service Launcher
 * Simple launcher for the P21 Bridge Service
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 [P21 BRIDGE LAUNCHER] Starting P21 Bridge Service...');
console.log('   Bridge API: http://localhost:8002');
console.log('   P21 Python Server: http://localhost:8001');
console.log('');

const bridgePath = path.join(__dirname, 'p21-bridge.js');

const bridgeProcess = spawn('node', [bridgePath], {
    cwd: process.cwd(),
    stdio: 'inherit', // Pipe all output to parent
    env: process.env
});

bridgeProcess.on('close', (code) => {
    console.log(`\n🛑 [P21 BRIDGE LAUNCHER] Bridge service exited with code ${code}`);
    process.exit(code || 0);
});

bridgeProcess.on('error', (error) => {
    console.log('❌ [P21 BRIDGE LAUNCHER] Failed to start bridge service:', error.message);
    process.exit(1);
});

// Handle process signals
process.on('SIGINT', () => {
    console.log('\n🔸 [P21 BRIDGE LAUNCHER] Received SIGINT, stopping bridge...');
    bridgeProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🔸 [P21 BRIDGE LAUNCHER] Received SIGTERM, stopping bridge...');
    bridgeProcess.kill('SIGTERM');
});

console.log('✅ [P21 BRIDGE LAUNCHER] P21 Bridge Service launched successfully');
console.log('   Use Ctrl+C to stop the service');
console.log('');
