import React, { useState, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardDataPoint, ChartGroup, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from './contexts/GlobalContext';
import ConnectionStatusModal from './ConnectionStatusModal';
import HelpModal from './HelpModal';

// Memoized table row component to prevent unnecessary re-renders
const TableRow = memo(({ row, handleInputChange, handleSaveRow, savingRows }: {
    row: DashboardDataPoint;
    handleInputChange: (id: number, field: keyof DashboardDataPoint, value: any) => void;
    handleSaveRow: (id: number) => Promise<void>;
    savingRows: Set<number>;
}) => {
    const isSaving = savingRows.has(row.id);
    
    return (
        <tr key={row.id}>
            <td className="px-6 py-4 whitespace-nowrap text-sm">{row.id}</td>
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
}) => {
    const { mode, setMode } = useGlobal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails[]>([]);
    const [selectedChartGroup, setSelectedChartGroup] = useState<string>('All');
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
            // Group data points by chart group to match the original JSON file structure
            const groupedData = dataPoints.reduce((acc, point) => {
                const group = point.chartGroup;
                if (!acc[group]) acc[group] = [];
                
                // Create a clean copy without runtime fields like prodValue
                const cleanPoint = {
                    id: point.id,
                    chartGroup: point.chartGroup,
                    variableName: point.variableName,
                    dataPoint: point.dataPoint,
                    serverName: point.serverName,
                    tableName: point.tableName,
                    productionSqlExpression: point.productionSqlExpression,
                    value: point.value,
                    calculationType: point.calculationType,
                    lastUpdated: point.lastUpdated
                };
                
                acc[group].push(cleanPoint);
                return acc;
            }, {} as Record<string, any[]>);

            // Create backup data with metadata
            const backupData = {
                metadata: {
                    exportDate: new Date().toISOString(),
                    totalRecords: dataPoints.length,
                    mode: mode,
                    version: "1.0.0"
                },
                data: groupedData,
                allDataPoints: dataPoints.map(point => ({
                    id: point.id,
                    chartGroup: point.chartGroup,
                    variableName: point.variableName,
                    dataPoint: point.dataPoint,
                    serverName: point.serverName,
                    tableName: point.tableName,
                    productionSqlExpression: point.productionSqlExpression,
                    value: point.value,
                    calculationType: point.calculationType,
                    lastUpdated: point.lastUpdated
                }))
            };

            // Create and download the file
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('Dashboard data backup created successfully');
            
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
                            updateDataPoint(point.id, key as keyof DashboardDataPoint, String((point as any)[key]));
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

    // Filter data points based on selected chart group
    const filteredDataPoints = useMemo(() => {
        if (selectedChartGroup === 'All') {
            return dataPoints;
        }
        return dataPoints.filter(point => point.chartGroup === selectedChartGroup);
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
                
                <div className="flex items-center space-x-4">
                    <span className="font-semibold">Filter by Chart Group:</span>
                    <select
                        value={selectedChartGroup}
                        onChange={(e) => setSelectedChartGroup(e.target.value)}
                        className="bg-primary text-text-primary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm min-w-[200px]"
                    >
                        {chartGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                    <span className="text-sm text-text-secondary">
                        Showing {filteredDataPoints.length} of {dataPoints.length} records
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
                        {filteredDataPoints
                            .sort((a, b) => a.id - b.id)
                            .map((row) => (
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
