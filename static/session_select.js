document.addEventListener('DOMContentLoaded', () => {
  const userEmail = localStorage.getItem('userEmail');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  if (!userEmail) {
    window.location.href = '/login.html';
    return;
  }
  const sessionsListDiv = document.getElementById('sessionsList');
  const newSessionBtn = document.getElementById('newSessionBtn');
  const modal = document.getElementById('createSessionModal');
  const modalClose = document.getElementById('createModalClose');
  const modalCancel = document.getElementById('createSessionCancel');
  const modalSave = document.getElementById('createSessionSave');

  // Load sessions available to user
  async function loadSessions() {
    sessionsListDiv.innerHTML = 'Cargando sesiones...';
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'X-User-Email': userEmail },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar sesiones');
      const sessions = data.sessions || [];
      if (sessions.length === 0) {
        sessionsListDiv.innerHTML = '<p>No tienes sesiones guardadas.</p>';
        return;
      }
      sessionsListDiv.innerHTML = '';
      sessions.forEach((sess) => {
        const btn = document.createElement('button');
        btn.classList.add('btn', 'btn-secondary', 'mb-2', 'w-100');
        btn.textContent = sess.name || `Sesión ${sess.id}`;
        btn.addEventListener('click', () => {
          // Redirect to index with session id
          window.location.href = `/?session=${sess.id}`;
        });
        sessionsListDiv.appendChild(btn);
      });
    } catch (err) {
      sessionsListDiv.innerHTML = `<div class="text-danger">${err.message}</div>`;
    }
  }

  loadSessions();

  // Show create session modal
  newSessionBtn.addEventListener('click', async () => {
    // Reset inputs
    document.getElementById('newSessionName').value = '';
    const list = document.getElementById('sessionUsersList');
    list.innerHTML = 'Cargando usuarios...';
    // Load users if admin; else only current user
    try {
      let usersList = [];
      if (isAdmin) {
        const res = await fetch('/api/users', { headers: { 'X-User-Email': userEmail } });
        const data = await res.json();
        if (res.ok && data.users) usersList = data.users;
      }
      if (usersList.length === 0) {
        usersList = [{ id: 0, email: userEmail }];
      }
      list.innerHTML = '';
      usersList.forEach((u) => {
        const div = document.createElement('div');
        div.classList.add('form-check');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.classList.add('form-check-input');
        input.id = `cs-user-${u.id}`;
        input.value = u.email;
        if (u.email === userEmail) {
          input.checked = true;
          input.disabled = true;
        }
        const label = document.createElement('label');
        label.classList.add('form-check-label');
        label.htmlFor = input.id;
        label.textContent = u.email;
        div.appendChild(input);
        div.appendChild(label);
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = `<div class="text-danger">Error al cargar usuarios</div>`;
    }
    modal.style.display = 'block';
  });

  function hideModal() {
    modal.style.display = 'none';
  }
  modalClose.addEventListener('click', hideModal);
  modalCancel.addEventListener('click', hideModal);
  // Save new session
  modalSave.addEventListener('click', async () => {
    const name = document.getElementById('newSessionName').value.trim();
    const selectedEmails = Array.from(document.querySelectorAll('#sessionUsersList input[type=checkbox]:checked')).map((cb) => cb.value);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({ name, document_ids: [], user_emails: selectedEmails.filter((e) => e !== userEmail) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear sesión');
      // hide modal and reload sessions
      hideModal();
      loadSessions();
      // redirect to new session page
      if (data.id || data.session_id) {
        const id = data.id || data.session_id;
        window.location.href = `/?session=${id}`;
      }
    } catch (err) {
      alert(err.message);
    }
  });
});