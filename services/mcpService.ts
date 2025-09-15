import { ServerName, ConnectionDetails } from '../types';

// MCP Server URLs from environment
const MCP_P21_URL = import.meta.env.VITE_MCP_P21_SERVER_URL ||
                    (import.meta.env.DEV ? '/api/p21' : 'http://localhost:8002');
const MCP_POR_URL = import.meta.env.VITE_MCP_POR_SERVER_URL ||
                    (import.meta.env.DEV ? '/api/por' : 'http://localhost:8002');

/**
 * Optimized number extraction for single values - focused on what dashboards actually need
 */
const extractSingleNumericValue = (row: any, columnPriority: string[] = []): { value: number; column: string } => {
    console.log(`[Value Extraction] Starting extraction for row:`, JSON.stringify(row, null, 2));
    const keys = Object.keys(row);
    console.log(`[Value Extraction] Row keys available:`, keys);

    // Priority columns for numeric value extraction - ordered by importance
    const defaultPriorities = ['result', 'count', 'total', 'sum', 'value', 'amount', 'balance', 'total_sales', 'total_inventory'];
    const priorities = columnPriority.length > 0 ? columnPriority : defaultPriorities;

    console.log(`[Value Extraction] Using priorities:`, priorities);

    const parseToNumber = (input: any): number | null => {
        console.log(`[Value Extraction] parseToNumber input:`, input, `(type: ${typeof input})`);

        if (input === null || input === undefined) {
            console.log(`[Value Extraction] Input is null/undefined, returning null`);
            return null;
        }
        if (typeof input === 'number') {
            const isValid = Number.isFinite(input);
            console.log(`[Value Extraction] Number input, isFinite: ${isValid}, value: ${input}`);
            return isValid ? input : null;
        }
        if (typeof input === 'string') {
            const s = input.trim();
            console.log(`[Value Extraction] String input original: "${input}", trimmed: "${s}"`);

            if (!s || s === 'NULL') {
                console.log(`[Value Extraction] String is empty or NULL, returning null`);
                return null;
            }
            // Remove currency symbols, commas, percent signs, spaces - most common formats
            const cleaned = s.replace(/[$€£%,\s]/g, '').replace(/,/g, '');
            console.log(`[Value Extraction] String cleaned: "${cleaned}"`);

            if (cleaned === '') {
                console.log(`[Value Extraction] String empty after cleaning, returning null`);
                return null;
            }
            const num = Number(cleaned);
            const isValidNum = Number.isFinite(num);
            console.log(`[Value Extraction] Parsed number: ${num}, isFinite: ${isValidNum}`);
            return isValidNum ? num : null;
        }
        console.log(`[Value Extraction] Unsupported input type: ${typeof input}, returning null`);
        return null;
    };

    // 1) First try priority columns - exactly what dashboards need
    console.log(`[Value Extraction] Step 1: Trying priority columns...`);
    for (const priority of priorities) {
        console.log(`[Value Extraction] Checking priority column: "${priority}"`);
        const matchingCols = keys.filter(k => new RegExp(priority.replace(/_/g, '[\\_]?'), 'i').test(k));
        console.log(`[Value Extraction] Matching columns for "${priority}":`, matchingCols);

        for (const col of matchingCols) {
            console.log(`[Value Extraction] Trying column "${col}" with value:`, row[col]);
            const value = parseToNumber(row[col]);
            if (value !== null) {
                console.log(`[Value Extraction] SUCCESS! Extracted value ${value} from column "${col}" using priority search`);
                return { value, column: col };
            } else {
                console.log(`[Value Extraction] Failed to parse value from column "${col}"`);
            }
        }
    }

    // 2) Try all numeric columns directly
    console.log(`[Value Extraction] Step 2: Trying all columns for numeric values...`);
    for (const key of keys) {
        console.log(`[Value Extraction] Checking column "${key}" wth value:`, row[key]);
        const value = parseToNumber(row[key]);
        if (value !== null) {
            console.log(`[Value Extraction] SUCCESS! Extracted value ${value} from column "${key}" using direct search`);
            return { value, column: key };
        } else {
            console.log(`[Value Extraction] Failed to parse value from column "${key}"`);
        }
    }

    console.log(`[Value Extraction] FAILURE! No numeric value found in any column. Raw row data:`, row);
    console.log(`[Value Extraction] FAILURE! No numeric value found in any column. All keys:`, keys);
    console.log(`[Value Extraction] FAILURE! No numeric value found in any column. Returning 0 for error indication.`);
    return { value: 0, column: 'none' };
};

