import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, supabaseAuthService } from '../services/supabase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const session = await supabaseAuthService.getSession();
        if (session?.user) {
          const currentUser = await supabaseAuthService.getCurrentUser();
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const currentUser = await supabaseAuthService.getCurrentUser();
          setUser(currentUser);
        } else {
          setUser(null);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const login = async (email, password) => {
    const data = await supabaseAuthService.signin(email, password);
    setUser(data.user);
    return data;
  };

  const register = async (userData) => {
    const data = await supabaseAuthService.signup(userData.email, userData.password, {
      name: userData.name,
      phone: userData.phone
    });
    return data;
  };

  const logout = async () => {
    await supabaseAuthService.signout();
    setUser(null);
  };

  const isAdmin = () => {
    return user?.role === 'admin' || user?.isAdmin === true;
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
