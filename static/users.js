// Script for user management (admin only)

document.addEventListener('DOMContentLoaded', () => {
  const email = localStorage.getItem('userEmail');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  // Redirect non‑authenticated users to login
  if (!email) {
    window.location.href = '/login.html';
    return;
  }
  // If not admin, redirect to main page
  if (!isAdmin) {
    window.location.href = '/';
    return;
  }
  // Populate nav bar user info
  document.getElementById('navUserEmail').textContent = email;
  // Show users link for admin
  document.getElementById('navUsersLink').style.display = 'inline-block';
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('userEmail');
    localStorage.removeItem('isAdmin');
    window.location.href = '/login.html';
  });
  // Load users
  loadUsers();
  // Handle creation form submission
  document.getElementById('createUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createUser();
  });
});

async function loadUsers() {
  const currentEmail = localStorage.getItem('userEmail');
  try {
    const res = await fetch('/api/users', {
      headers: { 'X-User-Email': currentEmail },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al obtener usuarios');
    }
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    (data.users || []).forEach((u) => {
      const tr = document.createElement('tr');
      const emailTd = document.createElement('td');
      emailTd.textContent = u.email;
      const roleTd = document.createElement('td');
      roleTd.textContent = u.is_admin ? 'Administrador' : 'Usuario';
      const actionsTd = document.createElement('td');
      // Prevent deleting self
      if (u.email !== currentEmail) {
        const delBtn = document.createElement('button');
        delBtn.classList.add('btn', 'btn-danger', 'btn-sm');
        delBtn.textContent = 'Eliminar';
        delBtn.addEventListener('click', () => deleteUser(u.email));
        actionsTd.appendChild(delBtn);
      }
      tr.appendChild(emailTd);
      tr.appendChild(roleTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
  } catch (err) {
    document.getElementById('userError').textContent = err.message;
  }
}

async function createUser() {
  const emailVal = document.getElementById('newUserEmail').value.trim();
  const passwordVal = document.getElementById('newUserPassword').value;
  const isAdminVal = document.getElementById('newUserRole').value === 'true';
  const currentEmail = localStorage.getItem('userEmail');
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': currentEmail,
      },
      body: JSON.stringify({ email: emailVal, password: passwordVal, is_admin: isAdminVal }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al crear usuario');
    }
    // Reset form and reload list
    document.getElementById('createUserForm').reset();
    loadUsers();
  } catch (err) {
    document.getElementById('userError').textContent = err.message;
  }
}

async function deleteUser(emailToDelete) {
  if (!confirm(`¿Deseas eliminar el usuario ${emailToDelete}?`)) return;
  const currentEmail = localStorage.getItem('userEmail');
  try {
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': currentEmail,
      },
      body: JSON.stringify({ email: emailToDelete }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al eliminar usuario');
    }
    loadUsers();
  } catch (err) {
    document.getElementById('userError').textContent = err.message;
  }
}