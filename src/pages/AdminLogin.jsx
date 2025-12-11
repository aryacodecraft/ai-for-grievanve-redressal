import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const AdminLogin = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(formData.email, formData.password);

      if (isAdmin()) {
        navigate('/admin/dashboard');
      } else {
        setError('Access denied. Admin credentials required.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid admin credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-emblem">
            <svg width="60" height="60" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2"/>
              <path d="M20 8L23 16H31L25 21L27 29L20 24L13 29L15 21L9 16H17L20 8Z" fill="currentColor"/>
            </svg>
          </div>
          <h1>Admin Login</h1>
          <p>National Grievance Redressal Portal</p>
        </div>

        <div className="auth-card">
          <div className="alert alert-warning">
            <strong>Restricted Access:</strong> This portal is for authorized administrators only.
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Admin Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="Enter admin email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                className="form-input"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Enter admin password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Login as Admin'}
            </button>
          </form>

          <div className="auth-links" style={{ marginTop: '1.5rem' }}>
            <Link to="/">← Back to Home</Link>
            <Link to="/login">Citizen Login →</Link>
          </div>
        </div>

        <div className="auth-footer">
          <p>© 2024 Government of India. All Rights Reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
