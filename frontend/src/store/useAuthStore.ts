import { create } from 'zustand';
import type { GoogleUser } from '@/lib/googleDrive';

interface AuthState {
    isInitialized: boolean;
    isAuthenticated: boolean;
    user: GoogleUser | null;
    // Actions
    setInitialized: (val: boolean) => void;
    setAuthenticated: (val: boolean) => void;
    setUser: (user: GoogleUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isInitialized: false,
    isAuthenticated: false,
    user: null,

    setInitialized: (val) => set({ isInitialized: val }),
    setAuthenticated: (val) => set({ isAuthenticated: val }),
    setUser: (user) => set({ user }),
}));
