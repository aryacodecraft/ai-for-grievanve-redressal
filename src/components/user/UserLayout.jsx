import React from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './UserLayout.css';

const UserLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="user-layout">
      <header className="user-header">
        <div className="container">
          <div className="user-header-content">
            <div className="user-logo">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 8L23 16H31L25 21L27 29L20 24L13 29L15 21L9 16H17L20 8Z" fill="currentColor"/>
              </svg>
              <div>
                <div className="portal-name">Citizen Portal</div>
                <div className="portal-subtitle">Grievance Redressal System</div>
              </div>
            </div>
            <div className="user-info">
              <div className="user-details">
                <div className="user-name">{user?.name}</div>
                <div className="user-email">{user?.email}</div>
              </div>
              <button onClick={handleLogout} className="btn btn-secondary btn-sm">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="user-main">
        <aside className="user-sidebar">
          <nav className="user-nav">
            <Link
              to="/user/dashboard"
              className={`nav-item ${isActive('/user/dashboard') ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>Dashboard</span>
            </Link>

            <Link
              to="/user/grievances"
              className={`nav-item ${isActive('/user/grievances') ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>My Grievances</span>
            </Link>

            <Link
              to="/user/new-grievance"
              className={`nav-item ${isActive('/user/new-grievance') ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>New Grievance</span>
            </Link>

            <Link
              to="/user/profile"
              className={`nav-item ${isActive('/user/profile') ? 'active' : ''}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Profile</span>
            </Link>
          </nav>
        </aside>

        <main className="user-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default UserLayout;
