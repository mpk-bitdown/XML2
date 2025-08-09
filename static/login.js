// Handle login form submission
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = '';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Credenciales incorrectas');
      }
      // Save user info in localStorage
      localStorage.setItem('userEmail', email);
      localStorage.setItem('isAdmin', data.is_admin ? 'true' : 'false');
      // Redirect to session selection page after successful login
      window.location.href = '/session_select.html';
    } catch (err) {
      errorDiv.textContent = err.message;
    }
  });
});