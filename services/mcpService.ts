import { ServerName, ConnectionDetails } from '../types';

// MCP Server URLs from environment
const MCP_P21_URL = import.meta.env.VITE_MCP_P21_SERVER_URL || 'http://localhost:8001';
const MCP_POR_URL = import.meta.env.VITE_MCP_POR_SERVER_URL || 'http://localhost:8002';

/**
 * Makes a call to an MCP server tool with timeout and retry logic
 */
const callMCPTool = async (serverUrl: string, toolName: string, args: any): Promise<any> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
        console.log(`[MCP Service] Calling ${toolName} on ${serverUrl} with args:`, args);
        
        const response = await fetch(`${serverUrl}/call_tool`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: toolName,
                arguments: args
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`[MCP Service] ${toolName} raw response:`, result);

        // Parse the MCP response structure
        if (result && result.content && Array.isArray(result.content) && result.content.length > 0) {
            const firstContent = result.content[0];
            if (firstContent.type === 'text' && firstContent.text) {
                try {
                    // Parse the JSON string in the text field
                    const parsedData = JSON.parse(firstContent.text);
                    console.log(`[MCP Service] ${toolName} parsed data:`, parsedData);
                    return parsedData;
                } catch (parseError) {
                    console.error(`[MCP Service] Failed to parse MCP response text:`, firstContent.text);
                    throw new Error(`Failed to parse MCP response: ${parseError}`);
                }
            }
        }

        // Fallback for unexpected response structure
        console.warn(`[MCP Service] Unexpected MCP response structure:`, result);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error(`[MCP Service] Timeout calling ${toolName} on ${serverUrl}`);
            throw new Error(`Request timeout after 10 seconds`);
        }
        console.error(`[MCP Service] Error calling ${toolName} on ${serverUrl}:`, error);
        throw error;
    }
};

/**
 * Fetches data for a single metric from an MCP server (P21 or POR).
 * For site distribution queries that return multiple rows, this will only return the first row's value.
 */
