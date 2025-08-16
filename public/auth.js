// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update active form
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(tab + 'Form').classList.add('active');
    });
});

// Login form
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/';
        } else {
            showError('loginForm', data.error || 'Login failed');
        }
    } catch (error) {
        showError('loginForm', 'Network error');
    }
});

// Register form
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('registerForm', 'Registration successful! Please login.');
            // Switch to login tab
            document.querySelector('[data-tab="login"]').click();
        } else {
            showError('registerForm', data.error || 'Registration failed');
        }
    } catch (error) {
        showError('registerForm', 'Network error');
    }
});

function showError(formId, message) {
    clearMessages(formId);
    const form = document.getElementById(formId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    form.appendChild(errorDiv);
}

function showSuccess(formId, message) {
    clearMessages(formId);
    const form = document.getElementById(formId);
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    form.appendChild(successDiv);
}

function clearMessages(formId) {
    const form = document.getElementById(formId);
    const messages = form.querySelectorAll('.error, .success');
    messages.forEach(msg => msg.remove());
}