// Script for document management and dashboard visualization

// Base URL for backend API. Using 127.0.0.1 instead of localhost avoids
// certain security restrictions on some systems.
// When served via Flask on Railway, the frontend and backend live on the same domain.
// Use a relative path for the API so that it works in production and locally.
const API_BASE_URL = "/api";

// Arrays to hold supplier and document type filter state
let allSuppliers = [];
let selectedSuppliers = [];
let allDocTypes = [];
let selectedDocTypes = [];

// Pagination state for documents table
let allDocuments = [];
let currentPage = 1;
let itemsPerPage = 5;

// State for sorting documents table. Stores last sorted column index and direction.
let docSortState = { column: -1, ascending: true };

// Loader overlay control
function showLoader() {
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
}
function hideLoader() {
  const overlay = document.getElementById('loaderOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Session parameter from query string.  If present, documents are loaded
// from the corresponding session instead of global filters.  This allows
// viewing a saved session of documents.  We parse it once on load.
const urlParams = new URLSearchParams(window.location.search);
const sessionParam = urlParams.get('session');

/**
 * Display current session name in the documents header if sessionParam is present.
 * Fetch session details from backend and set badge text.
 */
async function displayCurrentSession() {
  if (!sessionParam) {
    // Hide session labels if no session in query
    const badge = document.getElementById('currentSessionBadge');
    if (badge) badge.textContent = '';
    const label = document.getElementById('currentSessionLabel');
    if (label) {
      label.style.display = 'none';
      label.textContent = '';
    }
    return;
  }
  const badge = document.getElementById('currentSessionBadge');
  const label = document.getElementById('currentSessionLabel');
  try {
    const userEmail = localStorage.getItem('userEmail') || '';
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionParam}`, {
      headers: { 'X-User-Email': userEmail },
    });
    const data = await res.json();
    const name = res.ok ? (data.name || `Sesión ${sessionParam}`) : `Sesión ${sessionParam}`;
    if (badge) badge.textContent = name;
    if (label) {
      label.textContent = name;
      label.style.display = 'inline-block';
    }
  } catch (err) {
    if (badge) badge.textContent = `Sesión ${sessionParam}`;
    if (label) {
      label.textContent = `Sesión ${sessionParam}`;
      label.style.display = 'inline-block';
    }
  }
}

// Global Chart.js styling to give a polished dashboard look similar to Tableau/Power BI
Chart.defaults.font.family = 'Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif';
Chart.defaults.color = '#343a40';
Chart.defaults.plugins.legend.position = 'bottom';

/**
 * Helper to render the supplier dropdown with checkboxes and search.
 */
function renderSuppliersDropdown() {
  const container = document.getElementById('supplierOptions');
  container.innerHTML = '';
  allSuppliers.forEach((sup) => {
    const div = document.createElement('div');
    div.classList.add('form-check');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.classList.add('form-check-input');
    input.id = `supplier-option-${sup.id}`;
    input.value = sup.id;
    input.checked = selectedSuppliers.includes(sup.id);
    input.addEventListener('change', () => {
      if (input.checked) {
        if (!selectedSuppliers.includes(sup.id)) selectedSuppliers.push(sup.id);
      } else {
        selectedSuppliers = selectedSuppliers.filter((id) => id !== sup.id);
      }
      // Update select-all checkbox state
      const selectAll = document.getElementById('supplier-select-all');
      selectAll.checked = selectedSuppliers.length === allSuppliers.length;
      updateSupplierToggleText();
    });
    const label = document.createElement('label');
    label.classList.add('form-check-label');
    label.htmlFor = input.id;
    label.textContent = sup.name;
    div.appendChild(input);
    div.appendChild(label);
    container.appendChild(div);
  });
  updateSupplierToggleText();
}

/**
 * Update the supplier dropdown toggle button text based on selections.
 */
function updateSupplierToggleText() {
  const toggle = document.getElementById('supplierDropdownToggle');
  if (!toggle) return;
  if (selectedSuppliers.length === 0 || selectedSuppliers.length === allSuppliers.length) {
    toggle.textContent = 'Todos';
  } else {
    toggle.textContent = `${selectedSuppliers.length} seleccionados`;
  }
}

/**
 * Helper to render the document type dropdown.
 */
function renderDocTypeDropdown() {
  const container = document.getElementById('docTypeOptions');
  container.innerHTML = '';
  allDocTypes.forEach((t) => {
    const div = document.createElement('div');
    div.classList.add('form-check');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.classList.add('form-check-input');
    const safeId = t.replace(/[^a-zA-Z0-9_-]/g, '');
    input.id = `doctype-option-${safeId}`;
    input.value = t;
    input.checked = selectedDocTypes.includes(t);
    input.addEventListener('change', () => {
      if (input.checked) {
        if (!selectedDocTypes.includes(t)) selectedDocTypes.push(t);
      } else {
        selectedDocTypes = selectedDocTypes.filter((v) => v !== t);
      }
      const selectAll = document.getElementById('docType-select-all');
      selectAll.checked = selectedDocTypes.length === allDocTypes.length;
      updateDocTypeToggleText();
    });
    const label = document.createElement('label');
    label.classList.add('form-check-label');
    label.htmlFor = input.id;
    label.textContent = t;
    div.appendChild(input);
    div.appendChild(label);
    container.appendChild(div);
  });
  updateDocTypeToggleText();
}

/**
 * Update document type toggle button text.
 */
function updateDocTypeToggleText() {
  const toggle = document.getElementById('docTypeDropdownToggle');
  if (!toggle) return;
  if (selectedDocTypes.length === 0 || selectedDocTypes.length === allDocTypes.length) {
    toggle.textContent = 'Todos';
  } else {
    toggle.textContent = `${selectedDocTypes.length} seleccionados`;
  }
}

let productChart = null;
let categoryChart = null;

/**
 * Fetch AI insights (suggestions and projections) and display them in the dashboard.
 */
async function loadAiInsights() {
  try {
    const response = await fetch(`${API_BASE_URL}/analytics/ai`);
    const data = await response.json();
    const suggDiv = document.getElementById("aiSuggestions");
    const projDiv = document.getElementById("aiProjections");
    if (!data || !data.suggestions) {
      suggDiv.textContent = "No hay sugerencias disponibles.";
      projDiv.textContent = "";
      return;
    }
    // Display suggestions as paragraphs
    suggDiv.innerHTML = data.suggestions
      .map((s) => `<p class="mb-1">${s}</p>`)
      .join("");
    // Build projections table
    const entries = Object.entries(data.projections || {});
    if (entries.length === 0) {
      projDiv.textContent = "No hay proyecciones disponibles.";
    } else {
      // Sort by projected total descending and take top 5
      entries.sort((a, b) => b[1].proyeccion_total - a[1].proyeccion_total);
      const topEntries = entries.slice(0, 5);
      let html = '<div class="table-responsive"><table class="table table-sm table-bordered"><thead><tr><th>Producto</th><th>Cant. actual</th><th>Proy. total</th></tr></thead><tbody>';
      topEntries.forEach(([name, stats]) => {
        html += `<tr><td>${name}</td><td>${stats.cantidad_actual.toFixed(0)}</td><td>${stats.proyeccion_total.toFixed(0)}</td></tr>`;
      });
      html += '</tbody></table></div>';
      projDiv.innerHTML = html;
    }
  } catch (err) {
    console.error("Error al obtener sugerencias de AI:", err);
  }
}

/**
 * Render the current page of documents based on pagination state.
 */
function renderDocumentsPage() {
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const docsToShow = allDocuments.slice(start, end);
  renderDocumentTable(docsToShow);
  updatePaginationControls();
}

/**
 * Update pagination controls (info text, disabled state) based on current state.
 */
function updatePaginationControls() {
  const totalPages = Math.ceil(allDocuments.length / itemsPerPage) || 1;
  // Update info text
  const infoSpan = document.getElementById("paginationInfo");
  infoSpan.textContent = `${currentPage} / ${totalPages}`;
  // Disable prev/next buttons when at bounds
  document.getElementById("prevPageBtn").disabled = currentPage <= 1;
  document.getElementById("nextPageBtn").disabled = currentPage >= totalPages;
  // Set select value to reflect current itemsPerPage
  const select = document.getElementById("itemsPerPageSelect");
  if (select.value !== String(itemsPerPage)) {
    select.value = String(itemsPerPage);
  }
}

/**
 * Toggle visibility of dashboard charts and metrics based on user selection.
 */
function toggleDashboards() {
  const showDocType = document.getElementById("toggleDocType").checked;
  const showSize = document.getElementById("toggleSize").checked;
  const showAvg = document.getElementById("toggleAvgPages").checked;
  const showProvider = document.getElementById("toggleProvider").checked;
  const showProductSummary = document.getElementById("toggleProductSummary").checked;
  const showProductMonthly = document.getElementById("toggleProductMonthly").checked;
  document.getElementById("docTypeChartContainer").style.display = showDocType ? "block" : "none";
  document.getElementById("fileSizeChartContainer").style.display = showSize ? "block" : "none";
  // The avg pages container has hidden attribute that we also handle in loadDashboard
  if (!showAvg) {
    document.getElementById("avgPagesContainer").style.display = "none";
  } else {
    // We will restore display when loadDashboard sets hidden false
    document.getElementById("avgPagesContainer").style.display = "block";
  }
  // Provider chart
  document.getElementById("providerChartContainer").style.display = showProvider ? "block" : "none";
  // Product summary
  document.getElementById("productSummaryChartContainer").style.display = showProductSummary ? "block" : "none";
  // Product monthly container
  document.getElementById("productMonthlyContainer").style.display = showProductMonthly ? "block" : "none";
}

/**
 * Export selected documents to CSV by calling backend API and triggering download.
 */
async function exportSelectedToCsv() {
  const checkboxes = document.querySelectorAll(".select-checkbox:checked");
  const ids = Array.from(checkboxes).map((cb) => parseInt(cb.value));
  try {
    // Build query string based on global filters only when no ids (exporting all filtered)
    const start = document.getElementById("startMonth").value;
    const end = document.getElementById("endMonth").value;
    const params = new URLSearchParams();
    if (!ids.length) {
      if (selectedSuppliers.length > 0 && selectedSuppliers.length < allSuppliers.length) {
        params.append('supplier', selectedSuppliers.join(','));
      }
      if (selectedDocTypes.length > 0 && selectedDocTypes.length < allDocTypes.length) {
        params.append('type', selectedDocTypes.join(','));
      }
      if (start) params.append('start', start);
      if (end) params.append('end', end);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/documents/csv${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const csvText = await response.text();
    if (!response.ok) {
      throw new Error("Error al generar el archivo CSV");
    }
    // Create blob and download
    const blob = new Blob([csvText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "documentos.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Check authentication. If no logged user, redirect to login page
  const userEmail = localStorage.getItem('userEmail');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  if (!userEmail) {
    // If user is not logged in, redirect to login page
    window.location.href = '/login.html';
    return;
  }
  // Update nav bar with user info
  const navEmailEl = document.getElementById('navUserEmail');
  if (navEmailEl) navEmailEl.textContent = userEmail;
  const usersLink = document.getElementById('navUsersLink');
  if (usersLink) usersLink.style.display = isAdmin ? 'inline-block' : 'none';
  // Also update users link in side navigation
  const sideUsersLink = document.getElementById('sideUsersLink');
  if (sideUsersLink) sideUsersLink.style.display = isAdmin ? 'block' : 'none';
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = 'inline-block';
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('userEmail');
      localStorage.removeItem('isAdmin');
      window.location.href = '/login.html';
    });
  }
  // If not viewing a session, redirect to session selection page
  if (!sessionParam) {
    window.location.href = '/session_select.html';
    return;
  }
  // Display current session name if applicable
  displayCurrentSession();
  // Load suppliers and document types for filters
  loadSuppliers();
  loadDocTypes();
  // Load existing documents and charts
  loadDocuments();
  loadProductChart();
  loadCategoryChart();
  // Set up upload form handler
  const uploadForm = document.getElementById("upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", handleUpload);
  }
  // CSV export button for documents
  const csvBtn = document.getElementById("exportCsvBtn");
  if (csvBtn) csvBtn.addEventListener("click", exportSelectedToCsv);
  // Pagination controls
  document.getElementById("itemsPerPageSelect").addEventListener("change", (e) => {
    itemsPerPage = parseInt(e.target.value, 10) || 5;
    currentPage = 1;
    renderDocumentsPage();
  });
  document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderDocumentsPage();
    }
  });
  document.getElementById("nextPageBtn").addEventListener("click", () => {
    const totalPages = Math.ceil(allDocuments.length / itemsPerPage) || 1;
    if (currentPage < totalPages) {
      currentPage++;
      renderDocumentsPage();
    }
  });
  // Delete all documents button
  document.getElementById("deleteAllBtn").addEventListener("click", async () => {
    if (!confirm("¿Estás seguro de eliminar todos los documentos? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/documents/delete_all`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Error al eliminar documentos");
      }
      await loadDocuments();
      await loadSuppliers();
      await loadDocTypes();
      // Reload charts after deletion
      await loadProductChart();
      await loadCategoryChart();
    } catch (err) {
      alert(err.message);
    }
  });

  // When viewing a saved session, disable destructive actions (delete all, purge)
  if (sessionParam) {
    const delBtn = document.getElementById('deleteAllBtn');
    const purgeBtn = document.getElementById('purgeDuplicatesBtn');
    if (delBtn) delBtn.style.display = 'none';
    if (purgeBtn) purgeBtn.style.display = 'none';
  }
  // Purge duplicate documents button
  document.getElementById('purgeDuplicatesBtn').addEventListener('click', async () => {
    if (!confirm('¿Deseas purgar los documentos duplicados? Esta acción eliminará documentos con el mismo proveedor, RUT, número de factura y artículos.')) return;
    try {
      showLoader();
      const res = await fetch(`${API_BASE_URL}/documents/purge_duplicates`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al purgar duplicados');
      await loadDocuments();
      await loadSuppliers();
      await loadDocTypes();
      await loadProductChart();
      await loadCategoryChart();
      alert(data.message || 'Duplicados eliminados correctamente');
    } catch (err) {
      alert(err.message);
    } finally {
      hideLoader();
    }
  });

  // Save session button opens modal and loads users
  const saveSessionBtn = document.getElementById('saveSessionBtn');
  if (saveSessionBtn) {
    saveSessionBtn.addEventListener('click', async () => {
      // Determine document IDs to include: selected checkboxes or all loaded
      const checked = Array.from(document.querySelectorAll('.select-checkbox:checked'));
      let docIds;
      if (checked.length > 0) {
        docIds = checked.map((cb) => parseInt(cb.value));
      } else {
        docIds = allDocuments.map((d) => d.id);
      }
      // Store ids on modal element for later use
      // Store selected document IDs in data attribute of modal
      const modalEl = document.getElementById('sessionModal');
      modalEl.dataset.docIds = JSON.stringify(docIds);
      // Clear previous selections
      document.getElementById('sessionName').value = '';
      const list = document.getElementById('sessionUsersList');
      list.innerHTML = '<div>Cargando usuarios...</div>';
        try {
        const userEmail = localStorage.getItem('userEmail') || '';
        const isAdmin = localStorage.getItem('isAdmin') === 'true';
        let usersList = [];
        if (isAdmin) {
          // Attempt to retrieve all users if admin
          const res = await fetch(`${API_BASE_URL}/users`, { headers: { 'X-User-Email': userEmail } });
          try {
            const data = await res.json();
            if (res.ok && data.users) {
              usersList = data.users;
            }
          } catch (_) { /* ignore */ }
        }
        // If not admin or fetch failed, include only current user
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
          input.id = `sess-user-${u.id}`;
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
        list.innerHTML = '<div>Error al cargar usuarios.</div>';
      }
      // Show modal by setting display style
      modalEl.style.display = 'block';
    });
  }

  // View sessions button navigates to sessions page
  const viewSessionsBtn = document.getElementById('viewSessionsBtn');
  if (viewSessionsBtn) {
    viewSessionsBtn.addEventListener('click', () => {
      window.location.href = '/sessions.html';
    });
  }

  // Modal save button to create session
  const sessionModalSaveBtn = document.getElementById('sessionModalSaveBtn');
  if (sessionModalSaveBtn) {
    sessionModalSaveBtn.addEventListener('click', async () => {
      const modalEl = document.getElementById('sessionModal');
      const docIdsStr = modalEl.dataset.docIds || '[]';
      let docIds;
      try { docIds = JSON.parse(docIdsStr); } catch (_) { docIds = []; }
      const name = document.getElementById('sessionName').value.trim();
      // Gather selected user emails
      const checkboxes = Array.from(document.querySelectorAll('#sessionUsersList input[type=checkbox]'));
      const userEmails = checkboxes.filter((cb) => cb.checked && !cb.disabled).map((cb) => cb.value);
      const userEmail = localStorage.getItem('userEmail') || '';
      try {
        const res = await fetch(`${API_BASE_URL}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': userEmail,
          },
          body: JSON.stringify({ name, document_ids: docIds, user_emails: userEmails }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al crear la sesión');
        }
        // Hide creation modal
        modalEl.style.display = 'none';
        // After saving session, offer to associate documents to another saved session via new modal
        if (docIds.length > 0) {
          // Populate associate modal with list of sessions
          const assocModal = document.getElementById('associateSessionModal');
          const listDiv = document.getElementById('associateSessionsList');
          listDiv.innerHTML = 'Cargando sesiones...';
          try {
            const sessionsRes = await fetch(`${API_BASE_URL}/sessions`, {
              headers: { 'X-User-Email': userEmail },
            });
            const sessionsData = await sessionsRes.json();
            listDiv.innerHTML = '';
            if (!sessionsRes.ok || !sessionsData.sessions) {
              listDiv.textContent = 'No se pudieron cargar sesiones.';
            } else {
              sessionsData.sessions.forEach((sess) => {
                // Skip newly created session (already saved) if same id? We don't have id here; we cannot know created session id because backend returns message; skip if necessary
                const div = document.createElement('div');
                div.classList.add('form-check');
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'associateSession';
                input.classList.add('form-check-input');
                input.id = `assoc-${sess.id}`;
                input.value = sess.id;
                const label = document.createElement('label');
                label.classList.add('form-check-label');
                label.htmlFor = input.id;
                label.textContent = `${sess.name} (ID ${sess.id})`;
                div.appendChild(input);
                div.appendChild(label);
                listDiv.appendChild(div);
              });
            }
          } catch (err) {
            listDiv.textContent = 'Error al cargar sesiones.';
          }
          // Show associate modal
          assocModal.style.display = 'block';
          // Store docIds on modal for later use
          assocModal.dataset.docIds = JSON.stringify(docIds);
        }
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Hide session modal on cancel or close
  const sessionModalEl = document.getElementById('sessionModal');
  if (sessionModalEl) {
    const cancelBtn = sessionModalEl.querySelector('.btn-secondary');
    const closeBtn = sessionModalEl.querySelector('.btn-close');
    const hideModal = () => { sessionModalEl.style.display = 'none'; };
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (closeBtn) closeBtn.addEventListener('click', hideModal);
  }

  // New session button: opens modal with no documents preselected
  const newSessionBtn = document.getElementById('newSessionBtn');
  if (newSessionBtn) {
    newSessionBtn.addEventListener('click', async () => {
      const modalEl = document.getElementById('sessionModal');
      modalEl.dataset.docIds = JSON.stringify([]);
      document.getElementById('sessionName').value = '';
      const list = document.getElementById('sessionUsersList');
      list.innerHTML = '<div>Cargando usuarios...</div>';
      try {
        const userEmail = localStorage.getItem('userEmail') || '';
        const isAdmin = localStorage.getItem('isAdmin') === 'true';
        let usersList = [];
        if (isAdmin) {
          const res = await fetch(`${API_BASE_URL}/users`, { headers: { 'X-User-Email': userEmail } });
          try {
            const data = await res.json();
            if (res.ok && data.users) usersList = data.users;
          } catch (_) { /* ignore */ }
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
          input.id = `sess-user-${u.id}`;
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
        list.innerHTML = '<div>Error al cargar usuarios.</div>';
      }
      modalEl.style.display = 'block';
    });
  }

  // Associate session modal buttons
  const assocModal = document.getElementById('associateSessionModal');
  if (assocModal) {
    const cancelAssoc = document.getElementById('associateCancelBtn');
    const closeAssoc = document.getElementById('associateCloseBtn');
    const confirmAssoc = document.getElementById('associateConfirmBtn');
    const hideAssoc = () => { assocModal.style.display = 'none'; };
    if (cancelAssoc) cancelAssoc.addEventListener('click', hideAssoc);
    if (closeAssoc) closeAssoc.addEventListener('click', hideAssoc);
    if (confirmAssoc) {
      confirmAssoc.addEventListener('click', async () => {
        // Determine selected session ID
        const selected = document.querySelector('input[name="associateSession"]:checked');
        if (!selected) {
          alert('Selecciona una sesión a la cual asociar los documentos');
          return;
        }
        const sessId = parseInt(selected.value, 10);
        const docsStr = assocModal.dataset.docIds || '[]';
        let docIds;
        try { docIds = JSON.parse(docsStr); } catch (_) { docIds = []; }
        const userEmail = localStorage.getItem('userEmail') || '';
        try {
          const res = await fetch(`${API_BASE_URL}/sessions/${sessId}/add_documents`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Email': userEmail,
            },
            body: JSON.stringify({ document_ids: docIds }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al asociar a sesión');
          alert(data.message || 'Documentos asociados a la sesión');
        } catch (err) {
          alert(err.message);
        } finally {
          hideAssoc();
        }
      });
    }
  }
  // Export products summary to Excel
  document.getElementById("exportProductsBtn").addEventListener("click", async () => {
    try {
      // Build query string based on current filters
      const params = new URLSearchParams();
      const start = document.getElementById("startMonth").value;
      const end = document.getElementById("endMonth").value;
      if (selectedSuppliers.length > 0 && selectedSuppliers.length < allSuppliers.length) {
        params.append('supplier', selectedSuppliers.join(','));
      }
      if (selectedDocTypes.length > 0 && selectedDocTypes.length < allDocTypes.length) {
        params.append('type', selectedDocTypes.join(','));
      }
      if (start) params.append('start', start);
      if (end) params.append('end', end);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${API_BASE_URL}/analytics/products/export${query}`);
      if (!response.ok) {
        throw new Error("Error al exportar datos de productos");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "productos.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  });
  // Export categories summary to Excel
  document.getElementById("exportCategoriesBtn").addEventListener("click", async () => {
    try {
      // Build query string based on current filters
      const params = new URLSearchParams();
      const start = document.getElementById("startMonth").value;
      const end = document.getElementById("endMonth").value;
      if (selectedSuppliers.length > 0 && selectedSuppliers.length < allSuppliers.length) {
        params.append('supplier', selectedSuppliers.join(','));
      }
      if (selectedDocTypes.length > 0 && selectedDocTypes.length < allDocTypes.length) {
        params.append('type', selectedDocTypes.join(','));
      }
      if (start) params.append('start', start);
      if (end) params.append('end', end);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${API_BASE_URL}/analytics/categories/export${query}`);
      if (!response.ok) {
        throw new Error("Error al exportar categorías");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "categorias.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  });
  // Apply filter button. When clicked, reload all data (documents, product chart, category chart)
  document.getElementById("applyFiltersBtn").addEventListener("click", () => {
    currentPage = 1;
    // Show loader while filters apply
    showLoader();
    Promise.all([
      loadDocuments(),
      loadProductChart(),
      loadCategoryChart(),
    ]).finally(() => {
      hideLoader();
    });
  });
  // Chart type selector
  document.getElementById("productChartType").addEventListener("change", () => {
    loadProductChart();
  });
  // Metric selector for product summary
  document.getElementById("productMetricSelect").addEventListener("change", () => {
    loadProductChart();
  });
  // Setup dropdown toggles for supplier and doc type filters
  const supplierToggle = document.getElementById('supplierDropdownToggle');
  const supplierDropdown = document.getElementById('supplierDropdown');
  supplierToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    supplierDropdown.classList.toggle('show');
    docTypeDropdown.classList.remove('show');
  });
  const docTypeToggle = document.getElementById('docTypeDropdownToggle');
  const docTypeDropdown = document.getElementById('docTypeDropdown');
  docTypeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    docTypeDropdown.classList.toggle('show');
    supplierDropdown.classList.remove('show');
  });
  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    supplierDropdown.classList.remove('show');
    docTypeDropdown.classList.remove('show');
  });
  // Prevent dropdown from closing when clicking inside
  supplierDropdown.addEventListener('click', (e) => e.stopPropagation());
  docTypeDropdown.addEventListener('click', (e) => e.stopPropagation());
  // Select all for suppliers
  document.getElementById('supplier-select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedSuppliers = allSuppliers.map((s) => s.id);
    } else {
      selectedSuppliers = [];
    }
    renderSuppliersDropdown();
  });
  // Search filter for suppliers
  document.getElementById('supplierSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('#supplierOptions .form-check');
    items.forEach((div) => {
      const label = div.querySelector('label').textContent.toLowerCase();
      div.style.display = label.includes(term) ? 'block' : 'none';
    });
  });
  // Select all for doc types
  document.getElementById('docType-select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedDocTypes = [...allDocTypes];
    } else {
      selectedDocTypes = [];
    }
    renderDocTypeDropdown();
  });
  // Search filter for doc types
  document.getElementById('docTypeSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll('#docTypeOptions .form-check');
    items.forEach((div) => {
      const label = div.querySelector('label').textContent.toLowerCase();
      div.style.display = label.includes(term) ? 'block' : 'none';
    });
  });
  // Sorting on table headers
  const headerCells = document.querySelectorAll("#docs-table thead th");
  headerCells.forEach((th, idx) => {
    // Skip first column (selection) and last column (actions)
    if (idx === 0 || th.textContent.trim().toLowerCase().startsWith('acciones')) return;
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (docSortState.column === idx) {
        docSortState.ascending = !docSortState.ascending;
      } else {
        docSortState.column = idx;
        docSortState.ascending = true;
      }
      sortDocumentsByColumn(idx, docSortState.ascending);
      currentPage = 1;
      renderDocumentsPage();
    });
  });
});

/**
 * Fetch the list of documents from the backend and display them.
 */
async function loadDocuments() {
  try {
    // If viewing a saved session, fetch documents from the session endpoint
    if (sessionParam) {
      const userEmail = localStorage.getItem('userEmail') || '';
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionParam}/documents`, {
        headers: { 'X-User-Email': userEmail },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al obtener documentos de la sesión');
      }
      allDocuments = data.documents || [];
      currentPage = 1;
      renderDocumentsPage();
      return;
    }
    // Build query based on global filters
    const start = document.getElementById("startMonth").value;
    const end = document.getElementById("endMonth").value;
    const invoice = document.getElementById("invoiceInput").value.trim();
    const params = new URLSearchParams();
    // Suppliers: if not all selected, send comma‑separated list
    if (selectedSuppliers.length > 0 && selectedSuppliers.length < allSuppliers.length) {
      params.append('supplier', selectedSuppliers.join(','));
    }
    // Document types: if not all selected, send comma‑separated list
    if (selectedDocTypes.length > 0 && selectedDocTypes.length < allDocTypes.length) {
      params.append('type', selectedDocTypes.join(','));
    }
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    if (invoice) params.append("invoice", invoice);
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/documents${query}`);
    const data = await response.json();
    allDocuments = data.documents || [];
    // Reset pagination to first page when reloading data
    currentPage = 1;
    renderDocumentsPage();
  } catch (err) {
    console.error("Error al obtener documentos:", err);
  }
}

/**
 * Render a table with the provided document metadata.
 * @param {Array} docs
 */
function renderDocumentTable(docs) {
  const tbody = document.getElementById("docs-body");
  tbody.innerHTML = "";
  docs.forEach((doc) => {
    const row = document.createElement("tr");
    // Checkbox cell for selection
    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.classList.add("select-checkbox");
    checkbox.value = doc.id;
    selectCell.appendChild(checkbox);
    row.appendChild(selectCell);
    // Provider name (or fallback to filename)
    const nameCell = document.createElement("td");
    nameCell.textContent = doc.supplier_name || doc.filename || "-";
    row.appendChild(nameCell);
    // Type: show specific document type when available
    const typeCell = document.createElement("td");
    let typeText = '';
    if (doc.doc_type) {
      typeText = doc.doc_type;
    } else if (doc.filetype) {
      typeText = doc.filetype.toUpperCase();
    } else {
      typeText = '-';
    }
    typeCell.textContent = typeText;
    row.appendChild(typeCell);
    // Size in KB
    const sizeCell = document.createElement("td");
    sizeCell.textContent = (doc.size_bytes / 1024).toFixed(1);
    row.appendChild(sizeCell);
    // Pages or XML root
    const metaCell = document.createElement("td");
    if (doc.filetype === "pdf") {
      metaCell.textContent = doc.pages !== null ? `${doc.pages} pág.` : "-";
    } else if (doc.filetype === "xml") {
      metaCell.textContent = doc.xml_root || "-";
    } else {
      metaCell.textContent = "-";
    }
    row.appendChild(metaCell);
    // Supplier RUT
    const rutCell = document.createElement("td");
    rutCell.textContent = doc.supplier_rut || "-";
    row.appendChild(rutCell);
    // Invoice number
    const invoiceCell = document.createElement("td");
    invoiceCell.textContent = doc.invoice_number || "-";
    row.appendChild(invoiceCell);
    // Invoice total formatted in CLP pesos
    const totalCell = document.createElement("td");
    const totalVal = doc.invoice_total != null ? parseFloat(doc.invoice_total) : 0;
    totalCell.textContent = totalVal ? '$' + totalVal.toLocaleString('es-CL') : "-";
    row.appendChild(totalCell);
    // Document date (fecha de la factura)
    const dateCell = document.createElement("td");
    if (doc.doc_date) {
      const dateObj = new Date(doc.doc_date);
      dateCell.textContent = dateObj.toLocaleDateString();
    } else {
      dateCell.textContent = "-";
    }
    row.appendChild(dateCell);
    // Actions
    const actionsCell = document.createElement("td");
    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Descargar";
    // Use Bootstrap button styling for a cleaner look
    downloadBtn.classList.add("btn", "btn-primary", "btn-sm");
    downloadBtn.addEventListener("click", () => downloadDocument(doc.id, doc.filename));
    actionsCell.appendChild(downloadBtn);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

/**
 * Handle uploading of a document from the form.
 * @param {Event} event
 */
async function handleUpload(event) {
  event.preventDefault();
  const fileInput = document.getElementById("file-input");
  const files = Array.from(fileInput.files);
  if (!files || files.length === 0) {
    alert("Por favor seleccione uno o más archivos.");
    return;
  }
  // Show progress bar
  const progressContainer = document.getElementById("uploadProgressContainer");
  const progressBar = document.getElementById("uploadProgressBar");
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  const totalFiles = files.length;
  let uploaded = 0;
  // Keep track of newly created document IDs to optionally add to current session
  const newDocIds = [];
  for (const file of files) {
    const formData = new FormData();
    // Use 'files' field to match backend logic
    formData.append('files', file);
    try {
      const response = await fetch(`${API_BASE_URL}/documents`, {
        method: 'POST',
        body: formData,
      });
      // Attempt to parse JSON to capture created documents
      let result;
      try { result = await response.json(); } catch (_) { result = {}; }
      if (!response.ok) {
        throw new Error(result.error || 'Error al subir los archivos.');
      }
      // result may be an object with 'documents' array or a list itself
      const created = Array.isArray(result) ? result : result.documents;
      if (Array.isArray(created)) {
        created.forEach((doc) => {
          if (doc && doc.id) newDocIds.push(doc.id);
        });
      }
    } catch (err) {
      alert(err.message);
      // Hide progress bar and stop further uploads
      progressContainer.style.display = 'none';
      return;
    }
    uploaded++;
    const percent = Math.round((uploaded / totalFiles) * 100);
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
  }
  // Hide progress bar after completion
  progressContainer.style.display = 'none';
  // Reset file input
  fileInput.value = '';
  // If a session is active, associate newly created documents to the session so they appear in the list
  if (sessionParam && newDocIds.length > 0) {
    try {
      const userEmail = localStorage.getItem('userEmail') || '';
      await fetch(`${API_BASE_URL}/sessions/${sessionParam}/add_documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail,
        },
        body: JSON.stringify({ document_ids: newDocIds }),
      });
    } catch (_) {
      // Ignore errors; still attempt to reload documents
    }
  }
  // After uploading files, show loader while refreshing data
  showLoader();
  try {
    await loadDocuments();
    await loadSuppliers();
    await loadDocTypes();
    await loadProductChart();
    await loadCategoryChart();
  } finally {
    hideLoader();
  }
}

/**
 * Download a document by creating a hidden link and triggering click.
 * @param {number} id
 * @param {string} filename
 */
function downloadDocument(id, filename) {
  const link = document.createElement("a");
  link.href = `${API_BASE_URL}/documents/${id}/download`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Fetch dashboard statistics and render charts accordingly.
 */
async function loadDashboard() {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard`);
    const stats = await response.json();
    // Render chart of document types
    renderDocTypeChart(stats.count_per_type);
    // Render chart of file sizes distribution
    renderFileSizeChart(stats.file_sizes);
    // Display average pages if available
    const avgPagesContainer = document.getElementById("avgPagesContainer");
    const avgPagesText = document.getElementById("avgPagesText");
    if (stats.avg_pages !== null && stats.avg_pages !== undefined) {
      avgPagesContainer.hidden = false;
      avgPagesText.textContent = `Promedio de páginas (PDF): ${stats.avg_pages.toFixed(1)}`;
    } else {
      avgPagesContainer.hidden = true;
    }
  } catch (err) {
    console.error("Error al obtener datos de dashboard:", err);
  }
  // Update dashboard visibility according to toggles
  toggleDashboards();
}

/**
 * Fetch analytics data (suppliers, products, monthly) without product filter.
 */
async function loadAnalytics() {
  try {
    const response = await fetch(`${API_BASE_URL}/analytics`);
    analyticsData = await response.json();
    // Render provider usage chart
    renderProviderChart(analyticsData.providers_usage);
    // Render product summary chart (use top products by total quantity)
    renderProductSummaryChart(analyticsData.products_summary);
    // Populate product select
    await loadProductsList();
  } catch (err) {
    console.error("Error al obtener analytics:", err);
  }
}

/**
 * Fetch list of products and populate the product selector.
 */
async function loadProductsList() {
  try {
    const response = await fetch(`${API_BASE_URL}/products`);
    const data = await response.json();
    const select = document.getElementById("productSelect");
    select.innerHTML = "";
    // Add placeholder option
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Selecciona --";
    select.appendChild(placeholder);
    data.products.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Error al cargar lista de productos:", err);
  }
}

/**
 * Fetch product-specific analytics and render monthly chart.
 * @param {string} productName
 */
async function loadProductAnalytics(productName) {
  if (!productName) {
    // Clear chart if no product selected
    if (productMonthlyChart) productMonthlyChart.destroy();
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/analytics?product=${encodeURIComponent(productName)}`);
    const data = await response.json();
    if (data.product_monthly) {
      renderProductMonthlyChart(productName, data.product_monthly);
    }
  } catch (err) {
    console.error("Error al obtener analytics del producto:", err);
  }
}

/**
 * Load list of suppliers from backend and populate the supplier select element.
 * Adds an initial option for all suppliers.
 */
async function loadSuppliers() {
  try {
    const response = await fetch(`${API_BASE_URL}/suppliers`);
    const data = await response.json();
    allSuppliers = (data.suppliers || []).map((s) => ({ id: s.id, name: s.name }));
    // Select all suppliers by default if not already selected
    if (!selectedSuppliers.length) {
      selectedSuppliers = allSuppliers.map((s) => s.id);
    }
    renderSuppliersDropdown();
  } catch (err) {
    console.error("Error al cargar proveedores:", err);
  }
}

/**
 * Load available document types from the backend and populate the filter.
 */
async function loadDocTypes() {
  try {
    const response = await fetch(`${API_BASE_URL}/documents/types`);
    const data = await response.json();
    // API returns an array of types (strings)
    allDocTypes = data.types || [];
    // Select all by default if no previous selection
    if (!selectedDocTypes.length) {
      selectedDocTypes = [...allDocTypes];
    }
    renderDocTypeDropdown();
  } catch (err) {
    console.error('Error al cargar tipos de documento:', err);
  }
}

/**
 * Load product chart data with filters and render the chart.
 * The filters are read from the supplier select and start/end month inputs.
 */
async function loadProductChart() {
  try {
    // Get filters
    const start = document.getElementById("startMonth").value;
    const end = document.getElementById("endMonth").value;
    // Build query string
    const params = new URLSearchParams();
    if (selectedSuppliers.length > 0 && selectedSuppliers.length < allSuppliers.length) {
      params.append('supplier', selectedSuppliers.join(','));
    }
    if (selectedDocTypes.length > 0 && selectedDocTypes.length < allDocTypes.length) {
      params.append('type', selectedDocTypes.join(','));
    }
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/analytics/products/chart${query}`);
    const data = await response.json();
    const summary = data.products || {};
    // Prepare labels and values
    const metric = document.getElementById("productMetricSelect").value || "qty";
    const entries = Object.entries(summary);
    // Sort by selected metric descending and take top 15
    entries.sort((a, b) => {
      const aval = metric === "value" ? (a[1].total_value || 0) : (a[1].total_qty || 0);
      const bval = metric === "value" ? (b[1].total_value || 0) : (b[1].total_qty || 0);
      return bval - aval;
    });
    const topEntries = entries.slice(0, 15);
    const labels = topEntries.map((e) => e[0]);
    const values = topEntries.map((e) => metric === "value" ? (e[1].total_value || 0) : (e[1].total_qty || 0));
    const ctx = document.getElementById("productChart").getContext("2d");
    const chartType = document.getElementById("productChartType").value;
    if (productChart) productChart.destroy();
    productChart = new Chart(ctx, {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: metric === "value" ? "Valor total" : "Cantidad total",
            data: values,
            backgroundColor: chartType === "pie" ? labels.map(() => getRandomColor()) : (metric === "value" ? "rgba(40, 167, 69, 0.6)" : "rgba(0, 123, 255, 0.6)"),
            borderColor: chartType === "pie" ? [] : (metric === "value" ? "rgba(40, 167, 69, 1)" : "rgba(0, 123, 255, 1)"),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: metric === "value" ? "Productos con mayor valor comprado" : "Productos más comprados",
          },
          legend: {
            position: chartType === "pie" ? "right" : "bottom",
          },
        },
        scales: chartType === "bar" ? {
          y: {
            beginAtZero: true,
            title: { display: true, text: metric === "value" ? "Valor total (CLP)" : "Cantidad" },
          },
          x: {
            title: { display: true, text: "Productos" },
          },
        } : {},
      },
    });
  } catch (err) {
    console.error("Error al cargar gráfico de productos:", err);
  }
}

/**
 * Load category analytics and render category chart.
 */
async function loadCategoryChart() {
  try {
    // Apply same filters as product chart
    const start = document.getElementById("startMonth").value;
    const end = document.getElementById("endMonth").value;
    const params = new URLSearchParams();
    if (selectedSuppliers.length > 0 && selectedSuppliers.length < allSuppliers.length) {
      params.append('supplier', selectedSuppliers.join(','));
    }
    if (selectedDocTypes.length > 0 && selectedDocTypes.length < allDocTypes.length) {
      params.append('type', selectedDocTypes.join(','));
    }
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/analytics/categories${query}`);
    const data = await response.json();
    const categories = data.categories || {};
    const labels = Object.keys(categories);
    // Use total purchase value as metric on Y axis
    const qtyValues = labels.map((cat) => categories[cat].total_value);
    const ctx = document.getElementById("categoryChart").getContext("2d");
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Valor total (CLP)",
            data: qtyValues,
            backgroundColor: labels.map(() => getRandomColor()),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Valor total (CLP)" },
          },
          x: {
            title: { display: true, text: "Categorías" },
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Costo comprado por categoría",
          },
          legend: {
            display: false,
          },
        },
      },
    });
  } catch (err) {
    console.error("Error al cargar gráfico de categorías:", err);
  }
}

