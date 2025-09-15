import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        port: 8081,
        host: '127.0.0.1',
        // Proxy P21 MCP requests for development
        proxy: {
          '/api/p21': {
            target: 'http://localhost:8002',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/p21/, '/')
          },
          '/api/por': {
            target: 'http://localhost:8002',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/por/, '/')
          }
        }
      }
    };
});
