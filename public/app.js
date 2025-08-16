// Initialize Socket.IO
const socket = io();

// Global variables
let currentUser = null;
let allTasks = [];
let allUsers = [];

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    
    // Redirect to login if not authenticated
    if (!currentUser) {
        window.location.href = '/login.html';
        return;
    }
    
    await loadUsers();
    await loadTasks();
    await loadClaimableTasks();
    setupEventListeners();
    setupSocketListeners();
    
    console.log('App initialized successfully');
    
    // Show tabs based on user role
    if (currentUser && (currentUser.role === 'community_manager' || currentUser.role === 'admin')) {
        document.querySelector('[data-tab="manage"]').style.display = 'block';
        document.querySelector('[data-tab="dashboard"]').style.display = 'block';
    } else {
        // Hide admin/manager tabs for regular developers
        document.querySelector('[data-tab="create-task"]').style.display = 'none';
        document.querySelector('[data-tab="manage"]').style.display = 'none';
        document.querySelector('[data-tab="dashboard"]').style.display = 'none';
        // Ensure claimable tab is visible for developers
        document.querySelector('[data-tab="claimable"]').style.display = 'block';
    }
});

// Load current user
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/me');
        if (response.ok) {
            currentUser = await response.json();
            updateUserProfile();
            
            // Show dashboard tab for community managers and admins
            if (currentUser.role === 'community_manager' || currentUser.role === 'admin') {
                document.getElementById('dashboardTab').style.display = 'block';
            }
        } else {
            currentUser = null;
        }
    } catch (error) {
        console.error('Failed to load user:', error);
        currentUser = null;
    }
}

// Update user profile display
function updateUserProfile() {
    document.getElementById('username').textContent = currentUser.username;
    if (currentUser.profile_picture) {
        document.getElementById('userAvatar').src = currentUser.profile_picture;
    }
}

// Load all users
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            allUsers = await response.json();
            populateAssignToSelect();
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

// Populate assign to select
function populateAssignToSelect() {
    const select = document.getElementById('assignToSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Developer</option><option value="claimable">Make Claimable</option>';
    
    allUsers.filter(user => user.role === 'developer').forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.username;
        select.appendChild(option);
    });
}

// Load tasks
async function loadTasks() {
    const container = document.getElementById('tasksGrid');
    if (container) {
        container.innerHTML = '<div class="loading-text"><div class="loading-spinner large"></div>Loading tasks...</div>';
    }
    
    try {
        const response = await fetch('/api/tasks');
        if (response.ok) {
            allTasks = await response.json();
            renderTasks();
        }
    } catch (error) {
        console.error('Failed to load tasks:', error);
        if (container) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Tasks</h3><p>Please refresh the page</p></div>';
        }
    }
}

// Render tasks
function renderTasks() {
    const container = document.getElementById('tasksGrid');
    const statusFilter = document.getElementById('statusFilter').value;
    
    // Filter tasks for current user or all tasks for managers
    let filteredTasks = allTasks;
    if (currentUser.role === 'developer') {
        filteredTasks = allTasks.filter(task => task.assigned_to === currentUser.id);
    }
    
    if (statusFilter !== 'all') {
        filteredTasks = filteredTasks.filter(task => task.status === statusFilter);
    }
    
    if (filteredTasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><h3>No Tasks</h3><p>No tasks found for the current filter</p></div>';
        return;
    }
    
    container.innerHTML = filteredTasks.map(task => `
        <div class="task-card" onclick="openTaskModal(${task.id})">
            <div class="task-title">${task.title}</div>
            <div class="task-meta">
                <span class="task-priority ${task.priority}">${task.priority}</span>
                <span class="task-status ${task.status}">${task.status.replace('-', ' ')}</span>
            </div>
            ${task.description ? `<div class="task-description">${task.description.substring(0, 100)}...</div>` : ''}
            <div class="task-meta">
                <span>Assigned: ${task.assigned_username || 'Unassigned'}</span>
                <span>Due: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}</span>
                ${task.game ? `<span>Game: ${task.game}</span>` : ''}
            </div>
            <div class="task-actions">
                <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); updateTaskStatus(${task.id}, '${getNextStatus(task.status)}')">
                    Next Status
                </button>
                ${currentUser.role === 'admin' ? `
                <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteTask(${task.id})">
                    <i class="fas fa-trash"></i>
                    Delete
                </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Get next status for task progression
function getNextStatus(currentStatus) {
    const statusFlow = {
        'not-started': 'in-progress',
        'in-progress': 'done',
        'done': 'not-started'
    };
    return statusFlow[currentStatus] || 'in-progress';
}

// Update task status
async function updateTaskStatus(taskId, newStatus) {
    try {
        const task = allTasks.find(t => t.id === taskId);
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...task, status: newStatus })
        });
        
        if (response.ok) {
            await loadTasks();
        }
    } catch (error) {
        console.error('Failed to update task:', error);
    }
}

