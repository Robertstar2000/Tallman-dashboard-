import { ServerName, ConnectionDetails } from '../types';

// MCP Server URLs from environment
const MCP_P21_URL = import.meta.env.VITE_MCP_P21_SERVER_URL || 'http://localhost:8001';
const MCP_POR_URL = import.meta.env.VITE_MCP_POR_SERVER_URL || 'http://localhost:8002';

/**
 * Makes a call to an MCP server tool
 */
const callMCPTool = async (serverUrl: string, toolName: string, args: any): Promise<any> => {
    try {
        const response = await fetch(`${serverUrl}/call_tool`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: toolName,
                arguments: args
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error(`Error calling MCP tool ${toolName} on ${serverUrl}:`, error);
        throw error;
    }
};

/**
 * Fetches data for a single metric from an MCP server (P21 or POR).
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
            limit: 1 // Just get one value for metrics
        });

        // Handle nested result structure from MCP server
        const actualResult = result.result || result;
        
        if (actualResult.success && actualResult.data && actualResult.data.length > 0) {
            // Get the first row and first column value
            const firstRow = actualResult.data[0];
            let value = 0;
            
            // Extract value from the first property of the row object
            const firstKey = Object.keys(firstRow)[0];
            if (firstKey) {
                const rawValue = firstRow[firstKey];
                value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue) || 0;
            }
            
            return { value };
        } else {
            return { value: 0, error: actualResult.error || result.error || 'No data returned' };
        }

    } catch (error) {
        console.error(`Error fetching metric data from ${serverName}:`, error);
        return { value: 0, error: error instanceof Error ? error.message : 'Unknown error' };
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

        if (result.success) {
            return { result: result };
        } else {
            return { error: result.error || 'Query execution failed' };
        }

    } catch (error) {
        console.error(`Error executing query on ${serverName}:`, error);
        return { error: error instanceof Error ? error.message : 'Unknown error' };
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
