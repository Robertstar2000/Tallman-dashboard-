import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import HelpModal from './HelpModal';
import { useGlobal } from './contexts/GlobalContext';
import { SunIcon, MoonIcon, PrintIcon, HelpIcon, LogoutIcon } from './icons';
import { ChartGroup } from '../types';

const Header: React.FC = () => {
    const { user, logout } = useAuth();
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const { theme, toggleTheme, selectedChartGroup, setSelectedChartGroup } = useGlobal();

    const handlePrint = () => {
        // This command opens the browser's system print dialog.
        window.print();
    };

    // Get available chart groups for the filter dropdown
    const chartGroups = ['All', ...Object.values(ChartGroup).filter(group => group !== ChartGroup.KEY_METRICS)];
    
    return (
        <>
            <header className="bg-primary shadow-md sticky top-0 z-50 no-print">
                <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-6">
                           <h1 className="text-2xl font-bold text-red-600">Tallman Leadership Dashboard</h1>
                           <div className="flex items-center space-x-2">
                               <span className="text-sm font-medium text-text-secondary">Filter:</span>
                               <select
                                   value={selectedChartGroup}
                                   onChange={(e) => setSelectedChartGroup(e.target.value)}
                                   className="bg-secondary text-text-primary p-2 rounded border border-transparent focus:border-accent focus:ring-0 text-sm min-w-[160px]"
                               >
                                   {chartGroups.map(group => (
                                       <option key={group} value={group}>{group}</option>
                                   ))}
                               </select>
                           </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            {user?.role === 'admin' && (
                                 <Link to="/admin" className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                                    Admin
                                </Link>
                            )}
                             <button onClick={toggleTheme} className="p-2 rounded-full text-text-secondary hover:bg-secondary hover:text-accent" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                                {theme === 'dark' ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
                            </button>
                            <button onClick={handlePrint} className="p-2 rounded-full text-text-secondary hover:bg-secondary hover:text-accent" title="Print Dashboard">
                                <PrintIcon className="w-6 h-6" />
                            </button>
                             <button onClick={() => setIsHelpModalOpen(true)} className="p-2 rounded-full text-text-secondary hover:bg-secondary hover:text-accent" title="Help">
                                <HelpIcon className="w-6 h-6" />
                            </button>
                            <button onClick={logout} className="p-2 rounded-full text-text-secondary hover:bg-secondary hover:text-accent" title="Logout">
                                <LogoutIcon className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>
            {isHelpModalOpen && <HelpModal title="Dashboard User Guide" filePath="/user_instruction.md" onClose={() => setIsHelpModalOpen(false)} />}
        </>
    );
};

export default Header;