// Open task modal
function openTaskModal(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const canEdit = currentUser.role === 'admin' || currentUser.role === 'community_manager';
    
    document.getElementById('taskModalTitle').textContent = task.title;
    document.getElementById('taskModalBody').innerHTML = `
        <form id="editTaskForm">
            <div class="form-group">
                <label>Title:</label>
                <input type="text" id="modalTitle" value="${task.title}" ${!canEdit ? 'readonly' : ''}>
            </div>
            <div class="form-group">
                <label>Status:</label>
                <select id="modalStatus" ${!canEdit ? 'disabled' : ''}>
                    <option value="not-started" ${task.status === 'not-started' ? 'selected' : ''}>Not Started</option>
                    <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                    <option value="done" ${task.status === 'done' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
            <div class="form-group">
                <label>Priority:</label>
                <select id="modalPriority" ${!canEdit ? 'disabled' : ''}>
                    <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                    <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                </select>
            </div>
            ${canEdit ? `
            <div class="form-group">
                <label>Assign to:</label>
                <select id="modalAssignTo">
                    <option value="">Unassigned</option>
                    ${allUsers.filter(u => u.role === 'developer').map(u => 
                        `<option value="${u.id}" ${task.assigned_to == u.id ? 'selected' : ''}>${u.username}</option>`
                    ).join('')}
                </select>
            </div>
            ` : `
            <div class="form-group">
                <label>Assigned to:</label>
                <span>${task.assigned_username || 'Unassigned'}</span>
            </div>
            `}
            <div class="form-group">
                <label>Due Date:</label>
                <input type="date" id="modalDueDate" value="${task.due_date || ''}" ${!canEdit ? 'readonly' : ''}>
            </div>
            <div class="form-group">
                <label>Game:</label>
                <input type="text" id="modalGame" value="${task.game || ''}" ${!canEdit ? 'readonly' : ''}>
            </div>
            <div class="form-group">
                <label>Description:</label>
                <textarea id="modalDescription" rows="4" ${!canEdit ? 'readonly' : ''}>${task.description || ''}</textarea>
            </div>
            ${canEdit ? `
            <div class="form-actions">
                <button type="button" class="btn btn-primary" onclick="updateModalTask(${task.id})">
                    Update Task
                </button>
            </div>
            ` : ''}
        </form>
    `;
    
    document.getElementById('taskModal').classList.add('active');
}

// Update task from modal
async function updateModalTask(taskId) {
    const taskData = {
        title: document.getElementById('modalTitle').value,
        status: document.getElementById('modalStatus').value,
        priority: document.getElementById('modalPriority').value,
        assigned_to: document.getElementById('modalAssignTo')?.value || null,
        due_date: document.getElementById('modalDueDate').value,
        game: document.getElementById('modalGame').value,
        description: document.getElementById('modalDescription').value
    };
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        
        if (response.ok) {
            await loadTasks();
            closeTaskModal();
            showNotification('success', 'Task Updated', 'Task has been updated successfully');
        } else {
            showNotification('error', 'Error', 'Failed to update task');
        }
    } catch (error) {
        console.error('Failed to update task:', error);
        showNotification('error', 'Error', 'Network error occurred');
    }
}

