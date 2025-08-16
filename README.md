# DevBoard Web - Silent Knives Project Management

A multi-user web application for managing the Silent Knives Roblox game development project.

## Features

### Authentication
- User registration and login
- Role-based access (Developer, Community Manager, Admin)
- Profile picture uploads
- Session management

### Task Management
- Create and assign tasks to developers
- Task status tracking (Not Started, In Progress, Done)
- Priority levels (Low, Medium, High)
- Due date management
- Real-time updates via Socket.IO

### Dashboard (Community Managers)
- Project overview statistics
- Developer performance tracking
- Task completion metrics
- Visual progress indicators

### User Roles
- **Developer**: View assigned tasks, update task status
- **Community Manager**: Create tasks, assign to developers, view dashboard
- **Admin**: Full access to all features

## Installation

1. Navigate to the Website folder:
```bash
cd Website
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open http://localhost:3000

## Default Login
- Username: `admin`
- Password: `admin123`

## Database
Uses SQLite database stored in `database/devboard.db`

## File Structure
```
Website/
├── server/
│   └── app.js          # Express server with auth & API
├── public/
│   ├── index.html      # Main application
│   ├── login.html      # Authentication page
│   ├── app.js          # Frontend JavaScript
│   ├── auth.js         # Authentication logic
│   ├── styles.css      # Main styles
│   └── auth.css        # Auth page styles
├── database/           # SQLite database
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/register` - User registration
- `POST /api/logout` - User logout

### Users
- `GET /api/users` - Get all users
- `GET /api/me` - Get current user

### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### File Upload
- `POST /api/upload/profile` - Upload profile picture

## Deployment
For production deployment:
1. Set environment variables
2. Use a process manager like PM2
3. Configure reverse proxy (nginx)
4. Set up SSL certificate