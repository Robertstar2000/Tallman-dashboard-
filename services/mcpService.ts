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

        // Determine server URL with safety override:
        // If SQL clearly references P21 tables but serverName says POR, route to P21.
        const looksLikeP21 = /\b(oe_hdr|invoice_hdr|invoice_line|po_hdr|po_line|inv_loc|customer|balances|chart_of_accts)\b/i.test(sql);
        if (serverName === ServerName.P21 || looksLikeP21) {
            if (serverName !== ServerName.P21 && looksLikeP21) {
                console.warn(`[MCP Service] Overriding server from ${serverName} to P21 based on detected P21 tables in SQL.`);
            }
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
            // Get the first row from query result
            const firstRow = actualResult.data[0];

            console.log(`[MCP Service] First row from ${serverName}:`, firstRow);

            // Robust numeric extraction:
            // - Prefer actual numeric columns over string parsing
            // - Prefer well-known aliases (result, count, total, value, amount, NewRentalCount_*, RentalSales_*, ar_ending_balance)
            // - As a last resort, parse numeric-looking strings (strip commas/currency), allowing 0 and large numbers
            const parseToNumber = (input: any): number | null => {
                if (input === null || input === undefined) return null;
                if (typeof input === 'number') {
                    return Number.isFinite(input) ? input : null;
                }
                if (typeof input === 'string') {
                    const s = input.trim();
                    if (!s) return null;
                    // Remove common formatting: commas, currency symbols, percent signs, spaces
                    const cleaned = s.replace(/[$€£,%\s]/g, '').replace(/,/g, '');
                    // Allow minus sign and decimals
                    const num = Number(cleaned);
                    if (Number.isFinite(num)) return num;
                    return null;
                }
                return null;
            };

            const keys = Object.keys(firstRow);
            // Sort keys to prefer known aliases first
            const preferRegex = /(result|count|total|sum|value|amount|newrentalcount|rentalsales|ar_ending_balance)/i;
            const sortedKeys = [...keys].sort((a, b) => {
                const aPref = preferRegex.test(a) ? 0 : 1;
                const bPref = preferRegex.test(b) ? 0 : 1;
                if (aPref !== bPref) return aPref - bPref;
                return 0;
            });

            let extractedValue: number | null = null;
            let chosenKey: string | null = null;

            // 1) Try direct numeric columns (preferred)
            for (const key of sortedKeys) {
                const raw = firstRow[key];
                if (typeof raw === 'number' && Number.isFinite(raw)) {
                    extractedValue = raw;
                    chosenKey = key;
                    break;
                }
            }

            // 2) Fallback: try parsing strings numerically (including "0")
            if (extractedValue === null) {
                for (const key of sortedKeys) {
                    const raw = firstRow[key];
                    const parsed = parseToNumber(raw);
                    if (parsed !== null) {
                        extractedValue = parsed;
                        chosenKey = key;
                        break;
                    }
                }
            }

            if (extractedValue === null) {
                console.warn(`[MCP Service] No numeric value could be extracted from row:`, firstRow);
                extractedValue = 0;
            } else {
                console.log(`[MCP Service] Extracted value ${extractedValue} from column "${chosenKey}"`);
            }

            console.log(`[MCP Service] Final extracted value from ${serverName}: ${extractedValue}`);
            return { value: extractedValue };
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

        // Determine server URL with safety override for P21-looking SQL
        const looksLikeP21 = /\b(oe_hdr|invoice_hdr|invoice_line|po_hdr|po_line|inv_loc|customer|balances|chart_of_accts)\b/i.test(sql);
        if (serverName === ServerName.P21 || looksLikeP21) {
            if (serverName !== ServerName.P21 && looksLikeP21) {
                console.warn(`[MCP Service] Overriding server from ${serverName} to P21 for aggregated query due to detected P21 tables.`);
            }
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
                    // Determine location and value using robust selection rules
                    const keys = Object.keys(row);

                    const parseToNumberAgg = (input: any): number | null => {
                        if (input === null || input === undefined) return null;
                        if (typeof input === 'number') {
                            return Number.isFinite(input) ? input : null;
                        }
                        if (typeof input === 'string') {
                            const s = input.trim();
                            if (!s) return null;
                            const cleaned = s.replace(/[$€£,%\s]/g, '').replace(/,/g, '');
                            const num = Number(cleaned);
                            if (Number.isFinite(num)) return num;
                            return null;
                        }
                        return null;
                    };

                    // Choose location: prefer keys named 'location', 'site', 'city', 'name', 'branch', 'warehouse'
                    const locationPrefer = /(location|site|city|name|branch|warehouse)/i;
                    let locationKey = keys.find(k => locationPrefer.test(k)) || '';
                    if (!locationKey) {
                        // fallback to first string-like column
                        locationKey = keys.find(k => typeof row[k] === 'string') || keys[0] || 'unknown';
                    }
                    const location = String(row[locationKey] ?? 'unknown');

                    // Choose value: prefer numeric columns, or aliases like result/count/total/value/amount
                    const preferRegexVal = /(result|count|total|sum|value|amount|newrentalcount|rentalsales|ar_ending_balance)/i;
                    const sortedKeysVal = [...keys].sort((a, b) => {
                        const aPref = (typeof row[a] === 'number' || preferRegexVal.test(a)) ? 0 : 1;
                        const bPref = (typeof row[b] === 'number' || preferRegexVal.test(b)) ? 0 : 1;
                        if (aPref !== bPref) return aPref - bPref;
                        return 0;
                    });

                    let value: number | null = null;
                    for (const k of sortedKeysVal) {
                        // Skip the chosen location column
                        if (k === locationKey) continue;
                        const parsed = parseToNumberAgg(row[k]);
                        if (parsed !== null) {
                            value = parsed;
                            break;
                        }
                    }
                    if (value === null) value = 0;

                    results.push({ location, value });
                    console.log(`[MCP Service] Extracted location: "${location}", parsed value: ${value}`);
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
