import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="header-top">
        <div className="container">
          <div className="header-top-content">
            <div className="gov-emblem">
              <div className="emblem-placeholder">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2"/>
                  <path d="M20 8L23 16H31L25 21L27 29L20 24L13 29L15 21L9 16H17L20 8Z" fill="currentColor"/>
                </svg>
              </div>
              <div className="gov-text">
                <div className="gov-name">Government of India</div>
                <div className="dept-name">National Grievance Redressal Portal</div>
              </div>
            </div>
            <div className="header-links">
              <a href="#skip-to-main" className="skip-link">Skip to main content</a>
              <span className="header-divider">|</span>
              <a href="#accessibility">Accessibility</a>
              <span className="header-divider">|</span>
              <a href="#sitemap">Sitemap</a>
            </div>
          </div>
        </div>
      </div>
      <nav className="nav-bar">
        <div className="container">
          <ul className="nav-menu">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/services">Services</Link></li>
            <li><Link to="/guidelines">Guidelines</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li className="nav-login">
              <Link to="/login" className="btn-nav-login">Citizen Login</Link>
            </li>
            <li>
              <Link to="/admin/login" className="btn-nav-admin">Admin Login</Link>
            </li>
          </ul>
        </div>
      </nav>
    </header>
  );
};

export default Header;
