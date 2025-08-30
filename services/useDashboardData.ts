import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardDataPoint, ConnectionStatus, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from '../components/contexts/GlobalContext';
import { generateSqlResponse, testConnections } from './geminiService';
import * as mcpService from './mcpService';
import { safeLocalStorage } from './storageService';

// Pattern to detect site distribution queries that return multiple locations
const SITE_DISTRIBUTION_PATTERN = /GROUP BY/i; // Simplified pattern to catch all GROUP BY queries

const DASHBOARD_DATA_KEY = 'dashboard_data_points';

// Global worker lock to prevent multiple instances
let globalWorkerLock = false;
let globalWorkerInstanceId: string | null = null;

/**
 * Helper function to ensure all values in data points are scalar (numbers).
 * This fixes the React error where objects are being rendered as children.
 */
const sanitizeDataPointValues = (dataPoints: DashboardDataPoint[]): DashboardDataPoint[] => {
    return dataPoints.map(dp => {
        let sanitizedValue = dp.value;
        
        // If value is an object, try to extract a scalar value
        if (typeof dp.value === 'object' && dp.value !== null) {
            const valueObj = dp.value as any;
            
            // Try common result field names
            if (typeof valueObj.result === 'number') {
                sanitizedValue = valueObj.result;
            } else if (typeof valueObj.ar_ending_balance === 'number') {
                sanitizedValue = valueObj.ar_ending_balance;
            } else if (typeof valueObj.total === 'number') {
                sanitizedValue = valueObj.total;
            } else {
                // Extract first numeric value found
                const keys = Object.keys(valueObj);
                for (const key of keys) {
                    if (typeof valueObj[key] === 'number') {
                        sanitizedValue = valueObj[key];
                        break;
                    }
                }
                
                // If still no number found, default to 0
                if (typeof sanitizedValue !== 'number') {
                    sanitizedValue = 0;
                    console.warn(`[useDashboardData] Could not extract scalar value from object for ${dp.variableName}, defaulting to 0:`, dp.value);
                }
            }
        } else if (typeof dp.value === 'string') {
            // Try to parse string values as numbers
            const parsed = parseFloat(dp.value);
            if (!isNaN(parsed)) {
                sanitizedValue = parsed;
            } else {
                sanitizedValue = 0;
                console.warn(`[useDashboardData] Could not parse string value for ${dp.variableName}, defaulting to 0:`, dp.value);
            }
        } else if (typeof dp.value !== 'number') {
            // Handle any other non-numeric types
            sanitizedValue = 0;
            console.warn(`[useDashboardData] Non-numeric value found for ${dp.variableName}, defaulting to 0:`, dp.value);
        }
        
        return {
            ...dp,
            value: sanitizedValue
        };
    });
};

