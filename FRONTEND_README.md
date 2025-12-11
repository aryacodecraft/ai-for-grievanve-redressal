# National Grievance Redressal Portal - Frontend

A government-style web portal built with React and Vite for managing public grievances. The portal includes a public landing page, citizen portal, and admin portal.

## Features

### Public Landing Page
- Government-style header with logo and navigation
- Hero section with portal description and CTA
- Services section showcasing key features
- Announcements and notices section
- About section
- Professional footer with contact information

### Citizen/User Portal
- Secure login and registration
- Dashboard with statistics and overview
- Submit new grievances with detailed forms
- Track submitted grievances with status updates
- Filter and search grievances
- User profile management
- Protected routes with authentication

### Admin Portal
- Admin-only authentication
- Comprehensive dashboard with system statistics
- View and manage all grievances
- Update grievance status with remarks
- User management
- Filter and search functionality
- Role-based access control

## Design Principles

The UI follows government portal design standards:
- Formal, serious, and professional appearance
- Clean layout with high contrast for accessibility
- Minimal color palette (dark blue, maroon, gold accents)
- No flashy animations or modern gradients
- Simple, rectangular buttons and forms
- Clear typography with good readability
- Responsive design for all devices

## Tech Stack

- **React 18** - UI library
- **React Router DOM** - Client-side routing
- **Axios** - HTTP client for API calls
- **Vite** - Build tool and dev server
- **CSS3** - Styling with CSS custom properties

## Project Structure

```
src/
├── components/
│   ├── landing/          # Public landing page components
│   │   ├── Header.jsx
│   │   ├── Footer.jsx
│   │   └── *.css
│   ├── user/             # User portal layout
│   │   ├── UserLayout.jsx
│   │   └── UserLayout.css
│   ├── admin/            # Admin portal layout
│   │   ├── AdminLayout.jsx
│   │   └── AdminLayout.css
│   └── auth/             # Authentication components
│       └── ProtectedRoute.jsx
├── pages/
│   ├── Home.jsx          # Landing page
│   ├── Login.jsx         # Citizen login
│   ├── Register.jsx      # Citizen registration
│   ├── AdminLogin.jsx    # Admin login
│   ├── user/             # User portal pages
│   │   ├── Dashboard.jsx
│   │   ├── NewGrievance.jsx
│   │   ├── Grievances.jsx
│   │   └── Profile.jsx
│   └── admin/            # Admin portal pages
│       ├── AdminDashboard.jsx
│       ├── AdminGrievances.jsx
│       └── AdminUsers.jsx
├── context/
│   └── AuthContext.jsx   # Authentication context
├── services/
│   └── api.js            # API service layer
├── styles/
│   └── index.css         # Global styles
├── App.jsx               # Main app component with routing
└── main.jsx              # Application entry point
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```env
VITE_API_URL=http://localhost:10000/api
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## Backend Integration

The frontend expects a backend API at the URL specified in `VITE_API_URL`. See `API_ENDPOINTS.md` for complete API documentation.

Key integration points:
- All API calls are made through the `services/api.js` layer
- Authentication tokens are stored in localStorage
- Axios interceptors handle token injection and 401 errors
- Protected routes check authentication status

## Authentication Flow

1. User logs in via `/login` or `/admin/login`
2. Backend returns JWT token and user data
3. Token is stored in localStorage
4. Token is attached to all subsequent API requests
5. On 401 error, user is redirected to login
6. Protected routes verify token before rendering

## Route Protection

- **Public routes:** /, /login, /register, /admin/login
- **User routes:** /user/* (requires authentication)
- **Admin routes:** /admin/* (requires authentication + admin role)

## Customization

### Colors
Update CSS custom properties in `src/styles/index.css`:
```css
:root {
  --primary-color: #0d3b66;
  --secondary-color: #1e5a8e;
  --accent-color: #b8860b;
  /* ... */
}
```

### Logo
Replace the SVG logo in:
- `src/components/landing/Header.jsx`
- `src/pages/Login.jsx`
- Admin login and layouts

### Portal Name
Update portal name and department in header components.

### Content
Update static content in:
- Home page hero section
- About section text
- Footer contact details
- Service descriptions

## API Service Layer

All API calls go through `src/services/api.js`:

```javascript
import { authService, grievanceService, userService } from './services/api';

// Authentication
await authService.login(email, password);
await authService.register(userData);

// Grievances
await grievanceService.getUserGrievances();
await grievanceService.createGrievance(data);

// Admin
await grievanceService.updateGrievanceStatus(id, status, remarks);
```

## Deployment

### Prerequisites
- Backend API must be deployed and accessible
- Update `VITE_API_URL` in `.env` to point to production API

### Steps
1. Build the project: `npm run build`
2. Deploy the `dist/` directory to your hosting service
3. Configure routing to serve index.html for all routes
4. Ensure CORS is properly configured on the backend

### Hosting Options
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Any static hosting service

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Accessibility

- High contrast text for readability
- Keyboard navigation support
- Focus states on interactive elements
- Semantic HTML structure
- ARIA labels where appropriate

## Missing Backend Implementation

If your backend doesn't have these endpoints yet, refer to `API_ENDPOINTS.md` for:
- Required endpoint URLs and methods
- Request/response formats
- Authentication requirements
- Error handling

## Development Notes

- Use `npm run dev` for hot-reload during development
- The dev server proxies `/api` requests to `http://localhost:10000`
- Update proxy configuration in `vite.config.js` if backend runs on different port

## Future Enhancements

Potential features to add:
- File upload for grievance attachments
- Real-time notifications
- Advanced analytics dashboard
- Export grievances to PDF/Excel
- SMS/Email notification integration
- Multi-language support
- Dark mode toggle
- Grievance escalation workflow
- Chat support
- Mobile app

## License

Government of India - All Rights Reserved

## Support

For technical support or questions, contact the development team.
