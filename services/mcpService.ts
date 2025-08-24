import { ServerName, ConnectionDetails } from '../types';

/**
 * Simulates fetching data for a single metric from an MCP server (P21 or POR).
 * In this sandboxed environment, these calls are expected to fail.
 */
export const fetchMetricData = async (
    sql: string, 
    serverName: ServerName
): Promise<{ value: number; error: string }> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
    
    // Hardcoded failure response for sandboxed environment
    const error = `Connection to ${serverName} failed: Server is in a sandboxed environment.`;
    return { value: 99999, error };
};

/**
 * Simulates executing an arbitrary SQL query against an MCP server.
 * This is for the SQL Query Tool in production mode.
 */
export const executeQuery = async (
    sql: string, 
    serverName: ServerName
): Promise<{ result?: any; error?: string }> => {
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 800));

    // Specific check for sandboxed tables mentioned in geminiService prompt
    if (sql.includes('mcp_sandboxed_inv') || sql.includes('mcp_sandboxed_users')) {
         return { error: "Connection to MCP Sandbox failed: Network timeout." };
    }

    if (serverName === ServerName.P21 || serverName === ServerName.POR) {
        return { error: `Cannot execute query on ${serverName}: Connection failed in sandboxed environment.` };
    }
    
    // For other servers, we can simulate a generic failure or success if needed.
    // Let's assume they also fail for consistency in production simulation.
    return { error: `Query execution on ${serverName} is not available in this mode.` };
};

/**
 * Simulates testing connections for all servers in production mode.
 * P21/POR are expected to fail, while internal systems connect.
 */
export const testMcpConnections = async (): Promise<ConnectionDetails[]> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return [
        { name: ServerName.P21, status: 'Error', error: 'Connection failed: Server is in a sandboxed environment.' },
        { name: ServerName.POR, status: 'Error', error: 'Connection failed: Server is in a sandboxed environment.' },
        { name: ServerName.INTERNAL_SQL, status: 'Connected', responseTime: 12, version: 'SQL Server 2022' },
        { name: ServerName.LDAP, status: 'Connected', responseTime: 5, version: 'OpenLDAP 2.6' }
    ];
};
