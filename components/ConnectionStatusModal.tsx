import React from 'react';
import { ConnectionDetails } from '../types';

interface ConnectionStatusModalProps {
    details: ConnectionDetails[];
    onClose: () => void;
}

const ConnectionStatusModal: React.FC<ConnectionStatusModalProps> = ({ details, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-2xl w-full max-w-lg p-6 m-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-text-primary">Connection Status</h3>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary">&times;</button>
                </div>
                <div className="space-y-4">
                    {details.map((detail) => (
                        <div key={detail.name} className="bg-primary p-4 rounded-md">
                            <h4 className="font-semibold text-text-primary text-lg">{detail.name}</h4>
                            <div className="mt-2 text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-text-secondary">Status:</span>
                                    <span className={`font-bold ${detail.status === 'Connected' ? 'text-green-400' : 'text-red-400'}`}>{detail.status}</span>
                                </div>

                                {detail.responseTime !== undefined && (
                                    <div className="flex justify-between">
                                        <span className="text-text-secondary">Response Time:</span>
                                        <span>{detail.responseTime} ms</span>
                                    </div>
                                )}

                                {detail.version && (
                                    <div className="flex justify-between">
                                        <span className="text-text-secondary">Version:</span>
                                        <span>{detail.version}</span>
                                    </div>
                                )}

                                {detail.identifier && (
                                    <div className="flex justify-between">
                                        <span className="text-text-secondary">Identifier:</span>
                                        <span>{detail.identifier}</span>
                                    </div>
                                )}

                                {detail.size && (
                                    <div className="flex justify-between">
                                        <span className="text-text-secondary">DB Size:</span>
                                        <span>{detail.size}</span>
                                    </div>
                                )}

                                {detail.database && (
                                    <div className="flex justify-between">
                                        <span className="text-text-secondary">Database:</span>
                                        <span className="text-blue-400">{detail.database}</span>
                                    </div>
                                )}

                                {detail.errorType && (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between">
                                            <span className="text-text-secondary">Error Type:</span>
                                            <span className="text-orange-400">{detail.errorType}</span>
                                        </div>
                                    </div>
                                )}

                                {detail.error && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-text-secondary">Error:</span>
                                        <span className="text-red-400 break-words">{detail.error}</span>
                                    </div>
                                )}
                            </div>

                            {/* Enhanced Debug Information Section */}
                            {detail.debugInfo && (
                                <div className="mt-4 border-t border-gray-600 pt-3">
                                    <h5 className="text-sm font-semibold text-text-primary mb-2">🔍 Debug Information</h5>
                                    <div className="space-y-1 text-xs text-text-secondary bg-gray-800 rounded p-2">
                                        <div>Server URL: <span className="text-blue-300">{detail.debugInfo.serverUrl}</span></div>
                                        <div>Response Time: <span className="text-green-300">{detail.debugInfo.responseTime} ms</span></div>
                                        {detail.debugInfo.rawResult && (
                                            <div>
                                                <div className="mt-2 mb-1 text-xs text-text-primary font-medium">Server Response:</div>
                                                <pre className="text-xs bg-gray-900 p-2 rounded overflow-x-auto max-h-24 overflow-y-auto">
                                                    {JSON.stringify(detail.debugInfo.rawResult, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Debug Logs Section - Expandable */}
                            {detail.name === 'P21' && (
                                <div className="mt-3 border-t border-gray-600 pt-3">
                                    <h5 className="text-sm font-semibold text-text-primary mb-2">📋 Recent Activity</h5>
                                    <button
                                        onClick={() => { /* Could show/hide detailed logs */ }}
                                        className="text-xs text-accent hover:text-highlight underline"
                                    >
                                        View Console Logs (Check browser DevTools → Console)
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                 <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-accent hover:bg-highlight text-white rounded-md">Close</button>
                </div>
            </div>
        </div>
    );
};

export default ConnectionStatusModal;
