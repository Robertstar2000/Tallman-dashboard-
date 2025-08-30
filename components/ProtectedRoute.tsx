import React, { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { UserRole } from '../types';

interface ProtectedRouteProps {
    children: ReactElement;
    requiredRole?: UserRole;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
    const { user, isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // If a specific role is required and the user doesn't have it, redirect.
    if (requiredRole && user?.role !== requiredRole) {
        // Redirect non-admins trying to access admin pages to the dashboard.
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
