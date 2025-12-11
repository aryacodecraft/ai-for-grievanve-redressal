import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-main">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-section">
              <h3>Contact Information</h3>
              <div className="footer-content">
                <p><strong>Helpline:</strong> 1800-XXX-XXXX</p>
                <p><strong>Email:</strong> grievance@gov.in</p>
                <p><strong>Office Hours:</strong> Mon-Fri, 9:00 AM - 6:00 PM</p>
                <p><strong>Address:</strong> Department of Administrative Reforms,<br/>
                   Government Secretariat, New Delhi - 110001</p>
              </div>
            </div>

            <div className="footer-section">
              <h3>Quick Links</h3>
              <ul className="footer-links">
                <li><Link to="/about">About Us</Link></li>
                <li><Link to="/guidelines">Guidelines</Link></li>
                <li><Link to="/faq">FAQ</Link></li>
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/feedback">Feedback</Link></li>
              </ul>
            </div>

            <div className="footer-section">
              <h3>Important Links</h3>
              <ul className="footer-links">
                <li><a href="https://india.gov.in" target="_blank" rel="noopener noreferrer">India.gov.in</a></li>
                <li><a href="https://mygov.in" target="_blank" rel="noopener noreferrer">MyGov</a></li>
                <li><a href="https://digitalindia.gov.in" target="_blank" rel="noopener noreferrer">Digital India</a></li>
                <li><Link to="/sitemap">Sitemap</Link></li>
                <li><Link to="/accessibility">Accessibility Statement</Link></li>
              </ul>
            </div>

            <div className="footer-section">
              <h3>Visitor Info</h3>
              <div className="footer-content">
                <p className="visitor-count">Total Visitors: 1,234,567</p>
                <p className="last-updated">Last Updated: December 9, 2024</p>
                <div className="social-links">
                  <a href="#" aria-label="Facebook">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
                    </svg>
                  </a>
                  <a href="#" aria-label="Twitter">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <div className="footer-bottom-content">
            <p>© 2024 Government of India. All Rights Reserved.</p>
            <p>Managed by Department of Administrative Reforms and Public Grievances</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