// Close task modal
function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // Task form
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const taskData = Object.fromEntries(formData.entries());
            
            console.log('Creating task with data:', taskData);
            
            // Handle claimable tasks
            if (taskData.assigned_to === 'claimable') {
                taskData.assigned_to = null;
                taskData.is_claimable = true;
            } else {
                taskData.is_claimable = false;
            }
            
            try {
                const response = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(taskData)
                });
                
                const result = await response.json();
                console.log('Task creation response:', result);
                
                if (response.ok) {
                    e.target.reset();
                    await loadTasks();
                    await loadClaimableTasks();
                    switchTab('tasks');
                    showNotification('success', 'Task Created', 'Task has been created successfully');
                } else {
                    showNotification('error', 'Error', result.error || 'Failed to create task');
                }
            } catch (error) {
                console.error('Failed to create task:', error);
                showNotification('error', 'Error', 'Network error occurred');
            }
        });
    } else {
        console.error('Task form not found');
    }
    
    // Status filter
    document.getElementById('statusFilter').addEventListener('change', renderTasks);
    
    // Profile upload
    document.getElementById('profileUpload').addEventListener('change', handleProfileUpload);
    
    // Create developer form
    document.getElementById('createDeveloperForm').addEventListener('submit', createDeveloper);
}

// Switch tabs
function switchTab(tabName) {
    // Clear dynamic content containers (except claimable tasks which will be reloaded)
    const dashboardStats = document.getElementById('dashboardStats');
    const developerOverview = document.getElementById('developerOverview');
    const developersList = document.getElementById('developersList');
    
    if (dashboardStats) dashboardStats.innerHTML = '';
    if (developerOverview) developerOverview.innerHTML = '';
    if (developersList) developersList.innerHTML = '';
    
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    let targetTab;
    switch(tabName) {
        case 'tasks': targetTab = 'tasksTab'; break;
        case 'create-task': targetTab = 'create-taskTab'; break;
        case 'claimable': targetTab = 'claimableTab'; break;
        case 'dashboard': targetTab = 'dashboardTab'; break;
        case 'manage': targetTab = 'manageTab'; break;
        default: targetTab = tabName + 'Tab';
    }
    
    document.getElementById(targetTab).classList.add('active');
    
    // Load data based on tab
    switch(tabName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'claimable':
            loadClaimableTasks();
            break;
        case 'manage':
            if (currentUser.role === 'community_manager' || currentUser.role === 'admin') {
                loadDevelopers();
            }
            break;
    }
}

