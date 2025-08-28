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


const generateSystemPrompt = (dataPoints: DashboardDataPoint[], serverName: ServerName): string => {
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

    let dialectInfo = '';
    switch (serverName) {
        case ServerName.P21:
            dialectInfo = 'The P21 server uses Transact-SQL (T-SQL). Functions like GETDATE(), CAST(), DATEADD(), and DATEDIFF() are valid.';
            break;
        case ServerName.POR:
            dialectInfo = `The POR server is an MS Access database read by a backend process using an 'mdb-reader' library. This imposes strict limitations. You must act as this limited reader.
You must simulate failures for queries that exceed these limitations.

JET SQL DIALECT RULES:
- The function for the current date is Date(). Do NOT use GETDATE().
- Type conversion is done with functions like CInt(), CStr(), CDate(). Do NOT use CAST() or CONVERT().
- Conditional logic uses IIF(), not CASE.
- String concatenation uses the '&' operator.
- Reserved words in identifiers must be wrapped in [square brackets].
- The query MUST fail if it uses incompatible T-SQL functions like GETDATE().

MDB-READER LIMITATIONS:
- The reader is READ-ONLY. Any DML (INSERT, UPDATE, DELETE) or DDL (CREATE, ALTER, DROP) commands must fail.
- Complex JOINs (more than two tables) and complex subqueries are not supported and must fail.
- UNION queries are not supported and must fail.
- Domain Aggregate Functions (DLookUp, DSum, DCount, etc.) are not supported and must fail.
- User-Defined VBA functions are not supported. If a query appears to call a custom function, it must fail.
- Crosstab queries (TRANSFORM...PIVOT) are not supported and must fail.

When a query fails due to these limitations, return an appropriate error message in the JSON response.
Example error response: {"error": "Unsupported query feature for mdb-reader: Subquery."}`;
            break;
        case ServerName.INTERNAL_SQL:
             dialectInfo = 'The Internal SQL DB server uses a modern, standard SQL dialect similar to T-SQL.';
             break;
        case ServerName.LDAP:
             dialectInfo = 'This is not a SQL server. Queries against it should be interpreted as LDAP queries and should likely fail with a relevant error message unless they are very simple lookups.';
             break;
    }


    return `You are an advanced SQL database administrator AI for a tool supply company named Tallman Equipment.
Your task is to act as a database engine and execute SQL queries. You must strictly adhere to the correct SQL dialect for the specified server.
The current query is for the "${serverName}" server.

${dialectInfo}

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
                model: 'phi:latest', // Using available model
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

/**
 * A wrapper function to add retry logic with exponential backoff for API calls.
 * This is crucial for handling rate-limiting errors (429).
 * @param apiCall The function that makes the API call.
 * @param maxRetries The maximum number of times to retry.
 * @param initialDelay The initial delay in milliseconds before the first retry.
 * @returns The result of the API call.
 */
const withRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> => {
    let attempt = 0;
    let delay = initialDelay;

    while (attempt < maxRetries) {
        try {
            return await apiCall();
        } catch (error) {
            attempt++;
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRateLimitError = errorMessage.includes('429') || /rate limit|quota/i.test(errorMessage);

            if (isRateLimitError && attempt < maxRetries) {
                const jitter = Math.random() * 1000;
                const waitTime = delay + jitter;
                console.warn(
                    `[geminiService] Rate limit error detected. Retrying in ${Math.round(waitTime / 1000)}s... (Attempt ${attempt}/${maxRetries})`
                );
                await new Promise(resolve => setTimeout(resolve, waitTime));
                delay *= 2; // Exponential backoff
            } else {
                console.error(`[geminiService] Final attempt failed or non-retriable error:`, error);
                throw error;
            }
        }
    }
    // This line should not be reachable, but is required for type safety.
    throw new Error('Exceeded max retries for API call.');
};


const callGemini = async (prompt: string): Promise<any> => {
    const ai = getAiClient();
    if (!ai) { // Should not happen if called correctly, but for type safety
        return callOllama(prompt); // Fallback
    }

    try {
        const apiCall = () => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        const response = await withRetry(apiCall);

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error calling Gemini after retries:", error);
        let errorMessage;
        if (error instanceof Error) {
            errorMessage = error.message;
        } else {
            try {
                errorMessage = JSON.stringify(error);
            } catch {
                errorMessage = String(error);
            }
        }
        return { error: `Failed to get response from Gemini: ${errorMessage}` };
    }
}


export const generateSqlResponse = async (sql: string, contextData: DashboardDataPoint[], serverName: ServerName): Promise<{ result?: number; error?: string }> => {
    const systemPrompt = generateSystemPrompt(contextData, serverName);
    const fullPrompt = `${systemPrompt}\n\nExecute this query:\n${sql}`;
    
    const ai = getAiClient();

    if (ai) {
        console.log(`[geminiService] Using Gemini API for SQL response on ${serverName}.`);
        return callGemini(fullPrompt);
    } else {
        console.log(`[geminiService] Using Ollama API for SQL response on ${serverName}.`);
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
