const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Database setup
const db = new sqlite3.Database('./database/devboard.db');

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        temp_password BOOLEAN DEFAULT 0,
        role TEXT DEFAULT 'developer',
        profile_picture TEXT,
        custom_link TEXT UNIQUE,
        developer_code TEXT,
        last_security_check DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tasks table
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'not-started',
        priority TEXT DEFAULT 'medium',
        assigned_to INTEGER,
        created_by INTEGER,
        due_date DATE,
        game TEXT,
        claimable BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users (id),
        FOREIGN KEY (created_by) REFERENCES users (id)
    )`);

    // Notifications table
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Project data table
    db.run(`CREATE TABLE IF NOT EXISTS project_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert Project 1 data
    db.run(`INSERT OR IGNORE INTO project_data (key, value) VALUES 
        ('project_name', 'Project 1'),
        ('project_platform', 'development'),
        ('project_status', 'development')`);

    // Create admin user if not exists
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (username, email, password, role) VALUES 
        ('admin', 'admin@project1.com', ?, 'admin')`, [adminPassword], function(err) {
        if (err) {
            console.error('Error creating admin user:', err);
        } else {
            console.log('Admin user ready - username: admin, password: admin123');
        }
    });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'project1-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// File upload setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './public/uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

const requireRole = (role) => (req, res, next) => {
    if (req.session.userRole !== role && req.session.userRole !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    if (!req.session.userId) {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    } else {
        // Check if user needs to reset temp password
        db.get('SELECT temp_password FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err) return res.status(500).send('Database error');
            
            if (user && user.temp_password) {
                res.sendFile(path.join(__dirname, '../public/password-reset.html'));
            } else {
                res.sendFile(path.join(__dirname, '../public/index.html'));
            }
        });
    }
});

// Auth routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.userRole = user.role;
        
        // Check if temp password
        if (user.temp_password) {
            return res.json({ 
                success: true,
                tempPassword: true,
                user: { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role 
                } 
            });
        }
        
        res.json({ 
            success: true, 
            user: { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                profile_picture: user.profile_picture 
            } 
        });
    });
});

// Reset password for temp users
app.post('/api/reset-password', requireAuth, (req, res) => {
    const { newPassword } = req.body;
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    db.run('UPDATE users SET password = ?, temp_password = 0 WHERE id = ?',
        [hashedPassword, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
        [username, email, hashedPassword], function(err) {
        if (err) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        res.json({ success: true, userId: this.lastID });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, redirect: '/login.html' });
    });
});

// User routes
app.get('/api/users', requireAuth, (req, res) => {
    db.all('SELECT id, username, email, role, profile_picture, created_at FROM users', (err, users) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(users);
    });
});

app.get('/api/me', requireAuth, (req, res) => {
    db.get('SELECT id, username, email, role, profile_picture FROM users WHERE id = ?', 
        [req.session.userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(user);
    });
});

// Task routes
app.get('/api/tasks', requireAuth, (req, res) => {
    const query = `
        SELECT t.*, 
               u1.username as assigned_username,
               u2.username as created_username
        FROM tasks t
        LEFT JOIN users u1 ON t.assigned_to = u1.id
        LEFT JOIN users u2 ON t.created_by = u2.id
        ORDER BY t.created_at DESC
    `;
    
    db.all(query, (err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(tasks);
    });
});

app.post('/api/tasks', requireAuth, (req, res) => {
    const { title, description, status = 'not-started', priority = 'medium', assigned_to, due_date, game, is_claimable } = req.body;
    
    if (!title || title.trim() === '') {
        return res.status(400).json({ error: 'Task title is required' });
    }
    
    const claimable = is_claimable ? 1 : 0;
    const finalAssignedTo = is_claimable ? null : (assigned_to || null);
    
    db.run(`INSERT INTO tasks (title, description, status, priority, assigned_to, created_by, due_date, game, claimable) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title.trim(), description || '', status, priority, finalAssignedTo, req.session.userId, due_date || null, game || null, claimable],
        function(err) {
            if (err) {
                console.error('Task creation error:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('Task created successfully:', this.lastID);
            
            // Emit real-time update
            io.emit('taskCreated', { id: this.lastID, title, assigned_to: finalAssignedTo, claimable });
            
            res.json({ success: true, taskId: this.lastID });
        });
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
    const { title, description, status, priority, assigned_to, due_date, game } = req.body;
    
    db.run(`UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, 
            assigned_to = ?, due_date = ?, game = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, description, status, priority, assigned_to, due_date, game, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            io.emit('taskUpdated', { id: req.params.id, status });
            
            res.json({ success: true });
        });
});

app.delete('/api/tasks/:id', requireAuth, requireRole('admin'), (req, res) => {
    db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
        
        io.emit('taskDeleted', { id: req.params.id });
        res.json({ success: true });
    });
});

// Dashboard stats for community managers
app.get('/api/dashboard/stats', requireAuth, requireRole('community_manager'), (req, res) => {
    const queries = {
        totalTasks: 'SELECT COUNT(*) as count FROM tasks',
        completedTasks: 'SELECT COUNT(*) as count FROM tasks WHERE status = "done"',
        inProgressTasks: 'SELECT COUNT(*) as count FROM tasks WHERE status = "in-progress"',
        overdueTasks: 'SELECT COUNT(*) as count FROM tasks WHERE due_date < date("now") AND status != "done"',
        tasksByDeveloper: `
            SELECT u.username, u.profile_picture,
                   COUNT(t.id) as total_tasks,
                   COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_tasks
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to
            WHERE u.role = 'developer'
            GROUP BY u.id, u.username
        `
    };
    
    const results = {};
    let completed = 0;
    const total = Object.keys(queries).length;
    
    Object.entries(queries).forEach(([key, query]) => {
        db.all(query, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            results[key] = key === 'tasksByDeveloper' ? rows : rows[0].count;
            completed++;
            
            if (completed === total) {
                res.json(results);
            }
        });
    });
});

// Profile picture upload
app.post('/api/upload/profile', requireAuth, upload.single('profile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const profilePicture = '/uploads/' + req.file.filename;
    
    db.run('UPDATE users SET profile_picture = ? WHERE id = ?', 
        [profilePicture, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, profile_picture: profilePicture });
    });
});



// Custom link access
app.get('/dev/:link', (req, res) => {
    const { link } = req.params;
    
    db.get('SELECT * FROM users WHERE custom_link = ?', [link], (err, user) => {
        if (err || !user) {
            return res.status(404).send('Invalid link');
        }
        
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.userRole = user.role;
        req.session.customAccess = true;
        
        res.redirect('/');
    });
});

// Security check
app.post('/api/security-check', requireAuth, (req, res) => {
    const { developerCode } = req.body;
    
    db.get('SELECT developer_code FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user || user.developer_code !== developerCode) {
            return res.status(401).json({ error: 'Invalid developer code' });
        }
        
        db.run('UPDATE users SET last_security_check = CURRENT_TIMESTAMP WHERE id = ?', 
            [req.session.userId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Claim task
app.post('/api/tasks/:id/claim', requireAuth, (req, res) => {
    db.run('UPDATE tasks SET assigned_to = ?, claimable = 0 WHERE id = ? AND claimable = 1 AND assigned_to IS NULL',
        [req.session.userId, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(400).json({ error: 'Task not available or already claimed' });
        
        io.emit('taskClaimed', { id: req.params.id, userId: req.session.userId });
        res.json({ success: true });
    });
});

// Get claimable tasks
app.get('/api/tasks/claimable', requireAuth, (req, res) => {
    console.log('Fetching claimable tasks...');
    db.all('SELECT * FROM tasks WHERE claimable = 1 AND assigned_to IS NULL ORDER BY created_at DESC', (err, tasks) => {
        if (err) {
            console.error('Error fetching claimable tasks:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('Found claimable tasks:', tasks.length);
        res.json(tasks);
    });
});

// Debug endpoint to check all tasks
app.get('/api/debug/tasks', requireAuth, (req, res) => {
    db.all('SELECT id, title, claimable, assigned_to FROM tasks', (err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(tasks);
    });
});

// Get developers
app.get('/api/developers', requireAuth, (req, res) => {
    db.all(`SELECT u.id, u.username, u.email, u.profile_picture, u.created_at,
                   COUNT(t.id) as task_count,
                   COUNT(CASE WHEN t.status = 'done' THEN 1 END) as completed_count
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to
            WHERE u.role = 'developer'
            GROUP BY u.id
            ORDER BY u.created_at DESC`, (err, developers) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(developers);
    });
});

// Create developer
app.post('/api/developers', requireAuth, requireRole('community_manager'), (req, res) => {
    const { username, email, password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const customLink = Math.random().toString(36).substr(2, 16);
    const developerCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    db.run(`INSERT INTO users (username, email, password, temp_password, custom_link, developer_code, role) 
            VALUES (?, ?, ?, 0, ?, ?, 'developer')`,
        [username, email, hashedPassword, customLink, developerCode], function(err) {
        if (err) return res.status(400).json({ error: 'Username or email already exists' });
        
        res.json({ 
            success: true, 
            userId: this.lastID,
            customLink: `/dev/${customLink}`,
            developerCode
        });
    });
});

// Generate developer link
app.post('/api/developers/:id/link', requireAuth, requireRole('community_manager'), (req, res) => {
    const customLink = Math.random().toString(36).substr(2, 16);
    
    db.run('UPDATE users SET custom_link = ? WHERE id = ? AND role = "developer"',
        [customLink, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Developer not found' });
        
        const fullLink = `${req.protocol}://${req.get('host')}/dev/${customLink}`;
        res.json({ success: true, link: fullLink });
    });
});

// Send notification
app.post('/api/notifications', requireAuth, requireRole('community_manager'), (req, res) => {
    const { userId, title, message } = req.body;
    
    db.run('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
        [userId, title, message], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        io.to(`user_${userId}`).emit('notification', { id: this.lastID, title, message });
        res.json({ success: true });
    });
});

// Get notifications
app.get('/api/notifications', requireAuth, (req, res) => {
    db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
        [req.session.userId], (err, notifications) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(notifications);
    });
});

// Mark notification as read
app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
    db.run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Socket.io for real-time updates
io.on('connection', (socket) => {
    console.log('User connected');
    
    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Project 1 DevBoard running on port ${PORT}`);
});