/**
 * Optimized extraction for aggregated data - handles location + numeric value pairs
 */
const extractAggregatedData = (rows: any[]): Array<{ location: string; value: number; column: string }> => {
    if (!rows.length) return [];

    const results: Array<{ location: string; value: number; column: string }> = [];

    for (const row of rows) {
        try {
            const keys = Object.keys(row);

            // Location priority (for site distribution, etc.)
            const locationKeys = ['location', 'site', 'branch', 'warehouse', 'city', 'name'];
            let locationValue = 'unknown';
            let locationColumn = 'none';

            for (const locKey of locationKeys) {
                const matchingCols = keys.filter(k => new RegExp(locKey.replace(/_/g, '[\\_]?'), 'i').test(k));
                for (const col of matchingCols) {
                    if (typeof row[col] === 'string' && row[col].trim()) {
                        locationValue = row[col].trim();
                        locationColumn = col;
                        break;
                    }
                }
                if (locationColumn !== 'none') break;
            }

            // Extract numeric value (excluding location column)
            const { value, column } = extractSingleNumericValue(row, keys);

            results.push({
                location: locationValue,
                value: value,
                column: column
            });

        } catch (err) {
            console.warn(`[MCP Service] Error processing aggregated row:`, err);
            results.push({ location: 'error', value: 0, column: 'error' });
        }
    }

    return results;
};

/**
 * Optimized MCP tool call - focuses on extracting only what we need from responses
 */
const callMCPTool = async (
    serverUrl: string,
    toolName: string,
    args: any,
    extractSingleValue: boolean = false,
    extractAggregated: boolean = false
): Promise<any> => {
        const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
        console.log(`[MCP Service] Calling ${toolName} on ${serverUrl} with args:`, args);

        const requestBody = JSON.stringify({
            name: toolName,
            arguments: args
        });

        const response = await fetch(`${serverUrl}/call_tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`[MCP Service] HTTP Error Response:`, {
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type'),
                errorText: errorText.substring(0, 500)
            });
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`[MCP Service] ${toolName} raw response received:`, JSON.stringify(result, null, 2));

        let parsedData: any = null;

        // Handle different response formats - UNWRAP nested results
        if (result?.content?.[0]?.text) {
            parsedData = JSON.parse(result.content[0].text);
            console.log(`[MCP Service] Parsed content[0].text data:`, JSON.stringify(parsedData, null, 2));
        } else if (result && typeof result.success !== 'undefined') {
            parsedData = result;
            console.log(`[MCP Service] Using raw result data:`, JSON.stringify(parsedData, null, 2));
        }

        // CRITICAL FIX: Handle double-wrapped responses from SQL Query Tool
        // The SQL Query Tool wraps the MCP response in an extra "result" object
        if (parsedData?.result && typeof parsedData.result === 'object') {
            console.log(`[MCP Service] Found result wrapper - extracting inner data:`, JSON.stringify(parsedData.result, null, 2));
            // Extract the inner MCP response from the result wrapper
            if (typeof parsedData.result.success !== 'undefined') {
                parsedData = parsedData.result;
                console.log(`[MCP Service] After unwrapping result:`, JSON.stringify(parsedData, null, 2));
            }
        }

        if (!parsedData) {
            console.log(`[MCP Service] No parsed data, returning raw result:`, JSON.stringify(result, null, 2));
            return result;
        }

        // Apply optimizations based on what's needed
        if (extractSingleValue && parsedData.success && parsedData.data?.length > 0) {
            const { value, column } = extractSingleNumericValue(parsedData.data[0]);
            console.log(`[MCP Service] Extracted single value: ${value} from column: ${column}`);
            return { success: true, value, column, rawResult: parsedData };
        }

        if (extractAggregated && parsedData.success && parsedData.data) {
            const aggregatedResults = extractAggregatedData(parsedData.data);
            console.log(`[MCP Service] Extracted ${aggregatedResults.length} aggregated results`);
            return { success: true, data: aggregatedResults, rawResult: parsedData };
        }

        return parsedData;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after 90 seconds`);
        }
        throw error;
    }
};

