import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { safeLocalStorage } from '../services/storageService';

type Theme = 'light' | 'dark';

interface GlobalContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const GlobalProvider = ({ children }: { children: ReactNode }) => {
    const [theme, setTheme] = useState<Theme>(() => (safeLocalStorage.getItem('theme') as Theme) || 'dark');

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        safeLocalStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    return (
        <GlobalContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </GlobalContext.Provider>
    );
};

export const useGlobal = () => {
    const context = useContext(GlobalContext);
    if (context === undefined) {
        throw new Error('useGlobal must be used within a GlobalProvider');
    }
    return context;
};