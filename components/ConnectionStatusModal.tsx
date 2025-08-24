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
                    {details.map((detail, index) => (
                        <div key={index} className="bg-primary p-4 rounded-md">
                            <h4 className="font-semibold text-text-primary text-lg">{detail.name}</h4>
                            <div className="mt-2 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                                <span className="text-text-secondary">Status:</span>
                                <span className={`font-bold ${detail.status === 'Connected' ? 'text-green-400' : 'text-red-400'}`}>{detail.status}</span>
                                
                                {detail.responseTime !== undefined && <>
                                    <span className="text-text-secondary">Response Time:</span>
                                    <span>{detail.responseTime} ms</span>
                                </>}
                                {detail.version && <>
                                    <span className="text-text-secondary">Version:</span>
                                    <span>{detail.version}</span>
                                </>}
                                 {detail.identifier && <>
                                    <span className="text-text-secondary">Identifier:</span>
                                    <span>{detail.identifier}</span>
                                </>}
                                {detail.size && <>
                                    <span className="text-text-secondary">DB Size:</span>
                                    <span>{detail.size}</span>
                                </>}
                                {detail.error && <>
                                    <span className="text-text-secondary">Error:</span>
                                    <span className="text-red-400 col-span-2">{detail.error}</span>
                                </>}
                            </div>
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
