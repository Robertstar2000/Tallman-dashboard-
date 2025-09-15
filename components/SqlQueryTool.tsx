import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

import * as mcpService from '../services/mcpService';
import { useGlobal } from './contexts/GlobalContext';
import { DashboardDataPoint, ServerName, ChartGroup } from '../types';

interface SqlQueryToolProps {
    dataPoints: DashboardDataPoint[];
    updateDataPoint: (id: number, field: keyof DashboardDataPoint, value: string) => void;
}

const SqlQueryTool: React.FC<SqlQueryToolProps> = ({ dataPoints, updateDataPoint }) => {
    const { mode, selectedChartGroup } = useGlobal();
    const [query, setQuery] = useState('SELECT COUNT(order_no) AS result FROM oe_hdr;');
    const [server, setServer] = useState<ServerName>(ServerName.P21);
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [metricId, setMetricId] = useState<string>('');
    const [loadedMetricId, setLoadedMetricId] = useState<number | null>(null);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [localChartGroupFilter, setLocalChartGroupFilter] = useState<string>('All');


    useEffect(() => {
        if (feedbackMessage) {
            const timer = setTimeout(() => setFeedbackMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedbackMessage]);

    // Create the same filtered and sorted data points as the Admin component
    const filteredAndSortedDataPoints = useMemo(() => {
        let filtered;
        if (localChartGroupFilter === 'All') {
            filtered = [...dataPoints];
        } else {
            filtered = dataPoints.filter(point => point.chartGroup === localChartGroupFilter);
        }
        
        // Sort the filtered data
        if (localChartGroupFilter === 'All') {
            // Sort by chart group first, then by variable name
            filtered.sort((a, b) => {
                if (a.chartGroup !== b.chartGroup) {
                    return a.chartGroup.localeCompare(b.chartGroup);
                }
                return a.variableName.localeCompare(b.variableName);
            });
        } else {
            // Sort by variable name within the selected group
            filtered.sort((a, b) => a.variableName.localeCompare(b.variableName));
        }
        
        // Add unique display ID to prevent React key conflicts
        return filtered.map((point, index) => ({
            ...point,
            displayId: `${point.id}-${point.chartGroup}-${index}` // Unique identifier to prevent key conflicts
        }));
    }, [dataPoints, localChartGroupFilter]);

    // Get unique chart groups for the dropdown
    const chartGroups = useMemo(() => {
        const groups = ['All', ...Object.values(ChartGroup)];
        return groups;
    }, []);

    const handleLoadQuery = () => {
        if (!metricId) {
            setError("Please enter a metric ID.");
            return;
        }
        setError(null);

        // Find the data point by display ID or ID
        const dataPointWithDisplayId = filteredAndSortedDataPoints.find(dp =>
            dp.displayId === metricId || dp.id.toString() === metricId
        );
        if (dataPointWithDisplayId) {
            setQuery(dataPointWithDisplayId.productionSqlExpression);
            setServer(dataPointWithDisplayId.serverName);
            setLoadedMetricId(dataPointWithDisplayId.id); // Store the actual database ID
            setFeedbackMessage(`Loaded SQL and server (${dataPointWithDisplayId.serverName}) for ID: ${metricId} (${dataPointWithDisplayId.variableName})`);
        } else {
            setError(`Metric with ID ${metricId} not found in current filter view.`);
            setLoadedMetricId(null);
        }
    };

    const handleSaveQuery = () => {
        if (loadedMetricId === null) {
            setError("You must first load a query by ID to save it.");
            return;
        }
        try {
            // Update the SQL expression
            updateDataPoint(loadedMetricId, 'productionSqlExpression', query);
            
            // Update the lastUpdated timestamp to track when the SQL was modified
            updateDataPoint(loadedMetricId, 'lastUpdated', new Date().toISOString());
            
            // Find the data point to get its variable name for feedback
            const dataPoint = filteredAndSortedDataPoints.find(dp => dp.id === loadedMetricId);
            const variableName = dataPoint ? dataPoint.variableName : `ID ${loadedMetricId}`;
            
            setFeedbackMessage(`Successfully saved SQL expression for ${variableName}. Changes will be included in backups and persist in the admin list.`);
            setError(null);
            
            console.log(`[SQL Query Tool] Saved SQL expression for metric ID ${loadedMetricId}: ${variableName}`);
            console.log(`[SQL Query Tool] SQL: ${query}`);
            
        } catch(e) {
             const message = e instanceof Error ? e.message : "An unknown error occurred during save.";
             setError(message);
             console.error(`[SQL Query Tool] Error saving SQL for metric ID ${loadedMetricId}:`, e);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setResult(null);
        try {
            const response = mode === 'production'
                ? await mcpService.executeQuery(query, server)
                : { error: 'Demo mode: Direct queries not available. Only production mode supports SQL execution.' };
            
            if (response.error) {
                setError(response.error);
            } else {
                setResult(JSON.stringify(response, null, 2));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-primary shadow-xl rounded-lg p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-text-primary">SQL Query Tool</h2>
                <Link to="/admin" className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-highlight">
                    &larr; Back to Admin
                </Link>
            </div>
            
            <p className="text-text-secondary mb-4 text-sm">
                Directly query the database engine. You are currently in <span className="font-bold text-text-primary">{mode.toUpperCase()}</span> mode.
                Select the target server to ensure correct SQL dialect is used.
                Try querying a sandboxed table like <code className="bg-secondary px-1 rounded">mcp_sandboxed_inv</code> to see the simulated error response.
                <br />
                <strong>Note:</strong> The ID numbers correspond to the display order in the Admin table based on your current filter selection.
            </p>

            <div className="mb-4 p-4 bg-secondary rounded-lg">
                <label htmlFor="chart-group-filter" className="block text-sm font-medium text-text-secondary mb-2">
                    Filter by Chart Group (affects ID numbering)
                </label>
                <select
                    id="chart-group-filter"
                    value={localChartGroupFilter}
                    onChange={(e) => setLocalChartGroupFilter(e.target.value)}
                    className="w-full bg-primary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                >
                    {chartGroups.map(group => (
                        <option key={group} value={group}>{group}</option>
                    ))}
                </select>
                <p className="text-xs text-text-secondary mt-1">
                    Showing {filteredAndSortedDataPoints.length} records. IDs are renumbered 1-{filteredAndSortedDataPoints.length} based on this filter.
                </p>
            </div>

            <div className="mb-4 p-4 bg-secondary rounded-lg">
                <label htmlFor="metric-id" className="block text-sm font-medium text-text-secondary mb-2">
                    Load SQL by ID
                </label>
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        id="metric-id"
                        value={metricId}
                        onChange={(e) => setMetricId(e.target.value)}
                        className="w-48 bg-primary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                        placeholder="Enter metric ID or display ID..."
                    />
                    <button
                        onClick={handleLoadQuery}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                        Load
                    </button>
                </div>
                <p className="text-xs text-text-secondary mt-1">
                    Enter a metric ID (number) or display ID format like "{filteredAndSortedDataPoints[0]?.displayId || 'example-display-id'}"
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                 <div className="mb-4">
                    <label htmlFor="server-select" className="block text-sm font-medium text-text-secondary mb-2">
                        Target Server
                    </label>
                    <select
                        id="server-select"
                        value={server}
                        onChange={(e) => setServer(e.target.value as ServerName)}
                        className="w-full bg-secondary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                    >
                        {Object.values(ServerName).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="mb-4">
                    <label htmlFor="query-textarea" className="block text-sm font-medium text-text-secondary mb-2">
                        SQL Query
                    </label>
                    <textarea
                        id="query-textarea"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        rows={6}
                        className="w-full bg-secondary p-2 rounded border border-transparent focus:border-accent focus:ring-0 font-mono text-sm"
                        placeholder="Enter your SQL query here..."
                    />
                </div>
                
                <div className="flex items-center justify-between mb-4">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500"
                    >
                        {isLoading ? 'Executing...' : 'Execute Query'}
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveQuery}
                        disabled={loadedMetricId === null}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                        title={loadedMetricId === null ? "Load a metric first to enable saving" : "Save changes to loaded metric"}
                    >
                        Save to Metric
                    </button>
                </div>
            </form>

            {feedbackMessage && <div className="mb-4 p-3 bg-green-900/50 text-green-300 rounded-md text-sm">{feedbackMessage}</div>}

            {isLoading && <div className="text-center text-text-secondary">Executing query...</div>}

            {error && <div className="mb-4 p-3 bg-red-900/50 text-red-300 rounded-md">{error}</div>}

            {result && (
                <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">Result</h3>
                    <pre className="bg-secondary p-4 rounded-md text-sm whitespace-pre-wrap overflow-x-auto">
                        <code>{result}</code>
                    </pre>
                </div>
            )}
        </div>
    );
};

export default SqlQueryTool;
