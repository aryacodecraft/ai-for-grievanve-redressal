import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabaseGrievanceService } from '../../services/supabase';
import '../user/Grievances.css';

const AdminGrievances = () => {
  const [grievances, setGrievances] = useState([]);
  const [filteredGrievances, setFilteredGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrievance, setSelectedGrievance] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    status: '',
    remarks: ''
  });

  useEffect(() => {
    loadGrievances();
  }, []);

  useEffect(() => {
    filterGrievances();
  }, [filter, searchTerm, grievances]);

  const loadGrievances = async () => {
    try {
      const data = await supabaseGrievanceService.getAllGrievances();
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
          g.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.id?.toString().includes(searchTerm)
      );
    }

    setFilteredGrievances(filtered);
  };

  const handleUpdateStatus = (grievance) => {
    setSelectedGrievance(grievance);
    setUpdateForm({
      status: grievance.status,
      remarks: ''
    });
    setShowUpdateModal(true);
  };

  const submitStatusUpdate = async () => {
    try {
      await supabaseGrievanceService.updateGrievanceStatus(
        selectedGrievance.id,
        updateForm.status,
        updateForm.remarks
      );
      setShowUpdateModal(false);
      loadGrievances();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update grievance status');
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
    <div className="grievances-page">
      <div className="page-header">
        <div>
          <h1>All Grievances</h1>
          <p>Manage and review all submitted grievances</p>
        </div>
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
          <button
            className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected ({grievances.filter((g) => g.status === 'rejected').length})
          </button>
        </div>

        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search by ID, subject, or category..."
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
                <th>User</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrievances.map((grievance) => (
                <tr key={grievance.id}>
                  <td><strong>#{grievance.id}</strong></td>
                  <td>{grievance.subject || grievance.title}</td>
                  <td>{grievance.category}</td>
                  <td>{grievance.department}</td>
                  <td>{grievance.userName || grievance.userEmail || 'N/A'}</td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(grievance.status)}`}>
                      {grievance.status}
                    </span>
                  </td>
                  <td>{new Date(grievance.createdAt || grievance.date).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleUpdateStatus(grievance)}
                        className="btn btn-primary btn-sm"
                      >
                        Update
                      </button>
                    </div>
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
          <p>No grievances match your current filters</p>
        </div>
      )}

      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Update Grievance Status</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Grievance ID: #{selectedGrievance.id}
            </p>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={updateForm.status}
                onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value })}
              >
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea
                className="form-textarea"
                rows="4"
                value={updateForm.remarks}
                onChange={(e) => setUpdateForm({ ...updateForm, remarks: e.target.value })}
                placeholder="Add remarks or resolution notes..."
              />
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowUpdateModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={submitStatusUpdate}
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGrievances;
