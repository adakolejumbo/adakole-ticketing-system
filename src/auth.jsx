import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const loadMeta = useCallback(async () => setMeta(await api('/meta')), []);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(async ({ user }) => {
        setUser(user);
        await loadMeta();
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [loadMeta]);

  const login = async (email, password) => {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    setUser(user);
    await loadMeta();
    return user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setMeta(null);
  };

  const staff = user && (user.role === 'agent' || user.role === 'admin');
  return (
    <AuthContext.Provider value={{ user, meta, loading, login, logout, reloadMeta: loadMeta, staff, admin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
