import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardDataPoint, ConnectionStatus, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from '../components/contexts/GlobalContext';
import { generateSqlResponse, testConnections } from './geminiService';
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
    const runProductionWorkerTick = useCallback(() => {
        setDataPoints(prevDataPoints => {
            if (prevDataPoints.length === 0) return prevDataPoints;
            const index = metricUpdateIndexRef.current;
            const metricToUpdate = prevDataPoints[index];
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('disconnected');
            else setPorStatus('disconnected');
            setStatusMessage(`[Prod Worker] Simulating failed fetch for: ${metricToUpdate.variableName}. Last attempt: ${new Date().toLocaleTimeString()}`);
            const updatedPoints = [...prevDataPoints];
            updatedPoints[index] = { ...metricToUpdate, value: 99999, lastUpdated: new Date().toISOString() };
            metricUpdateIndexRef.current = (index + 1) % prevDataPoints.length;
            return updatedPoints;
        });
    }, []);
    
    // Demo Mode Worker
    const runDemoWorkerTick = useCallback(async () => {
        if (dataPoints.length === 0) return;

        const index = metricUpdateIndexRef.current;
        const metricToUpdate = dataPoints[index];
        
        setStatusMessage(`[Demo Worker] Fetching new value for: ${metricToUpdate.variableName}...`);
        
        try {
            if (metricToUpdate.serverName === ServerName.P21) setP21Status('testing');
            else setPorStatus('testing');

            const response = await generateSqlResponse(metricToUpdate.productionSqlExpression, dataPoints);

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

    useEffect(() => {
        loadInitialData();
        return () => stopDemoWorker(); // Cleanup on unmount
    }, [loadInitialData, stopDemoWorker]);

    useEffect(() => {
        stopDemoWorker(); // Stop any existing worker when mode changes
        if (initialDataLoaded && dataPoints.length > 0) {
            if (mode === 'production') {
                setStatusMessage('Production mode active. Simulating connection failures.');
                workerIntervalRef.current = window.setInterval(runProductionWorkerTick, 60000); // 1 minute interval
            } else { // demo mode
                 setStatusMessage('Demo mode active. AI data generation is stopped.');
                // In demo mode, the worker is started by the user via `runDemoWorker`
            }
        } else if (initialDataLoaded) {
            setStatusMessage('Dashboard data loaded, but no metrics found.');
        }
    }, [mode, initialDataLoaded, dataPoints.length, runProductionWorkerTick, stopDemoWorker]);

    const runDemoWorker = useCallback(() => {
        if (mode !== 'demo' || isWorkerRunningRef.current) return;
        console.log("Starting demo worker...");
        isWorkerRunningRef.current = true;
        setStatusMessage('Demo worker started. Generating live data...');
        // Run first tick immediately
        runDemoWorkerTick();
        workerIntervalRef.current = window.setInterval(runDemoWorkerTick, 15000); // 15 seconds
    }, [mode, runDemoWorkerTick]);
    
    const updateDataPoint = (id: number, field: keyof DashboardDataPoint, value: string) => {
        setDataPoints(prev => {
            const updatedPoints = prev.map(p => p.id === id ? { ...p, [field]: value } : p);
            safeLocalStorage.setItem(DASHBOARD_DATA_KEY, JSON.stringify(updatedPoints));
            return updatedPoints;
        });
    };

    const resetDataToDefaults = useCallback(async () => {
        if (window.confirm('Are you sure you want to reset all dashboard data to the original defaults? This cannot be undone.')) {
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
            setStatusMessage("Connection test complete (Production Mode).");
            // In production, simulate successful pings to internal servers
            // and failed connections to sandboxed MCP servers.
            return [
                { name: ServerName.P21, status: 'Error', error: 'Connection failed: Server is in a sandboxed environment.' },
                { name: ServerName.POR, status: 'Error', error: 'Connection failed: Server is in a sandboxed environment.' },
                { name: ServerName.INTERNAL_SQL, status: 'Connected', responseTime: 12, version: 'SQL Server 2022' },
                { name: ServerName.LDAP, status: 'Connected', responseTime: 5, version: 'OpenLDAP 2.6' }
            ];
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