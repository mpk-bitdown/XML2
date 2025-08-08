// JavaScript for categories AI page

let categoriesData = [];
let allCategoryOptions = [];
// Track selected products for bulk operations
let selectedProducts = new Set();

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
  // Bulk operations handlers
  const bulkCategorySelect = document.getElementById('bulkCategorySelect');
  const applyBulkCategoryBtn = document.getElementById('applyBulkCategoryBtn');
  const applyBulkGenericBtn = document.getElementById('applyBulkGenericBtn');
  const bulkGenericInput = document.getElementById('bulkGenericInput');
  // Apply bulk category to selected
  applyBulkCategoryBtn.addEventListener('click', async () => {
    const newCat = bulkCategorySelect.value;
    if (!newCat) {
      alert('Selecciona una categoría');
      return;
    }
    if (selectedProducts.size === 0) {
      alert('No hay productos seleccionados');
      return;
    }
    try {
      for (const prod of selectedProducts) {
        const res = await fetch('/api/manual_categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_name: prod, category: newCat }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al aplicar categoría');
        }
      }
      alert('Categoría aplicada a seleccionados');
      // Clear selections and reload
      selectedProducts.clear();
      document.getElementById('selectAllCategories').checked = false;
      loadCategorization();
    } catch (err) {
      alert(err.message);
    }
  });
  // Apply bulk generic mapping to selected
  applyBulkGenericBtn.addEventListener('click', async () => {
    const genName = bulkGenericInput.value.trim();
    if (!genName) {
      alert('Ingresa un nombre genérico');
      return;
    }
    if (selectedProducts.size === 0) {
      alert('No hay productos seleccionados');
      return;
    }
    try {
      for (const prod of selectedProducts) {
        const res = await fetch('/api/generic_products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_name: prod, generic_name: genName }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error al asignar genérico');
        }
      }
      alert('Genérico asignado a seleccionados');
      // Clear selections and input
      selectedProducts.clear();
      bulkGenericInput.value = '';
      document.getElementById('selectAllCategories').checked = false;
      loadCategorization();
    } catch (err) {
      alert(err.message);
    }
  });
  // Select all checkbox toggles all rows
  const selectAllCheckbox = document.getElementById('selectAllCategories');
  selectAllCheckbox.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('.cat-select-checkbox');
    selectedProducts.clear();
    checkboxes.forEach((cb) => {
      cb.checked = selectAllCheckbox.checked;
      if (selectAllCheckbox.checked) {
        selectedProducts.add(cb.dataset.product);
      }
    });
  });

  // Create new category dynamically
  const createCatBtn = document.getElementById('createCategoryBtn');
  const newCatInput = document.getElementById('newCategoryInput');
  if (createCatBtn && newCatInput) {
    createCatBtn.addEventListener('click', () => {
      const newCat = newCatInput.value.trim();
      if (!newCat) return;
      if (!allCategoryOptions.includes(newCat)) {
        allCategoryOptions.push(newCat);
        // Remove duplicates and sort
        allCategoryOptions = Array.from(new Set(allCategoryOptions));
        // Clear input
        newCatInput.value = '';
        // Re-render dropdown options
        const bulkSelect = document.getElementById('bulkCategorySelect');
        if (bulkSelect) {
          bulkSelect.innerHTML = '';
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = '-- Categoría --';
          bulkSelect.appendChild(placeholder);
          allCategoryOptions.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            bulkSelect.appendChild(option);
          });
        }
        // Also update each row's select options
        document.querySelectorAll('#categoriesBody select').forEach((sel) => {
          const option = document.createElement('option');
          option.value = newCat;
          option.textContent = newCat;
          sel.appendChild(option);
        });
      }
    });
  }
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
    // Populate bulk category dropdown
    const bulkSelect = document.getElementById('bulkCategorySelect');
    if (bulkSelect) {
      bulkSelect.innerHTML = '';
      // Add a placeholder option
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- Categoría --';
      bulkSelect.appendChild(placeholder);
      allCategoryOptions.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        bulkSelect.appendChild(option);
      });
    }
    // Reset selections
    selectedProducts.clear();
    const selectAllCheckbox = document.getElementById('selectAllCategories');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    renderCategoriesTable();
  } catch (err) {
    alert(err.message);
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('categoriesBody');
  tbody.innerHTML = '';
  categoriesData.forEach((rec) => {
    const tr = document.createElement('tr');
    // Checkbox cell for selecting product
    const selTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('form-check-input', 'cat-select-checkbox');
    checkbox.dataset.product = rec.product_name;
    checkbox.checked = selectedProducts.has(rec.product_name);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedProducts.add(rec.product_name);
      } else {
        selectedProducts.delete(rec.product_name);
      }
      // Update select all checkbox state
      const allBoxes = document.querySelectorAll('.cat-select-checkbox');
      const allChecked = Array.from(allBoxes).every((cb) => cb.checked);
      const selectAll = document.getElementById('selectAllCategories');
      if (selectAll) selectAll.checked = allChecked;
    });
    selTd.appendChild(checkbox);
    tr.appendChild(selTd);
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
    // Supplier names column
    const suppTd = document.createElement('td');
    if (rec.supplier_names && rec.supplier_names.length) {
      suppTd.textContent = rec.supplier_names.join(', ');
    } else {
      suppTd.textContent = '';
    }
    tr.appendChild(suppTd);
    // Generic product name column
    const genTd = document.createElement('td');
    genTd.textContent = rec.generic_name || '';
    tr.appendChild(genTd);
    // Units per package column: editable input
    const unitsTd = document.createElement('td');
    const unitsInput = document.createElement('input');
    unitsInput.type = 'number';
    unitsInput.min = '0';
    unitsInput.step = 'any';
    unitsInput.classList.add('form-control', 'form-control-sm', 'package-units');
    // Fill value if available
    if (rec.units_per_package !== null && rec.units_per_package !== undefined) {
      unitsInput.value = rec.units_per_package;
      unitsInput.dataset.originalUnits = String(rec.units_per_package);
    } else {
      unitsInput.value = '';
      unitsInput.dataset.originalUnits = '';
    }
    // Highlight if changed
    unitsInput.addEventListener('input', () => {
      const orig = unitsInput.dataset.originalUnits;
      if (unitsInput.value !== orig) {
        unitsInput.classList.add('bg-info');
      } else {
        unitsInput.classList.remove('bg-info');
      }
    });
    unitsTd.appendChild(unitsInput);
    tr.appendChild(unitsTd);
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
    // Product name is in second cell (index 1) because index 0 is checkbox
    const productName = row.children[1].textContent.toLowerCase();
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
  const catUpdates = [];
  selects.forEach((sel) => {
    const original = sel.dataset.original;
    const current = sel.value;
    const product = sel.closest('tr').querySelector('td:nth-child(2)').textContent;
    if (current !== original) {
      catUpdates.push({ product_name: product, category: current });
    }
  });
  // Gather package unit updates
  const unitInputs = document.querySelectorAll('#categoriesBody input.package-units');
  const unitUpdates = [];
  unitInputs.forEach((inp) => {
    const original = inp.dataset.originalUnits;
    const val = inp.value.trim();
    const product = inp.closest('tr').querySelector('td:nth-child(2)').textContent;
    if (val !== '' && val !== original) {
      const units = parseFloat(val);
      if (!isNaN(units)) {
        unitUpdates.push({ product_name: product, units: units });
      }
    }
  });
  if (catUpdates.length === 0 && unitUpdates.length === 0) {
    alert('No hay cambios para guardar.');
    return;
  }
  try {
    // Save category changes
    for (const upd of catUpdates) {
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
    // Save units changes
    for (const upd of unitUpdates) {
      const res = await fetch('/api/package_units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upd),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar cantidad por paquete');
      }
    }
    alert('Cambios guardados correctamente');
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