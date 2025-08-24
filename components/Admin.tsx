import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardDataPoint, ChartGroup, ServerName, ConnectionDetails } from '../types';
import { useGlobal } from './contexts/GlobalContext';
import ConnectionStatusModal from './ConnectionStatusModal';
import HelpModal from './HelpModal';

interface AdminProps {
    dataPoints: DashboardDataPoint[];
    updateDataPoint: (id: number, field: keyof DashboardDataPoint, value: string) => void;
    runDemoWorker: () => void;
    stopDemoWorker: () => void;
    testDbConnections: () => Promise<ConnectionDetails[]>;
    isWorkerRunning: boolean;
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
    statusMessage,
    resetDataToDefaults,
}) => {
    const { mode, setMode } = useGlobal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails[]>([]);

    const handleTestConnections = async () => {
        const details = await testDbConnections();
        setConnectionDetails(details);
        setIsModalOpen(true);
    };

    const handleInputChange = (id: number, field: keyof DashboardDataPoint, value: any) => {
        updateDataPoint(id, field, String(value));
    };

    const headers = [
      'ID', 'Chart Group', 'Variable Name', 'Data Point', 'Server',
      'Table Name', 'Production SQL Expression', 'Value', 'Calc Type', 'Last Updated'
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

            <div className="bg-secondary p-4 rounded-lg mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
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
                    <button onClick={runDemoWorker} disabled={mode === 'production' || isWorkerRunning} className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Run
                    </button>
                    <button onClick={stopDemoWorker} disabled={mode === 'production' || !isWorkerRunning} className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                        Stop
                    </button>
                    <button onClick={handleTestConnections} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                        Test Connections
                    </button>
                    <button onClick={resetDataToDefaults} className="px-3 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700">
                        Reset to Defaults
                    </button>
                </div>
            </div>

            <div className="overflow-auto max-h-[70vh]">
                <table className="min-w-full divide-y divide-secondary">
                    <thead className="bg-secondary sticky top-0">
                        <tr>
                            {headers.map(header => (
                                <th key={header} scope="col" className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-primary divide-y divide-secondary">
                        {dataPoints.map((row) => (
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
                                    <textarea
                                        value={row.productionSqlExpression}
                                        onChange={(e) => handleInputChange(row.id, 'productionSqlExpression', e.target.value)}
                                        className="w-full bg-secondary p-1 rounded border border-transparent focus:border-accent focus:ring-0 text-sm font-mono"
                                        rows={5}
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{typeof row.value === 'number' ? row.value.toLocaleString() : row.value}</td>
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