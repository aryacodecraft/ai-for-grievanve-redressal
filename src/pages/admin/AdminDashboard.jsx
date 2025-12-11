import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabaseStatsService, supabaseGrievanceService } from '../../services/supabase';
import '../user/Dashboard.css';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentGrievances, setRecentGrievances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, grievancesData] = await Promise.all([
        supabaseStatsService.getAdminStats(),
        supabaseGrievanceService.getAllGrievances()
      ]);
      setStats(statsData);
      setRecentGrievances(grievancesData.slice(0, 10));
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
          <h1>Admin Dashboard</h1>
          <p>Overview of all grievances and system statistics</p>
        </div>
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
            <div className="stat-value">{stats?.totalGrievances || 0}</div>
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
            <div className="stat-value">{stats?.pendingGrievances || 0}</div>
            <div className="stat-label">Pending Review</div>
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
            <div className="stat-value">{stats?.resolvedGrievances || 0}</div>
            <div className="stat-label">Resolved</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#e0e7ff' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3730a3" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats?.totalUsers || 0}</div>
            <div className="stat-label">Registered Users</div>
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="dashboard-section">
          <div className="section-header">
            <h2>Recent Grievances</h2>
            <Link to="/admin/grievances">View All →</Link>
          </div>

          {recentGrievances.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGrievances.map((grievance) => (
                    <tr key={grievance.id}>
                      <td><strong>#{grievance.id}</strong></td>
                      <td>{grievance.subject || grievance.title}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(grievance.status)}`}>
                          {grievance.status}
                        </span>
                      </td>
                      <td>{new Date(grievance.createdAt || grievance.date).toLocaleDateString('en-IN')}</td>
                      <td>
                        <Link to={`/admin/grievances/${grievance.id}`} className="btn btn-secondary btn-sm">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No grievances found</p>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2>Quick Statistics</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card">
              <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Resolution Rate</h4>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary-color)' }}>
                {stats?.resolutionRate || 0}%
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                Average resolution rate this month
              </p>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Avg. Resolution Time</h4>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary-color)' }}>
                {stats?.avgResolutionTime || 0} days
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                Time taken to resolve grievances
              </p>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Today's Submissions</h4>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary-color)' }}>
                {stats?.todaySubmissions || 0}
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
                New grievances submitted today
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
