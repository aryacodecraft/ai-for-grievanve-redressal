import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { announcementService } from '../services/api';
import './Home.css';

const Home = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      const data = await announcementService.getAllAnnouncements();
      setAnnouncements(data.slice(0, 5));
    } catch (error) {
      console.error('Failed to load announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="container">
          <div className="hero-content">
            <h1>National Grievance Redressal Portal</h1>
            <p className="hero-subtitle">
              A Government of India Initiative for Citizens to Register and Track Public Grievances
            </p>
            <p className="hero-description">
              Lodge your complaints and track their resolution status in a transparent and efficient manner.
              Your voice matters in building a better India.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-primary btn-large">
                Lodge a Grievance
              </Link>
              <Link to="/about" className="btn btn-secondary btn-large">
                Learn More
              </Link>
            </div>
            <div className="hero-stats">
              <div className="stat-item">
                <div className="stat-number">1.2M+</div>
                <div className="stat-label">Grievances Resolved</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">500K+</div>
                <div className="stat-label">Registered Citizens</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">85%</div>
                <div className="stat-label">Resolution Rate</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="services-section">
        <div className="container">
          <h2 className="section-title">Our Services</h2>
          <p className="section-subtitle">
            Comprehensive grievance management system for all citizens
          </p>
          <div className="services-grid">
            <div className="service-card">
              <div className="service-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              </div>
              <h3>Submit Grievance</h3>
              <p>Register your complaints online and receive a unique tracking number for follow-up.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3>Track Status</h3>
              <p>Monitor the progress of your grievance in real-time through our transparent tracking system.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h3>User Dashboard</h3>
              <p>Access your personalized dashboard to manage all your grievances in one place.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </div>
              <h3>Get Updates</h3>
              <p>Receive notifications via SMS and email at every stage of grievance resolution.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <h3>Document Upload</h3>
              <p>Attach relevant documents and evidence to support your grievance claim.</p>
            </div>

            <div className="service-card">
              <div className="service-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
              </div>
              <h3>Help & Support</h3>
              <p>Access comprehensive guidelines, FAQs, and helpdesk support for assistance.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="announcements-section">
        <div className="container">
          <h2 className="section-title">Announcements & Notices</h2>
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          ) : (
            <div className="announcements-container">
              {announcements.length > 0 ? (
                <div className="announcements-list">
                  {announcements.map((announcement) => (
                    <div key={announcement.id} className="announcement-item">
                      <div className="announcement-date">
                        {new Date(announcement.createdAt || announcement.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="announcement-content">
                        <h4>{announcement.title}</h4>
                        <p>{announcement.content || announcement.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="announcements-list">
                  <div className="announcement-item">
                    <div className="announcement-date">09 Dec 2024</div>
                    <div className="announcement-content">
                      <h4>System Maintenance Notice</h4>
                      <p>The portal will undergo scheduled maintenance on December 15, 2024, from 2:00 AM to 4:00 AM IST.</p>
                    </div>
                  </div>
                  <div className="announcement-item">
                    <div className="announcement-date">05 Dec 2024</div>
                    <div className="announcement-content">
                      <h4>New Features Added</h4>
                      <p>Citizens can now track their grievances using mobile number verification for enhanced security.</p>
                    </div>
                  </div>
                  <div className="announcement-item">
                    <div className="announcement-date">01 Dec 2024</div>
                    <div className="announcement-content">
                      <h4>Holiday Notice</h4>
                      <p>The grievance redressal offices will remain closed on December 25, 2024, on account of Christmas.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="about-section">
        <div className="container">
          <div className="about-grid">
            <div className="about-content">
              <h2>About the Portal</h2>
              <p>
                The National Grievance Redressal Portal is a centralized platform established by the
                Government of India to enable citizens to lodge their grievances to the public authorities
                and seek redressal in a time-bound manner.
              </p>
              <p>
                This initiative aims to promote transparency, accountability, and responsiveness in
                governance by providing citizens a single-window access to register complaints related
                to various government services and departments.
              </p>
              <div className="about-features">
                <div className="feature-item">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span>Transparent Process</span>
                </div>
                <div className="feature-item">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span>Time-bound Resolution</span>
                </div>
                <div className="feature-item">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span>Secure & Confidential</span>
                </div>
                <div className="feature-item">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span>24/7 Accessibility</span>
                </div>
              </div>
              <Link to="/about" className="btn btn-primary">Read More</Link>
            </div>
            <div className="about-image">
              <div className="image-placeholder">
                <svg width="100%" height="100%" viewBox="0 0 400 300" fill="none">
                  <rect width="400" height="300" fill="#e5e7eb"/>
                  <path d="M200 100L220 140H180L200 100Z" fill="#9ca3af"/>
                  <circle cx="200" cy="180" r="30" fill="#9ca3af"/>
                  <rect x="150" y="220" width="100" height="10" fill="#9ca3af"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
