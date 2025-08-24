import React from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDashboardData } from './services/useDashboardData';
import Dashboard from './components/Dashboard';
import Admin from './components/Admin';
import { GlobalProvider } from './components/contexts/GlobalContext';
import { AuthProvider } from './components/contexts/AuthContext';
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import UserManagementPage from './components/UserManagementPage';
import ErrorBoundary from './components/ErrorBoundary';
import SqlQueryTool from './components/SqlQueryTool';

// This new component loads data and then renders the nested routes for the main application layout.
const MainLayoutWithData = () => {
    const dashboardData = useDashboardData();
    console.log('[App.tsx/MainLayoutWithData] Rendering. isLoading:', dashboardData.isLoading, 'Data points:', dashboardData.dataPoints?.length);

    if (dashboardData.isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background font-sans">
                <p className="text-xl text-text-primary animate-pulse">Loading Dashboard Data...</p>
            </div>
        );
    }
    
    console.log('[App.tsx/MainLayoutWithData] Data loading complete. Rendering authenticated routes.');

    return (
        <div className="flex flex-col min-h-screen bg-background font-sans">
            <main className="p-4 sm:p-6 lg:p-8 flex-grow">
                 {/* This is the single, consolidated Routes block for the authenticated app */}
                <Routes>
                    <Route path="/" element={<Dashboard {...dashboardData} />} />
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute requiredRole="admin">
                                <Admin {...dashboardData} />
                            </ProtectedRoute>
                        }
                    />
                     <Route
                        path="/user-management"
                        element={
                            <ProtectedRoute requiredRole="admin">
                                <UserManagementPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/sql-query-tool"
                        element={
                            <ProtectedRoute requiredRole="admin">
                                <SqlQueryTool dataPoints={dashboardData.dataPoints} updateDataPoint={dashboardData.updateDataPoint} />
                            </ProtectedRoute>
                        }
                    />
                     {/* Any path not matched inside this layout redirects to the dashboard */}
                     <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </main>
        </div>
    );
};


function App() {
    return (
        <GlobalProvider>
            {/* Replaced HashRouter with MemoryRouter to avoid browser history API calls */}
            <MemoryRouter>
                <AuthProvider>
                    <ErrorBoundary>
                        {/* Simplified top-level routing to a single structure */}
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route
                                path="/*"
                                element={
                                    <ProtectedRoute>
                                        <MainLayoutWithData />
                                    </ProtectedRoute>
                                }
                            />
                        </Routes>
                    </ErrorBoundary>
                </AuthProvider>
            </MemoryRouter>
        </GlobalProvider>
    );
}

export default App;