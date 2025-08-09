// JavaScript for sessions page: list, view and delete document sessions

document.addEventListener('DOMContentLoaded', () => {
  const userEmail = localStorage.getItem('userEmail');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  if (!userEmail) {
    window.location.href = '/login.html';
    return;
  }
  // Update nav bar user and admin link
  const navEmailEl = document.getElementById('navUserEmail');
  if (navEmailEl) navEmailEl.textContent = userEmail;
  const usersLink = document.getElementById('navUsersLink');
  if (usersLink) usersLink.style.display = isAdmin ? 'inline-block' : 'none';
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = 'inline-block';
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('userEmail');
      localStorage.removeItem('isAdmin');
      window.location.href = '/login.html';
    });
  }
  // Load sessions
  loadSessions();
});

async function loadSessions() {
  const userEmail = localStorage.getItem('userEmail');
  try {
    const res = await fetch('/api/sessions', {
      headers: { 'X-User-Email': userEmail },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al obtener sesiones');
    }
    const sessions = data.sessions || [];
    renderSessionsTable(sessions);
  } catch (err) {
    alert(err.message);
  }
}

function renderSessionsTable(sessions) {
  const tbody = document.getElementById('sessionsBody');
  tbody.innerHTML = '';
  const currentUser = localStorage.getItem('userEmail');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  sessions.forEach((sess) => {
    const row = document.createElement('tr');
    // Name with link to view
    const nameCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `/?session=${sess.id}`;
    link.textContent = sess.name;
    nameCell.appendChild(link);
    row.appendChild(nameCell);
    // Date
    const dateCell = document.createElement('td');
    const dt = new Date(sess.created_at);
    dateCell.textContent = dt.toLocaleString();
    row.appendChild(dateCell);
    // Created by
    const createdCell = document.createElement('td');
    createdCell.textContent = sess.created_by || '-';
    row.appendChild(createdCell);
    // Documents count
    const docCountCell = document.createElement('td');
    docCountCell.textContent = sess.document_ids ? sess.document_ids.length : 0;
    row.appendChild(docCountCell);
    // Shared users count
    const sharedCell = document.createElement('td');
    const shared = sess.user_emails || [];
    // Exclude creator from count if present
    const countShared = shared.filter((u) => u !== sess.created_by).length;
    sharedCell.textContent = countShared;
    row.appendChild(sharedCell);
    // Actions
    const actionsCell = document.createElement('td');
    // Delete button if admin or creator
    if (isAdmin || currentUser === sess.created_by) {
      const delBtn = document.createElement('button');
      delBtn.classList.add('btn', 'btn-danger', 'btn-sm', 'me-2');
      delBtn.textContent = 'Eliminar';
      delBtn.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro de eliminar esta sesión?')) return;
        try {
          const res = await fetch(`/api/sessions/${sess.id}`, {
            method: 'DELETE',
            headers: { 'X-User-Email': currentUser },
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Error al eliminar la sesión');
          }
          loadSessions();
        } catch (err) {
          alert(err.message);
        }
      });
      actionsCell.appendChild(delBtn);
    }
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}