// Load dashboard data
async function loadDashboardData() {
    if (currentUser.role !== 'community_manager' && currentUser.role !== 'admin') return;
    
    try {
        const response = await fetch('/api/dashboard/stats');
        if (response.ok) {
            const stats = await response.json();
            renderDashboard(stats);
        }
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

// Render dashboard
function renderDashboard(stats) {
    const dashboardTab = document.getElementById('dashboardTab');
    if (!dashboardTab || !dashboardTab.classList.contains('active')) return;
    
    const statsContainer = document.getElementById('dashboardStats');
    const developersContainer = document.getElementById('developerOverview');
    
    if (!statsContainer || !developersContainer) return;
    
    if (!stats) {
        statsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-chart-pie"></i><h3>Loading Dashboard</h3><p>Please wait...</p></div>';
        return;
    }
    
    // Render stats
    statsContainer.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-tasks"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${stats.totalTasks || 0}</div>
                    <div class="stat-label">Total Tasks</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon success"><i class="fas fa-check"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${stats.completedTasks || 0}</div>
                    <div class="stat-label">Completed</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon warning"><i class="fas fa-spinner"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${stats.inProgressTasks || 0}</div>
                    <div class="stat-label">In Progress</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon danger"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${stats.overdueTasks || 0}</div>
                    <div class="stat-label">Overdue</div>
                </div>
            </div>
        </div>
    `;
    
    // Render developer overview
    if (stats.tasksByDeveloper && stats.tasksByDeveloper.length > 0) {
        developersContainer.innerHTML = `
            <div class="developers-grid">
                ${stats.tasksByDeveloper.map(dev => `
                    <div class="developer-card">
                        <div class="developer-avatar">
                            <img src="${dev.profile_picture || '/uploads/default-avatar.png'}" alt="${dev.username}">
                        </div>
                        <div class="developer-info">
                            <h4>${dev.username}</h4>
                            <div class="developer-stats">
                                <span>Total: ${dev.total_tasks || 0}</span>
                                <span>Completed: ${dev.completed_tasks || 0}</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${dev.total_tasks > 0 ? (dev.completed_tasks / dev.total_tasks) * 100 : 0}%"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        developersContainer.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No Developers</h3><p>No developers found</p></div>';
    }
}

// Profile picture upload
function uploadProfilePicture() {
    document.getElementById('profileUpload').click();
}

async function handleProfileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('profile', file);
    
    try {
        const response = await fetch('/api/upload/profile', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('userAvatar').src = data.profile_picture;
        }
    } catch (error) {
        console.error('Failed to upload profile picture:', error);
    }
}

// Logout
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Load claimable tasks
async function loadClaimableTasks() {
    console.log('Loading claimable tasks...');
    const container = document.getElementById('claimableTasksGrid');
    if (container) {
        container.innerHTML = '<div class="loading-text"><div class="loading-spinner large"></div>Loading claimable tasks...</div>';
    }
    
    try {
        const response = await fetch('/api/tasks/claimable');
        if (response.ok) {
            const claimableTasks = await response.json();
            console.log('Claimable tasks loaded:', claimableTasks);
            renderClaimableTasks(claimableTasks);
        } else {
            console.error('Failed to load claimable tasks:', response.status);
            if (container) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Tasks</h3><p>Please refresh the page</p></div>';
            }
        }
    } catch (error) {
        console.error('Failed to load claimable tasks:', error);
        if (container) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Error Loading Tasks</h3><p>Please refresh the page</p></div>';
        }
    }
}

// Render claimable tasks
function renderClaimableTasks(tasks) {
    console.log('Rendering claimable tasks:', tasks);
    const container = document.getElementById('claimableTasksGrid');
    if (!container) {
        console.error('Claimable tasks container not found');
        return;
    }
    
    console.log('Container found, tasks count:', tasks ? tasks.length : 0);
    
    if (!tasks || tasks.length === 0) {
        console.log('No claimable tasks, showing empty state');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><h3>No Available Tasks</h3><p>All tasks are currently assigned or no claimable tasks exist</p></div>';
        return;
    }
    
    console.log('Rendering', tasks.length, 'claimable tasks');
    
    const html = tasks.map(task => `
        <div class="task-card claimable">
            <div class="task-title">${task.title}</div>
            <div class="task-meta">
                <span class="task-priority ${task.priority}">${task.priority}</span>
                <span class="task-status status-claimable">Available</span>
            </div>
            ${task.description ? `<div class="task-description">${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}</div>` : ''}
            <div class="task-meta">
                <span>Due: ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'}</span>
                ${task.game ? `<span>Game: ${task.game}</span>` : ''}
            </div>
            <div class="task-actions">
                <button class="btn btn-primary" onclick="claimTask(${task.id})">
                    <i class="fas fa-hand-paper"></i>
                    Claim Task
                </button>
            </div>
        </div>
    `).join('');
    
    console.log('Generated HTML:', html);
    container.innerHTML = html;
    console.log('Container after update:', container.innerHTML);
}

// Claim task
async function claimTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/claim`, {
            method: 'POST'
        });
        
        if (response.ok) {
            await loadTasks();
            await loadClaimableTasks();
            showNotification('success', 'Task Claimed', 'Task has been assigned to you');
        } else {
            const error = await response.json();
            showNotification('error', 'Error', error.error || 'Failed to claim task');
        }
    } catch (error) {
        console.error('Failed to claim task:', error);
        showNotification('error', 'Error', 'Failed to claim task');
    }
}

// Load developers (for manage tab)
async function loadDevelopers() {
    try {
        const response = await fetch('/api/developers');
        if (response.ok) {
            const developers = await response.json();
            renderDevelopers(developers);
        }
    } catch (error) {
        console.error('Failed to load developers:', error);
    }
}

// Render developers
function renderDevelopers(developers) {
    const manageTab = document.getElementById('manageTab');
    if (!manageTab || !manageTab.classList.contains('active')) return;
    
    const container = document.getElementById('developersList');
    if (!container) return;
    
    if (!developers || developers.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-user-plus"></i><h3>No Developers</h3><p>Add developers to get started</p></div>';
        return;
    }
    
    container.innerHTML = developers.map(dev => `
        <div class="developer-item">
            <div class="developer-avatar">
                <img src="${dev.profile_picture || '/uploads/default-avatar.png'}" alt="${dev.username}">
            </div>
            <div class="developer-info">
                <h4>${dev.username}</h4>
                <p>${dev.email}</p>
                <div class="developer-stats">
                    <span class="stat">Tasks: ${dev.task_count || 0}</span>
                    <span class="stat">Completed: ${dev.completed_count || 0}</span>
                </div>
            </div>
            <div class="developer-actions">
                <button class="btn btn-secondary" onclick="generateDeveloperLink(${dev.id})">
                    <i class="fas fa-link"></i>
                    Generate Link
                </button>
            </div>
        </div>
    `).join('');
}

// Show create developer modal
function showCreateDeveloperModal() {
    document.getElementById('createDeveloperModal').style.display = 'flex';
}

// Close create developer modal
function closeCreateDeveloperModal() {
    document.getElementById('createDeveloperModal').style.display = 'none';
}

// Close modal helper
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Show security modal
function showSecurityModal() {
    document.getElementById('securityModal').style.display = 'flex';
}

// Submit security check
function submitSecurityCheck() {
    const code = document.getElementById('developerCodeInput').value;
    if (!code) {
        showNotification('error', 'Error', 'Please enter your developer code');
        return;
    }
    
    fetch('/api/security-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerCode: code })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('securityModal').style.display = 'none';
            showNotification('success', 'Verified', 'Security check passed');
        } else {
            showNotification('error', 'Error', data.error || 'Invalid code');
        }
    })
    .catch(error => {
        console.error('Security check failed:', error);
        showNotification('error', 'Error', 'Network error');
    });
}

