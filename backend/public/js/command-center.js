(function commandCenterPortal() {
  const TOKEN_KEY = 'mack_token';
  const VIEW_STORAGE_KEY = 'mack_command_center_view';
  const VALID_VIEWS = new Set(['inventory', 'calibration']);
  const state = {
    user: null,
    currentView: 'inventory',
    materials: [],
    templates: [],
    calibration: [],
    logs: [],
    inventoryTable: null,
    templateTable: null,
    calibrationTable: null,
    editingMaterialId: null,
    editingTemplateId: null,
    editingCalibrationId: null,
    activeMaterialId: null,
    activeCalibrationId: null,
    currentStatusTimeout: null,
  };

  const GHS_OPTIONS = [
    { key: 'explosive', label: 'Explosive', symbol: 'bomb' },
    { key: 'flammable', label: 'Flammable', symbol: 'flame' },
    { key: 'oxidizing', label: 'Oxidizer', symbol: 'flame_circle' },
    { key: 'gas_cylinder', label: 'Gas', symbol: 'cylinder' },
    { key: 'corrosive', label: 'Corrosive', symbol: 'corrosion' },
    { key: 'toxic', label: 'Toxic', symbol: 'skull' },
    { key: 'health_hazard', label: 'Health', symbol: 'health' },
    { key: 'exclamation_mark', label: 'Irritant', symbol: 'exclamation' },
    { key: 'environmental_hazard', label: 'Environment', symbol: 'tree_fish' },
  ];

  const elements = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    state.currentView = readStoredView() || state.currentView;
    setView(state.currentView, { persist: false, redraw: false });
    renderGhsSelector();
    wireEvents();
    checkDependencies();
    initializeIcons();
    refreshPortal();
  }

  function cacheDom() {
    elements.shell = document.querySelector('.cc-shell');
    elements.assetWarning = document.getElementById('asset-warning');
    elements.statusBanner = document.getElementById('status-banner');
    elements.sessionUser = document.getElementById('session-user');
    elements.expiredCount = document.getElementById('expired-count');
    elements.lowStockCount = document.getElementById('low-stock-count');
    elements.warningCount = document.getElementById('warning-count');
    elements.lockedCount = document.getElementById('locked-count');
    elements.inventoryNavCount = document.getElementById('inventory-nav-count');
    elements.calibrationNavCount = document.getElementById('calibration-nav-count');
    elements.inventorySearch = document.getElementById('inventory-search');
    elements.templateSearch = document.getElementById('template-search');
    elements.calibrationSearch = document.getElementById('calibration-search');
    elements.inventoryTable = document.getElementById('inventory-table');
    elements.templateTable = document.getElementById('template-table');
    elements.calibrationTable = document.getElementById('calibration-table');
    elements.logList = document.getElementById('recent-log-list');
    elements.inventoryImportInput = document.getElementById('inventory-import-input');
    elements.calibrationImportInput = document.getElementById('calibration-import-input');
    elements.addCalibrationButton = document.getElementById('add-calibration-button');
    elements.addTemplateButton = document.getElementById('add-template-button');
    elements.materialModal = document.getElementById('material-modal');
    elements.materialForm = document.getElementById('material-form');
    elements.materialModalTitle = document.getElementById('material-modal-title');
    elements.usageModal = document.getElementById('usage-modal');
    elements.usageForm = document.getElementById('usage-form');
    elements.usageModalTitle = document.getElementById('usage-modal-title');
    elements.templateModal = document.getElementById('template-modal');
    elements.templateForm = document.getElementById('template-form');
    elements.templateModalTitle = document.getElementById('template-modal-title');
    elements.calibrationModal = document.getElementById('calibration-modal');
    elements.calibrationForm = document.getElementById('calibration-form');
    elements.calibrationModalTitle = document.getElementById('calibration-modal-title');
    elements.manageTemplateButton = document.getElementById('manage-template-button');
    elements.calibrationTemplateSummary = document.getElementById('calibration-template-summary');
    elements.checkoutModal = document.getElementById('checkout-modal');
    elements.checkoutForm = document.getElementById('checkout-form');
    elements.checkoutModalTitle = document.getElementById('checkout-modal-title');
    elements.certificateModal = document.getElementById('certificate-modal');
    elements.certificateForm = document.getElementById('certificate-form');
    elements.certificateModalTitle = document.getElementById('certificate-modal-title');
    elements.ghsSelector = document.getElementById('ghs-selector');
    elements.navTabs = Array.from(document.querySelectorAll('.nav-tab'));
    elements.panels = Array.from(document.querySelectorAll('.command-panel'));
    elements.actionMenuGroups = Array.from(document.querySelectorAll('.floating-menu-group'));
  }

  function wireEvents() {
    document.getElementById('refresh-button').addEventListener('click', refreshPortal);
    document.getElementById('export-audit-button').addEventListener('click', exportAuditWorkbook);
    document.getElementById('logout-button').addEventListener('click', logout);
    document.getElementById('add-material-button').addEventListener('click', () => openMaterialModal());
    elements.addCalibrationButton.addEventListener('click', () => {
      if (!state.templates.length) {
        setStatus('Create a calibration template before adding an asset.', 'error');
        openTemplateModal();
        return;
      }
      openCalibrationModal();
    });
    elements.addTemplateButton.addEventListener('click', () => openTemplateModal());

    elements.navTabs.forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });

    elements.inventorySearch.addEventListener('input', () => {
      if (state.inventoryTable) {
        state.inventoryTable.setFilter(filterInventoryRows, elements.inventorySearch.value);
      }
    });

    elements.templateSearch.addEventListener('input', () => {
      if (state.templateTable) {
        state.templateTable.setFilter(filterTemplateRows, elements.templateSearch.value);
      }
    });

    elements.calibrationSearch.addEventListener('input', () => {
      if (state.calibrationTable) {
        state.calibrationTable.setFilter(filterCalibrationRows, elements.calibrationSearch.value);
      }
    });

    elements.materialForm.addEventListener('submit', submitMaterialForm);
    elements.usageForm.addEventListener('submit', submitUsageForm);
    elements.templateForm.addEventListener('submit', submitTemplateForm);
    elements.calibrationForm.addEventListener('submit', submitCalibrationForm);
    elements.manageTemplateButton.addEventListener('click', () => openTemplateModal());
    elements.calibrationForm.template_id.addEventListener('change', (event) => {
      updateCalibrationTemplateSummary(event.target.value);
    });
    elements.checkoutForm.addEventListener('submit', submitCheckoutForm);
    elements.certificateForm.addEventListener('submit', submitCertificateForm);
    elements.inventoryImportInput.addEventListener('change', handleInventoryImport);
    elements.calibrationImportInput.addEventListener('change', handleCalibrationImport);

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal.id);
      });
    });
  }

  function checkDependencies() {
    const missing = [];
    if (typeof window.Tabulator !== 'function') missing.push('tabulator.min.js');
    if (!window.XLSX) missing.push('xlsx.full.min.js');
    if (!window.luxon || !window.luxon.DateTime) missing.push('luxon.min.js');
    if (!window.jspdf || !window.jspdf.jsPDF) missing.push('jspdf.min.js');
    if (!hasAutoTablePlugin()) missing.push('jspdf.plugin.autotable.js');
    if (!window.lucide) missing.push('lucide.min.js');

    if (missing.length) {
      elements.assetWarning.classList.remove('hidden');
      elements.assetWarning.textContent = `Offline asset warning: missing ${missing.join(', ')}. Add the local files listed in DOWNLOAD_LIST.md to backend/public/js and backend/public/css.`;
    } else {
      elements.assetWarning.classList.add('hidden');
      elements.assetWarning.textContent = '';
    }
  }

  function hasAutoTablePlugin() {
    return Boolean(window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === 'function');
  }

  function initializeIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  async function refreshPortal() {
    try {
      const [session, materials, templates, calibration, logs] = await Promise.all([
        apiFetch('/api/command-center/session'),
        apiFetch('/api/command-center/materials'),
        apiFetch('/api/command-center/calibration/templates'),
        apiFetch('/api/command-center/calibration'),
        apiFetch('/api/command-center/logs?limit=24'),
      ]);

      state.user = session.user;
      state.materials = Array.isArray(materials) ? materials : [];
      state.templates = Array.isArray(templates) ? templates : [];
      state.calibration = Array.isArray(calibration) ? calibration : [];
      state.logs = Array.isArray(logs) ? logs : [];

      renderAll();
      setStatus('Command Center synchronized.', 'info');
    } catch (error) {
      setStatus(error.message || 'Failed to load Command Center data.', 'error');
    }
  }

  function renderAll() {
    elements.sessionUser.textContent = state.user ? `${state.user.display_name || state.user.username} (${state.user.role})` : 'Authenticated';
    renderDashboard();
    renderInventoryTable();
    renderTemplateTable();
    renderCalibrationTable();
    renderLogs();
    updateTabCounts();
    setView(state.currentView);
    initializeIcons();
  }

  function renderDashboard() {
    const expired = state.materials.filter((item) => item.expired).length;
    const lowStock = state.materials.filter((item) => item.low_stock).length;
    const warning = state.calibration.filter((item) => item.warning).length;
    const locked = state.calibration.filter((item) => item.locked_for_checkout).length;

    elements.expiredCount.textContent = String(expired);
    elements.lowStockCount.textContent = String(lowStock);
    elements.warningCount.textContent = String(warning);
    elements.lockedCount.textContent = String(locked);
  }

  function updateTabCounts() {
    elements.inventoryNavCount.textContent = String(state.materials.length);
    elements.calibrationNavCount.textContent = String(state.calibration.length);
  }

  function renderInventoryTable() {
    if (typeof window.Tabulator !== 'function') {
      elements.inventoryTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      return;
    }

    const columns = [
      { title: 'Material', field: 'name', minWidth: 180 },
      { title: 'Batch', field: 'batch_id', minWidth: 130 },
      {
        title: 'GHS',
        field: 'ghs_symbols',
        minWidth: 180,
        formatter: (cell) => renderGhsSymbols(cell.getValue()),
      },
      { title: 'Expiration', field: 'expiration_date', minWidth: 120 },
      {
        title: 'Shelf Life',
        field: 'days_remaining',
        minWidth: 120,
        formatter: (cell) => formatShelfLife(cell.getRow().getData()),
      },
      { title: 'Stock', field: 'stock_level', hozAlign: 'right', minWidth: 90 },
      { title: 'Min', field: 'min_threshold', hozAlign: 'right', minWidth: 90 },
      {
        title: 'Status',
        field: 'expired',
        minWidth: 150,
        formatter: (cell) => formatMaterialStatus(cell.getRow().getData()),
      },
      {
        title: 'Actions',
        field: 'actions',
        minWidth: 230,
        headerSort: false,
        formatter: () => [
          '<div class="table-actions">',
          '<button class="table-button" data-action="use">Use</button>',
          '<button class="table-button" data-action="edit">Edit</button>',
          '<button class="table-button" data-action="delete">Delete</button>',
          '</div>',
        ].join(''),
        cellClick: (event, cell) => {
          const action = eventTargetAction(event);
          if (!action) return;
          const row = cell.getRow().getData();
          if (action === 'use') openUsageModal(row);
          if (action === 'edit') openMaterialModal(row);
          if (action === 'delete') deleteMaterial(row);
        },
      },
    ];

    if (!state.inventoryTable) {
      state.inventoryTable = new window.Tabulator(elements.inventoryTable, {
        data: state.materials,
        layout: 'fitColumns',
        reactiveData: false,
        placeholder: 'No materials are currently in inventory.',
        columns,
        rowFormatter: (row) => {
          const data = row.getData();
          row.getElement().classList.remove('row-expired', 'row-warning');
          if (data.expired) row.getElement().classList.add('row-expired');
          else if (data.low_stock) row.getElement().classList.add('row-warning');
        },
      });
    } else {
      state.inventoryTable.replaceData(state.materials);
    }

    state.inventoryTable.setFilter(filterInventoryRows, elements.inventorySearch.value);
  }

  function renderTemplateTable() {
    if (typeof window.Tabulator !== 'function') {
      elements.templateTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      return;
    }

    const columns = [
      { title: 'Template', field: 'template_name', minWidth: 180 },
      { title: 'Category', field: 'category', minWidth: 120 },
      {
        title: 'Rules',
        field: 'cal_interval_days',
        minWidth: 220,
        formatter: (cell) => formatTemplateRules(cell.getRow().getData()),
      },
      { title: 'Department', field: 'assigned_department', minWidth: 150 },
      { title: 'Assets', field: 'asset_count', minWidth: 90, hozAlign: 'right' },
      {
        title: 'Actions',
        field: 'actions',
        minWidth: 160,
        headerSort: false,
        formatter: () => [
          '<div class="table-actions">',
          '<button class="table-button" data-action="edit">Edit</button>',
          '<button class="table-button" data-action="delete">Delete</button>',
          '</div>',
        ].join(''),
        cellClick: (event, cell) => {
          const action = eventTargetAction(event);
          if (!action) return;
          const row = cell.getRow().getData();
          if (action === 'edit') openTemplateModal(row);
          if (action === 'delete') deleteTemplate(row);
        },
      },
    ];

    if (!state.templateTable) {
      state.templateTable = new window.Tabulator(elements.templateTable, {
        data: state.templates,
        layout: 'fitColumns',
        reactiveData: false,
        placeholder: 'No calibration templates are registered yet.',
        columns,
      });
    } else {
      state.templateTable.replaceData(state.templates);
    }

    state.templateTable.setFilter(filterTemplateRows, elements.templateSearch.value);
  }

  function renderCalibrationTable() {
    if (typeof window.Tabulator !== 'function') {
      elements.calibrationTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      return;
    }

    const columns = [
      { title: 'Asset', field: 'tool_name', minWidth: 170 },
      { title: 'Template', field: 'template_name', minWidth: 170 },
      { title: 'Serial', field: 'serial_number', minWidth: 150 },
      { title: 'Last Cal', field: 'last_cal', minWidth: 120 },
      {
        title: 'Rules',
        field: 'cal_frequency',
        minWidth: 220,
        formatter: (cell) => formatTemplateRules(cell.getRow().getData()),
      },
      { title: 'Next Cal', field: 'next_cal', minWidth: 120 },
      { title: 'Department', field: 'assigned_department', minWidth: 140 },
      {
        title: 'Status',
        field: 'status',
        minWidth: 165,
        formatter: (cell) => formatCalibrationStatus(cell.getRow().getData()),
      },
      {
        title: 'Actions',
        field: 'actions',
        minWidth: 300,
        headerSort: false,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          return [
            '<div class="table-actions">',
            `<button class="table-button" data-action="checkout" ${row.locked_for_checkout ? 'disabled' : ''}>Check-out</button>`,
            '<button class="table-button" data-action="certificate">Certificate</button>',
            '<button class="table-button" data-action="edit">Edit</button>',
            '<button class="table-button" data-action="delete">Delete</button>',
            '</div>',
          ].join('');
        },
        cellClick: (event, cell) => {
          const action = eventTargetAction(event);
          if (!action) return;
          const row = cell.getRow().getData();
          if (action === 'checkout' && !row.locked_for_checkout) openCheckoutModal(row);
          if (action === 'certificate') openCertificateModal(row);
          if (action === 'edit') openCalibrationModal(row);
          if (action === 'delete') deleteCalibration(row);
        },
      },
    ];

    if (!state.calibrationTable) {
      state.calibrationTable = new window.Tabulator(elements.calibrationTable, {
        data: state.calibration,
        layout: 'fitColumns',
        reactiveData: false,
        placeholder: 'No calibration assets are currently registered.',
        columns,
        rowFormatter: (row) => {
          const data = row.getData();
          row.getElement().classList.remove('row-overdue', 'row-grace', 'row-warning');
          if (data.locked_for_checkout) row.getElement().classList.add('row-overdue');
          else if (data.in_grace_period) row.getElement().classList.add('row-grace');
          else if (data.warning) row.getElement().classList.add('row-warning');
        },
      });
    } else {
      state.calibrationTable.replaceData(state.calibration);
    }

    state.calibrationTable.setFilter(filterCalibrationRows, elements.calibrationSearch.value);
  }

  function renderLogs() {
    if (!state.logs.length) {
      elements.logList.innerHTML = '<div class="log-entry">No transactions have been recorded yet.</div>';
      return;
    }

    elements.logList.innerHTML = state.logs.slice(0, 12).map((entry) => {
      const timestamp = formatDateTime(entry.timestamp);
      return [
        '<article class="log-entry">',
        '<div class="log-meta">',
        `<span class="log-pill">${escapeHtml(entry.module)}</span>`,
        `<small>${escapeHtml(timestamp)}</small>`,
        '</div>',
        `<strong>${escapeHtml(entry.detail || entry.action)}</strong>`,
        `<small>${escapeHtml(entry.actor_name || 'System')} · ${escapeHtml(entry.action)}</small>`,
        '</article>',
      ].join('');
    }).join('');
  }

  function setView(view, options = {}) {
    const nextView = normalizeView(view);
    state.currentView = nextView;
    if (elements.shell) {
      elements.shell.dataset.mode = nextView;
    }
    document.body.dataset.portalMode = nextView;
    if (options.persist !== false) {
      persistView(nextView);
    }

    elements.navTabs.forEach((button) => {
      const isActive = button.dataset.view === nextView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    elements.panels.forEach((panel) => {
      const isActive = panel.dataset.panel === nextView;
      panel.classList.toggle('active', isActive);
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    elements.actionMenuGroups.forEach((group) => {
      const isActive = group.dataset.menuView === nextView;
      group.classList.toggle('active', isActive);
      group.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    if (options.redraw === false) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (nextView === 'inventory' && state.inventoryTable) state.inventoryTable.redraw(true);
        if (nextView === 'calibration' && state.calibrationTable) state.calibrationTable.redraw(true);
      });
    });
  }

  function normalizeView(view) {
    return VALID_VIEWS.has(view) ? view : 'inventory';
  }

  function readStoredView() {
    try {
      const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
      return VALID_VIEWS.has(storedView) ? storedView : null;
    } catch (error) {
      return null;
    }
  }

  function persistView(view) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, normalizeView(view));
    } catch (error) {
      // Ignore storage failures in locked-down browsers.
    }
  }

  function renderGhsSelector() {
    elements.ghsSelector.innerHTML = GHS_OPTIONS.map((item) => [
      `<button class="ghs-token" type="button" data-ghs-symbol="${item.key}">`,
      `<span class="ghs-icon">${getGhsSvg(item.key)}</span>`,
      `<span>${escapeHtml(item.label)}</span>`,
      '</button>',
    ].join('')).join('');

    elements.ghsSelector.querySelectorAll('[data-ghs-symbol]').forEach((button) => {
      button.addEventListener('click', () => button.classList.toggle('is-selected'));
    });
  }

  function getSelectedGhsSymbols() {
    return Array.from(elements.ghsSelector.querySelectorAll('.ghs-token.is-selected')).map((button) => button.dataset.ghsSymbol);
  }

  function setSelectedGhsSymbols(symbols) {
    const selected = new Set(Array.isArray(symbols) ? symbols : []);
    elements.ghsSelector.querySelectorAll('.ghs-token').forEach((button) => {
      button.classList.toggle('is-selected', selected.has(button.dataset.ghsSymbol));
    });
  }

  function openMaterialModal(material) {
    state.editingMaterialId = material ? material.id : null;
    elements.materialModalTitle.textContent = material ? 'Edit Material' : 'Add Material';
    elements.materialForm.reset();
    setSelectedGhsSymbols(material ? material.ghs_symbols : []);
    elements.materialForm.name.value = material ? material.name : '';
    elements.materialForm.batch_id.value = material ? material.batch_id : '';
    elements.materialForm.expiration_date.value = material ? (material.expiration_date || '') : '';
    elements.materialForm.stock_level.value = material ? material.stock_level : '0';
    elements.materialForm.min_threshold.value = material ? material.min_threshold : '0';
    openModal('material-modal');
  }

  function openUsageModal(material) {
    state.activeMaterialId = material.id;
    elements.usageModalTitle.textContent = `Record Usage · ${material.name}`;
    elements.usageForm.reset();
    openModal('usage-modal');
  }

  function openTemplateModal(template) {
    state.editingTemplateId = template ? template.id : null;
    elements.templateModalTitle.textContent = template ? 'Edit Calibration Template' : 'Add Calibration Template';
    elements.templateForm.reset();
    elements.templateForm.template_name.value = template ? template.template_name : '';
    elements.templateForm.category.value = template ? template.category : 'Mechanical';
    elements.templateForm.cal_interval_days.value = template ? template.cal_interval_days : '365';
    elements.templateForm.alert_lead_days.value = template ? template.alert_lead_days : '30';
    elements.templateForm.grace_period_days.value = template ? template.grace_period_days : '14';
    elements.templateForm.unit_of_measure.value = template ? template.unit_of_measure : 'days';
    elements.templateForm.assigned_department.value = template ? template.assigned_department : 'Unassigned';
    openModal('template-modal');
  }

  function syncTemplateOptions(selectedId) {
    const options = ['<option value="">Select a template</option>']
      .concat(state.templates.map((template) => `<option value="${template.id}">${escapeHtml(template.template_name)} · ${escapeHtml(template.category)}</option>`));
    elements.calibrationForm.template_id.innerHTML = options.join('');

    if (selectedId) {
      elements.calibrationForm.template_id.value = String(selectedId);
    } else if (state.templates.length) {
      elements.calibrationForm.template_id.value = String(state.templates[0].id);
    }

    updateCalibrationTemplateSummary(elements.calibrationForm.template_id.value);
  }

  function updateCalibrationTemplateSummary(templateId) {
    const template = state.templates.find((entry) => String(entry.id) === String(templateId));
    if (!template) {
      elements.calibrationTemplateSummary.textContent = 'Select a calibration template to inherit category, interval, alert lead, grace period, unit, and department.';
      return;
    }

    elements.calibrationTemplateSummary.textContent = [
      `${template.template_name} (${template.category})`,
      `${template.cal_interval_days} day interval`,
      `${template.alert_lead_days} day alert`,
      `${template.grace_period_days} day grace`,
      `${template.unit_of_measure}`,
      `${template.assigned_department}`,
    ].join(' · ');
  }

  function openCalibrationModal(asset) {
    if (!state.templates.length) {
      setStatus('Create a calibration template before adding an asset.', 'error');
      openTemplateModal();
      return;
    }

    state.editingCalibrationId = asset ? asset.id : null;
    elements.calibrationModalTitle.textContent = asset ? 'Edit Calibration Asset' : 'Add Calibration Asset';
    elements.calibrationForm.reset();
    syncTemplateOptions(asset ? asset.template_id : null);
    elements.calibrationForm.tool_name.value = asset ? asset.tool_name : '';
    elements.calibrationForm.serial_number.value = asset ? asset.serial_number : '';
    elements.calibrationForm.last_cal.value = asset ? (asset.last_cal || '') : '';
    openModal('calibration-modal');
  }

  function openCheckoutModal(asset) {
    state.activeCalibrationId = asset.id;
    elements.checkoutModalTitle.textContent = `Check Out · ${asset.tool_name}`;
    elements.checkoutForm.reset();
    openModal('checkout-modal');
  }

  function openCertificateModal(asset) {
    state.activeCalibrationId = asset.id;
    elements.certificateModalTitle.textContent = `Generate Certificate · ${asset.tool_name}`;
    elements.certificateForm.reset();
    openModal('certificate-modal');
  }

  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    initializeIcons();
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  async function submitMaterialForm(event) {
    event.preventDefault();
    const payload = {
      name: elements.materialForm.name.value.trim(),
      batch_id: elements.materialForm.batch_id.value.trim(),
      expiration_date: elements.materialForm.expiration_date.value || null,
      stock_level: Number(elements.materialForm.stock_level.value || 0),
      min_threshold: Number(elements.materialForm.min_threshold.value || 0),
      ghs_symbols: getSelectedGhsSymbols(),
    };

    try {
      if (state.editingMaterialId) {
        await apiFetch(`/api/command-center/materials/${state.editingMaterialId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setStatus('Material updated.', 'info');
      } else {
        await apiFetch('/api/command-center/materials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStatus('Material created.', 'info');
      }
      closeModal('material-modal');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to save material.', 'error');
    }
  }

  async function submitUsageForm(event) {
    event.preventDefault();
    try {
      await apiFetch(`/api/command-center/materials/${state.activeMaterialId}/use`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: Number(elements.usageForm.quantity.value || 0),
          reason: elements.usageForm.reason.value.trim(),
        }),
      });
      closeModal('usage-modal');
      setStatus('Usage recorded.', 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to record usage.', 'error');
    }
  }

  async function submitTemplateForm(event) {
    event.preventDefault();
    const payload = {
      template_name: elements.templateForm.template_name.value.trim(),
      category: elements.templateForm.category.value,
      cal_interval_days: Number(elements.templateForm.cal_interval_days.value || 365),
      alert_lead_days: Number(elements.templateForm.alert_lead_days.value || 30),
      grace_period_days: Number(elements.templateForm.grace_period_days.value || 14),
      unit_of_measure: elements.templateForm.unit_of_measure.value.trim() || 'days',
      assigned_department: elements.templateForm.assigned_department.value.trim() || 'Unassigned',
    };

    try {
      const response = state.editingTemplateId
        ? await apiFetch(`/api/command-center/calibration/templates/${state.editingTemplateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await apiFetch('/api/command-center/calibration/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      closeModal('template-modal');
      setStatus(state.editingTemplateId ? 'Calibration template updated.' : 'Calibration template created.', 'info');
      await refreshPortal();
      if (!elements.calibrationModal.classList.contains('hidden')) {
        syncTemplateOptions(response && response.id ? response.id : null);
      }
    } catch (error) {
      setStatus(error.message || 'Failed to save calibration template.', 'error');
    }
  }

  async function submitCalibrationForm(event) {
    event.preventDefault();
    const templateId = Number(elements.calibrationForm.template_id.value || 0);
    if (!templateId) {
      setStatus('Select a calibration template before saving the asset.', 'error');
      return;
    }

    const payload = {
      template_id: templateId,
      tool_name: elements.calibrationForm.tool_name.value.trim(),
      serial_number: elements.calibrationForm.serial_number.value.trim(),
      last_cal: elements.calibrationForm.last_cal.value || null,
    };

    try {
      if (state.editingCalibrationId) {
        await apiFetch(`/api/command-center/calibration/${state.editingCalibrationId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setStatus('Calibration asset updated.', 'info');
      } else {
        await apiFetch('/api/command-center/calibration', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStatus('Calibration asset created.', 'info');
      }
      closeModal('calibration-modal');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to save calibration asset.', 'error');
    }
  }

  async function submitCheckoutForm(event) {
    event.preventDefault();
    try {
      await apiFetch(`/api/command-center/calibration/${state.activeCalibrationId}/check-out`, {
        method: 'POST',
        body: JSON.stringify({ reason: elements.checkoutForm.reason.value.trim() }),
      });
      closeModal('checkout-modal');
      setStatus('Asset check-out logged.', 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to check out asset.', 'error');
    }
  }

  async function submitCertificateForm(event) {
    event.preventDefault();
    try {
      const payload = await apiFetch(`/api/command-center/calibration/${state.activeCalibrationId}/certificate`, {
        method: 'POST',
        body: JSON.stringify({ technician: elements.certificateForm.technician.value.trim() }),
      });
      buildCertificatePdf(payload);
      closeModal('certificate-modal');
      setStatus(`Certificate ${payload.certificate_id} generated locally.`, 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to generate certificate.', 'error');
    }
  }

  async function deleteMaterial(material) {
    if (!window.confirm(`Delete ${material.name}? This removes its usage history as well.`)) return;
    try {
      await apiFetch(`/api/command-center/materials/${material.id}`, { method: 'DELETE' });
      setStatus('Material deleted.', 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to delete material.', 'error');
    }
  }

  async function deleteCalibration(asset) {
    if (!window.confirm(`Delete ${asset.tool_name}?`)) return;
    try {
      await apiFetch(`/api/command-center/calibration/${asset.id}`, { method: 'DELETE' });
      setStatus('Calibration asset deleted.', 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to delete calibration asset.', 'error');
    }
  }

  async function deleteTemplate(template) {
    if (!window.confirm(`Delete template ${template.template_name}?`)) return;
    try {
      await apiFetch(`/api/command-center/calibration/templates/${template.id}`, { method: 'DELETE' });
      setStatus('Calibration template deleted.', 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to delete calibration template.', 'error');
    }
  }

  async function handleInventoryImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const workbook = await readWorkbook(file);
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      const materials = mapInventoryRows(rows);
      if (!materials.length) throw new Error('No valid inventory rows detected in the workbook.');
      await apiFetch('/api/command-center/materials/import', {
        method: 'POST',
        body: JSON.stringify({ materials }),
      });
      setStatus(`Imported ${materials.length} inventory rows.`, 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to import inventory workbook.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  async function handleCalibrationImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const workbook = await readWorkbook(file);
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      const calibration = mapCalibrationRows(rows);
      if (!calibration.length) throw new Error('No valid calibration rows detected in the workbook.');
      await apiFetch('/api/command-center/calibration/import', {
        method: 'POST',
        body: JSON.stringify({ calibration }),
      });
      setStatus(`Imported ${calibration.length} calibration rows.`, 'info');
      refreshPortal();
    } catch (error) {
      setStatus(error.message || 'Failed to import calibration workbook.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  function exportAuditWorkbook() {
    if (!window.XLSX) {
      setStatus('XLSX is not available locally.', 'error');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const inventoryRows = state.materials.map((item) => ({
      Name: item.name,
      Batch: item.batch_id,
      Symbols: item.ghs_symbols.join(', '),
      Expiration: item.expiration_date,
      StockLevel: item.stock_level,
      MinThreshold: item.min_threshold,
      Expired: item.expired ? 'YES' : 'NO',
    }));
    const templateRows = state.templates.map((item) => ({
      TemplateName: item.template_name,
      Category: item.category,
      IntervalDays: item.cal_interval_days,
      AlertLeadDays: item.alert_lead_days,
      GracePeriodDays: item.grace_period_days,
      UnitOfMeasure: item.unit_of_measure,
      AssignedDepartment: item.assigned_department,
      AssetCount: item.asset_count,
    }));
    const calibrationRows = state.calibration.map((item) => ({
      TemplateName: item.template_name,
      ToolName: item.tool_name,
      SerialNumber: item.serial_number,
      Category: item.category,
      AssignedDepartment: item.assigned_department,
      LastCalibration: item.last_cal,
      FrequencyDays: item.cal_frequency,
      AlertLeadDays: item.alert_lead_days,
      GracePeriodDays: item.grace_period_days,
      NextCalibration: item.next_cal,
      Status: item.status,
    }));
    const logRows = state.logs.map((item) => ({
      Module: item.module,
      Action: item.action,
      Detail: item.detail,
      Actor: item.actor_name,
      Timestamp: item.timestamp,
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventoryRows), 'Inventory');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(templateRows), 'Templates');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(calibrationRows), 'Calibration');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(logRows), 'Logs');
    XLSX.writeFile(workbook, `command-center-audit-${todayIso()}.xlsx`);
    setStatus('Audit workbook exported locally.', 'info');
  }

  async function logout() {
    try {
      await apiFetch('/api/command-center/logout', { method: 'POST' });
    } catch (error) {
    }
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/admin.html#signin';
  }

  async function apiFetch(url, options) {
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    if (opts.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      credentials: 'same-origin',
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const errorMessage = typeof data === 'string' ? data : (data && data.error) || response.statusText;
      throw new Error(errorMessage || 'Request failed');
    }

    return data;
  }

  function readWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(XLSX.read(reader.result, { type: 'binary' }));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Unable to read workbook.'));
      reader.readAsBinaryString(file);
    });
  }

  function mapInventoryRows(rows) {
    return rows.map(normalizeRow).map((row) => ({
      name: pickValue(row, ['name', 'material_name', 'material', 'chemical', 'chemical_name']),
      batch_id: pickValue(row, ['batch_id', 'batch', 'batch_number', 'lot', 'lot_number']),
      ghs_symbols: pickValue(row, ['ghs_symbols', 'ghs', 'hazards', 'hazard_symbols']),
      expiration_date: pickValue(row, ['expiration_date', 'expiration', 'expiry', 'exp_date']),
      stock_level: pickValue(row, ['stock_level', 'stock', 'current_stock', 'quantity_on_hand']),
      min_threshold: pickValue(row, ['min_threshold', 'minimum_threshold', 'minimum', 'threshold']),
    })).filter((row) => row.name && row.batch_id);
  }

  function mapCalibrationRows(rows) {
    return rows.map(normalizeRow).map((row) => ({
      template_name: pickValue(row, ['template_name', 'template', 'template_label', 'template_type']),
      tool_name: pickValue(row, ['tool_name', 'tool', 'gage', 'gage_name', 'asset_name']),
      serial_number: pickValue(row, ['serial_number', 'serial', 'asset_id', 'tool_id']),
      category: pickValue(row, ['category', 'template_category']),
      last_cal: pickValue(row, ['last_cal', 'last_calibration', 'last_cal_date', 'calibrated_on']),
      cal_interval_days: pickValue(row, ['cal_interval_days', 'cal_frequency', 'frequency', 'frequency_days', 'cal_days', 'interval_days']),
      alert_lead_days: pickValue(row, ['alert_lead_days', 'alert_window', 'lead_days', 'notify_days']),
      grace_period_days: pickValue(row, ['grace_period_days', 'grace_days', 'lock_after_days']),
      unit_of_measure: pickValue(row, ['unit_of_measure', 'unit', 'uom']),
      assigned_department: pickValue(row, ['assigned_department', 'department', 'dept']),
    })).filter((row) => row.tool_name && row.serial_number);
  }

  function normalizeRow(row) {
    return Object.entries(row || {}).reduce((accumulator, entry) => {
      const [key, value] = entry;
      accumulator[String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')] = value;
      return accumulator;
    }, {});
  }

  function pickValue(row, keys) {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return '';
  }

  function formatTemplateRules(data) {
    return `${data.cal_frequency || data.cal_interval_days}d interval · ${data.alert_lead_days}d alert · ${data.grace_period_days}d grace`;
  }

  function buildCertificatePdf(payload) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF is not available locally.');
    }

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(11, 23, 42);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Command Center', 16, 15);
    doc.setFontSize(12);
    doc.text('Calibration Certificate', 16, 23);

    doc.setTextColor(11, 23, 42);
    doc.setDrawColor(255, 139, 43);
    doc.setLineWidth(0.8);
    doc.line(16, 40, 194, 40);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    const rows = [
      ['Certificate ID', payload.certificate_id],
      ['Issued At', formatDateTime(payload.issued_at)],
      ['Technician', payload.technician],
      ['Template', payload.asset.template_name || 'Not assigned'],
      ['Category', payload.asset.category || 'Not assigned'],
      ['Department', payload.asset.assigned_department || 'Unassigned'],
      ['Asset ID', String(payload.asset.id)],
      ['Tool Name', payload.asset.tool_name],
      ['Serial Number', payload.asset.serial_number],
      ['Last Calibration', payload.asset.last_cal || 'Not set'],
      ['Next Calibration', payload.asset.next_cal || 'Not scheduled'],
      ['Alert Lead', `${payload.asset.alert_lead_days || 0} days`],
      ['Grace Period', `${payload.asset.grace_period_days || 0} days`],
      ['Status', payload.asset.status],
    ];

    let statementY = 168;

    if (hasAutoTablePlugin() && typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: 46,
        head: [['Field', 'Value']],
        body: rows,
        theme: 'grid',
        margin: { left: 16, right: 68 },
        headStyles: {
          fillColor: [11, 23, 42],
          textColor: [255, 255, 255],
        },
        styles: {
          font: 'helvetica',
          fontSize: 10,
          cellPadding: 3.5,
          lineColor: [214, 224, 236],
          lineWidth: 0.15,
          textColor: [11, 23, 42],
        },
        alternateRowStyles: {
          fillColor: [247, 249, 252],
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 44 },
        },
      });
      statementY = Math.max(168, ((doc.lastAutoTable && doc.lastAutoTable.finalY) || 120) + 12);
    } else {
      rows.forEach((entry, index) => {
        const y = 52 + (index * 8);
        doc.setFont('helvetica', 'bold');
        doc.text(`${entry[0]}:`, 16, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(entry[1] || ''), 62, y);
      });
      statementY = 150;
    }

    doc.setFont('helvetica', 'bold');
    doc.text('Verification QR', 150, 52);
    if (payload.qr_data_url) {
      doc.addImage(payload.qr_data_url, 'PNG', 145, 58, 42, 42);
    }

    doc.setFillColor(255, 248, 238);
    doc.roundedRect(16, statementY, 178, 34, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Operational Statement', 20, statementY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text('This asset was reviewed and certified locally by the Command Center portal.', 20, statementY + 20);
    doc.text('Assets remain available during warning and grace windows, then hard-lock after grace expires.', 20, statementY + 27);

    doc.save(`calibration-certificate-${payload.asset.serial_number}.pdf`);
  }

  function filterTemplateRows(data, term) {
    const value = String(term || '').trim().toLowerCase();
    if (!value) return true;
    return [data.template_name, data.category, data.assigned_department].some((field) => String(field || '').toLowerCase().includes(value));
  }

  function filterInventoryRows(data, term) {
    const value = String(term || '').trim().toLowerCase();
    if (!value) return true;
    return [data.name, data.batch_id, (data.ghs_symbols || []).join(' '), data.expiration_date].some((field) => String(field || '').toLowerCase().includes(value));
  }

  function filterCalibrationRows(data, term) {
    const value = String(term || '').trim().toLowerCase();
    if (!value) return true;
    return [
      data.tool_name,
      data.template_name,
      data.serial_number,
      data.status,
      data.category,
      data.assigned_department,
      data.next_cal,
    ].some((field) => String(field || '').toLowerCase().includes(value));
  }

  function formatShelfLife(item) {
    if (item.days_remaining === null || item.days_remaining === undefined) return '<span class="status-chip status-info">Open</span>';
    if (item.days_remaining < 0) return `<span class="status-chip status-danger">Expired ${Math.abs(item.days_remaining)}d</span>`;
    if (item.days_remaining === 0) return '<span class="status-chip status-warning">Expires Today</span>';
    return `<span class="status-chip status-ok">${item.days_remaining}d Remaining</span>`;
  }

  function formatMaterialStatus(item) {
    if (item.expired) return '<span class="status-chip status-danger">Expired</span>';
    if (item.low_stock) return '<span class="status-chip status-warning">Low Stock</span>';
    if (item.high_hazard) return '<span class="status-chip status-info">High Hazard</span>';
    return '<span class="status-chip status-ok">Ready</span>';
  }

  function formatCalibrationStatus(item) {
    if (item.locked_for_checkout) return '<span class="status-chip status-danger">LOCKED</span>';
    if (item.in_grace_period) return `<span class="status-chip status-grace">GRACE ${item.grace_remaining_days}d</span>`;
    if (item.warning) {
      if (item.days_until_due === 0) return '<span class="status-chip status-warning">WARNING TODAY</span>';
      if (typeof item.days_until_due === 'number') return `<span class="status-chip status-warning">WARNING ${item.days_until_due}d</span>`;
      return '<span class="status-chip status-warning">WARNING</span>';
    }
    return '<span class="status-chip status-ok">SAFE</span>';
  }

  function renderGhsSymbols(symbols) {
    if (!Array.isArray(symbols) || !symbols.length) return '<span class="status-chip status-info">None</span>';
    return `<div class="ghs-icon-stack">${symbols.map((symbol) => `<span class="ghs-icon" title="${escapeHtml(symbol)}">${getGhsSvg(symbol)}</span>`).join('')}</div>`;
  }

  function getGhsSvg(symbol) {
    const key = String(symbol || '').trim().toLowerCase();
    const stroke = '#1f2937';
    const danger = '#111827';
    const wrap = (content) => `<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32 4 60 32 32 60 4 32" fill="#fff" stroke="#c62828" stroke-width="4"></polygon>${content}</svg>`;

    const icons = {
      explosive: wrap(`<path d="M24 44c4-14 20-8 16-24 7 7 4 17-2 21 6 0 8 4 8 7H18c1-2 3-4 6-4Z" fill="${danger}"></path>`),
      flammable: wrap(`<path d="M34 16c5 8-1 11 3 17 2 3 7 4 7 10 0 7-5 11-12 11s-12-4-12-11c0-8 8-12 8-19 3 3 4 6 3 9 4-3 5-8 3-17Z" fill="${danger}"></path>`),
      flame_circle: wrap(`<circle cx="32" cy="32" r="8" fill="none" stroke="${danger}" stroke-width="4"></circle><path d="M32 18v10M32 36v10M18 32h10M36 32h10" stroke="${danger}" stroke-width="4" stroke-linecap="round"></path>`),
      gas_cylinder: wrap(`<rect x="24" y="14" width="16" height="36" rx="7" fill="none" stroke="${danger}" stroke-width="4"></rect><path d="M28 14v-4h8v4" stroke="${danger}" stroke-width="4" stroke-linecap="round"></path>`),
      corrosive: wrap(`<path d="M16 44h32" stroke="${danger}" stroke-width="4"></path><path d="M20 20h12l-4 10H16zM34 18h12l-4 10H30z" fill="${danger}"></path><path d="M24 36l-4 8M40 34l-2 6" stroke="${danger}" stroke-width="4" stroke-linecap="round"></path>`),
      toxic: wrap(`<circle cx="32" cy="24" r="8" fill="none" stroke="${danger}" stroke-width="4"></circle><path d="M22 42 42 22M22 22l20 20M26 48h12" stroke="${danger}" stroke-width="4" stroke-linecap="round"></path>`),
      health_hazard: wrap(`<path d="M32 18c5 0 8 4 8 9 0 7-8 15-8 15s-8-8-8-15c0-5 3-9 8-9Z" fill="none" stroke="${danger}" stroke-width="4"></path><path d="M32 24v10M27 29h10" stroke="${danger}" stroke-width="4" stroke-linecap="round"></path>`),
      exclamation_mark: wrap(`<path d="M32 18v18" stroke="${danger}" stroke-width="6" stroke-linecap="round"></path><circle cx="32" cy="46" r="3.5" fill="${danger}"></circle>`),
      environmental_hazard: wrap(`<path d="M20 44c6-4 10-10 14-20 3 8 7 13 10 16M24 46h18" stroke="${danger}" stroke-width="4" stroke-linecap="round"></path><path d="M42 40c4-2 8-1 10 2-3 5-7 7-13 5" fill="none" stroke="${danger}" stroke-width="4"></path>`),
    };

    return icons[key] || wrap(`<circle cx="32" cy="32" r="10" fill="none" stroke="${danger}" stroke-width="4"></circle>`);
  }

  function eventTargetAction(event) {
    const target = event && event.target ? event.target.closest('[data-action]') : null;
    return target ? target.dataset.action : '';
  }

  function setStatus(message, variant) {
    clearTimeout(state.currentStatusTimeout);
    elements.statusBanner.textContent = message;
    elements.statusBanner.classList.remove('hidden', 'error');
    if (variant === 'error') {
      elements.statusBanner.classList.add('error');
    }
    state.currentStatusTimeout = window.setTimeout(() => {
      elements.statusBanner.classList.add('hidden');
    }, 3800);
  }

  function formatDateTime(value) {
    if (!value) return 'Unknown time';
    if (window.luxon && window.luxon.DateTime) {
      const parsed = window.luxon.DateTime.fromISO(String(value));
      return parsed.isValid ? parsed.toFormat('yyyy-LL-dd HH:mm') : String(value);
    }
    return String(value).replace('T', ' ').slice(0, 16);
  }

  function todayIso() {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();