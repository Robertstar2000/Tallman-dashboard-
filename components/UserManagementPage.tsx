import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { User, UserRole } from '../types';
import * as authService from '../services/authService';

const UserManagementPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | Partial<User> | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const userList = await authService.getUsers();
            setUsers(userList);
        } catch (err: unknown) {
             const message = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`Failed to load users: ${message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const openModal = (user: User | null = null) => {
        if (user) {
            setCurrentUser({ ...user });
            setIsEditing(true);
        } else {
            setCurrentUser({ username: '', role: 'user' });
            setIsEditing(false);
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentUser(null);
    };

    const handleSave = async () => {
        if (!currentUser || !currentUser.username) {
            setError("Username is required.");
            return;
        }
        setError(null);
        try {
            if (isEditing && 'id' in currentUser) {
                await authService.updateUser(currentUser.id, { role: currentUser.role });
            } else {
                await authService.addUser(currentUser as Omit<User, 'id'>);
            }
            await fetchUsers();
            closeModal();
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred while saving the user.');
            }
        }
    };
    
    const handleDelete = async (id: number) => {
        if (window.confirm('Are you sure you want to delete this user?')) {
            try {
                await authService.deleteUser(id);
                await fetchUsers();
            } catch (err: unknown) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('An unexpected error occurred while deleting the user.');
                }
            }
        }
    };
    
    if (isLoading) {
        return <div className="text-center p-8">Loading users...</div>
    }

    return (
        <div className="bg-primary shadow-xl rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-text-primary">User Management</h2>
                <div className="flex items-center space-x-4">
                    <button onClick={() => openModal()} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                        Add User
                    </button>
                    <Link to="/admin" className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-highlight">
                        &larr; Back to Admin
                    </Link>
                </div>
            </div>
            
            {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4">{error}</div>}

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-secondary">
                    <thead className="bg-secondary">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Username</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase">Role</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-primary divide-y divide-secondary">
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td className="px-6 py-4 text-sm">{user.id}</td>
                                <td className="px-6 py-4 text-sm">{user.username}</td>
                                <td className="px-6 py-4 text-sm capitalize">{user.role}</td>
                                <td className="px-6 py-4 text-right text-sm space-x-2">
                                    <button onClick={() => openModal(user)} className="text-accent hover:underline">Edit</button>
                                    <button onClick={() => handleDelete(user.id)} className="text-red-500 hover:underline">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && currentUser && (
                 <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
                    <div className="bg-secondary rounded-lg shadow-2xl w-full max-w-md p-6 m-4">
                        <h3 className="text-lg font-bold mb-4">{isEditing ? 'Edit User' : 'Add User'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="username" className="block text-sm font-medium text-text-secondary">Username</label>
                                <input
                                    type="text"
                                    id="username"
                                    value={currentUser.username}
                                    onChange={(e) => setCurrentUser({ ...currentUser, username: e.target.value })}
                                    disabled={isEditing}
                                    className="mt-1 block w-full px-3 py-2 bg-primary rounded-md text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:bg-gray-700"
                                />
                            </div>
                            <div>
                                <label htmlFor="role" className="block text-sm font-medium text-text-secondary">Role</label>
                                <select
                                    id="role"
                                    value={currentUser.role}
                                    onChange={(e) => setCurrentUser({ ...currentUser, role: e.target.value as UserRole })}
                                    className="mt-1 block w-full pl-3 pr-10 py-2 bg-primary text-base border-gray-600 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm rounded-md"
                                >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-4">
                            <button onClick={closeModal} className="px-4 py-2 text-sm font-medium bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-highlight rounded-md">{isEditing ? 'Save Changes' : 'Add User'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagementPage;