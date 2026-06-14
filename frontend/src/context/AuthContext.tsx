import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerUser: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async (authToken: string) => {
    try {
      const res = await api.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error('Failed to fetch user profiles:', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken) {
      setToken(storedToken);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
        setLoading(false);
        // Silently refresh user profile in background
        api.get('/api/auth/me')
          .then((res) => {
            setUser(res.data);
            localStorage.setItem('user', JSON.stringify(res.data));
          })
          .catch(() => {});
      } else {
        fetchCurrentUser(storedToken);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      const { access_token } = res.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      await fetchCurrentUser(access_token);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const registerUser = async (email: string, password: string, name: string) => {
    setLoading(true);
    try {
      await api.post('/api/auth/register', { email, password, name });
      // Automatically log in after registration
      await login(email, password);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, registerUser, logout, refreshUser }}>
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