/**
 * Generate a random color for charts.
 * @returns {string}
 */
function getRandomColor() {
  const r = Math.floor(Math.random() * 255);
  const g = Math.floor(Math.random() * 255);
  const b = Math.floor(Math.random() * 255);
  return `rgba(${r}, ${g}, ${b}, 0.6)`;
}

/**
 * Sort the global allDocuments array by a column index.
 * The index corresponds to visible columns:
 * 0: Seleccionar (ignored), 1: Proveedor, 2: Tipo, 3: Tamaño, 4: Páginas/Etiqueta, 5: RUT,
 * 6: Factura N°, 7: Monto total, 8: Fecha, 9: Acciones (ignored).
 * Sorting will gracefully handle missing values.
 *
 * @param {number} idx - The column index to sort by.
 * @param {boolean} asc - Whether to sort ascending (true) or descending (false).
 */
function sortDocumentsByColumn(idx, asc) {
  const getKey = (doc) => {
    switch (idx) {
      case 1: // Proveedor
        return (doc.supplier_name || doc.filename || '').toLowerCase();
      case 2: // Tipo
        return (doc.filetype || '').toLowerCase();
      case 3: // Tamaño
        return doc.size_bytes || 0;
      case 4: // Páginas / Etiqueta raíz
        if (doc.filetype === 'pdf') {
          return doc.pages != null ? doc.pages : -1;
        }
        return (doc.xml_root || '').toLowerCase();
      case 5: // RUT
        return (doc.supplier_rut || '').toLowerCase();
      case 6: // Factura N°
        return (doc.invoice_number || '').toLowerCase();
      case 7: // Monto total
        return doc.invoice_total != null ? parseFloat(doc.invoice_total) : 0;
      case 8: // Fecha
        return doc.doc_date || '';
      default:
        return '';
    }
  };
  allDocuments.sort((a, b) => {
    const aKey = getKey(a);
    const bKey = getKey(b);
    // Handle numbers and strings differently
    if (typeof aKey === 'number' && typeof bKey === 'number') {
      return asc ? aKey - bKey : bKey - aKey;
    }
    // Convert dates if ISO strings
    if (idx === 8) {
      const aDate = aKey ? new Date(aKey) : new Date(0);
      const bDate = bKey ? new Date(bKey) : new Date(0);
      return asc ? aDate - bDate : bDate - aDate;
    }
    // Compare as strings
    if (aKey < bKey) return asc ? -1 : 1;
    if (aKey > bKey) return asc ? 1 : -1;
    return 0;
  });
}

