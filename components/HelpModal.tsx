import React, { useState, useEffect } from 'react';

interface HelpModalProps {
    title: string;
    filePath: string;
    onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ title, filePath, onClose }) => {
    const [content, setContent] = useState('Loading...');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchContent = async () => {
            try {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`Failed to load help file: ${response.statusText}`);
                }
                const text = await response.text();
                setContent(text);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(`Could not load content from ${filePath}. ${message}`);
                setContent('');
            }
        };
        fetchContent();
    }, [filePath]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col p-6 m-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b border-primary pb-4">
                    <h3 className="text-xl font-bold text-text-primary">{title}</h3>
                    <button onClick={onClose} className="text-text-secondary text-2xl hover:text-text-primary">&times;</button>
                </div>
                <div className="overflow-y-auto pr-4 text-text-primary">
                    {error ? (
                        <div className="text-red-400">{error}</div>
                    ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                            {content}
                        </pre>
                    )}
                </div>
                 <div className="mt-6 flex justify-end border-t border-primary pt-4">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-accent hover:bg-highlight text-white rounded-md">Close</button>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
