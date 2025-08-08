// JavaScript for categories AI page

let categoriesData = [];
let allCategoryOptions = [];

document.addEventListener('DOMContentLoaded', () => {
  const userEmail = localStorage.getItem('userEmail');
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  if (!userEmail) {
    window.location.href = '/login.html';
    return;
  }
  // Update nav user and admin link
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
  // Load categorization data
  loadCategorization();
  // Search box handler
  const searchInput = document.getElementById('categorySearch');
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    filterTable(term);
  });
  // Save manual categories
  document.getElementById('saveCategoriesBtn').addEventListener('click', saveManualCategories);
  // Apply ML
  document.getElementById('applyMlBtn').addEventListener('click', applyMl);
});

async function loadCategorization() {
  try {
    const res = await fetch('/api/products/categorization');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al obtener categorización');
    }
    categoriesData = [...(data.categorized || []), ...(data.uncategorized || [])];
    // Derive list of category options (unique)
    const setOpts = new Set();
    categoriesData.forEach((r) => setOpts.add(r.category));
    // Also include some standard categories (for editing convenience)
    [
      'Carnes', 'Pescados y Mariscos', 'Lácteos', 'Frutas', 'Verduras',
      'Panadería y Pastelería', 'Snacks y Dulces', 'Cereales y Granos', 'Pastas y Harinas',
      'Aceites y Condimentos', 'Bebidas Alcohólicas', 'Bebidas no Alcohólicas', 'Aseo y Limpieza',
      'Higiene Personal', 'Mascotas', 'Bebé', 'Congelados', 'Electrónicos y Tecnología',
      'Herramientas y Ferretería', 'Oficina y Papelería', 'Otros'
    ].forEach((c) => setOpts.add(c));
    allCategoryOptions = Array.from(setOpts);
    renderCategoriesTable();
  } catch (err) {
    alert(err.message);
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categoriesBody');
  tbody.innerHTML = '';
  categoriesData.forEach((rec, index) => {
    const tr = document.createElement('tr');
    // Product name
    const nameTd = document.createElement('td');
    nameTd.textContent = rec.product_name;
    tr.appendChild(nameTd);
    // Quantity
    const qtyTd = document.createElement('td');
    qtyTd.textContent = rec.total_qty.toFixed(2);
    tr.appendChild(qtyTd);
    // Value
    const valTd = document.createElement('td');
    valTd.textContent = rec.total_value.toLocaleString('es-CL', { minimumFractionDigits: 0 });
    tr.appendChild(valTd);
    // Category select
    const catTd = document.createElement('td');
    const select = document.createElement('select');
    select.classList.add('form-select', 'form-select-sm');
    allCategoryOptions.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === rec.category) option.selected = true;
      select.appendChild(option);
    });
    // Mark row if manual assignment
    if (rec.manual) {
      select.classList.add('bg-warning');
    }
    // Store original category
    select.dataset.original = rec.category;
    select.addEventListener('change', () => {
      // Highlight changed rows
      if (select.value !== select.dataset.original) {
        select.classList.add('bg-info');
      } else {
        select.classList.remove('bg-info');
      }
    });
    catTd.appendChild(select);
    tr.appendChild(catTd);
    // Manual indicator
    const manualTd = document.createElement('td');
    manualTd.textContent = rec.manual ? 'Sí' : 'No';
    tr.appendChild(manualTd);
    tbody.appendChild(tr);
  });
}

function filterTable(term) {
  const rows = document.querySelectorAll('#categoriesBody tr');
  rows.forEach((row) => {
    const productName = row.children[0].textContent.toLowerCase();
    if (!productName.includes(term)) {
      row.style.display = 'none';
    } else {
      row.style.display = '';
    }
  });
}

async function saveManualCategories() {
  const userEmail = localStorage.getItem('userEmail');
  const selects = document.querySelectorAll('#categoriesBody select');
  const updates = [];
  selects.forEach((sel) => {
    const original = sel.dataset.original;
    const current = sel.value;
    const product = sel.closest('tr').children[0].textContent;
    if (current !== original) {
      updates.push({ product_name: product, category: current });
    }
  });
  if (updates.length === 0) {
    alert('No hay cambios para guardar.');
    return;
  }
  try {
    for (const upd of updates) {
      const res = await fetch('/api/manual_categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upd),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar categoría manual');
      }
    }
    alert('Cambios guardados correctamente');
    // Reload data to reflect manual flags and update heuristics
    loadCategorization();
  } catch (err) {
    alert(err.message);
  }
}

async function applyMl() {
  try {
    const res = await fetch('/api/products/categorization/apply_ml', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error al aplicar ML');
    }
    alert(`Se actualizaron ${data.updated} productos mediante ML`);
    loadCategorization();
  } catch (err) {
    alert(err.message);
  }
}