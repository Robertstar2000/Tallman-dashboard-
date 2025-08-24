import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../Logo';
import { safeLocalStorage } from '../../services/storageService';

const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    
    const [attempts, setAttempts] = useState(0);
    const [lockout, setLockout] = useState<number | null>(null);

    useEffect(() => {
        const lockoutTime = safeLocalStorage.getItem('lockoutTime');
        if (lockoutTime) {
            const remaining = parseInt(lockoutTime, 10) - Date.now();
            if (remaining > 0) {
                setLockout(remaining);
                setTimeout(() => {
                    setLockout(null);
                    safeLocalStorage.removeItem('lockoutTime');
                }, remaining);
            } else {
                safeLocalStorage.removeItem('lockoutTime');
            }
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (lockout) {
            setError(`Too many failed attempts. Please try again in ${Math.ceil(lockout / 1000 / 60)} minutes.`);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await login(username, password);
            // On success, AuthProvider will redirect automatically
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unexpected server error occurred. Please try again later.');
            }
            
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);
            if (newAttempts >= 3) {
                const lockoutDuration = 15 * 60 * 1000; // 15 minutes
                const lockoutEndTime = Date.now() + lockoutDuration;
                safeLocalStorage.setItem('lockoutTime', lockoutEndTime.toString());
                setLockout(lockoutDuration);
                setAttempts(0);
                 setTimeout(() => {
                    setLockout(null);
                    safeLocalStorage.removeItem('lockoutTime');
                }, lockoutDuration);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
     if (lockout) {
        return (
             <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
                <div className="text-center p-8">
                    <h2 className="text-2xl font-bold text-red-500 mb-4">Account Locked</h2>
                    <p>Too many failed login attempts.</p>
                    <p>Please try again in {Math.ceil(lockout / 1000 / 60)} minutes.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="w-full max-w-md p-8 space-y-8 bg-primary rounded-2xl shadow-2xl m-4">
                <div className="text-center">
                     <Logo className="w-16 h-16 mx-auto text-accent"/>
                    <h1 className="mt-4 text-3xl font-bold text-text-primary">Tallman Equipment</h1>
                    <p className="mt-2 text-sm text-text-secondary">Please sign in to your account</p>
                </div>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="relative">
                        <input
                            id="username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 bg-secondary border border-transparent rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Username"
                        />
                    </div>
                    <div className="relative">
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                             value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-secondary border border-transparent rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Password"
                        />
                    </div>
                    
                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full px-4 py-3 font-semibold text-white bg-accent rounded-lg hover:bg-highlight focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-primary transition-colors duration-300 disabled:bg-gray-500"
                        >
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;