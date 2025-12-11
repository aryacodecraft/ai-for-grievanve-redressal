# Backend API Endpoints Documentation

This document lists all the API endpoints that the frontend expects from the backend. The backend server should implement these endpoints to ensure full integration with the frontend.

## Base URL
```
http://localhost:10000/api
```

For production, update `VITE_API_URL` in your `.env` file.

---

## Authentication Endpoints

### 1. User Login
**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "phone": "9876543210",
    "role": "citizen",
    "isAdmin": false,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "message": "Invalid email or password"
}
```

---

### 2. User Registration
**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "user@example.com",
  "phone": "9876543210",
  "password": "password123"
}
```

**Response (201 Created):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "message": "User already exists"
}
```

---

## Grievance Endpoints

### 3. Get All Grievances (Admin)
**Endpoint:** `GET /api/grievances`

**Headers:**
```
Authorization: Bearer {token}
```

**Query Parameters:**
- `limit` (optional): Number of results
- `status` (optional): Filter by status

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "subject": "Street light not working",
    "description": "The street light on XYZ road has been non-functional for 3 days",
    "category": "Public Services",
    "department": "Municipal Corporation",
    "status": "pending",
    "priority": "medium",
    "userId": 5,
    "userName": "John Doe",
    "userEmail": "user@example.com",
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-01T10:00:00Z"
  }
]
```

---

### 4. Get User's Grievances
**Endpoint:** `GET /api/grievances/user`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "subject": "Street light not working",
    "category": "Public Services",
    "department": "Municipal Corporation",
    "status": "pending",
    "createdAt": "2024-12-01T10:00:00Z"
  }
]
```

---

### 5. Get Grievance by ID
**Endpoint:** `GET /api/grievances/:id`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "subject": "Street light not working",
  "description": "Detailed description...",
  "category": "Public Services",
  "department": "Municipal Corporation",
  "status": "pending",
  "priority": "medium",
  "userId": 5,
  "userName": "John Doe",
  "remarks": null,
  "createdAt": "2024-12-01T10:00:00Z",
  "updatedAt": "2024-12-01T10:00:00Z"
}
```

---

### 6. Create New Grievance
**Endpoint:** `POST /api/grievances`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "category": "Public Services",
  "subject": "Street light not working",
  "description": "Detailed description of the issue",
  "department": "Municipal Corporation",
  "priority": "medium"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "subject": "Street light not working",
  "status": "pending",
  "createdAt": "2024-12-01T10:00:00Z",
  "message": "Grievance submitted successfully"
}
```

---

### 7. Update Grievance Status (Admin)
**Endpoint:** `PATCH /api/grievances/:id/status`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "status": "in-progress",
  "remarks": "Issue has been forwarded to the concerned department"
}
```

**Response (200 OK):**
```json
{
  "message": "Grievance status updated successfully",
  "grievance": {
    "id": 1,
    "status": "in-progress",
    "remarks": "Issue has been forwarded to the concerned department",
    "updatedAt": "2024-12-02T10:00:00Z"
  }
}
```

---

### 8. Delete Grievance (Admin)
**Endpoint:** `DELETE /api/grievances/:id`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "message": "Grievance deleted successfully"
}
```

---

## User Management Endpoints

### 9. Get All Users (Admin)
**Endpoint:** `GET /api/users`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "phone": "9876543210",
    "role": "citizen",
    "totalGrievances": 5,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

---

### 10. Get User by ID (Admin)
**Endpoint:** `GET /api/users/:id`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "user@example.com",
  "phone": "9876543210",
  "address": "123 Main St",
  "role": "citizen",
  "totalGrievances": 5,
  "resolvedGrievances": 3,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

### 11. Update User (Admin)
**Endpoint:** `PATCH /api/users/:id`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "name": "John Updated",
  "phone": "9999999999",
  "role": "admin"
}
```

**Response (200 OK):**
```json
{
  "message": "User updated successfully",
  "user": {
    "id": 1,
    "name": "John Updated",
    "phone": "9999999999"
  }
}
```

---

### 12. Update User Profile (Self)
**Endpoint:** `PATCH /api/users/profile`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "name": "John Updated",
  "phone": "9999999999",
  "address": "456 New Street"
}
```

**Response (200 OK):**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": 1,
    "name": "John Updated",
    "email": "user@example.com",
    "phone": "9999999999"
  }
}
```

---

### 13. Update User Role (Admin)
**Endpoint:** `PATCH /api/users/:id/role`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response (200 OK):**
```json
{
  "message": "User role updated successfully"
}
```

---

## Statistics Endpoints

### 14. Get Admin Statistics
**Endpoint:** `GET /api/stats/admin`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "totalGrievances": 150,
  "pendingGrievances": 45,
  "resolvedGrievances": 90,
  "totalUsers": 500,
  "resolutionRate": 85,
  "avgResolutionTime": 5,
  "todaySubmissions": 12
}
```

---

### 15. Get User Statistics
**Endpoint:** `GET /api/stats/user`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "total": 10,
  "pending": 3,
  "inProgress": 2,
  "resolved": 5
}
```

---

## Announcement Endpoints

### 16. Get All Announcements
**Endpoint:** `GET /api/announcements`

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "title": "System Maintenance Notice",
    "content": "The portal will undergo maintenance on Dec 15, 2024",
    "date": "2024-12-09T00:00:00Z",
    "createdAt": "2024-12-09T10:00:00Z"
  }
]
```

---

### 17. Create Announcement (Admin)
**Endpoint:** `POST /api/announcements`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "title": "New Feature Added",
  "content": "Citizens can now track grievances using mobile number"
}
```

**Response (201 Created):**
```json
{
  "message": "Announcement created successfully",
  "announcement": {
    "id": 2,
    "title": "New Feature Added",
    "content": "Citizens can now track grievances using mobile number"
  }
}
```

---

### 18. Delete Announcement (Admin)
**Endpoint:** `DELETE /api/announcements/:id`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "message": "Announcement deleted successfully"
}
```

---

## Status Values

Grievances can have the following status values:
- `pending` - Newly submitted, awaiting review
- `in-progress` - Being processed
- `resolved` - Successfully resolved
- `rejected` - Rejected with remarks

## Priority Values

- `low`
- `medium`
- `high`

## User Roles

- `citizen` - Regular user
- `admin` - Administrator with full access

---

## Authentication Notes

1. All protected endpoints require a valid JWT token in the Authorization header
2. Admin-only endpoints should check if the user has `role: 'admin'` or `isAdmin: true`
3. User-specific endpoints should only return data belonging to the authenticated user
4. JWT tokens should be validated on every request

---

## Error Handling

All endpoints should return appropriate HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

Error response format:
```json
{
  "message": "Error description"
}
```

---

## CORS Configuration

The backend should allow requests from the frontend origin and include appropriate CORS headers.

---

## Environment Variables

Backend should use:
- `PORT` - Server port (default: 10000)
- `JWT_SECRET` - Secret key for JWT signing
- Firebase configuration for Firestore database
- Any other service API keys (Groq, HuggingFace, etc.)