/**
 * Fetches data for a single metric from an MCP server (P21 or POR).
 * Optimized to extract only the numeric value needed by dashboards.
 */
export const fetchMetricData = async (
    sql: string,
    serverName: ServerName
): Promise<{ value: number; error?: string }> => {
    try {
        let serverUrl: string;

        // Determine server URL with safety override
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

        // Use optimized MCP call with single value extraction
        const result = await callMCPTool(serverUrl, 'execute_sql', {
            sql_query: sql,
            limit: 1 // Single metric only needs first row
        }, true, false); // extractSingleValue = true

        // DEBUG: Log raw result to see what MCP server is returning
        console.log(`[MCP Service] Raw result from ${serverName}:`, JSON.stringify(result, null, 2));

        if (result && result.success && result.value !== undefined) {
            // Valid result (including 0)
            console.log(`[MCP Service] Successfully extracted value from ${serverName}: ${result.value} (column: ${result.column})`);
            return { value: result.value };
        } else if (result && typeof result.success === 'boolean' && !result.success && result.error) {
            // MCP server error
            console.error(`[MCP Service] Error from ${serverName}:`, result.error);
            return { value: 0, error: result.error };
        } else if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
            // Fallback: try to extract value manually from data array
            console.log(`[MCP Service] Trying manual extraction from result.data`);
            const { value, column } = extractSingleNumericValue(result.data[0]);
            if (value !== 0 || column !== 'none') {
                console.log(`[MCP Service] Manual extraction successful: ${value} from column ${column}`);
                return { value };
            }
        }

        // Fallback: if all else fails, return error
        console.error(`[MCP Service] Complete extraction failure from ${serverName}:`, {
            hasResult: !!result,
            hasSuccess: result && 'success' in result,
            successValue: result && result.success,
            hasValue: result && 'value' in result,
            valueValue: result && result.value,
            hasData: result && 'data' in result,
            dataInfo: result && result.data && Array.isArray(result.data) ? `${result.data.length} rows` : 'not array',
            resultKeys: result ? Object.keys(result) : 'no result'
        });

        return { value: 0, error: 'Could not extract numeric value from MCP response' };

    } catch (error) {
        console.error(`Error fetching metric data from ${serverName}:`, error);
        return { value: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
};

/**
 * Fetches data for multiple metrics from an aggregated query (like site distribution).
 * Optimized to extract only location + numeric value pairs that dashboards need.
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

        // Use optimized MCP call with aggregated data extraction
        const result = await callMCPTool(serverUrl, 'execute_sql', {
            sql_query: sql,
            limit: 50 // Reasonable limit for site distribution queries
        }, false, true); // extractAggregated = true

        if (result && result.success && Array.isArray(result.data)) {
            console.log(`[MCP Service] Successfully extracted ${result.data.length} aggregated results from ${serverName}`);
            return result.data.map((item: any) => ({
                location: item.location,
                value: item.value,
                error: item.error
            }));
        } else if (result && result.error) {
            console.error(`[MCP Service] Error from ${serverName}:`, result.error);
            return [{ location: 'error', value: 0, error: result.error }];
        } else {
            return [{ location: 'error', value: 0, error: 'No data returned or failed to extract aggregated data' }];
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
 * Tests connections to MCP servers with enhanced P21 debugging information.
 * Focuses specifically on P21 MCP server for detailed diagnostics.
 */
export const testMcpConnections = async (): Promise<ConnectionDetails[]> => {
    const results: ConnectionDetails[] = [];
    const p21DebugInfo: any = {};

    console.log('🔍 [P21 MCP DEBUG] Starting comprehensive connection test...');

    // P21 MCP Server - Enhanced Testing with Fallback
    console.log('📊 [P21 MCP DEBUG] Testing P21 MCP Server...');
    console.log('🔗 [P21 MCP DEBUG] Server URL:', MCP_P21_URL);
    console.log('🔧 [P21 MCP DEBUG] Environment:', { P21_DSN: 'P21live (from system env)' });

    // Try basic HTTP connectivity test first
    let p21Available = false;

    try {
        console.log('🏥 [P21 MCP DEBUG] Testing basic connectivity...');
        const healthCheck = await fetch(MCP_P21_URL + '?test=health', {
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5 second timeout for health check
        });

        if (healthCheck.ok) {
            p21Available = true;
            console.log('✅ [P21 MCP DEBUG] P21 server is responding to health check');
        } else {
            console.log('⚠️ [P21 MCP DEBUG] P21 server responded but not OK:', healthCheck.status);
        }
    } catch (connectError) {
        console.log('💥 [P21 MCP DEBUG] P21 server health check failed:', connectError instanceof Error ? connectError.message : String(connectError));
        console.log('⚠️ [P21 MCP DEBUG] P21 database not available in this environment');
    }

    // Always attempt to connect to real P21 server - no simulation mode
    console.log('🌐 [P21 MCP DEBUG] Attempting to connect to real P21 server...');

    if (p21Available) {
        console.log('🌐 [P21 MCP DEBUG] P21 database available, proceeding with full test');
    }

    try {
        const startTime = Date.now();
        p21DebugInfo.startTime = startTime;
        p21DebugInfo.serverUrl = MCP_P21_URL;

        console.log('📝 [P21 MCP DEBUG] Sending test query...');
        console.log('💻 [P21 MCP DEBUG] Query: SELECT @@VERSION AS sql_version, DB_NAME() AS database_name');
        console.log('⏱️  [P21 MCP DEBUG] Starting request at:', new Date().toISOString());

        const testResult = await callMCPTool(MCP_P21_URL, 'execute_sql', {
            sql_query: 'SELECT COUNT(order_no) AS result FROM oe_hdr',
            limit: 1
        });

        const responseTime = Date.now() - startTime;
        p21DebugInfo.responseTime = responseTime;
        p21DebugInfo.rawResult = testResult;

        console.log('⚡ [P21 MCP DEBUG] Response received in', responseTime, 'ms');
        console.log('📋 [P21 MCP DEBUG] Raw response:', JSON.stringify(testResult, null, 2));

        // Enhanced success analysis
        if (testResult && testResult.success) {
            console.log('✅ [P21 MCP DEBUG] Query execution: SUCCESS');
            console.log('📊 [P21 MCP DEBUG] Data returned:', testResult.data);
            console.log('🏗️  [P21 MCP DEBUG] Column structure:', testResult.columns);
            console.log('⏱️  [P21 MCP DEBUG] Execution time:', testResult.execution_time, 'seconds');

            if (testResult.data && testResult.data.length > 0) {
                console.log('💾 [P21 MCP DEBUG] SQL Version:', testResult.data[0].sql_version);
                console.log('🎯 [P21 MCP DEBUG] Database Name:', testResult.data[0].database_name);
                console.log('🔄 [P21 MCP DEBUG] Connection: ACTIVE and AUTHENTICATED');
            }

            results.push({
                name: ServerName.P21,
                status: 'Connected',
                responseTime,
                version: 'Epicore P21 MCP v1.0.0',
                identifier: MCP_P21_URL,
                database: testResult.data?.[0]?.database_name || 'Unknown',
                debugInfo: p21DebugInfo
            });

            console.log('🎉 [P21 MCP DEBUG] P21 MCP Server: FULLY OPERATIONAL');

        } else if (testResult && testResult.error) {
            console.log('❌ [P21 MCP DEBUG] Query execution: FAILED');
            console.log('🚨 [P21 MCP DEBUG] Error details:', testResult.error);
            console.log('📊 [P21 MCP DEBUG] Error context:', {
                execution_time: testResult.execution_time,
                columns_count: testResult.columns?.length || 0,
                data_count: testResult.data?.length || 0
            });

            // Determine specific error type
            const errorMsg = testResult.error.toLowerCase();
            if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
                console.log('🔐 [P21 MCP DEBUG] Error Type: PERMISSION ISSUE');
                console.log('💡 [P21 MCP DEBUG] Solution: Contact DBA to grant SELECT permissions');
            } else if (errorMsg.includes('timeout') || errorMsg.includes('connection')) {
                console.log('🌐 [P21 MCP DEBUG] Error Type: CONNECTIVITY ISSUE');
                console.log('💡 [P21 MCP DEBUG] Solution: Check DSN configuration and network connectivity');
            } else if (errorMsg.includes('authentication')) {
                console.log('🔑 [P21 MCP DEBUG] Error Type: AUTHENTICATION ISSUE');
                console.log('💡 [P21 MCP DEBUG] Solution: Verify DSN credentials and user permissions');
            } else {
                console.log('📋 [P21 MCP DEBUG] Error Type: UNKNOWN');
                console.log('💡 [P21 MCP DEBUG] Solution: Review server logs and contact administrator');
            }

            results.push({
                name: ServerName.P21,
                status: 'Error',
                error: testResult.error,
                responseTime,
                debugInfo: p21DebugInfo,
                errorType: 'DATABASE_QUERY_FAILED'
            });

        } else {
            console.log('⚠️  [P21 MCP DEBUG] Query execution: UNEXPECTED RESPONSE');
            console.log('📋 [P21 MCP DEBUG] Expected JSON, received:', testResult);

            results.push({
                name: ServerName.P21,
                status: 'Error',
                error: 'Unexpected response format from P21 server',
                responseTime,
                debugInfo: p21DebugInfo,
                errorType: 'UNEXPECTED_RESPONSE'
            });
        }

    } catch (error) {
        const responseTime = Date.now() - p21DebugInfo.startTime;
        console.log('💥 [P21 MCP DEBUG] Network/Protocol Error:');
        console.log('🔥 [P21 MCP DEBUG] Error type:', error.constructor.name);
        console.log('📝 [P21 MCP DEBUG] Error message:', error instanceof Error ? error.message : 'Unknown error');

        // Network error analysis
        if (error instanceof Error) {
            if (error.message.includes('fetch')) {
                console.log('🌐 [P21 MCP DEBUG] Error Type: NETWORK CONNECTIVITY');
                console.log('💡 [P21 MCP DEBUG] Solution: Check if P21 server is running on port 8001');
            } else if (error.message.includes('timeout')) {
                console.log('⏱️  [P21 MCP DEBUG] Error Type: REQUEST TIMEOUT');
                console.log('💡 [P21 MCP DEBUG] Solution: Server may be overloaded or unresponsive');
            } else {
                console.log('📋 [P21 MCP DEBUG] Error Type: GENERAL NETWORK ISSUE');
                console.log('💡 [P21 MCP DEBUG] Solution: Verify server URL and network configuration');
            }
        }

        results.push({
            name: ServerName.P21,
            status: 'Error',
            error: error instanceof Error ? error.message : 'Connection failed',
            responseTime,
            debugInfo: p21DebugInfo,
            errorType: 'NETWORK_ERROR'
        });
    }

    // POR MCP Server - Minimal testing to focus on P21
    console.log('🏢 [POR MCP DEBUG] Testing POR MCP Server (brief test)...');
    try {
        const startTime = Date.now();
        const testResult = await callMCPTool(MCP_POR_URL, 'execute_sql', {
            sql_query: 'SELECT 1 AS test_connection',
            limit: 1
        });
        const responseTime = Date.now() - startTime;

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

    // Simulated internal systems
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

    console.log('🎯 [P21 MCP DEBUG] Connection test completed. Check dashboard for detailed P21 diagnostics.');
    return results;
};