/**
 * Render a bar chart showing number of documents per supplier.
 * @param {Object} usage
 */
function renderProviderChart(usage) {
  const ctx = document.getElementById("providerChart").getContext("2d");
  const labels = Object.keys(usage);
  const data = Object.values(usage);
  if (providerChart) providerChart.destroy();
  providerChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Número de documentos",
          data,
          backgroundColor: "rgba(0, 123, 255, 0.6)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Cantidad" } },
        x: { title: { display: true, text: "Proveedores" } },
      },
      plugins: { title: { display: true, text: "Documentos por proveedor" } },
    },
  });
}

/**
 * Render a bar chart showing top products by total quantity.
 * @param {Object} productsSummary
 */
function renderProductSummaryChart(productsSummary) {
  const ctx = document.getElementById("productSummaryChart").getContext("2d");
  // Sort products by total quantity descending and take top 10
  const entries = Object.entries(productsSummary);
  entries.sort((a, b) => b[1].total_qty - a[1].total_qty);
  const topEntries = entries.slice(0, 10);
  const labels = topEntries.map((e) => e[0]);
  const data = topEntries.map((e) => e[1].total_qty);
  if (productSummaryChart) productSummaryChart.destroy();
  productSummaryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Cantidad total",
          data,
          backgroundColor: "rgba(255, 193, 7, 0.6)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "Cantidad" } },
        x: { title: { display: true, text: "Productos" } },
      },
      plugins: { title: { display: true, text: "Top productos por cantidad" } },
    },
  });
}

