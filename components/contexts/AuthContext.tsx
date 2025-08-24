import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, UserRole } from '../../types';
import * as authService from '../../services/authService';
import { safeSessionStorage } from '../../services/storageService';

interface AuthContextType {
    isAuthenticated: boolean;
    user: User | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'dashboard_user_session';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // On initial load, try to restore session from sessionStorage
        try {
            const storedSession = safeSessionStorage.getItem(SESSION_STORAGE_KEY);
            if (storedSession) {
                const sessionUser = JSON.parse(storedSession);
                // Validate the parsed object to ensure it's a valid user
                if (sessionUser && typeof sessionUser === 'object' && 'id' in sessionUser && 'username' in sessionUser && 'role' in sessionUser) {
                    setUser(sessionUser);
                } else {
                    // The stored object is not a valid user, clear it.
                    console.warn("Invalid user session found in storage. Clearing.");
                    safeSessionStorage.removeItem(SESSION_STORAGE_KEY);
                }
            }
        } catch (error: unknown) {
            console.error("Could not parse user session:", error instanceof Error ? error.message : String(error));
            // If parsing fails for any reason, clear the invalid item.
            safeSessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
    }, []);

    const login = async (username: string, password: string) => {
        try {
            const result = await authService.login(username, password);
            if (result.success && result.user) {
                const authenticatedUser: User = {
                    id: result.user.id,
                    username: result.user.username,
                    role: result.user.role as UserRole
                };
                setUser(authenticatedUser);
                safeSessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authenticatedUser));
                navigate('/', { replace: true });
            }
        } catch (error: unknown) {
           console.error("Login failed:", error);
           // Ensure that we always throw an Error object.
           if (error instanceof Error) {
               throw error;
           }
           throw new Error('An unknown login error occurred.');
        }
    };

    const logout = useCallback(() => {
        setUser(null);
        safeSessionStorage.removeItem(SESSION_STORAGE_KEY);
        navigate('/login', { replace: true });
    }, [navigate]);

    return (
        <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};