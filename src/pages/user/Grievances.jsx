import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabaseGrievanceService } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import './Grievances.css';

const Grievances = () => {
  const { user } = useAuth();
  const [grievances, setGrievances] = useState([]);
  const [filteredGrievances, setFilteredGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadGrievances();
    }
  }, [user]);

  useEffect(() => {
    filterGrievances();
  }, [filter, searchTerm, grievances]);

  const loadGrievances = async () => {
    try {
      const data = await supabaseGrievanceService.getUserGrievances(user.id);
      setGrievances(data);
      setFilteredGrievances(data);
    } catch (error) {
      console.error('Failed to load grievances:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterGrievances = () => {
    let filtered = grievances;

    if (filter !== 'all') {
      filtered = filtered.filter((g) => g.status === filter);
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (g) =>
          g.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredGrievances(filtered);
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
    <div className="grievances-page">
      <div className="page-header">
        <div>
          <h1>My Grievances</h1>
          <p>Track and manage all your submitted grievances</p>
        </div>
        <Link to="/user/new-grievance" className="btn btn-primary">
          + New Grievance
        </Link>
      </div>

      <div className="filters-section">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({grievances.length})
          </button>
          <button
            className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({grievances.filter((g) => g.status === 'pending').length})
          </button>
          <button
            className={`filter-tab ${filter === 'in-progress' ? 'active' : ''}`}
            onClick={() => setFilter('in-progress')}
          >
            In Progress ({grievances.filter((g) => g.status === 'in-progress').length})
          </button>
          <button
            className={`filter-tab ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            Resolved ({grievances.filter((g) => g.status === 'resolved').length})
          </button>
        </div>

        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search grievances..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredGrievances.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Category</th>
                <th>Department</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrievances.map((grievance) => (
                <tr key={grievance.id}>
                  <td><strong>#{grievance.id}</strong></td>
                  <td>{grievance.subject || grievance.title}</td>
                  <td>{grievance.category}</td>
                  <td>{grievance.department}</td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(grievance.status)}`}>
                      {grievance.status}
                    </span>
                  </td>
                  <td>{new Date(grievance.createdAt || grievance.date).toLocaleDateString('en-IN')}</td>
                  <td>
                    <Link to={`/user/grievances/${grievance.id}`} className="btn btn-secondary btn-sm">
                      View Details
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
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <h3>No Grievances Found</h3>
          <p>
            {searchTerm || filter !== 'all'
              ? 'Try adjusting your filters or search term'
              : 'You haven\'t submitted any grievances yet'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Grievances;