export const useDashboardData = () => {
    const { mode } = useGlobal();
    const [dataPoints, setDataPoints] = useState<DashboardDataPoint[]>([]);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [statusMessage, setStatusMessage] = useState('System Initializing...');
    const [p21Status, setP21Status] = useState<ConnectionStatus>('disconnected');
    const [porStatus, setPorStatus] = useState<ConnectionStatus>('disconnected');
    const [isWorkerRunning, setIsWorkerRunning] = useState(false);
    const [isMcpExecuting, setIsMcpExecuting] = useState(false);

    // Add instance tracking to detect multiple hook instances
    const instanceIdRef = useRef(Math.random().toString(36).substr(2, 9));
    console.log(`[useDashboardData] Hook instance created: ${instanceIdRef.current}`);

    const workerIntervalRef = useRef<number | null>(null);
    const metricUpdateIndexRef = useRef(0);
    const chartGroupIndexRef = useRef(0);
    const chartGroupLoopCountRef = useRef(0);
    const lastUpdateTimestampRef = useRef<Record<number, number>>({});
    const activeUpdatesRef = useRef<Set<string>>(new Set());
    const isWorkerTickRunningRef = useRef(false);

    // Track failed queries for retry logic
    const failedQueriesRef = useRef<Record<string, { count: number; lastAttempt: number; error: string }>>({});

    // Data validation and recovery function
    const validateAndRecoverData = useCallback((data: any): DashboardDataPoint[] => {
        if (!Array.isArray(data)) {
            console.warn('[useDashboardData] Data is not an array, attempting recovery...');
            return [];
        }

        const validData = data.filter((item, index) => {
            const isValid = item &&
                          typeof item === 'object' &&
                          typeof item.id === 'number' &&
                          typeof item.variableName === 'string' &&
                          typeof item.chartGroup === 'string';

            if (!isValid) {
                console.warn(`[useDashboardData] Invalid data point at index ${index}:`, item);
                return false;
            }
            return true;
        });

        // Sanitize values and ensure required fields
        const sanitizedData = sanitizeDataPointValues(validData).map(dp => ({
            ...dp,
            prodValue: typeof dp.prodValue === 'number' ? dp.prodValue : null,
            lastUpdated: typeof dp.lastUpdated === 'string' ? dp.lastUpdated : new Date().toISOString()
        }));

        console.log(`[useDashboardData] Data validation complete: ${validData.length}/${data.length} valid points`);
        return sanitizedData;
    }, []);

    const loadInitialData = useCallback(async () => {
        console.log('[useDashboardData] Starting to load initial data...');
        setStatusMessage('Loading initial dashboard data...');
        try {
            const storedData = safeLocalStorage.getItem(DASHBOARD_DATA_KEY);
            if (storedData) {
                console.log('[useDashboardData] Found data in localStorage, validating...');
                let parsedData;
                try {
                    parsedData = JSON.parse(storedData);
                } catch (parseError) {
                    console.error('[useDashboardData] Failed to parse localStorage data:', parseError);
                    console.log('[useDashboardData] Clearing corrupted localStorage data...');
                    safeLocalStorage.removeItem(DASHBOARD_DATA_KEY);
                    throw new Error("Corrupted localStorage data");
                }

                const validatedData = validateAndRecoverData(parsedData);
                if (validatedData.length === 0) {
                    console.warn('[useDashboardData] No valid data in localStorage, will reload from files');
                    safeLocalStorage.removeItem(DASHBOARD_DATA_KEY);
                    throw new Error("No valid data in localStorage");
                }

                console.log(`[useDashboardData] Loaded ${validatedData.length} validated data points from localStorage`);
                setDataPoints(validatedData);
                return;
            }

            console.log('[useDashboardData] No data in localStorage, fetching from JSON files...');

            // List of dashboard data files to load
            const dataFiles = [
                'hooks/dashboard-data/key-metrics.json',
                'hooks/dashboard-data/ar-aging.json',
                'hooks/dashboard-data/daily-orders.json',
                'hooks/dashboard-data/web-orders.json',
                'hooks/dashboard-data/inventory.json',
                'hooks/dashboard-data/site-distribution.json',
                'hooks/dashboard-data/customer-metrics.json',
                'hooks/dashboard-data/accounts.json',
                'hooks/dashboard-data/historical-data.json',
                'hooks/dashboard-data/por-overview.json'
            ];

            // Load and combine all data files with individual error handling
            const allData: DashboardDataPoint[] = [];
            const loadErrors: string[] = [];

            for (const filePath of dataFiles) {
                try {
                    console.log(`[useDashboardData] Loading ${filePath}...`);
                    const response = await fetch(filePath);
                    if (!response.ok) {
                        const errorMsg = `HTTP ${response.status} for ${filePath}`;
                        console.warn(`[useDashboardData] ${errorMsg}`);
                        loadErrors.push(errorMsg);
                        continue;
                    }

                    const responseText = await response.text();

                    // Try to parse JSON with better error handling
                    let fileData;
                    try {
                        fileData = JSON.parse(responseText);
                    } catch (parseError) {
                        const errorMsg = `JSON parse error in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
                        console.warn(`[useDashboardData] ${errorMsg}`);
                        loadErrors.push(errorMsg);
                        continue;
                    }

                    if (Array.isArray(fileData)) {
                        allData.push(...fileData);
                        console.log(`[useDashboardData] Loaded ${fileData.length} items from ${filePath}`);
                    } else {
                        const errorMsg = `${filePath} does not contain an array`;
                        console.warn(`[useDashboardData] ${errorMsg}`);
                        loadErrors.push(errorMsg);
                    }
                } catch (error) {
                    const errorMsg = `Failed to load ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
                    console.warn(`[useDashboardData] ${errorMsg}`);
                    loadErrors.push(errorMsg);
                }
            }

            if (allData.length === 0) throw new Error("No dashboard data could be loaded from any files.");

            // Sanitize values to ensure they are all scalar and add prodValue field
            const sanitizedData = sanitizeDataPointValues(allData).map(dp => ({
                ...dp,
                prodValue: null as number | null, // Initialize prodValue for production mode
                lastUpdated: new Date().toISOString()
            }));

            console.log(`[useDashboardData] Combined ${sanitizedData.length} total data points from ${dataFiles.length} files`);
            setDataPoints(sanitizedData);

            // Save to localStorage with error handling
            try {
                safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(sanitizedData));
                console.log('[useDashboardData] ✅ Saved initial data to localStorage');
            } catch (storageError) {
                console.error('[useDashboardData] ❌ Failed to save initial data to localStorage:', storageError);
            }
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[useDashboardData] CRITICAL ERROR: Failed to load initial data: ${error.message}`, error);
            setStatusMessage(`Error: Could not load core data. ${error.message}`);
            setDataPoints([]);
        } finally {
            setInitialDataLoaded(true);
        }
    }, [validateAndRecoverData]);

    // Production Mode Worker - Enhanced to ensure all queries are executed
    const runProductionWorkerTick = useCallback(async () => {
        if (dataPoints.length === 0) return;

        // Prevent multiple ticks from running simultaneously (but allow more parallel processing)
        if (isWorkerTickRunningRef.current) {
            console.log(`[Prod Worker] ❌ SKIPPING TICK - Another tick is already running!`);
            setStatusMessage(`Processing data points... (${activeUpdatesRef.current.size} active)`);
            return;
        }

        // Allow up to 3 concurrent queries to improve throughput while avoiding overload
        const MAX_CONCURRENT_QUERIES = 3;
        if (activeUpdatesRef.current.size >= MAX_CONCURRENT_QUERIES) {
            console.log(`[Prod Worker] ⏳ SKIPPING TICK - ${activeUpdatesRef.current.size}/${MAX_CONCURRENT_QUERIES} queries in progress`);
            setStatusMessage(`Processing ${activeUpdatesRef.current.size}/3 concurrent queries...`);
            return;
        }

        // Create deterministic ordering of chart groups
        const chartGroupOrder = [
            'Key Metrics',
            'Site Distribution', // Move Site Distribution earlier for testing
            'AR Aging',
            'Daily Orders',
            'Web Orders',
            'Inventory',
            'Customer Metrics',
            'Accounts',
            'Historical Data',
            'POR Overview'
        ];

        // Group data points by chart group and sort within each group by ID
        const groupedData = dataPoints.reduce((acc, point) => {
            const group = point.chartGroup;
            if (!acc[group]) acc[group] = [];
            acc[group].push(point);
            return acc;
        }, {} as Record<string, DashboardDataPoint[]>);

        // Sort data points within each group by ID for deterministic ordering
        Object.keys(groupedData).forEach(group => {
            groupedData[group].sort((a, b) => a.id - b.id);
        });

        // Filter to only include chart groups that exist in our data
        const availableChartGroups = chartGroupOrder.filter(group => groupedData[group]);
        if (availableChartGroups.length === 0) return;

        // Get current chart group using deterministic ordering
        const currentGroupIndex = chartGroupIndexRef.current % availableChartGroups.length;
        const currentGroup = availableChartGroups[currentGroupIndex];
        const currentGroupData = groupedData[currentGroup];

        // Get current metric within the group
        const metricIndex = metricUpdateIndexRef.current % currentGroupData.length;
        const metricToUpdate = currentGroupData[metricIndex];

        // Add null check to prevent critical error
        if (!metricToUpdate || !metricToUpdate.variableName) {
            console.error(`[Prod Worker] Invalid metric in group ${currentGroup} at index ${metricIndex}:`, metricToUpdate);
            // Move to next metric in current group
            metricUpdateIndexRef.current = (metricUpdateIndexRef.current + 1) % currentGroupData.length;
            return;
        }

        // Create a unique identifier combining chart group, variable name, and ID to prevent conflicts
        const uniqueIdentifier = `${currentGroup}::${metricToUpdate.variableName}::${metricToUpdate.id}`;
        const targetId = metricToUpdate.id;
        const targetVariableName = metricToUpdate.variableName;
        const targetChartGroup = metricToUpdate.chartGroup;
        const targetServerName = metricToUpdate.serverName;
        const targetSqlExpression = metricToUpdate.productionSqlExpression;

        // Mark that a tick is now running
        isWorkerTickRunningRef.current = true;
        console.log(`[Prod Worker] ✅ STARTING TICK - Worker tick flag set to true`);
        console.log(`[Prod Worker] 📊 Current state: metricIndex=${metricIndex}, chartGroupIndex=${currentGroupIndex}, loopCount=${chartGroupLoopCountRef.current}`);
        console.log(`[Prod Worker] 🎯 Target: ${uniqueIdentifier} from ${targetServerName}`);
        console.log(`[Prod Worker] 📋 Sequential order: ${availableChartGroups.join(' → ')}`);
        console.log(`[Prod Worker] 📍 Current position: Group "${currentGroup}" (${currentGroupIndex + 1}/${availableChartGroups.length}), Metric ${metricIndex + 1}/${currentGroupData.length}`);

        // Mark this data point as being updated using unique identifier
        activeUpdatesRef.current.add(uniqueIdentifier);

        const loopCount = chartGroupLoopCountRef.current + 1;
        setStatusMessage(`[Prod Worker] Loop ${loopCount}/2 - Group: ${currentGroup} - Fetching: ${targetVariableName}...`);

        if (targetServerName === ServerName.P21) setP21Status('testing');
        else if (targetServerName === ServerName.POR) setPorStatus('testing');

        // Set MCP executing state to trigger button flash (only for background worker)
        setIsMcpExecuting(true);

        try {
            // Check if this is a site distribution query that returns multiple locations
            const isSiteDistributionQuery = SITE_DISTRIBUTION_PATTERN.test(targetSqlExpression);
            console.log(`[Prod Worker] Query analysis: isSiteDistributionQuery=${isSiteDistributionQuery}, currentGroup=${targetChartGroup}`);
            console.log(`[Prod Worker] Full SQL query:`, targetSqlExpression);
            console.log(`[Prod Worker] Server: ${targetServerName}, ChartGroup: ${targetChartGroup}`);

            let processedResults: Array<{ location: string; value: number }>;
            let statusMsg = '';
            let finalValue = 99999; // Default error value

            if (isSiteDistributionQuery && targetChartGroup === 'Site Distribution') {
                // Handle site distribution aggregated query
                console.log(`[Prod Worker] Using aggregated data fetch for ${targetVariableName}`);
                const aggregatedResults = await mcpService.fetchAggregatedData(
                    targetSqlExpression,
                    targetServerName
                );

                // Clear MCP executing state after a short delay to ensure button flash is visible
                setTimeout(() => setIsMcpExecuting(false), 100);

                console.log(`[Prod Worker] Aggregated results for ${targetVariableName}:`, aggregatedResults);

                if (aggregatedResults.length > 0 && !aggregatedResults[0].error) {
                    processedResults = aggregatedResults;
                    statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Successfully updated ${aggregatedResults.length} locations for: ${targetVariableName}`;
                    if (targetServerName === ServerName.P21) setP21Status('connected');
                    else if (targetServerName === ServerName.POR) setPorStatus('connected');
                } else {
                    // Error in aggregated results
                    const errorMsg = aggregatedResults[0]?.error || 'No aggregated data returned';
                    processedResults = [{ location: metricToUpdate.dataPoint, value: 99999 }];
                    statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Aggregated query error for ${targetVariableName}: ${errorMsg} (using 99999)`;
                    console.warn(`[Prod Worker] Aggregated query error for ${targetVariableName}: ${errorMsg}. Using 99999 as error indicator.`);
                    if (targetServerName === ServerName.P21) setP21Status('connected');
                    else if (targetServerName === ServerName.POR) setPorStatus('connected');
                }
            } else {
                // Handle single metric query (existing logic)
                console.log(`[Prod Worker] Using single metric fetch for ${targetVariableName}`);
                const { value, error } = await mcpService.fetchMetricData(
                    targetSqlExpression,
                    targetServerName
                );

                // Clear MCP executing state after a short delay to ensure button flash is visible
                setTimeout(() => setIsMcpExecuting(false), 100);

                if (error) {
                    // SQL error occurred - track failure and use 99999 as error indicator
                    finalValue = 99999;
                    statusMsg = `[Prod Worker] Loop ${loopCount}/2 - SQL Error for ${targetVariableName}: ${error} (using 99999)`;
                    console.warn(`[Prod Worker] SQL Error for ${targetVariableName}: ${error}. Using 99999 as error indicator.`);
                    // Track this failure for retry logic
                    trackFailedQuery(uniqueIdentifier, `SQL Error: ${error}`);
                    // Keep connection status as connected since we want to continue
                    if (targetServerName === ServerName.P21) setP21Status('connected');
                    else if (targetServerName === ServerName.POR) setPorStatus('connected');
                } else if (value === null || value === undefined) {
                    // Null/undefined result - track failure and use 99999 as error indicator
                    finalValue = 99999;
                    statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Null result for ${targetVariableName} (using 99999)`;
                    console.warn(`[Prod Worker] Null/undefined result for ${targetVariableName}. Using 99999 as error indicator.`);
                    trackFailedQuery(uniqueIdentifier, 'Null/undefined result');
                    if (targetServerName === ServerName.P21) setP21Status('connected');
                    else if (targetServerName === ServerName.POR) setPorStatus('connected');
                } else if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
                    // Invalid number - track failure and use 99999 as error indicator
                    finalValue = 99999;
                    statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Invalid number for ${targetVariableName}: ${value} (using 99999)`;
                    console.warn(`[Prod Worker] Invalid number for ${targetVariableName}: ${value}. Using 99999 as error indicator.`);
                    trackFailedQuery(uniqueIdentifier, `Invalid number: ${value}`);
                    if (targetServerName === ServerName.P21) setP21Status('connected');
                    else if (targetServerName === ServerName.POR) setPorStatus('connected');
                } else {
                    // Valid result (including 0) - clear any previous failure tracking
                    finalValue = value;
                    statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Successfully updated: ${targetVariableName} = ${value}`;
                    clearFailedQuery(uniqueIdentifier);
                    if (targetServerName === ServerName.P21) setP21Status('connected');
                    else if (targetServerName === ServerName.POR) setPorStatus('connected');
                }

                // Convert single result to processed results format
                processedResults = [{ location: metricToUpdate.dataPoint, value: finalValue }];
            }

            // Get all Site Distribution points that match the dataPoints we might have received
            const currentDataPoints = dataPoints.filter(dp => dp.chartGroup === 'Site Distribution');
            console.log(`[Prod Worker] Current Site Distribution points:`, currentDataPoints.map(dp => ({ id: dp.id, dataPoint: dp.dataPoint, variableName: dp.variableName })));

            // Update multiple data points if this is a site distribution query
            setDataPoints(prev => {
                let updatedPoints = [...prev];
                let updateCount = 0;

                if (isSiteDistributionQuery && targetChartGroup === 'Site Distribution') {
                    // Update multiple points for site distribution
                    for (const result of processedResults) {
                        // Find matching data points by dataPoint field (location)
                        const matchingPoints = updatedPoints.filter(p =>
                            p.chartGroup === 'Site Distribution' && p.dataPoint === result.location
                        );

                        for (const matchingPoint of matchingPoints) {
                            const pointIndex = updatedPoints.findIndex(p => p.id === matchingPoint.id);
                            if (pointIndex !== -1) {
                                console.log(`[Prod Worker] Updating Site Distribution ${matchingPoint.variableName} (${result.location}) with prodValue: ${result.value}`);
                                updatedPoints[pointIndex] = {
                                    ...updatedPoints[pointIndex],
                                    prodValue: result.value,
                                    lastUpdated: new Date().toISOString()
                                };
                                updateCount++;
                            }
                        }
                    }
                } else {
                    // Single metric update (existing logic)
                    const pointIndex = updatedPoints.findIndex(p => {
                        const pointUniqueId = `${p.chartGroup}::${p.variableName}::${p.id}`;
                        return pointUniqueId === uniqueIdentifier;
                    });

                    if (pointIndex !== -1) {
                        console.log(`[Prod Worker] Updating single metric ${uniqueIdentifier} with prodValue: ${finalValue}`);
                        updatedPoints[pointIndex] = {
                            ...updatedPoints[pointIndex],
                            prodValue: finalValue,
                            lastUpdated: new Date().toISOString()
                        };
                        updateCount++;
                    }
                }

                console.log(`[Prod Worker] Updated ${updateCount} data points total`);

                // Save updated data to localStorage to persist production values
                try {
                    safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
                    console.log(`[Prod Worker] ✅ Saved updated data to localStorage`);
                } catch (storageError) {
                    console.error(`[Prod Worker] ❌ Failed to save to localStorage:`, storageError);
                }

                return updatedPoints;
            });

            // Set status message
            setStatusMessage(statusMsg);

        } catch (error) {
            // Handle any unexpected errors during MCP execution
            console.error(`[Prod Worker] Unexpected error for ${targetVariableName}:`, error);
            setIsMcpExecuting(false);

            // Update with error indicator using unique identifier
            setDataPoints(prev => {
                const updatedPoints = prev.map(p => {
                    // Create the same unique identifier for comparison
                    const pointUniqueId = `${p.chartGroup}::${p.variableName}::${p.id}`;
                    if (pointUniqueId === uniqueIdentifier) {
                        console.log(`[Prod Worker] Updating ${uniqueIdentifier} with error value: 99999`);
                        return { ...p, prodValue: 99999, lastUpdated: new Date().toISOString() };
                    }
                    return p;
                });

                // Save updated data to localStorage even for errors
                try {
                    safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
                    console.log(`[Prod Worker] ✅ Saved error data to localStorage`);
                } catch (storageError) {
                    console.error(`[Prod Worker] ❌ Failed to save error data to localStorage:`, storageError);
                }

                return updatedPoints;
            });

            setStatusMessage(`[Prod Worker] Loop ${loopCount}/2 - Unexpected error for ${targetVariableName} (using 99999)`);
            if (targetServerName === ServerName.P21) setP21Status('connected');
            else if (targetServerName === ServerName.POR) setPorStatus('connected');
        } finally {
            // Always remove from active updates set when done (success or error)
            activeUpdatesRef.current.delete(uniqueIdentifier);
            // Clear the tick running flag
            isWorkerTickRunningRef.current = false;
        }

        // Advance to next metric in current group
        const nextMetricIndex = (metricIndex + 1) % currentGroupData.length;
        metricUpdateIndexRef.current = nextMetricIndex;

        // If we've completed all metrics in current group, move to next group
        if (nextMetricIndex === 0) {
            const nextGroupIndex = (currentGroupIndex + 1) % availableChartGroups.length;
            chartGroupIndexRef.current = nextGroupIndex;

            // If we've completed all groups, increment loop count
            if (nextGroupIndex === 0) {
                const nextLoopCount = (chartGroupLoopCountRef.current + 1) % 2;
                chartGroupLoopCountRef.current = nextLoopCount;

                if (nextLoopCount === 0) {
                    console.log('[Prod Worker] Completed 2 loops through all chart groups, starting over...');
                }
            }
        }
    }, [dataPoints]);
    
    // Demo Mode Worker - Simplified to just use static values from JSON
    const runDemoWorkerTick = useCallback(async () => {
        // In demo mode, we just use static values from the JSON file
        // No AI/LLM calls, just simulate connection status updates
        setP21Status('connected');
        setPorStatus('connected');
        setStatusMessage('Demo mode active. Using static data from JSON file.');
    }, []);

    const stopWorker = useCallback(() => {
        if (workerIntervalRef.current) {
            clearInterval(workerIntervalRef.current);
            workerIntervalRef.current = null;
        }

        // Release global worker lock if this instance owns it
        if (globalWorkerInstanceId === instanceIdRef.current) {
            console.log(`[useDashboardData] 🔓 RELEASING global worker lock for instance: ${instanceIdRef.current}`);
            globalWorkerLock = false;
            globalWorkerInstanceId = null;
        }

        setIsWorkerRunning(false);
        setStatusMessage("Worker stopped by user.");
    }, []);

    // Function to track failed queries and implement retry logic
    const trackFailedQuery = useCallback((uniqueIdentifier: string, error: string) => {
        const now = Date.now();
        const currentFailure = failedQueriesRef.current[uniqueIdentifier] || {
            count: 0,
            lastAttempt: 0,
            error: ''
        };

        // Update failure tracking
        failedQueriesRef.current[uniqueIdentifier] = {
            count: currentFailure.count + 1,
            lastAttempt: now,
            error: error
        };

        console.warn(`[Query Failure] ${uniqueIdentifier} failed ${failedQueriesRef.current[uniqueIdentifier].count}x. Error: ${error}`);
    }, []);

    // Function to retry failed queries more frequently
    const shouldRetryFailedQuery = useCallback((uniqueIdentifier: string): boolean => {
        const failure = failedQueriesRef.current[uniqueIdentifier];
        if (!failure) return false;

        // Don't retry if failed more than 5 times in one hour
        if (failure.count >= 5) {
            const hourAgo = Date.now() - (60 * 60 * 1000);
            if (failure.lastAttempt > hourAgo) {
                console.log(`[Skip Retry] ${uniqueIdentifier} exceeded retry limit (${failure.count} fails)`);
                return false;
            }
            // Reset counter after an hour
            failure.count = 0;
        }

        // Retry if it hasn't been tried in the last 30 seconds
        const thirtySecondsAgo = Date.now() - 30000;
        return failure.lastAttempt < thirtySecondsAgo;
    }, []);

    // Function to clear successful queries from failure tracking
    const clearFailedQuery = useCallback((uniqueIdentifier: string) => {
        if (failedQueriesRef.current[uniqueIdentifier]) {
            console.log(`[Recovery] ${uniqueIdentifier} recovered after ${failedQueriesRef.current[uniqueIdentifier].count} failures`);
            delete failedQueriesRef.current[uniqueIdentifier];
        }
    }, []);

    // Function to force re-execution of a specific chart group (e.g., Historical Data P21 queries)
    const forceExecuteChartGroup = useCallback(async (chartGroup: string, serverFilter?: ServerName) => {
        if (dataPoints.length === 0) {
            console.warn(`[Force Execute] No data points available`);
            return false;
        }

        console.log(`[Force Execute] Starting force execution for: ${chartGroup}${serverFilter ? ` (server: ${serverFilter})` : ' (all servers)'}`);

        // Find all data points in the specified chart group
        let targetDataPoints = dataPoints.filter(dp => dp.chartGroup === chartGroup);

        // Apply server filter if specified
        if (serverFilter) {
            targetDataPoints = targetDataPoints.filter(dp => dp.serverName === serverFilter);
        }

        if (targetDataPoints.length === 0) {
            console.warn(`[Force Execute] No data points found for: ${chartGroup}${serverFilter ? ` (server: ${serverFilter})` : ''}`);
            setStatusMessage(`No queries found for ${chartGroup}`);
            return false;
        }

        console.log(`[Force Execute] Found ${targetDataPoints.length} queries to execute`);

        let successCount = 0;
        let errorCount = 0;

        // Execute each query sequentially to avoid overwhelming the server
        for (let i = 0; i < targetDataPoints.length; i++) {
            const dataPoint = targetDataPoints[i];
            const uniqueIdentifier = `${dataPoint.chartGroup}::${dataPoint.variableName}::${dataPoint.id}`;

            console.log(`[Force Execute] Executing ${i + 1}/${targetDataPoints.length}: ${uniqueIdentifier}`);

            // Check if this query is currently being processed
            if (activeUpdatesRef.current.has(uniqueIdentifier)) {
                console.log(`[Force Execute] Skipping ${uniqueIdentifier} - already in progress`);
                continue;
            }

            try {
                // Mark as active for consistency with main worker
                activeUpdatesRef.current.add(uniqueIdentifier);

                const { value, error } = await mcpService.fetchMetricData(
                    dataPoint.productionSqlExpression,
                    dataPoint.serverName
                );

                if (error) {
                    console.error(`[Force Execute] Error for ${uniqueIdentifier}:`, error);
                    errorCount++;

                    // Update data point with error value
                    setDataPoints(prev => {
                        const updatedPoints = prev.map(p => {
                            if (p.id === dataPoint.id) {
                                return { ...p, prodValue: 99999, lastUpdated: new Date().toISOString() };
                            }
                            return p;
                        });

                        try {
                            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
                        } catch (e) {
                            console.error('[Force Execute] Failed to save to localStorage:', e);
                        }

                        return updatedPoints;
                    });
                } else {
                    console.log(`[Force Execute] Success for ${uniqueIdentifier}: ${value}`);
                    successCount++;

                    // Update data point with result
                    setDataPoints(prev => {
                        const updatedPoints = prev.map(p => {
                            if (p.id === dataPoint.id) {
                                return { ...p, prodValue: value, lastUpdated: new Date().toISOString() };
                            }
                            return p;
                        });

                        try {
                            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
                        } catch (e) {
                            console.error('[Force Execute] Failed to save to localStorage:', e);
                        }

                        return updatedPoints;
                    });
                }
            } catch (err) {
                console.error(`[Force Execute] Exception for ${uniqueIdentifier}:`, err);
                errorCount++;
            } finally {
                // Clean up active updates tracking
                activeUpdatesRef.current.delete(uniqueIdentifier);
            }
        }

        console.log(`[Force Execute] Completed: ${successCount} success, ${errorCount} errors`);
        setStatusMessage(`Force executed ${chartGroup}: ${successCount} success, ${errorCount} errors`);

        return successCount > 0;
    }, [dataPoints]);

    // Function to force re-execute P21 historical data queries specifically
    const forceExecuteHistoricalDataP21 = useCallback(async () => {
        console.log('[Force Execute] Starting force execution of P21 Historical Data queries');
        return await forceExecuteChartGroup('Historical Data', ServerName.P21);
    }, [forceExecuteChartGroup]);

    // Function to reset worker indices for debugging/testing
    const resetWorkerIndices = useCallback(() => {
        console.log('[useDashboardData] 🔄 Resetting worker indices for sequential testing');
        metricUpdateIndexRef.current = 0;
        chartGroupIndexRef.current = 0;
        chartGroupLoopCountRef.current = 0;
        activeUpdatesRef.current.clear();
        isWorkerTickRunningRef.current = false;
        failedQueriesRef.current = {};
        setStatusMessage("Worker indices and failure tracking reset. Next tick will start from beginning.");
    }, []);

    const startWorker = useCallback(() => {
        // Check global worker lock
        if (globalWorkerLock && globalWorkerInstanceId !== instanceIdRef.current) {
            console.log(`[useDashboardData] ❌ BLOCKED - Another worker instance (${globalWorkerInstanceId}) is already running!`);
            console.log(`[useDashboardData] Current instance: ${instanceIdRef.current}`);
            setStatusMessage(`Worker blocked: Another instance (${globalWorkerInstanceId}) is running`);
            return;
        }

        // Acquire global worker lock
        globalWorkerLock = true;
        globalWorkerInstanceId = instanceIdRef.current;
        console.log(`[useDashboardData] 🔒 ACQUIRED global worker lock for instance: ${instanceIdRef.current}`);

        // Stop any existing worker first
        if (workerIntervalRef.current) {
            clearInterval(workerIntervalRef.current);
            workerIntervalRef.current = null;
        }

        console.log(`Starting ${mode} worker for instance ${instanceIdRef.current}...`);
        setIsWorkerRunning(true);

        if (mode === 'demo') {
            setStatusMessage('Demo worker started. Generating live data...');
            runDemoWorkerTick();
            workerIntervalRef.current = window.setInterval(runDemoWorkerTick, 2000);
        } else {
            setStatusMessage('Production worker started. Fetching from MCP Controller...');
            runProductionWorkerTick();
            workerIntervalRef.current = window.setInterval(runProductionWorkerTick, 2000);
        }
    }, [mode, runDemoWorkerTick, runProductionWorkerTick]);

    // Legacy function names for backward compatibility
    const runDemoWorker = startWorker;
    const stopDemoWorker = stopWorker;

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    useEffect(() => {
        // This effect manages the background worker lifecycle when mode changes.
        // It stops any running worker when the mode changes, but doesn't auto-start.
        if (workerIntervalRef.current) {
            clearInterval(workerIntervalRef.current);
            workerIntervalRef.current = null;
        }
        setIsWorkerRunning(false);

        if (initialDataLoaded && dataPoints.length > 0) {
            if (mode === 'production') {
                setStatusMessage('Production mode active. Click Run to start MCP Controller...');
            } else { // demo mode
                setStatusMessage('Demo mode active. Click Run to start using static data...');
                // Set connection status to connected for demo mode
                setP21Status('connected');
                setPorStatus('connected');
            }
        } else if (initialDataLoaded) {
            setStatusMessage('Dashboard data loaded, but no metrics found.');
        }

        // Cleanup function to stop the worker when the component unmounts or dependencies change.
        return () => {
             if (workerIntervalRef.current) {
                clearInterval(workerIntervalRef.current);
             }
        };
    }, [mode, initialDataLoaded, dataPoints.length]);

    // Auto-start worker when data is initially loaded (only once)
    useEffect(() => {
        if (initialDataLoaded && dataPoints.length > 0 && workerIntervalRef.current === null) {
            // Start the worker automatically when data is first loaded
            console.log('[useDashboardData] Auto-starting worker on initial data load');
            startWorker();
        }
    }, [initialDataLoaded, dataPoints.length, startWorker]);

    
    const updateDataPoint = (id: number, field: keyof DashboardDataPoint, value: string, chartGroup?: string, variableName?: string) => {
        setDataPoints(prev => {
            const updatedPoints = prev.map(p => {
                // If chartGroup and variableName are provided, use unique identifier matching
                if (chartGroup && variableName) {
                    const pointUniqueId = `${p.chartGroup}::${p.variableName}::${p.id}`;
                    const targetUniqueId = `${chartGroup}::${variableName}::${id}`;
                    if (pointUniqueId === targetUniqueId) {
                        console.log(`[updateDataPoint] Updating ${targetUniqueId} field ${field} to ${value}`);
                        return { ...p, [field]: value };
                    }
                } else {
                    // Fallback to old logic for backward compatibility (but this is risky)
                    if (p.id === id) {
                        console.warn(`[updateDataPoint] Using legacy ID matching for ID ${id} - this may cause cross-contamination!`);
                        return { ...p, [field]: value };
                    }
                }
                return p;
            });

            // Save to localStorage
            try {
                safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
                console.log(`[updateDataPoint] ✅ Saved updated data to localStorage`);
            } catch (storageError) {
                console.error(`[updateDataPoint] ❌ Failed to save to localStorage:`, storageError);
            }

            return updatedPoints;
        });
    };

    const resetDataToDefaults = useCallback(async () => {
        if (window.confirm('Are you sure you want to reset all dashboard data to the original defaults? This will erase all SQL fixes and cannot be undone.')) {
            console.log('[useDashboardData] Starting reset to defaults...');
            setStatusMessage("Resetting data to defaults...");
            
            // Clear localStorage
            safeLocalStorage.removeItem(DASHBOARD_DATA_KEY);
            console.log('[useDashboardData] Cleared localStorage');
            
            // Re-fetch data from multiple files with cache busting
            const cacheBuster = `?t=${Date.now()}`;
            
            // List of dashboard data files to reload
            const dataFiles = [
                'hooks/dashboard-data/key-metrics.json',
                'hooks/dashboard-data/ar-aging.json', 
                'hooks/dashboard-data/daily-orders.json',
                'hooks/dashboard-data/web-orders.json',
                'hooks/dashboard-data/inventory.json',
                'hooks/dashboard-data/site-distribution.json',
                'hooks/dashboard-data/customer-metrics.json',
                'hooks/dashboard-data/accounts.json',
                'hooks/dashboard-data/historical-data.json',
                'hooks/dashboard-data/por-overview.json'
            ];
            
            // Load and combine all data files with individual error handling
            const allData: DashboardDataPoint[] = [];
            const loadErrors: string[] = [];
            
            for (const filePath of dataFiles) {
                try {
                    const url = `${filePath}${cacheBuster}`;
                    console.log(`[useDashboardData] Reloading ${url}...`);
                    
                    const response = await fetch(url, {
                        cache: 'no-cache',
                        headers: {
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (!response.ok) {
                        const errorMsg = `HTTP ${response.status} for ${filePath}`;
                        console.warn(`[useDashboardData] ${errorMsg}`);
                        loadErrors.push(errorMsg);
                        continue;
                    }
                    
                    const responseText = await response.text();
                    
                    // Try to parse JSON with better error handling
                    let fileData;
                    try {
                        fileData = JSON.parse(responseText);
                    } catch (parseError) {
                        const errorMsg = `JSON parse error in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
                        console.warn(`[useDashboardData] ${errorMsg}`);
                        loadErrors.push(errorMsg);
                        continue;
                    }
                    
                    if (Array.isArray(fileData)) {
                        allData.push(...fileData);
                        console.log(`[useDashboardData] Successfully loaded ${fileData.length} items from ${filePath}`);
                    } else {
                        const errorMsg = `${filePath} does not contain an array`;
                        console.warn(`[useDashboardData] ${errorMsg}`);
                        loadErrors.push(errorMsg);
                    }
                } catch (err: unknown) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    const errorMsg = `Failed to load ${filePath}: ${error.message}`;
                    console.warn(`[useDashboardData] ${errorMsg}`);
                    loadErrors.push(errorMsg);
                }
            }
            
            // Check if we have any data at all
            if (allData.length === 0) {
                const errorMessage = `No dashboard data could be loaded. Errors: ${loadErrors.join('; ')}`;
                console.error(`[useDashboardData] CRITICAL ERROR: ${errorMessage}`);
                setStatusMessage(`Error: ${errorMessage}`);
                setDataPoints([]);
                return;
            }
            
            // Sanitize and add prodValue field
            const sanitizedData = sanitizeDataPointValues(allData).map(dp => ({
                ...dp,
                prodValue: null as number | null
            }));
            
            setDataPoints(sanitizedData);
            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(sanitizedData));
            console.log('[useDashboardData] Successfully reset data to defaults');
            
            // Create status message with load results
            let statusMsg = `Data reset complete. Loaded ${sanitizedData.length} metrics from ${dataFiles.length - loadErrors.length}/${dataFiles.length} files.`;
            if (loadErrors.length > 0) {
                statusMsg += ` Errors: ${loadErrors.length} files failed to load.`;
                console.warn('[useDashboardData] Reset completed with errors:', loadErrors);
            }
            setStatusMessage(statusMsg);
        }
    }, []);

    const testDbConnections = async (): Promise<ConnectionDetails[]> => {
        setStatusMessage("Testing database connections...");
        
        if (mode === 'production') {
            setStatusMessage("Testing connections via MCP Controller...");
            const results = await mcpService.testMcpConnections();
            setStatusMessage("Connection test complete (Production Mode).");
            return results;
        }

        // In demo mode, use the AI for simulation.
        const results = await testConnections();
        setStatusMessage("Connection test complete (Demo Mode).");
        return results;
    };

    return {
        dataPoints,
        statusMessage,
        p21Status,
        porStatus,
        updateDataPoint,
        isLoading: !initialDataLoaded,
        runDemoWorker,
        stopDemoWorker,
        testDbConnections,
        isWorkerRunning,
        isMcpExecuting,
        resetDataToDefaults,
        resetWorkerIndices,
        forceExecuteChartGroup,
        forceExecuteHistoricalDataP21,
        failedQueries: failedQueriesRef.current,
    };
};
