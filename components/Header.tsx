import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

const Header: React.FC = () => {
    const { user } = useAuth();
    
    return (
        <header className="bg-primary shadow-md sticky top-0 z-50">
            <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                       <h1 className="text-2xl font-bold text-red-600">Tallman Leadership Dashboard</h1>
                    </div>
                    <div className="flex items-center">
                        {user?.role === 'admin' && (
                             <Link to="/admin" className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                                Admin
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;