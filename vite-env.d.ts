/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OLLAMA_URL: string
  readonly VITE_P21_DSN: string
  readonly VITE_POR_FILE_PATH: string
  readonly VITE_MCP_P21_SERVER_URL: string
  readonly VITE_MCP_POR_SERVER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