/**
 * Render a line chart showing monthly quantity and prices for a product.
 * @param {string} productName
 * @param {Object} monthlyData
 */
function renderProductMonthlyChart(productName, monthlyData) {
  const ctx = document.getElementById("productMonthlyChart").getContext("2d");
  const months = Object.keys(monthlyData).sort();
  const qtyValues = months.map((m) => monthlyData[m].total_qty || 0);
  const avgPrices = months.map((m) => monthlyData[m].avg_price || 0);
  // Two datasets: quantity and average price on secondary axis
  if (productMonthlyChart) productMonthlyChart.destroy();
  productMonthlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Cantidad",
          data: qtyValues,
          backgroundColor: "rgba(40, 167, 69, 0.6)",
          yAxisID: 'y',
        },
        {
          label: "Precio promedio",
          data: avgPrices,
          type: 'line',
          borderColor: "rgba(220, 53, 69, 0.8)",
          backgroundColor: "rgba(220, 53, 69, 0.3)",
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Cantidad' },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          title: { display: true, text: 'Precio' },
          grid: { drawOnChartArea: false },
        },
        x: { title: { display: true, text: 'Mes' } },
      },
      plugins: {
        title: { display: true, text: `Detalle mensual para ${productName}` },
      },
    },
  });
}

/**
 * Render a pie chart showing the number of documents per type.
 * @param {Object} countPerType
 */
