import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { generateSqlResponse } from '../services/geminiService';
import { DashboardDataPoint } from '../types';

interface SqlQueryToolProps {
    dataPoints: DashboardDataPoint[];
    updateDataPoint: (id: number, field: keyof DashboardDataPoint, value: string) => void;
}

const SqlQueryTool: React.FC<SqlQueryToolProps> = ({ dataPoints, updateDataPoint }) => {
    const [query, setQuery] = useState('SELECT COUNT(order_no) AS result FROM oe_hdr WHERE status = \'open\';');
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [metricId, setMetricId] = useState<string>('');
    const [loadedMetricId, setLoadedMetricId] = useState<number | null>(null);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);


    useEffect(() => {
        if (feedbackMessage) {
            const timer = setTimeout(() => setFeedbackMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedbackMessage]);

    const handleLoadQuery = () => {
        const id = parseInt(metricId, 10);
        if (isNaN(id)) {
            setError("Please enter a valid numeric ID.");
            return;
        }
        setError(null);
        const dataPoint = dataPoints.find(dp => dp.id === id);
        if (dataPoint) {
            setQuery(dataPoint.productionSqlExpression);
            setLoadedMetricId(id);
            setFeedbackMessage(`Loaded SQL for metric ID: ${id}`);
        } else {
            setError(`Metric with ID ${id} not found.`);
            setLoadedMetricId(null);
        }
    };

    const handleSaveQuery = () => {
        if (loadedMetricId === null) {
            setError("You must first load a query by ID to save it.");
            return;
        }
        try {
            updateDataPoint(loadedMetricId, 'productionSqlExpression', query);
            setFeedbackMessage(`Successfully saved SQL expression for metric ID: ${loadedMetricId}.`);
            setError(null);
        } catch(e) {
             const message = e instanceof Error ? e.message : "An unknown error occurred during save.";
             setError(message);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setResult(null);
        try {
            const response = await generateSqlResponse(query, dataPoints);
            if(response.error){
                setError(response.error)
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
                Directly query the AI database engine. The AI has context of the table schemas.
                Try querying a sandboxed table like <code className="bg-secondary px-1 rounded">mcp_sandboxed_inv</code> to see the simulated error response.
            </p>

            <div className="mb-4 p-4 bg-secondary rounded-lg">
                <label htmlFor="metric-id" className="block text-sm font-medium text-text-secondary mb-2">
                    Load SQL by Metric ID
                </label>
                <div className="flex items-center space-x-2">
                    <input
                        type="number"
                        id="metric-id"
                        value={metricId}
                        onChange={(e) => setMetricId(e.target.value)}
                        className="w-32 bg-primary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm"
                        placeholder="Enter ID..."
                    />
                    <button
                        onClick={handleLoadQuery}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                        Load
                    </button>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label htmlFor="sql-query" className="block text-sm font-medium text-text-secondary mb-2">
                        SQL Query
                    </label>
                    <textarea
                        id="sql-query"
                        rows={8}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-secondary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm font-mono"
                        placeholder="Enter your SQL query here..."
                    />
                </div>
                 <div className="flex items-center space-x-4">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 font-semibold text-white bg-accent rounded-lg hover:bg-highlight focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-primary disabled:bg-gray-500"
                    >
                        {isLoading ? 'Executing...' : 'Execute Query'}
                    </button>
                     <button
                        type="button"
                        onClick={handleSaveQuery}
                        disabled={loadedMetricId === null}
                        className="flex-1 px-4 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 focus:ring-offset-primary disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        Save to Metric ID: {loadedMetricId ?? 'N/A'}
                    </button>
                </div>
            </form>

            {(result || error || feedbackMessage) && (
                <div className="mt-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-2">Result</h3>
                    {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-2">{error}</div>}
                    {feedbackMessage && <div className="bg-blue-900/50 text-blue-300 p-3 rounded-md mb-2">{feedbackMessage}</div>}
                    {result && (
                        <pre className="bg-secondary p-4 rounded-md text-text-primary text-sm overflow-x-auto">
                            <code>{result}</code>
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
};

export default SqlQueryTool;