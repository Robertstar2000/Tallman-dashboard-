export enum ChartGroup {
    KEY_METRICS = "Key Metrics",
    ACCOUNTS = "Accounts",
    CUSTOMER_METRICS = "Customer Metrics",
    INVENTORY = "Inventory",
    POR_OVERVIEW = "POR Overview",
    DAILY_ORDERS = "Daily Orders",
    AR_AGING = "AR Aging",
    HISTORICAL_DATA = "Historical Data",
    SITE_DISTRIBUTION = "Site Distribution",
    WEB_ORDERS = "Web Orders",
}

export enum ServerName {
    P21 = "P21",
    POR = "POR",
    INTERNAL_SQL = "Internal SQL DB",
    LDAP = "LDAP Server",
}

export interface DashboardDataPoint {
    id: number;
    chartGroup: ChartGroup;
    variableName: string;
    dataPoint: string;
    serverName: ServerName;
    tableName: string;
    productionSqlExpression: string;
    value: string | number; // Static demo values
    prodValue: number | null; // Production MCP SQL execution results
    calculationType: string;
    lastUpdated: string;
    valueColumn: string;
    filterColumn?: string;
    filterValue?: string | number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'testing';

export interface ConnectionDetails {
    name: string;
    status: 'Connected' | 'Disconnected' | 'Error';
    responseTime?: number;
    version?: string;
    identifier?: string;
    size?: string;
    error?: string;
}

export type UserRole = 'admin' | 'user';

export interface User {
    id: number;
    username: string;
    role: UserRole;
}
