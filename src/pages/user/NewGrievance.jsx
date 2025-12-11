import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseGrievanceService } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import './NewGrievance.css';

const NewGrievance = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    category: '',
    subject: '',
    description: '',
    department: '',
    priority: 'medium'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const categories = [
    'Public Services',
    'Healthcare',
    'Education',
    'Transportation',
    'Water Supply',
    'Electricity',
    'Sanitation',
    'Police',
    'Municipal Services',
    'Other'
  ];

  const departments = [
    'Municipal Corporation',
    'Health Department',
    'Education Department',
    'Public Works Department',
    'Police Department',
    'Water Authority',
    'Electricity Board',
    'Transport Department',
    'Other'
  ];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await supabaseGrievanceService.createGrievance(user.id, formData);
      setSuccess(`Grievance submitted successfully! Your tracking ID is: ${response.id}`);
      setTimeout(() => {
        navigate('/user/grievances');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to submit grievance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-grievance">
      <div className="page-header">
        <h1>Lodge a New Grievance</h1>
        <p>Fill in the details below to submit your complaint</p>
      </div>

      <div className="form-container">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="category" className="form-label">
                Category <span className="required">*</span>
              </label>
              <select
                id="category"
                name="category"
                className="form-select"
                value={formData.category}
                onChange={handleChange}
                required
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="department" className="form-label">
                Department <span className="required">*</span>
              </label>
              <select
                id="department"
                name="department"
                className="form-select"
                value={formData.department}
                onChange={handleChange}
                required
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="subject" className="form-label">
              Subject <span className="required">*</span>
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              className="form-input"
              value={formData.subject}
              onChange={handleChange}
              required
              placeholder="Brief summary of your grievance"
              maxLength="200"
            />
            <small className="form-help">Maximum 200 characters</small>
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Detailed Description <span className="required">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              className="form-textarea"
              value={formData.description}
              onChange={handleChange}
              required
              placeholder="Provide detailed information about your grievance"
              rows="6"
            ></textarea>
            <small className="form-help">Provide as much detail as possible to help us understand and resolve your issue</small>
          </div>

          <div className="form-group">
            <label htmlFor="priority" className="form-label">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              className="form-select"
              value={formData.priority}
              onChange={handleChange}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/user/dashboard')}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Grievance'}
            </button>
          </div>
        </form>

        <div className="form-info">
          <h3>Important Guidelines</h3>
          <ul>
            <li>Ensure all required fields are filled correctly</li>
            <li>Provide accurate and truthful information</li>
            <li>Avoid using abusive or offensive language</li>
            <li>Keep a note of your grievance tracking ID for future reference</li>
            <li>You will receive updates via email and SMS</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NewGrievance;