// Create developer
async function createDeveloper(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const developerData = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/developers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(developerData)
        });
        
        if (response.ok) {
            const result = await response.json();
            e.target.reset();
            closeCreateDeveloperModal();
            await loadDevelopers();
            showNotification('success', 'Developer Created', 'Developer account created successfully');
        }
    } catch (error) {
        console.error('Failed to create developer:', error);
        showNotification('error', 'Error', 'Failed to create developer');
    }
}

// Generate developer link
async function generateDeveloperLink(developerId) {
    try {
        const response = await fetch(`/api/developers/${developerId}/link`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            navigator.clipboard.writeText(result.link);
            showNotification('success', 'Link Generated', 'Developer link copied to clipboard');
        }
    } catch (error) {
        console.error('Failed to generate link:', error);
        showNotification('error', 'Error', 'Failed to generate link');
    }
}

// Show notification
function showNotification(type, title, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">
                <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}-circle"></i>
            </div>
            <div class="notification-text">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close" onclick="removeNotification(this.parentElement.parentElement)">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            removeNotification(notification);
        }
    }, 5000);
}

// Remove notification with animation
function removeNotification(notification) {
    notification.classList.add('removing');
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 300);
}

// Delete task (admin only)
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadTasks();
            await loadClaimableTasks();
            showNotification('success', 'Task Deleted', 'Task has been deleted successfully');
        } else {
            showNotification('error', 'Error', 'Failed to delete task');
        }
    } catch (error) {
        console.error('Failed to delete task:', error);
        showNotification('error', 'Error', 'Network error occurred');
    }
}

// Socket listeners
function setupSocketListeners() {
    socket.on('taskCreated', () => {
        loadTasks();
        loadClaimableTasks();
    });
    
    socket.on('taskUpdated', () => {
        loadTasks();
        loadClaimableTasks();
    });
    
    socket.on('taskClaimed', () => {
        loadTasks();
        loadClaimableTasks();
    });
}