import React, { useState, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardDataPoint, ChartGroup, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from './contexts/GlobalContext';
import ConnectionStatusModal from './ConnectionStatusModal';
import HelpModal from './HelpModal';
import { safeLocalStorage } from '../services/storageService';

// Memoized table row component to prevent unnecessary re-renders
const TableRow = memo(({ row, handleInputChange, handleSaveRow, savingRows }: {
    row: DashboardDataPoint & { displayId: number };
    handleInputChange: (id: number, field: keyof DashboardDataPoint, value: any) => void;
    handleSaveRow: (id: number) => Promise<void>;
    savingRows: Set<number>;
}) => {
    const isSaving = savingRows.has(row.id);
    
    return (
        <tr key={row.id}>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{row.displayId}</td>
            <td className="px-6 py-4 text-sm">
                <select
                    value={row.chartGroup}
                    onChange={(e) => handleInputChange(row.id, 'chartGroup', e.target.value)}
                    className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                >
                    {Object.values(ChartGroup).map(group => <option key={group} value={group}>{group}</option>)}
                </select>
            </td>
            <td className="px-6 py-4 text-sm">
                <textarea
                    value={row.variableName}
                    onChange={(e) => handleInputChange(row.id, 'variableName', e.target.value)}
                    className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm min-h-[40px] resize-y"
                    rows={3}
                />
            </td>
            <td className="px-6 py-4 text-sm">
                <input
                    type="text"
                    value={row.dataPoint}
                    onChange={(e) => handleInputChange(row.id, 'dataPoint', e.target.value)}
                    className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{row.serverName}</td>
            <td className="px-6 py-4 text-sm">
                <input
                    type="text"
                    value={row.tableName}
                    onChange={(e) => handleInputChange(row.id, 'tableName', e.target.value)}
                    className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                />
            </td>
            <td className="px-6 py-4 text-sm">
                <div className="flex flex-col space-y-2">
                    <textarea
                        value={row.productionSqlExpression}
                        onChange={(e) => handleInputChange(row.id, 'productionSqlExpression', e.target.value)}
                        className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm font-mono"
                        rows={5}
                    />
                    <button
                        onClick={() => handleSaveRow(row.id)}
                        disabled={isSaving}
                        className={`px-2 py-1 text-xs font-medium rounded ${
                            isSaving 
                                ? 'bg-gray-500 text-white cursor-not-allowed' 
                                : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                    >
                        {isSaving ? 'Saving...' : 'Save SQL'}
                    </button>
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof row.value === 'number' ? row.value.toLocaleString() : row.value}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">
                {row.prodValue !== null && row.prodValue !== undefined ? 
                    (typeof row.prodValue === 'number' ? row.prodValue.toLocaleString() : row.prodValue) : 
                    'N/A'
                }
            </td>
            <td className="px-6 py-4 text-sm">
                <textarea
                    value={row.calculationType}
                    onChange={(e) => handleInputChange(row.id, 'calculationType', e.target.value)}
                    className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                    rows={5}
                />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(row.lastUpdated).toLocaleString()}</td>
        </tr>
    );
});

TableRow.displayName = 'TableRow';

interface AdminProps {
    dataPoints: DashboardDataPoint[];
    updateDataPoint: (id: number, field: keyof DashboardDataPoint, value: string) => void;
    runDemoWorker: () => void;
    stopDemoWorker: () => void;
    testDbConnections: () => Promise<ConnectionDetails[]>;
    isWorkerRunning: boolean;
    isMcpExecuting: boolean;
    statusMessage: string;
    resetDataToDefaults: () => void;
    forceExecuteChartGroup?: (chartGroup: string, serverFilter?: ServerName) => Promise<boolean>;
    forceExecuteHistoricalDataP21?: () => Promise<boolean>;
}

const Admin: React.FC<AdminProps> = ({
    dataPoints,
    updateDataPoint,
    runDemoWorker,
    stopDemoWorker,
    testDbConnections,
    isWorkerRunning,
    isMcpExecuting,
    statusMessage,
    resetDataToDefaults,
    forceExecuteChartGroup,
    forceExecuteHistoricalDataP21,
}) => {
    const { mode, setMode, selectedChartGroup, setSelectedChartGroup } = useGlobal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails[]>([]);
    const [savingRows, setSavingRows] = useState<Set<number>>(new Set());

    const handleTestConnections = async () => {
        const details = await testDbConnections();
        setConnectionDetails(details);
        setIsModalOpen(true);
    };

    const handleInputChange = useCallback((id: number, field: keyof DashboardDataPoint, value: any) => {
        updateDataPoint(id, field, String(value));
    }, [updateDataPoint]);

    const handleSaveRow = useCallback(async (id: number) => {
        setSavingRows(prev => new Set(prev).add(id));
        
        try {
            // Find the data point to save
            const dataPoint = dataPoints.find(dp => dp.id === id);
            if (!dataPoint) {
                throw new Error('Data point not found');
            }

            // Update the lastUpdated timestamp
            updateDataPoint(id, 'lastUpdated', new Date().toISOString());
            
            // Simulate save delay for user feedback
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // In a real implementation, you would save to the appropriate JSON file here
            // For now, we just update localStorage which is handled by updateDataPoint
            
            console.log(`Saved SQL expression for data point ${id}: ${dataPoint.variableName}`);
            
        } catch (error) {
            console.error(`Error saving data point ${id}:`, error);
            alert(`Failed to save changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSavingRows(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        }
    }, [dataPoints, updateDataPoint]);

    const handleBackupData = useCallback(() => {
        try {
            // Get the current data from localStorage to ensure we have the latest changes
            const storedData = safeLocalStorage.getItem('dashboard_data_points');
            const currentDataPoints = storedData ? JSON.parse(storedData) : dataPoints;
            
            console.log(`[Admin] Creating backup with ${currentDataPoints.length} data points including SQL changes`);
            
            // Group data points by chart group to match the original JSON file structure
            const groupedData = currentDataPoints.reduce((acc, point) => {
                const group = point.chartGroup;
                if (!acc[group]) acc[group] = [];
                
                // Create a clean copy without runtime fields like prodValue, but keep SQL changes
                const cleanPoint = {
                    id: point.id,
                    chartGroup: point.chartGroup,
                    variableName: point.variableName,
                    dataPoint: point.dataPoint,
                    serverName: point.serverName,
                    tableName: point.tableName,
                    productionSqlExpression: point.productionSqlExpression, // This includes any SQL changes
                    value: point.value,
                    calculationType: point.calculationType,
                    lastUpdated: point.lastUpdated,
                    // Include additional fields that might have been added
                    ...(point.valueColumn && { valueColumn: point.valueColumn }),
                    ...(point.filterColumn && { filterColumn: point.filterColumn }),
                    ...(point.filterValue && { filterValue: point.filterValue })
                };
                
                acc[group].push(cleanPoint);
                return acc;
            }, {} as Record<string, any[]>);

            // Create backup data with metadata including SQL change tracking
            const backupData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    totalRecords: currentDataPoints.length,
                    mode: mode,
                    version: "1.0.0",
                    includesSqlChanges: true,
                    backupType: "complete_with_modifications"
                },
                data: groupedData,
                allDataPoints: currentDataPoints.map(point => ({
                    id: point.id,
                    chartGroup: point.chartGroup,
                    variableName: point.variableName,
                    dataPoint: point.dataPoint,
                    serverName: point.serverName,
                    tableName: point.tableName,
                    productionSqlExpression: point.productionSqlExpression, // Includes SQL changes
                    value: point.value,
                    calculationType: point.calculationType,
                    lastUpdated: point.lastUpdated,
                    // Include additional fields
                    ...(point.valueColumn && { valueColumn: point.valueColumn }),
                    ...(point.filterColumn && { filterColumn: point.filterColumn }),
                    ...(point.filterValue && { filterValue: point.filterValue })
                }))
            };

            // Create and download the file
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const link = document.createElement('a');
            link.href = url;
            link.download = `dashboard-backup-with-sql-changes-${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('Dashboard data backup created successfully with SQL changes');
            alert(`Backup created successfully!\n\nFile: dashboard-backup-with-sql-changes-${timestamp}.json\nRecords: ${currentDataPoints.length}\nIncludes: All SQL modifications and admin changes`);
            
        } catch (error) {
            console.error('Error creating backup:', error);
            alert(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, [dataPoints, mode]);

    const handleRestoreFromBackup = useCallback(() => {
        // Create a hidden file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        
        fileInput.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            try {
                // Read the file
                const fileContent = await file.text();
                const backupData = JSON.parse(fileContent);
                
                // Validate the backup file structure
                if (!backupData.metadata || !backupData.allDataPoints) {
                    throw new Error('Invalid backup file format: Missing metadata or allDataPoints');
                }
                
                if (!Array.isArray(backupData.allDataPoints)) {
                    throw new Error('Invalid backup file format: allDataPoints must be an array');
                }
                
                // Validate that we have the expected number of records
                const expectedRecordCount = backupData.metadata.totalRecords;
                const actualRecordCount = backupData.allDataPoints.length;
                
                if (expectedRecordCount !== actualRecordCount) {
                    throw new Error(`Record count mismatch: Expected ${expectedRecordCount}, found ${actualRecordCount}`);
                }
                
                // Validate each data point has required fields
                const requiredFields = ['id', 'chartGroup', 'variableName', 'dataPoint', 'serverName', 'tableName', 'productionSqlExpression'];
                for (let i = 0; i < backupData.allDataPoints.length; i++) {
                    const point = backupData.allDataPoints[i];
                    for (const field of requiredFields) {
                        if (point[field] === undefined || point[field] === null) {
                            throw new Error(`Invalid data point at index ${i}: Missing required field '${field}'`);
                        }
                    }
                }
                
                // Validate that IDs are unique
                const ids = backupData.allDataPoints.map((p: any) => p.id);
                const uniqueIds = new Set(ids);
                if (ids.length !== uniqueIds.size) {
                    throw new Error('Invalid backup file: Duplicate IDs found');
                }
                
                // Confirm with user before restoring
                const confirmMessage = `Restore backup from ${new Date(backupData.metadata.exportDate).toLocaleString()}?\n\n` +
                    `This will replace all current dashboard data with ${actualRecordCount} records from the backup.\n\n` +
                    `This action cannot be undone. Continue?`;
                
                if (!window.confirm(confirmMessage)) {
                    return;
                }
                
                // Process the data points to ensure they have the correct structure
                const restoredDataPoints = backupData.allDataPoints.map((point: any) => ({
                    id: point.id,
                    chartGroup: point.chartGroup,
                    variableName: point.variableName,
                    dataPoint: point.dataPoint,
                    serverName: point.serverName,
                    tableName: point.tableName,
                    productionSqlExpression: point.productionSqlExpression,
                    value: typeof point.value === 'number' ? point.value : 0,
                    prodValue: null, // Reset production values
                    calculationType: point.calculationType || '',
                    lastUpdated: point.lastUpdated || new Date().toISOString()
                }));
                
                // Update the data points using the existing update mechanism
                // First, clear existing data and then load the restored data
                localStorage.removeItem('dashboard_data_points');
                
                // Update each data point
                restoredDataPoints.forEach((point: DashboardDataPoint) => {
                    Object.keys(point).forEach(key => {
                        if (key !== 'id') {
                            const value = (point as any)[key];
                            updateDataPoint(point.id, key as keyof DashboardDataPoint, String(value ?? ''));
                        }
                    });
                });
                
                alert(`Successfully restored ${restoredDataPoints.length} data points from backup!\n\nThe page will reload to apply the changes.`);
                
                // Reload the page to ensure all data is properly loaded
                window.location.reload();
                
            } catch (error) {
                console.error('Error restoring backup:', error);
                alert(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease ensure you selected a valid dashboard backup file.`);
            }
        };
        
        // Trigger the file dialog
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }, [updateDataPoint]);

    // Debug: Log chart group values to understand the issue
    console.log('[Admin] Available chart groups in data:', [...new Set(dataPoints.map(p => p.chartGroup))]);
    console.log('[Admin] Selected chart group:', selectedChartGroup);
    console.log('[Admin] ChartGroup enum values:', Object.values(ChartGroup));

    // Debug: Log data points for the mentioned chart groups
    const siteDistribution = dataPoints.filter(p => p.chartGroup === 'Site Distribution');
    const inventory = dataPoints.filter(p => p.chartGroup === 'Inventory');
    const customerMetrics = dataPoints.filter(p => p.chartGroup === 'Customer Metrics');
    const webOrders = dataPoints.filter(p => p.chartGroup === 'Web Orders');

    console.log('[Admin] Site Distribution data points:', siteDistribution.map(p => ({ id: p.id, prodValue: p.prodValue, value: p.value })));
    console.log('[Admin] Inventory data points:', inventory.map(p => ({ id: p.id, prodValue: p.prodValue, value: p.value })));
    console.log('[Admin] Customer Metrics data points:', customerMetrics.map(p => ({ id: p.id, prodValue: p.prodValue, value: p.value })));
    console.log('[Admin] Web Orders data points:', webOrders.map(p => ({ id: p.id, prodValue: p.prodValue, value: p.value })));

    // Filter and sort data points based on selected chart group
    const filteredAndSortedDataPoints = useMemo(() => {
        let filtered;

        if (selectedChartGroup === 'All') {
            filtered = [...dataPoints];
            // When "All" is selected: sort by chart group first, then by ID numeric order within each group
            filtered.sort((a, b) => {
                if (a.chartGroup !== b.chartGroup) {
                    return a.chartGroup.localeCompare(b.chartGroup);
                }
                return a.id - b.id;
            });
            console.log(`[Admin] "All" selected: showing all ${filtered.length} items sorted by group then ID`);
        } else {
            // When a specific chart group is selected: show ONLY items in that group
            filtered = dataPoints.filter(point => point.chartGroup === selectedChartGroup);
            // Sort by ID numeric order (1, 2, 3, 4... ascending)
            filtered.sort((a, b) => a.id - b.id);
            console.log(`[Admin] "${selectedChartGroup}" selected: showing only ${filtered.length} items from this group, sorted by ID`);
        }

        // Add sequential display ID (1-based numbering) for filtered results
        return filtered.map((point, index) => ({
            ...point,
            displayId: index + 1 // 1-based sequential numbering for filtered results
        }));
    }, [dataPoints, selectedChartGroup]);

    // Get unique chart groups for the dropdown
    const chartGroups = useMemo(() => {
        const groups = ['All', ...Object.values(ChartGroup)];
        return groups;
    }, []);

    const headers = [
      'ID', 'Chart Group', 'Variable Name', 'Data Point', 'Server',
      'Table Name', 'Production SQL Expression', 'Demo Value', 'Prod Value', 'Calc Type', 'Last Updated'
    ];

    return (
        <div className="bg-primary shadow-xl rounded-lg p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-primary">Admin Management</h2>
                    <p className="text-sm text-text-secondary mt-1">{statusMessage}</p>
                </div>
                <div className="flex items-center space-x-2 flex-wrap justify-center sm:justify-end">
                    <Link to="/" className="px-3 py-2 text-sm font-medium text-white bg-highlight rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-background">
                        Dashboard
                    </Link>
                     <Link to="/user-management" className="px-3 py-2 text-sm font-medium text-white bg-highlight rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-background">
                        Users
                    </Link>
                     <Link to="/sql-query-tool" className="px-3 py-2 text-sm font-medium text-white bg-highlight rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-background">
                        SQL Tool
                    </Link>
                    <button onClick={() => setIsHelpModalOpen(true)} className="px-3 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700">
                        Help
                    </button>
                </div>
            </div>

            <div className="bg-secondary p-4 rounded-lg mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center space-x-4">
                        <span className="font-semibold">Mode:</span>
                         <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="radio" name="mode" value="demo" checked={mode === 'demo'} onChange={() => setMode('demo')} className="form-radio text-accent focus:ring-accent"/>
                            <span>Demo</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input type="radio" name="mode" value="production" checked={mode === 'production'} onChange={() => setMode('production')} className="form-radio text-accent focus:ring-accent"/>
                            <span>Production</span>
                        </label>
                    </div>
                     <div className="flex flex-wrap items-center space-x-2">
                        <button 
                            onClick={runDemoWorker} 
                            disabled={isWorkerRunning} 
                            className={`px-3 py-2 text-sm font-medium text-white rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed ${
                                isWorkerRunning && isMcpExecuting 
                                    ? 'bg-green-400 animate-pulse shadow-lg shadow-green-400/50' 
                                    : isWorkerRunning 
                                        ? 'bg-green-600 hover:bg-green-700' 
                                        : 'bg-green-600 hover:bg-green-700'
                            }`}
                        >
                            Run
                        </button>
                        <button onClick={stopDemoWorker} disabled={!isWorkerRunning} className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                            Stop
                        </button>
                        <button onClick={handleTestConnections} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                            Test Connections
                        </button>
                        <button onClick={handleBackupData} className="px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700">
                            Backup
                        </button>
                        <button onClick={handleRestoreFromBackup} className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
                            Restore From Backup
                        </button>
                        <button onClick={resetDataToDefaults} className="px-3 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700">
                            Reset to Defaults
                        </button>
                    </div>
                </div>

                {/* Manual Query Execution Section */}
                <div className="border-t border-secondary pt-4 mt-4">
                    <h3 className="font-semibold text-text-primary mb-2 text-sm">Manual Query Execution</h3>
                    <p className="text-xs text-text-secondary mb-3">
                        Use these buttons to manually execute specific chart groups, useful for debugging failed queries.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {forceExecuteChartGroup && (
                            <>
                                {/* 10 Chart Group Force Execution Buttons */}
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Key Metrics queries...');
                                        alert('Starting force execution of Key Metrics queries. Check console for progress.');
                                        await forceExecuteChartGroup('Key Metrics');
                                        alert('Completed Key Metrics execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                                >
                                    Force: Key Metrics
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Accounts queries...');
                                        alert('Starting force execution of Accounts queries. Check console for progress.');
                                        await forceExecuteChartGroup('Accounts');
                                        alert('Completed Accounts execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                                >
                                    Force: Accounts
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Customer Metrics queries...');
                                        alert('Starting force execution of Customer Metrics queries. Check console for progress.');
                                        await forceExecuteChartGroup('Customer Metrics');
                                        alert('Completed Customer Metrics execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-cyan-600 rounded-md hover:bg-cyan-700"
                                >
                                    Force: Customer Metrics
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Inventory queries...');
                                        alert('Starting force execution of Inventory queries. Check console for progress.');
                                        await forceExecuteChartGroup('Inventory');
                                        alert('Completed Inventory execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-pink-600 rounded-md hover:bg-pink-700"
                                >
                                    Force: Inventory
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing POR Overview queries...');
                                        alert('Starting force execution of POR Overview queries. Check console for progress.');
                                        await forceExecuteChartGroup('POR Overview');
                                        alert('Completed POR Overview execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700"
                                >
                                    Force: POR Overview
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Daily Orders queries...');
                                        alert('Starting force execution of Daily Orders queries. Check console for progress.');
                                        await forceExecuteChartGroup('Daily Orders');
                                        alert('Completed Daily Orders execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-rose-600 rounded-md hover:bg-rose-700"
                                >
                                    Force: Daily Orders
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing AR Aging queries...');
                                        alert('Starting force execution of AR Aging queries. Check console for progress.');
                                        await forceExecuteChartGroup('AR Aging');
                                        alert('Completed AR Aging execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
                                >
                                    Force: AR Aging
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Historical Data queries...');
                                        alert('Starting force execution of Historical Data queries. Check console for progress.');
                                        await forceExecuteChartGroup('Historical Data');
                                        alert('Completed Historical Data execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700"
                                >
                                    Force: Historical Data
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Site Distribution queries...');
                                        alert('Starting force execution of Site Distribution queries. Check console for progress.');
                                        await forceExecuteChartGroup('Site Distribution');
                                        alert('Completed Site Distribution execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                                >
                                    Force: Site Distribution
                                </button>
                                <button
                                    onClick={async () => {
                                        console.log('Force executing Web Orders queries...');
                                        alert('Starting force execution of Web Orders queries. Check console for progress.');
                                        await forceExecuteChartGroup('Web Orders');
                                        alert('Completed Web Orders execution.');
                                    }}
                                    className="px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                                >
                                    Force: Web Orders
                                </button>
                            </>
                        )}
                    </div>
                    <div className="text-xs text-text-secondary mt-2">
                        📊 Manual execution buttons for all 10 chart groups - use these to bypass the automatic worker and debug specific query failures.
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <span className="font-semibold">Filter by Chart Group:</span>
                    <select
                        value={selectedChartGroup}
                        onChange={(e) => {
                            console.log(`[Admin] Select changed from "${selectedChartGroup}" to "${e.target.value}"`);
                            setSelectedChartGroup(e.target.value);
                        }}
                        className="bg-primary text-text-primary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm min-w-[200px]"
                    >
                        {chartGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                    <span className="text-sm text-text-secondary" onClick={() => {
                        console.log('[Admin] Stats clicked - Current filter state:', {
                            selectedChartGroup,
                            filteredCount: filteredAndSortedDataPoints.length,
                            totalCount: dataPoints.length,
                            uniqueChartGroups: [...new Set(dataPoints.map(p => p.chartGroup))].sort(),
                            chartGroupsOptions: chartGroups
                        });
                    }}>
                        Showing {filteredAndSortedDataPoints.length} of {dataPoints.length} records (click for debug)
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-400px)] border border-secondary rounded-lg">
                <table className="min-w-full divide-y divide-secondary">
                    <thead className="bg-secondary sticky top-0 z-10">
                        <tr>
                            {headers.map(header => (
                                <th key={header} scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider whitespace-nowrap">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-primary divide-y divide-secondary">
                        {filteredAndSortedDataPoints.map((row) => (
                            <TableRow
                                key={row.id}
                                row={row}
                                handleInputChange={handleInputChange}
                                handleSaveRow={handleSaveRow}
                                savingRows={savingRows}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && <ConnectionStatusModal details={connectionDetails} onClose={() => setIsModalOpen(false)} />}
            {isHelpModalOpen && <HelpModal title="Developer README" filePath="/README.md" onClose={() => setIsHelpModalOpen(false)} />}

        </div>
    );
};

export default Admin;
