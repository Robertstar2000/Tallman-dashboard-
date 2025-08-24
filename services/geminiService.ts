import { GoogleGenAI } from "@google/genai";
import { DashboardDataPoint, ServerName, ConnectionDetails } from '../types';

const OLLAMA_API_URL = 'http://localhost:11434/api/generate';

const getAiClient = () => {
    // This function will check for an API key and decide which service to use.
    // For this project, we'll assume the environment variable might not be set,
    // and we'll fall back to Ollama.
    if (process.env.API_KEY) {
        try {
            return new GoogleGenAI({ apiKey: process.env.API_KEY });
        } catch (e) {
            console.warn("Gemini AI initialization failed, falling back to Ollama.", e);
            return null; // Fallback to Ollama
        }
    }
    return null; // Fallback to Ollama
};


const generateSystemPrompt = (dataPoints: DashboardDataPoint[]): string => {
    const tableSchemas = dataPoints.reduce((acc, dp) => {
        if (!acc[dp.tableName]) {
            acc[dp.tableName] = new Set<string>();
        }
        acc[dp.tableName].add(dp.valueColumn);
        if (dp.filterColumn) {
            acc[dp.tableName].add(dp.filterColumn);
        }
        return acc;
    }, {} as Record<string, Set<string>>);

    const schemaStrings = Object.entries(tableSchemas).map(([tableName, columns]) => {
        return `Table ${tableName} has columns: ${[...columns].join(', ')}.`;
    });

    return `You are an advanced SQL database administrator AI for a tool supply company named Tallman Equipment.
Your task is to act as a database engine (P21 or POR) and execute SQL queries.
When you receive a SQL query, you must return ONLY a single JSON object with a "result" key.
The value of "result" should be a single number that realistically represents the requested metric.
Do not include any other text, formatting, or explanations. Just the JSON.

Database Schema Information:
${schemaStrings.join('\n')}

Example Query: "SELECT COUNT(order_no) AS result FROM oe_hdr WHERE status = 'open';"
Example Response: {"result": 1250}

IMPORTANT: The "mcp_sandboxed_inv" and "mcp_sandboxed_users" tables are in a sandboxed environment and are offline.
Any query to these tables must fail. For these specific tables, return the following JSON error object instead:
{"error": "Connection to MCP Sandbox failed: Network timeout."}

Now, wait for the user's SQL query.`;
};


const callOllama = async (prompt: string): Promise<any> => {
    try {
        const response = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3', // As specified in README
                prompt: prompt,
                stream: false,
                format: 'json'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        
        // The actual JSON content from the model is in the 'response' property and needs parsing.
        return JSON.parse(data.response);

    } catch (error) {
        console.error("Error calling Ollama:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { error: `Failed to get response from Ollama: ${errorMessage}` };
    }
};

const callGemini = async (prompt: string): Promise<any> => {
    const ai = getAiClient();
    if (!ai) { // Should not happen if called correctly, but for type safety
        return callOllama(prompt); // Fallback
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error calling Gemini:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { error: `Failed to get response from Gemini: ${errorMessage}` };
    }
}


export const generateSqlResponse = async (sql: string, contextData: DashboardDataPoint[]): Promise<{ result?: number; error?: string }> => {
    const systemPrompt = generateSystemPrompt(contextData);
    const fullPrompt = `${systemPrompt}\n\nExecute this query:\n${sql}`;
    
    const ai = getAiClient();

    if (ai) {
        console.log("[geminiService] Using Gemini API for SQL response.");
        return callGemini(fullPrompt);
    } else {
        console.log("[geminiService] Using Ollama API for SQL response.");
        return callOllama(fullPrompt);
    }
};

export const testConnections = async (): Promise<ConnectionDetails[]> => {
    console.log("[geminiService] Simulating connection tests for Demo Mode...");
    const prompt = `Simulate a database connection test for four servers: ${ServerName.P21} (the main ERP), ${ServerName.POR} (the rental system), ${ServerName.INTERNAL_SQL}, and ${ServerName.LDAP}.
    - ${ServerName.P21} should be connected and fast. Give it a realistic response time, a version number, an identifier, and a database size.
    - ${ServerName.POR} should also be connected but slightly slower. Give it similar realistic details.
    - ${ServerName.INTERNAL_SQL} should be connected, very fast, and have a recent SQL Server version number.
    - ${ServerName.LDAP} should be connected, extremely fast, and identify itself as an OpenLDAP server.
    Return the result as a JSON array of four objects, each matching this TypeScript interface:
    interface ConnectionDetails {
      name: string; // e.g. 'P21', 'POR', 'Internal SQL DB', 'LDAP Server'
      status: 'Connected' | 'Disconnected' | 'Error';
      responseTime?: number; // in ms
      version?: string;
      identifier?: string;
      size?: string; // e.g., '1.2 TB'
      error?: string;
    }`;

    const ai = getAiClient();
    let result;

    if (ai) {
        console.log("[geminiService] Using Gemini API for connection test.");
        result = await callGemini(prompt);
    } else {
        console.log("[geminiService] Using Ollama API for connection test.");
        result = await callOllama(prompt);
    }

    if (result.error || !Array.isArray(result)) {
        console.error("Failed to get valid connection test from AI, returning defaults.", result?.error);
        return [
            { name: ServerName.P21, status: 'Error', error: 'AI simulation failed' },
            { name: ServerName.POR, status: 'Error', error: 'AI simulation failed' },
            { name: ServerName.INTERNAL_SQL, status: 'Error', error: 'AI simulation failed' },
            { name: ServerName.LDAP, status: 'Error', error: 'AI simulation failed' },
        ];
    }

    return result as ConnectionDetails[];
};