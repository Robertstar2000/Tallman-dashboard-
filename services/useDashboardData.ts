import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardDataPoint, ConnectionStatus, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from '../components/contexts/GlobalContext';
import { generateSqlResponse, testConnections } from './geminiService';
import * as mcpService from './mcpService';
import { safeLocalStorage } from './storageService';

const DASHBOARD_DATA_KEY = 'dashboard_data_points';

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
    
    const workerIntervalRef = useRef<number | null>(null);
    const metricUpdateIndexRef = useRef(0);
    const chartGroupIndexRef = useRef(0);
    const chartGroupLoopCountRef = useRef(0);

    const loadInitialData = useCallback(async () => {
        console.log('[useDashboardData] Starting to load initial data...');
        setStatusMessage('Loading initial dashboard data...');
        try {
            const storedData = safeLocalStorage.getItem(DASHBOARD_DATA_KEY);
            if (storedData) {
                console.log('[useDashboardData] Found data in localStorage.');
                const parsedData = JSON.parse(storedData);
                if (!Array.isArray(parsedData)) throw new Error("Stored data is not an array.");
                setDataPoints(parsedData);
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
            
            // Load and combine all data files
            const allData: DashboardDataPoint[] = [];
            for (const filePath of dataFiles) {
                try {
                    console.log(`[useDashboardData] Loading ${filePath}...`);
                    const response = await fetch(filePath);
                    if (!response.ok) {
                        console.warn(`[useDashboardData] Could not load ${filePath}: ${response.status}`);
                        continue;
                    }
                    const fileData = await response.json();
                    if (Array.isArray(fileData)) {
                        allData.push(...fileData);
                        console.log(`[useDashboardData] Loaded ${fileData.length} items from ${filePath}`);
                    }
                } catch (error) {
                    console.warn(`[useDashboardData] Error loading ${filePath}:`, error);
                }
            }
            
            if (allData.length === 0) throw new Error("No dashboard data could be loaded from any files.");
            
            // Sanitize values to ensure they are all scalar and add prodValue field
            const sanitizedData = sanitizeDataPointValues(allData).map(dp => ({
                ...dp,
                prodValue: null as number | null // Initialize prodValue for production mode
            }));
            
            console.log(`[useDashboardData] Combined ${sanitizedData.length} total data points from ${dataFiles.length} files`);
            setDataPoints(sanitizedData);
            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(sanitizedData));
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[useDashboardData] CRITICAL ERROR: Failed to load initial data: ${error.message}`, error);
            setStatusMessage(`Error: Could not load core data. ${error.message}`);
            setDataPoints([]); 
        } finally {
            setInitialDataLoaded(true);
        }
    }, []);

    // Production Mode Worker - Updated to sequence through chart groups in 2 loops
    const runProductionWorkerTick = useCallback(async () => {
        if (dataPoints.length === 0) return;

        // Group data points by chart group
        const groupedData = dataPoints.reduce((acc, point) => {
            const group = point.chartGroup;
            if (!acc[group]) acc[group] = [];
            acc[group].push(point);
            return acc;
        }, {} as Record<string, DashboardDataPoint[]>);

        const chartGroups = Object.keys(groupedData);
        if (chartGroups.length === 0) return;

        // Get current chart group
        const currentGroupIndex = chartGroupIndexRef.current;
        const currentGroup = chartGroups[currentGroupIndex];
        const currentGroupData = groupedData[currentGroup];

        // Get current metric within the group
        const metricIndex = metricUpdateIndexRef.current;
        const metricToUpdate = currentGroupData[metricIndex % currentGroupData.length];
        
        // Add null check to prevent critical error
        if (!metricToUpdate || !metricToUpdate.variableName) {
            console.error(`[Prod Worker] Invalid metric in group ${currentGroup} at index ${metricIndex}:`, metricToUpdate);
            // Move to next metric in current group
            metricUpdateIndexRef.current = (metricIndex + 1) % currentGroupData.length;
            return;
        }
        
        const loopCount = chartGroupLoopCountRef.current + 1;
        setStatusMessage(`[Prod Worker] Loop ${loopCount}/2 - Group: ${currentGroup} - Fetching: ${metricToUpdate.variableName}...`);
        
        if (metricToUpdate.serverName === ServerName.P21) setP21Status('testing');
        else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('testing');

        // Set MCP executing state to trigger button flash (only for background worker)
        setIsMcpExecuting(true);

        const { value, error } = await mcpService.fetchMetricData(
            metricToUpdate.productionSqlExpression, 
            metricToUpdate.serverName
        );

        // Clear MCP executing state after a short delay to ensure button flash is visible
        setTimeout(() => setIsMcpExecuting(false), 100);

        // Handle the result - use 99999 for errors, null, or invalid values
        let finalValue = value;
        let statusMsg = '';
        
        if (error) {
            // SQL error occurred - use 99999 as error indicator
            finalValue = 99999;
            statusMsg = `[Prod Worker] Loop ${loopCount}/2 - SQL Error for ${metricToUpdate.variableName}: ${error} (using 99999)`;
            console.warn(`[Prod Worker] SQL Error for ${metricToUpdate.variableName}: ${error}. Using 99999 as error indicator.`);
            // Keep connection status as connected since we want to continue
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('connected');
            else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('connected');
        } else if (value === null || value === undefined) {
            // Null/undefined result - use 99999 as error indicator
            finalValue = 99999;
            statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Null result for ${metricToUpdate.variableName} (using 99999)`;
            console.warn(`[Prod Worker] Null/undefined result for ${metricToUpdate.variableName}. Using 99999 as error indicator.`);
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('connected');
            else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('connected');
        } else if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            // Invalid number - use 99999 as error indicator
            finalValue = 99999;
            statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Invalid number for ${metricToUpdate.variableName}: ${value} (using 99999)`;
            console.warn(`[Prod Worker] Invalid number for ${metricToUpdate.variableName}: ${value}. Using 99999 as error indicator.`);
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('connected');
            else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('connected');
        } else {
            // Valid result (including 0) - use as-is
            finalValue = value;
            statusMsg = `[Prod Worker] Loop ${loopCount}/2 - Successfully updated: ${metricToUpdate.variableName} = ${value}`;
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('connected');
            else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('connected');
        }
        
        // Update the data point with the final value (0, valid number, or 99999 for errors)
        setDataPoints(prev => {
            const updatedPoints = prev.map(p => {
                if (p.id === metricToUpdate.id) {
                    return { ...p, prodValue: finalValue, lastUpdated: new Date().toISOString() };
                }
                return p;
            });
            return updatedPoints;
        });
        
        // Set status message
        setStatusMessage(statusMsg);
        
        // Advance to next metric in current group
        const nextMetricIndex = (metricIndex + 1) % currentGroupData.length;
        metricUpdateIndexRef.current = nextMetricIndex;
        
        // If we've completed all metrics in current group, move to next group
        if (nextMetricIndex === 0) {
            const nextGroupIndex = (currentGroupIndex + 1) % chartGroups.length;
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
        setIsWorkerRunning(false);
        setStatusMessage("Worker stopped by user.");
    }, []);

    const startWorker = useCallback(() => {
        // Stop any existing worker first
        if (workerIntervalRef.current) {
            clearInterval(workerIntervalRef.current);
            workerIntervalRef.current = null;
        }
        
        console.log(`Starting ${mode} worker...`);
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

    
    const updateDataPoint = (id: number, field: keyof DashboardDataPoint, value: string) => {
        setDataPoints(prev => {
            const updatedPoints = prev.map(p => p.id === id ? { ...p, [field]: value } : p);
            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
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
            try {
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
                
                // Load and combine all data files
                const allData: DashboardDataPoint[] = [];
                for (const filePath of dataFiles) {
                    const url = `${filePath}${cacheBuster}`;
                    console.log(`[useDashboardData] Reloading ${url}...`);
                    
                    const response = await fetch(url, {
                        cache: 'no-cache',
                        headers: {
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (!response.ok) {
                        console.warn(`[useDashboardData] Could not reload ${filePath}: ${response.status}`);
                        continue;
                    }
                    const fileData = await response.json();
                    if (Array.isArray(fileData)) {
                        allData.push(...fileData);
                    }
                }
                
                if (allData.length === 0) throw new Error("No dashboard data could be reloaded from any files.");
                
                // Sanitize and add prodValue field
                const sanitizedData = sanitizeDataPointValues(allData).map(dp => ({
                    ...dp,
                    prodValue: null as number | null
                }));
                
                setDataPoints(sanitizedData);
                safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(sanitizedData));
                console.log('[useDashboardData] Successfully reset data to defaults');
                setStatusMessage(`Data has been reset to defaults. Loaded ${sanitizedData.length} metrics from ${dataFiles.length} files.`);
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.error(`[useDashboardData] CRITICAL ERROR: Failed to reload default data: ${error.message}`, error);
                setStatusMessage(`Error: Could not reload default data. ${error.message}`);
                setDataPoints([]); 
            }
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
    };
};
