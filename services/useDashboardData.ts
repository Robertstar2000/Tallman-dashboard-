import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardDataPoint, ConnectionStatus, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from '../components/contexts/GlobalContext';
import { generateSqlResponse, testConnections } from './geminiService';
import * as mcpService from './mcpService';
import { safeLocalStorage } from './storageService';

const DASHBOARD_DATA_KEY = 'dashboard_data_points';

export const useDashboardData = () => {
    const { mode } = useGlobal();
    const [dataPoints, setDataPoints] = useState<DashboardDataPoint[]>([]);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [statusMessage, setStatusMessage] = useState('System Initializing...');
    const [p21Status, setP21Status] = useState<ConnectionStatus>('disconnected');
    const [porStatus, setPorStatus] = useState<ConnectionStatus>('disconnected');
    
    const workerIntervalRef = useRef<number | null>(null);
    const metricUpdateIndexRef = useRef(0);
    const isWorkerRunningRef = useRef(false);

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

            console.log('[useDashboardData] No data in localStorage, fetching from JSON.');
            const response = await fetch('hooks/dashboard-data.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error("Dashboard data is not an array.");
            setDataPoints(data);
            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(data));
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[useDashboardData] CRITICAL ERROR: Failed to load initial data: ${error.message}`, error);
            setStatusMessage(`Error: Could not load core data. ${error.message}`);
            setDataPoints([]); 
        } finally {
            setInitialDataLoaded(true);
        }
    }, []);

    // Production Mode Worker
    const runProductionWorkerTick = useCallback(async () => {
        if (dataPoints.length === 0) return;

        const index = metricUpdateIndexRef.current;
        const metricToUpdate = dataPoints[index];
        
        setStatusMessage(`[Prod Worker] Fetching from MCP Controller for: ${metricToUpdate.variableName}...`);
        
        if (metricToUpdate.serverName === ServerName.P21) setP21Status('testing');
        else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('testing');

        const { value, error } = await mcpService.fetchMetricData(
            metricToUpdate.productionSqlExpression, 
            metricToUpdate.serverName
        );

        setDataPoints(prev => {
            const updatedPoints = prev.map(p => p.id === metricToUpdate.id ? { ...p, value, lastUpdated: new Date().toISOString() } : p);
            return updatedPoints;
        });
        
        if (metricToUpdate.serverName === ServerName.P21) setP21Status('disconnected');
        else if (metricToUpdate.serverName === ServerName.POR) setPorStatus('disconnected');

        setStatusMessage(`[Prod Worker] Failed fetch for ${metricToUpdate.variableName}: ${error}`);
        
        metricUpdateIndexRef.current = (index + 1) % dataPoints.length;
    }, [dataPoints]);
    
    // Demo Mode Worker
    const runDemoWorkerTick = useCallback(async () => {
        if (dataPoints.length === 0) return;

        const index = metricUpdateIndexRef.current;
        const metricToUpdate = dataPoints[index];
        
        setStatusMessage(`[Demo Worker] Fetching new value for: ${metricToUpdate.variableName}...`);
        
        try {
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('testing');
            else setPorStatus('testing');

            const response = await generateSqlResponse(metricToUpdate.productionSqlExpression, dataPoints, metricToUpdate.serverName);

            if (response.result !== undefined) {
                setDataPoints(prev => {
                    const updatedPoints = prev.map(p => p.id === metricToUpdate.id ? { ...p, value: response.result!, lastUpdated: new Date().toISOString() } : p);
                    // Do not persist AI-generated values to localStorage, only the structure.
                    return updatedPoints;
                });
                if (metricToUpdate.serverName === ServerName.P21) setP21Status('connected');
                else setPorStatus('connected');
                 setStatusMessage(`[Demo Worker] Successfully updated: ${metricToUpdate.variableName}.`);
            } else {
                throw new Error(response.error || 'Unknown AI error');
            }
        } catch (error) {
            console.error(`[Demo Worker] Failed to update metric ${metricToUpdate.variableName}:`, error);
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('disconnected');
            else setPorStatus('disconnected');
            setStatusMessage(`[Demo Worker] Error updating ${metricToUpdate.variableName}: ${error instanceof Error ? error.message : ''}`);
        }

        metricUpdateIndexRef.current = (index + 1) % dataPoints.length;
    }, [dataPoints]);

    const stopDemoWorker = useCallback(() => {
        if (workerIntervalRef.current) {
            clearInterval(workerIntervalRef.current);
            workerIntervalRef.current = null;
        }
        isWorkerRunningRef.current = false;
        setStatusMessage("Worker stopped by user.");
    }, []);

    const runDemoWorker = useCallback(() => {
        if (mode !== 'demo' || isWorkerRunningRef.current) return;
        console.log("Starting demo worker...");
        isWorkerRunningRef.current = true;
        setStatusMessage('Demo worker started. Generating live data...');
        // Run first tick immediately
        runDemoWorkerTick();
        workerIntervalRef.current = window.setInterval(runDemoWorkerTick, 15000); // 15 seconds
    }, [mode, runDemoWorkerTick]);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    useEffect(() => {
        // This effect manages the background worker lifecycle.
        // It stops any running worker when the mode or data changes, then starts the correct one.
        if (workerIntervalRef.current) {
            clearInterval(workerIntervalRef.current);
            workerIntervalRef.current = null;
        }
        isWorkerRunningRef.current = false;

        if (initialDataLoaded && dataPoints.length > 0) {
            if (mode === 'production') {
                setStatusMessage('Production mode active. Connecting to MCP Controller...');
                isWorkerRunningRef.current = true;
                runProductionWorkerTick(); // Run first tick immediately
                // Use a shorter interval for production simulation to show continuous attempts
                workerIntervalRef.current = window.setInterval(runProductionWorkerTick, 15000); 
            } else { // demo mode
                 setStatusMessage('Demo mode active. Starting AI data generation...');
                 // The runDemoWorker function handles setting the interval and running flag.
                 runDemoWorker();
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
    }, [mode, initialDataLoaded, dataPoints.length, runProductionWorkerTick, runDemoWorker]);

    
    const updateDataPoint = (id: number, field: keyof DashboardDataPoint, value: string) => {
        setDataPoints(prev => {
            const updatedPoints = prev.map(p => p.id === id ? { ...p, [field]: value } : p);
            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
            return updatedPoints;
        });
    };

    const resetDataToDefaults = useCallback(async () => {
        if (window.confirm('Are you sure you want to reset all dashboard data to the original defaults? This will erase all SQL fixes and cannot be undone.')) {
            setStatusMessage("Resetting data to defaults...");
            safeLocalStorage.removeItem(DASHBOARD_DATA_KEY);
            // Re-fetch data
             try {
                const response = await fetch('hooks/dashboard-data.json');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                if (!Array.isArray(data)) throw new Error("Dashboard data is not an array.");
                setDataPoints(data);
                safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(data));
                setStatusMessage("Data has been reset to defaults.");
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
        isWorkerRunning: isWorkerRunningRef.current,
        resetDataToDefaults,
    };
};