function renderDocTypeChart(countPerType) {
  const ctx = document.getElementById("docTypeChart").getContext("2d");
  const labels = Object.keys(countPerType);
  const data = Object.values(countPerType);
  const chartTypeSelect = document.getElementById("docTypeChartType");
  const selectedType = chartTypeSelect.value || "pie";
  if (docTypeChart) {
    docTypeChart.destroy();
  }
  docTypeChart = new Chart(ctx, {
    type: selectedType,
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: ["#007bff", "#28a745", "#ffc107", "#dc3545"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: "Cantidad de documentos por tipo",
        },
      },
      scales: selectedType === "bar" ? {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Número de documentos" },
        },
        x: {
          title: { display: true, text: "Tipos" },
        },
      } : {},
    },
  });
}

/**
 * Render a bar chart or histogram representing file sizes in KB.
 * @param {Array<number>} fileSizes Array of file sizes in bytes
 */
function renderFileSizeChart(fileSizes) {
  const ctx = document.getElementById("fileSizeChart").getContext("2d");
  // Convert sizes to KB and round
  const sizesKB = fileSizes.map((size) => size / 1024);
  // Determine bins for histogram (0-100KB, 100-500KB, 500-1000KB, >1000KB)
  const bins = {
    "0-100 KB": 0,
    "100-500 KB": 0,
    "500-1000 KB": 0,
    ">1000 KB": 0,
  };
  sizesKB.forEach((size) => {
    if (size <= 100) bins["0-100 KB"]++;
    else if (size <= 500) bins["100-500 KB"]++;
    else if (size <= 1000) bins["500-1000 KB"]++;
    else bins[">1000 KB"]++;
  });
  const labels = Object.keys(bins);
  const data = Object.values(bins);
  if (fileSizeChart) {
    fileSizeChart.destroy();
  }
  fileSizeChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Número de documentos",
          data,
          backgroundColor: "rgba(40, 167, 69, 0.6)",
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Cantidad",
          },
        },
        x: {
          title: {
            display: true,
            text: "Rangos de tamaño (KB)",
          },
        },
      },
      plugins: {
        title: {
          display: true,
          text: "Distribución de tamaños de archivos",
        },
      },
    },
  });
}