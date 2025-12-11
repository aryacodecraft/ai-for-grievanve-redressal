import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabaseGrievanceService, supabaseStatsService } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentGrievances, setRecentGrievances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    try {
      const [statsData, grievancesData] = await Promise.all([
        supabaseStatsService.getUserStats(user.id),
        supabaseGrievanceService.getUserGrievances(user.id)
      ]);
      setStats(statsData);
      setRecentGrievances(grievancesData.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      pending: 'badge-pending',
      'in-progress': 'badge-in-progress',
      approved: 'badge-approved',
      resolved: 'badge-approved',
      rejected: 'badge-rejected'
    };
    return statusMap[status] || 'badge-pending';
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Welcome, {user?.name}!</h1>
          <p>Manage and track your grievances from your dashboard</p>
        </div>
        <Link to="/user/new-grievance" className="btn btn-primary">
          + New Grievance
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats?.total || 0}</div>
            <div className="stat-label">Total Grievances</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fef3c7' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats?.pending || 0}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a8a" strokeWidth="2">
              <path d="M12 2v20M2 12h20"/>
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats?.inProgress || 0}</div>
            <div className="stat-label">In Progress</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d1fae5' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats?.resolved || 0}</div>
            <div className="stat-label">Resolved</div>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h2>Recent Grievances</h2>
          <Link to="/user/grievances">View All →</Link>
        </div>

        {recentGrievances.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentGrievances.map((grievance) => (
                  <tr key={grievance.id}>
                    <td>#{grievance.id}</td>
                    <td>{grievance.subject || grievance.title}</td>
                    <td>{grievance.category}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(grievance.status)}`}>
                        {grievance.status}
                      </span>
                    </td>
                    <td>{new Date(grievance.createdAt || grievance.date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <Link to={`/user/grievances/${grievance.id}`} className="btn btn-secondary btn-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <h3>No Grievances Yet</h3>
            <p>You haven't submitted any grievances. Click the button below to lodge your first complaint.</p>
            <Link to="/user/new-grievance" className="btn btn-primary">
              Lodge a Grievance
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