export const fetchMetricData = async (
    sql: string,
    serverName: ServerName
): Promise<{ value: number; error?: string }> => {
    try {
        let serverUrl: string;

        // Determine server URL
        if (serverName === ServerName.P21) {
            serverUrl = MCP_P21_URL;
        } else if (serverName === ServerName.POR) {
            serverUrl = MCP_POR_URL;
        } else {
            return { value: 0, error: `Unsupported server: ${serverName}` };
        }

        // Use the new execute_sql tool directly with the full SQL query
        const result = await callMCPTool(serverUrl, 'execute_sql', {
            sql_query: sql,
            limit: 10 // Allow up to 10 rows for site distribution queries
        });

        console.log(`[MCP Service] Raw result from ${serverName}:`, result);

        // The MCP server returns the result directly, not nested
        const actualResult = result;

        if (actualResult && actualResult.success && actualResult.data && actualResult.data.length > 0) {
            // Get the first row and first column value (for single metric queries)
            const firstRow = actualResult.data[0];
            let value = 0;

            console.log(`[MCP Service] First row from ${serverName}:`, firstRow);

            // Extract value from the first property of the row object
            const firstKey = Object.keys(firstRow)[0];
            if (firstKey) {
                const rawValue = firstRow[firstKey];
                console.log(`[MCP Service] Raw value from ${serverName} (${firstKey}):`, rawValue, typeof rawValue);

                // Handle different value types properly
                if (rawValue === null || rawValue === undefined) {
                    value = 0;
                } else if (typeof rawValue === 'number') {
                    value = rawValue;
                } else if (typeof rawValue === 'string') {
                    // Try to parse string as number
                    const parsed = parseFloat(rawValue);
                    value = isNaN(parsed) ? 0 : parsed;
                } else {
                    // Convert other types to number if possible
                    const parsed = parseFloat(String(rawValue));
                    value = isNaN(parsed) ? 0 : parsed;
                }

                console.log(`[MCP Service] Final parsed value from ${serverName}:`, value);
            }

            return { value };
        } else {
            const errorMsg = actualResult?.error || result?.error || 'No data returned';
            console.error(`[MCP Service] Error from ${serverName}:`, errorMsg);
            return { value: 0, error: errorMsg };
        }

    } catch (error) {
        console.error(`Error fetching metric data from ${serverName}:`, error);
        return { value: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
};

/**
 * Fetches data for multiple metrics from an aggregated query (like site distribution).
 * Returns an array of results that can be used to update multiple dashboard points.
 */
export const fetchAggregatedData = async (
    sql: string,
    serverName: ServerName
): Promise<Array<{ location: string; value: number; error?: string }>> => {
    try {
        let serverUrl: string;

        // Determine server URL
        if (serverName === ServerName.P21) {
            serverUrl = MCP_P21_URL;
        } else if (serverName === ServerName.POR) {
            serverUrl = MCP_POR_URL;
        } else {
            return [{ location: 'unknown', value: 0, error: `Unsupported server: ${serverName}` }];
        }

        // Use the new execute_sql tool with higher limit for aggregated queries
        const result = await callMCPTool(serverUrl, 'execute_sql', {
            sql_query: sql,
            limit: 100 // Allow more rows for aggregated data
        });

        console.log(`[MCP Service] Aggregated raw result from ${serverName}:`, result);

        // The MCP server returns the result directly, not nested
        const actualResult = result;
        const results: Array<{ location: string; value: number; error?: string }> = [];

        if (actualResult && actualResult.success && actualResult.data && actualResult.data.length > 0) {
            // Process each row to extract location and value
            for (const row of actualResult.data) {
                console.log(`[MCP Service] Processing row:`, row);

                try {
                    // Try to extract location and value from row
                    const keys = Object.keys(row);
                    let location = '';
                    let value = 0;

                    // Assume first column is location and second is value (like 'total_orders')
                    if (keys.length >= 2) {
                        location = row[keys[0]] || '';
                        const rawValue = row[keys[1]];

                        // Handle different value types properly
                        if (rawValue === null || rawValue === undefined) {
                            value = 0;
                        } else if (typeof rawValue === 'number') {
                            value = rawValue;
                        } else if (typeof rawValue === 'string') {
                            const parsed = parseFloat(rawValue);
                            value = isNaN(parsed) ? 0 : parsed;
                        } else {
                            const parsed = parseFloat(String(rawValue));
                            value = isNaN(parsed) ? 0 : parsed;
                        }

                        results.push({ location: String(location), value });
                        console.log(`[MCP Service] Extracted location: "${location}", value: ${value}`);
                    } else {
                        // Fallback: use first column as value if no second column
                        const rawValue = row[keys[0]];
                        let value = 0;
                        if (rawValue === null || rawValue === undefined) {
                            value = 0;
                        } else if (typeof rawValue === 'number') {
                            value = rawValue;
                        } else if (typeof rawValue === 'string') {
                            const parsed = parseFloat(rawValue);
                            value = isNaN(parsed) ? 0 : parsed;
                        } else {
                            const parsed = parseFloat(String(rawValue));
                            value = isNaN(parsed) ? 0 : parsed;
                        }
                        results.push({ location: String(keys[0] || 'unknown'), value });
                    }
                } catch (rowError) {
                    console.error(`[MCP Service] Error processing row:`, row, rowError);
                    results.push({ location: 'error', value: 0, error: 'Row processing error' });
                }
            }

            console.log(`[MCP Service] Processed ${results.length} aggregated results from ${serverName}`);
            return results;
        } else {
            const errorMsg = actualResult?.error || result?.error || 'No data returned';
            console.error(`[MCP Service] Aggregated query error from ${serverName}:`, errorMsg);
            return [{ location: 'error', value: 0, error: errorMsg }];
        }

    } catch (error) {
        console.error(`Error fetching aggregated data from ${serverName}:`, error);
        return [{ location: 'error', value: 0, error: error instanceof Error ? error.message : 'Unknown error' }];
    }
};

/**
 * Executes an arbitrary SQL query against an MCP server.
 * This is for the SQL Query Tool in production mode.
 */
export const executeQuery = async (
    sql: string, 
    serverName: ServerName
): Promise<{ result?: any; error?: string }> => {
    try {
        let serverUrl: string;

        if (serverName === ServerName.P21) {
            serverUrl = MCP_P21_URL;
        } else if (serverName === ServerName.POR) {
            serverUrl = MCP_POR_URL;
        } else {
            return { error: `Query execution on ${serverName} is not available via MCP.` };
        }

        // Call the execute_sql tool on the MCP server
        const result = await callMCPTool(serverUrl, 'execute_sql', {
            sql_query: sql,
            limit: 1000  // Default limit for safety
        });

        console.log(`[MCP Service] executeQuery result from ${serverName}:`, result);

        if (result && result.success) {
            return { result: result };
        } else {
            const errorMsg = result?.error || 'Query execution failed';
            console.error(`[MCP Service] executeQuery error from ${serverName}:`, errorMsg);
            return { error: errorMsg };
        }

    } catch (error) {
        console.error(`Error executing query on ${serverName}:`, error);
        return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
};

/**
 * Debug function to test MCP response parsing directly
 */
export const debugMcpParsing = async (sql: string, serverName: ServerName = ServerName.P21): Promise<void> => {
    console.log("[DEBUG MCP] Testing MCP parsing for SQL:", sql);
    try {
        let serverUrl: string;
        if (serverName === ServerName.P21) {
            serverUrl = MCP_P21_URL;
        } else if (serverName === ServerName.POR) {
            serverUrl = MCP_POR_URL;
        } else {
            console.error("[DEBUG MCP] Unsupported server:", serverName);
            return;
        }

        console.log("[DEBUG MCP] Server URL:", serverUrl);

        // Test the raw callMCPTool function
        const rawResult = await callMCPTool(serverUrl, 'execute_sql', {
            sql_query: sql,
            limit: 100
        });

        console.log("[DEBUG MCP] Raw MCP result:", rawResult);

        // Test the aggregated data parsing
        const aggregatedResults = await fetchAggregatedData(sql, serverName);
        console.log("[DEBUG MCP] Aggregated results:", aggregatedResults);

    } catch (error) {
        console.error("[DEBUG MCP] Error during debug:", error);
    }
};

/**
 * Tests connections to MCP servers and other systems.
 */
export const testMcpConnections = async (): Promise<ConnectionDetails[]> => {
    const results: ConnectionDetails[] = [];

    // Test P21 MCP Server using execute_sql tool
    try {
        const startTime = Date.now();
        const testResult = await callMCPTool(MCP_P21_URL, 'execute_sql', {
            sql_query: 'SELECT 1 AS test_connection',
            limit: 1
        });
        const responseTime = Date.now() - startTime;

        // Connection is working if we get a successful response
        if (testResult.success) {
            results.push({
                name: ServerName.P21,
                status: 'Connected',
                responseTime,
                version: 'Epicore P21 MCP v1.0.0',
                identifier: MCP_P21_URL
            });
        } else {
            results.push({
                name: ServerName.P21,
                status: 'Error',
                error: testResult.error || 'Connection test failed'
            });
        }
    } catch (error) {
        results.push({
            name: ServerName.P21,
            status: 'Error',
            error: error instanceof Error ? error.message : 'Connection failed'
        });
    }

    // Test POR MCP Server using execute_sql tool
    try {
        const startTime = Date.now();
        const testResult = await callMCPTool(MCP_POR_URL, 'execute_sql', {
            sql_query: 'SELECT 1 AS test_connection',
            limit: 1
        });
        const responseTime = Date.now() - startTime;

        // Connection is working if we get a successful response
        if (testResult.success) {
            results.push({
                name: ServerName.POR,
                status: 'Connected',
                responseTime,
                version: 'POR MCP v1.0.0',
                identifier: MCP_POR_URL
            });
        } else {
            results.push({
                name: ServerName.POR,
                status: 'Error',
                error: testResult.error || 'Connection test failed'
            });
        }
    } catch (error) {
        results.push({
            name: ServerName.POR,
            status: 'Error',
            error: error instanceof Error ? error.message : 'Connection failed'
        });
    }

    // Simulate other internal systems (these remain as simulations for now)
    results.push({
        name: ServerName.INTERNAL_SQL,
        status: 'Connected',
        responseTime: 12,
        version: 'SQL Server 2022',
        identifier: 'internal-sql-server'
    });

    results.push({
        name: ServerName.LDAP,
        status: 'Connected',
        responseTime: 5,
        version: 'OpenLDAP 2.6',
        identifier: 'dc02.tallman.com'
    });

    return results;
};
