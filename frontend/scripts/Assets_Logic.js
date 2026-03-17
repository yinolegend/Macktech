(function tacticalCommandCenter() {
  const auth = window.CommandCenterAuth || {};
  const TOKEN_KEY = auth.TOKEN_KEY || 'command_center_token';
  const LEGACY_TOKEN_KEY = auth.LEGACY_TOKEN_KEY || 'mack_token';
  const VIEW_STORAGE_KEY = 'command_center_view';
  const SECTION_STORAGE_KEY = 'command_center_section';
  const SETTINGS_STORAGE_KEY = 'command_center_settings';
  const VALID_VIEWS = new Set(['hazmat', 'calibration']);
  const VALID_SECTIONS = new Set(['dashboard', 'assets', 'cfe', 'templates', 'reports', 'settings']);
  const DEFAULT_SETTINGS = {
    defaultDepartment: 'Operations',
    hazmatWarningLeadDays: 30,
    calibrationAlertLeadDays: 30,
    calibrationGraceDays: 14,
  };

  const GHS_OPTIONS = [
    { key: 'explosive', label: 'Explosive', description: 'Shock-sensitive or unstable energetic compounds.' },
    { key: 'flammable', label: 'Flammable', description: 'Ignition risk from spark, flame, or heat.' },
    { key: 'oxidizing', label: 'Oxidizer', description: 'Feeds combustion and escalates thermal events.' },
    { key: 'gas_cylinder', label: 'Gas', description: 'Compressed or liquefied gas under pressure.' },
    { key: 'corrosive', label: 'Corrosive', description: 'Damages skin, metals, or process surfaces.' },
    { key: 'toxic', label: 'Toxic', description: 'Acute toxic exposure hazard.' },
    { key: 'health_hazard', label: 'Health', description: 'Long-term respiratory or organ impact.' },
    { key: 'exclamation_mark', label: 'Irritant', description: 'Skin, eye, or respiratory irritant.' },
    { key: 'environmental_hazard', label: 'Environment', description: 'Environmental contamination risk.' },
  ];

  const state = {
    user: null,
    currentView: 'hazmat',
    currentSection: 'dashboard',
    settings: { ...DEFAULT_SETTINGS },
    assetFilters: {
      scope: 'all',
      department: 'all',
      type: 'all',
      date: '',
    },
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

  const elements = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    state.settings = loadSettings();
    state.currentView = readStoredView() || state.currentView;
    state.currentSection = readStoredSection() || state.currentSection;
    hydrateSettingsForm();
    renderGhsSelector();
    wireEvents();
    checkDependencies();
    setView(state.currentView, { persist: false, redraw: false });
    setSection(state.currentSection, { persist: false });
    refreshPortal();
  }

  function cacheDom() {
    elements.shell = document.querySelector('.tactical-shell');
    elements.assetWarning = document.getElementById('asset-warning');
    elements.statusBanner = document.getElementById('status-banner');
    elements.sessionUser = document.getElementById('session-user');
    elements.sectionLabel = document.getElementById('section-label');
    elements.sectionTitle = document.getElementById('section-title');
    elements.sectionSubtitle = document.getElementById('section-subtitle');
    elements.activeDatabaseChip = document.getElementById('active-database-chip');
    elements.openAssetsButton = document.getElementById('open-assets-button');
    elements.assetScopeFilter = document.getElementById('asset-scope-filter');
    elements.assetDepartmentFilter = document.getElementById('asset-department-filter');
    elements.assetTypeFilter = document.getElementById('asset-type-filter');
    elements.assetDateFilter = document.getElementById('asset-date-filter');
    elements.clearAssetFiltersButton = document.getElementById('clear-asset-filters-button');
    elements.dashboardAssetResults = document.getElementById('dashboard-asset-results');
    elements.expiredCount = document.getElementById('expired-count');
    elements.lowStockCount = document.getElementById('low-stock-count');
    elements.warningCount = document.getElementById('warning-count');
    elements.lockedCount = document.getElementById('locked-count');
    elements.dashboardFocus = document.getElementById('dashboard-focus');
    elements.reportSummary = document.getElementById('report-summary');
    elements.hazmatDnaGrid = document.getElementById('hazmat-dna-grid');
    elements.logList = document.getElementById('recent-log-list');
    elements.inventorySearch = document.getElementById('inventory-search');
    elements.templateSearch = document.getElementById('template-search');
    elements.calibrationSearch = document.getElementById('calibration-search');
    elements.inventoryTable = document.getElementById('inventory-table');
    elements.templateTable = document.getElementById('template-table');
    elements.calibrationTable = document.getElementById('calibration-table');
    elements.inventoryImportInput = document.getElementById('inventory-import-input');
    elements.calibrationImportInput = document.getElementById('calibration-import-input');
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
    elements.assetDetailModal = document.getElementById('asset-detail-modal');
    elements.assetDetailEyebrow = document.getElementById('asset-detail-eyebrow');
    elements.assetDetailTitle = document.getElementById('asset-detail-title');
    elements.assetDetailKind = document.getElementById('asset-detail-kind');
    elements.assetDetailStatus = document.getElementById('asset-detail-status');
    elements.assetDetailGrid = document.getElementById('asset-detail-grid');
    elements.ghsSelector = document.getElementById('ghs-selector');
    elements.settingsForm = document.getElementById('settings-form');
    elements.viewSelector = document.getElementById('view-selector');
    elements.sectionButtons = Array.from(document.querySelectorAll('.sidebar-nav-button'));
    elements.sections = Array.from(document.querySelectorAll('.workspace-section'));
    elements.viewPanels = Array.from(document.querySelectorAll('.view-panel'));
  }

  function wireEvents() {
    addEvent(document.getElementById('refresh-button'), 'click', refreshPortal);
    addEvent(document.getElementById('export-audit-button'), 'click', exportAuditWorkbook);
    addEvent(document.getElementById('logout-button'), 'click', logout);
    addEvent(elements.openAssetsButton, 'click', openFilteredAssetsWorkspace);
    addEvent(elements.clearAssetFiltersButton, 'click', clearAssetFilters);
    addEvent(document.getElementById('add-material-button'), 'click', () => openMaterialModal());
    addEvent(document.getElementById('add-template-button'), 'click', () => openTemplateModal());
    addEvent(document.getElementById('add-calibration-button'), 'click', () => {
      if (!state.templates.length) {
        setSection('templates');
        setView('calibration');
        setStatus('Create a calibration template before adding an asset.', 'error');
        openTemplateModal();
        return;
      }
      openCalibrationModal();
    });

    addEvent(elements.viewSelector, 'change', (event) => setView(event.target.value));
    addEvent(elements.assetScopeFilter, 'change', (event) => updateAssetFilter('scope', event.target.value));
    addEvent(elements.assetDepartmentFilter, 'change', (event) => updateAssetFilter('department', event.target.value));
    addEvent(elements.assetTypeFilter, 'change', (event) => updateAssetFilter('type', event.target.value));
    addEvent(elements.assetDateFilter, 'input', (event) => updateAssetFilter('date', event.target.value));
    addEvent(elements.dashboardAssetResults, 'click', handleAssetResultClick);

    elements.sectionButtons.forEach((button) => {
      button.addEventListener('click', () => setSection(button.dataset.section));
    });

    addEvent(elements.inventorySearch, 'input', applyInventoryTableFilters);

    addEvent(elements.templateSearch, 'input', () => {
      if (state.templateTable) {
        state.templateTable.setFilter(filterTemplateRows, elements.templateSearch.value);
      }
    });

    addEvent(elements.calibrationSearch, 'input', applyCalibrationTableFilters);

    addEvent(elements.materialForm, 'submit', submitMaterialForm);
    addEvent(elements.usageForm, 'submit', submitUsageForm);
    addEvent(elements.templateForm, 'submit', submitTemplateForm);
    addEvent(elements.calibrationForm, 'submit', submitCalibrationForm);
    addEvent(elements.manageTemplateButton, 'click', () => openTemplateModal());
    addEvent(elements.checkoutForm, 'submit', submitCheckoutForm);
    addEvent(elements.certificateForm, 'submit', submitCertificateForm);
    addEvent(elements.inventoryImportInput, 'change', handleInventoryImport);
    addEvent(elements.calibrationImportInput, 'change', handleCalibrationImport);
    addEvent(elements.settingsForm, 'submit', submitSettingsForm);

    if (elements.calibrationForm && elements.calibrationForm.template_id) {
      elements.calibrationForm.template_id.addEventListener('change', (event) => {
        updateCalibrationTemplateSummary(event.target.value);
      });
    }

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal.id);
      });
    });
  }

  function addEvent(target, eventName, handler) {
    if (target) target.addEventListener(eventName, handler);
  }

  function checkDependencies() {
    const missing = [];
    if (typeof window.Tabulator !== 'function') missing.push('tabulator.min.js');
    if (!window.XLSX) missing.push('xlsx.full.min.js');
    if (!window.jspdf || !window.jspdf.jsPDF) missing.push('jspdf.min.js');
    if (!window.luxon || !window.luxon.DateTime) missing.push('luxon.min.js');

    if (missing.length) {
      elements.assetWarning.classList.remove('hidden');
      elements.assetWarning.textContent = `Offline asset warning: missing ${missing.join(', ')}. Keep only the approved local files in /public/js/.`;
      return;
    }

    elements.assetWarning.classList.add('hidden');
    elements.assetWarning.textContent = '';
  }

  async function refreshPortal(options = {}) {
    const silentStatus = Boolean(options && options.silentStatus);
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
      if (!silentStatus) {
        setStatus('Command Center synchronized.', 'info');
      }
    } catch (error) {
      setStatus(error.message || 'Failed to load Command Center data.', 'error');
    }
  }

  function renderAll() {
    elements.sessionUser.textContent = state.user
      ? `${state.user.display_name || state.user.username} (${state.user.role})`
      : 'Authenticated';

    renderDashboard();
    renderDashboardFocus();
    renderReportSummary();
    renderHazmatDna();
    renderInventoryTable();
    renderTemplateTable();
    renderCalibrationTable();
    renderAssetConsole();
    renderLogs();
    hydrateSettingsForm();
    setView(state.currentView, { persist: false });
    setSection(state.currentSection, { persist: false });
  }

  function renderDashboard() {
    const expiredHazmat = state.materials.filter((item) => item.expired).length;
    const lowStock = state.materials.filter((item) => item.low_stock).length;
    const warnings = state.materials.filter(isHazmatWarning).length + state.calibration.filter((item) => item.warning).length;
    const locked = state.calibration.filter(isCalibrationRed).length;

    elements.expiredCount.textContent = String(expiredHazmat + locked);
    elements.lowStockCount.textContent = String(lowStock);
    elements.warningCount.textContent = String(warnings);
    elements.lockedCount.textContent = String(locked);
  }

  function renderDashboardFocus() {
    const items = state.currentView === 'hazmat'
      ? buildHazmatDashboardItems()
      : buildCalibrationDashboardItems();

    if (!items.length) {
      elements.dashboardFocus.innerHTML = '<div class="focus-item"><strong>No assets registered</strong><p>Create an asset and it will appear here after refresh.</p></div>';
      return;
    }

    elements.dashboardFocus.innerHTML = items.map((item) => [
      '<article class="focus-item">',
      `<strong>${escapeHtml(item.title)}</strong>`,
      `<p>${escapeHtml(item.meta)}</p>`,
      '</article>',
    ].join('')).join('');
  }

  function buildHazmatDashboardItems() {
    const priority = state.materials
      .filter((item) => item.expired || isHazmatWarning(item) || item.low_stock)
      .sort((left, right) => Number(left.days_remaining || 99999) - Number(right.days_remaining || 99999))
      .map((item) => ({
        key: `hazmat-${item.id}`,
        title: `${item.name} · ${item.batch_id}`,
        meta: item.expired
          ? 'RED · expiration passed'
          : isHazmatWarning(item)
            ? `AMBER · ${item.days_remaining}d remaining`
            : 'AMBER · low stock threshold hit',
      }));

    const recent = state.materials
      .slice()
      .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
      .map((item) => ({
        key: `hazmat-${item.id}`,
        title: `${item.name} · ${item.batch_id}`,
        meta: item.expired
          ? 'RED · expiration passed'
          : isHazmatWarning(item)
            ? `AMBER · ${item.days_remaining}d remaining`
            : item.low_stock
              ? 'AMBER · low stock threshold hit'
              : item.high_hazard
                ? 'READY · high hazard inventory'
                : 'READY · latest saved asset',
      }));

    return buildDashboardBoard(priority, recent);
  }

  function buildCalibrationDashboardItems() {
    const priority = state.calibration
      .filter((item) => isCalibrationRed(item) || item.warning)
      .sort((left, right) => Number(left.days_until_due || 99999) - Number(right.days_until_due || 99999))
      .map((item) => ({
        key: `calibration-${item.id}`,
        title: `${item.tool_name} · ${item.serial_number}`,
        meta: isCalibrationRed(item)
          ? `RED · ${item.status}`
          : `AMBER · ${typeof item.days_until_due === 'number' ? `${item.days_until_due}d to due` : 'warning lead active'}`,
      }));

    const recent = state.calibration
      .slice()
      .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
      .map((item) => ({
        key: `calibration-${item.id}`,
        title: `${item.tool_name} · ${item.serial_number}`,
        meta: isCalibrationRed(item)
          ? `RED · ${item.status}`
          : item.warning
            ? `AMBER · ${typeof item.days_until_due === 'number' ? `${item.days_until_due}d to due` : 'warning lead active'}`
            : item.next_cal
              ? `${String(item.status || 'SAFE').toUpperCase()} · next cal ${item.next_cal}`
              : `${String(item.status || 'SAFE').toUpperCase()} · latest saved asset`,
      }));

    return buildDashboardBoard(priority, recent);
  }

  function buildDashboardBoard(priorityItems, recentItems) {
    const seen = new Set();
    return priorityItems
      .concat(recentItems)
      .filter((item) => {
        if (!item || !item.key || seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      })
      .slice(0, 6);
  }

  function renderAssetConsole() {
    const entries = buildAssetDirectoryEntries();
    syncAssetDepartmentOptions(entries);
    syncAssetTypeOptions(entries);
    hydrateAssetFilterControls();
    renderAssetResults(applyAssetConsoleFilters(entries));
    applyInventoryTableFilters();
    applyCalibrationTableFilters();
  }

  function buildAssetDirectoryEntries() {
    const hazmatEntries = state.materials.map((item) => ({
      key: `hazmat-${item.id}`,
      source: 'hazmat',
      view: 'hazmat',
      section: 'assets',
      id: item.id,
      title: item.name,
      subtitle: item.batch_id,
      department: '',
      typeTags: ['material'].concat(item.high_hazard ? ['high_hazard'] : [], item.low_stock ? ['low_stock'] : [], item.expired ? ['expired'] : [], isHazmatWarning(item) ? ['warning'] : []),
      dateValue: item.expiration_date || '',
      dateLabel: item.expiration_date ? `Expires ${item.expiration_date}` : 'No expiration date',
      detail: item.high_hazard ? 'High hazard material' : 'Hazmat inventory',
      statusHtml: formatMaterialStatus(item),
      priorityRank: item.expired ? 0 : (isHazmatWarning(item) || item.low_stock ? 1 : 2),
    }));

    const calibrationEntries = state.calibration.map((item) => ({
      key: `calibration-${item.id}`,
      source: 'calibration',
      view: 'calibration',
      section: 'assets',
      id: item.id,
      title: item.tool_name,
      subtitle: item.serial_number,
      department: item.assigned_department || '',
      typeTags: ['calibration', normalizeFilterTag(item.category)].concat(item.locked_for_checkout ? ['locked'] : [], item.expired ? ['expired'] : [], item.warning ? ['warning'] : []),
      dateValue: item.next_cal || item.last_cal || '',
      dateLabel: item.next_cal ? `Next cal ${item.next_cal}` : (item.last_cal ? `Last cal ${item.last_cal}` : 'No calibration date'),
      detail: item.category || 'Calibration asset',
      statusHtml: formatCalibrationStatus(item),
      priorityRank: isCalibrationRed(item) ? 0 : (item.warning ? 1 : 2),
    }));

    return hazmatEntries.concat(calibrationEntries);
  }

  function syncAssetDepartmentOptions(entries) {
    if (!elements.assetDepartmentFilter) return;
    const departments = Array.from(new Set(entries.map((entry) => entry.department).filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const options = ['<option value="all">All Departments</option>']
      .concat(departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`));
    elements.assetDepartmentFilter.innerHTML = options.join('');
    if (state.assetFilters.department !== 'all' && !departments.includes(state.assetFilters.department)) {
      state.assetFilters.department = 'all';
    }
  }

  function syncAssetTypeOptions(entries) {
    if (!elements.assetTypeFilter) return;
    const typeValues = Array.from(new Set(entries.flatMap((entry) => entry.typeTags || []).filter(Boolean))).sort((left, right) => assetTypeLabel(left).localeCompare(assetTypeLabel(right)));
    const options = ['<option value="all">All Types</option>']
      .concat(typeValues.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(assetTypeLabel(type))}</option>`));
    elements.assetTypeFilter.innerHTML = options.join('');
    if (state.assetFilters.type !== 'all' && !typeValues.includes(state.assetFilters.type)) {
      state.assetFilters.type = 'all';
    }
  }

  function hydrateAssetFilterControls() {
    if (elements.assetScopeFilter) elements.assetScopeFilter.value = state.assetFilters.scope;
    if (elements.assetDepartmentFilter) elements.assetDepartmentFilter.value = state.assetFilters.department;
    if (elements.assetTypeFilter) elements.assetTypeFilter.value = state.assetFilters.type;
    if (elements.assetDateFilter) elements.assetDateFilter.value = state.assetFilters.date;
  }

  function applyAssetConsoleFilters(entries) {
    const filters = state.assetFilters;
    return entries
      .filter((entry) => {
        if (filters.scope !== 'all' && entry.source !== filters.scope) return false;
        if (filters.department !== 'all' && entry.department !== filters.department) return false;
        if (filters.type !== 'all' && !(entry.typeTags || []).includes(filters.type)) return false;
        if (filters.date) {
          if (!entry.dateValue) return false;
          if (entry.dateValue > filters.date) return false;
        }
        return true;
      })
      .sort((left, right) => left.priorityRank - right.priorityRank || Number(right.id || 0) - Number(left.id || 0));
  }

  function renderAssetResults(entries) {
    if (!elements.dashboardAssetResults) return;

    if (!entries.length) {
      const emptyMessage = state.assetFilters.scope === 'cfe'
        ? 'No CFE records are available yet. This filter is ready once CFE data is added.'
        : 'No assets match the active filters.';
      elements.dashboardAssetResults.innerHTML = `<div class="focus-item"><strong>No matching assets</strong><p>${escapeHtml(emptyMessage)}</p></div>`;
      return;
    }

    elements.dashboardAssetResults.innerHTML = entries.slice(0, 8).map((entry) => [
      `<button class="asset-result-card" type="button" data-asset-source="${escapeHtml(entry.source)}" data-asset-id="${escapeHtml(String(entry.id))}">`,
      '<div class="asset-result-meta">',
      `<span class="status-chip ${entry.source === 'calibration' ? 'status-amber' : 'status-blue'}">${escapeHtml(assetTypeLabel(entry.source))}</span>`,
      entry.dateLabel ? `<span class="status-chip status-blue">${escapeHtml(entry.dateLabel)}</span>` : '',
      '</div>',
      `<strong>${escapeHtml(entry.title)} · ${escapeHtml(entry.subtitle)}</strong>`,
      `<p>${escapeHtml(entry.detail)}${entry.department ? ` · ${escapeHtml(entry.department)}` : ''}</p>`,
      `<div class="detail-html">${entry.statusHtml}</div>`,
      '</button>',
    ].join('')).join('');
  }

  function updateAssetFilter(key, value) {
    state.assetFilters[key] = value || (key === 'date' ? '' : 'all');
    renderAssetConsole();
  }

  function clearAssetFilters() {
    state.assetFilters = {
      scope: 'all',
      department: 'all',
      type: 'all',
      date: '',
    };
    renderAssetConsole();
  }

  function handleAssetResultClick(event) {
    const target = event && event.target ? event.target.closest('[data-asset-source][data-asset-id]') : null;
    if (!target) return;
    openAssetFromConsole(target.dataset.assetSource, target.dataset.assetId);
  }

  function openAssetFromConsole(source, id) {
    if (source === 'calibration') {
      const asset = findCalibrationById(id);
      setView('calibration');
      setSection('assets');
      if (asset) openAssetDetailModal(asset, 'calibration');
      return;
    }

    if (source === 'hazmat') {
      const material = findMaterialById(id);
      setView('hazmat');
      setSection('assets');
      if (material) openAssetDetailModal(material, 'hazmat');
    }
  }

  function openFilteredAssetsWorkspace() {
    if (state.assetFilters.scope === 'calibration') {
      setView('calibration');
      setSection('assets');
      return;
    }

    if (state.assetFilters.scope === 'cfe') {
      setSection('cfe');
      return;
    }

    if (state.assetFilters.scope === 'hazmat') {
      setView('hazmat');
    }

    setSection('assets');
  }

  function applyInventoryTableFilters() {
    if (!state.inventoryTable) return;
    const searchTerm = elements.inventorySearch ? elements.inventorySearch.value : '';
    state.inventoryTable.setFilter((data) => matchesInventoryAssetFilters(data) && filterInventoryRows(data, searchTerm));
  }

  function applyCalibrationTableFilters() {
    if (!state.calibrationTable) return;
    const searchTerm = elements.calibrationSearch ? elements.calibrationSearch.value : '';
    state.calibrationTable.setFilter((data) => matchesCalibrationAssetFilters(data) && filterCalibrationRows(data, searchTerm));
  }

  function matchesInventoryAssetFilters(data) {
    const filters = state.assetFilters;
    if (filters.scope === 'calibration' || filters.scope === 'cfe') return false;
    if (filters.department !== 'all') return false;
    if (filters.type !== 'all' && !getHazmatTypeTags(data).includes(filters.type)) return false;
    if (filters.date) {
      if (!data.expiration_date) return false;
      if (data.expiration_date > filters.date) return false;
    }
    return true;
  }

  function matchesCalibrationAssetFilters(data) {
    const filters = state.assetFilters;
    if (filters.scope === 'hazmat' || filters.scope === 'cfe') return false;
    if (filters.department !== 'all' && (data.assigned_department || '') !== filters.department) return false;
    if (filters.type !== 'all' && !getCalibrationTypeTags(data).includes(filters.type)) return false;
    if (filters.date) {
      const dateValue = data.next_cal || data.last_cal;
      if (!dateValue) return false;
      if (dateValue > filters.date) return false;
    }
    return true;
  }

  function getHazmatTypeTags(item) {
    return ['material'].concat(item.high_hazard ? ['high_hazard'] : [], item.low_stock ? ['low_stock'] : [], item.expired ? ['expired'] : [], isHazmatWarning(item) ? ['warning'] : []);
  }

  function getCalibrationTypeTags(item) {
    return ['calibration', normalizeFilterTag(item.category)].concat(item.locked_for_checkout ? ['locked'] : [], item.expired ? ['expired'] : [], item.warning ? ['warning'] : []);
  }

  function assetTypeLabel(type) {
    const labels = {
      hazmat: 'Hazmat',
      calibration: 'Calibration',
      cfe: 'CFE',
      material: 'Material',
      high_hazard: 'High Hazard',
      low_stock: 'Low Stock',
      warning: 'Warning',
      expired: 'Expired',
      locked: 'Locked',
      mechanical: 'Mechanical',
      electrical: 'Electrical',
      pressure: 'Pressure',
    };
    return labels[type] || startCase(type);
  }

  function renderReportSummary() {
    const metrics = [
      { label: 'Hazmat Rows', value: state.materials.length },
      { label: 'Calibration Rows', value: state.calibration.length },
      { label: 'Templates', value: state.templates.length },
      { label: 'Logs', value: state.logs.length },
    ];

    elements.reportSummary.innerHTML = metrics.map((metric) => [
      '<div class="report-metric">',
      `<strong>${escapeHtml(String(metric.value))}</strong>`,
      `<small>${escapeHtml(metric.label)}</small>`,
      '</div>',
    ].join('')).join('');
  }

  function renderHazmatDna() {
    const lead = state.settings.hazmatWarningLeadDays;
    elements.hazmatDnaGrid.innerHTML = GHS_OPTIONS.map((item) => [
      '<article class="dna-card">',
      `<div class="ghs-icon" aria-hidden="true">${getGhsSvg(item.key)}</div>`,
      `<strong>${escapeHtml(item.label)}</strong>`,
      `<p>${escapeHtml(item.description)}</p>`,
      `<small>AMBER lead window: ${escapeHtml(String(lead))} day(s)</small>`,
      '</article>',
    ].join('')).join('');
  }

  function renderInventoryTable() {
    if (typeof window.Tabulator !== 'function') {
      elements.inventoryTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      return;
    }

    const columns = [
      { title: 'Material', field: 'name', minWidth: 170 },
      { title: 'Batch', field: 'batch_id', minWidth: 120 },
      {
        title: 'GHS',
        field: 'ghs_symbols',
        minWidth: 160,
        formatter: (cell) => renderGhsSymbols(cell.getValue()),
      },
      { title: 'Expiration', field: 'expiration_date', minWidth: 120 },
      {
        title: 'Shelf Life',
        field: 'days_remaining',
        minWidth: 120,
        formatter: (cell) => formatShelfLife(cell.getRow().getData()),
      },
      { title: 'Stock', field: 'stock_level', hozAlign: 'right', minWidth: 88 },
      { title: 'Min', field: 'min_threshold', hozAlign: 'right', minWidth: 88 },
      {
        title: 'Status',
        field: 'expired',
        minWidth: 160,
        formatter: (cell) => formatMaterialStatus(cell.getRow().getData()),
      },
      {
        title: 'Actions',
        field: 'actions',
        minWidth: 220,
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
        placeholder: 'No hazmat assets are currently registered.',
        columns,
        rowClick: (event, row) => {
          if (eventTargetAction(event)) return;
          openAssetDetailModal(row.getData(), 'hazmat');
        },
        rowFormatter: (row) => {
          const data = row.getData();
          row.getElement().classList.remove('row-danger', 'row-amber');
          if (data.expired) row.getElement().classList.add('row-danger');
          else if (isHazmatWarning(data) || data.low_stock) row.getElement().classList.add('row-amber');
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
      { title: 'Template', field: 'template_name', minWidth: 170 },
      { title: 'Category', field: 'category', minWidth: 120 },
      {
        title: 'Rules',
        field: 'cal_interval_days',
        minWidth: 220,
        formatter: (cell) => formatTemplateRules(cell.getRow().getData()),
      },
      { title: 'Department', field: 'assigned_department', minWidth: 150 },
      { title: 'Assets', field: 'asset_count', minWidth: 80, hozAlign: 'right' },
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
      { title: 'Serial', field: 'serial_number', minWidth: 140 },
      { title: 'Last Cal', field: 'last_cal', minWidth: 110 },
      {
        title: 'Rules',
        field: 'cal_frequency',
        minWidth: 220,
        formatter: (cell) => formatTemplateRules(cell.getRow().getData()),
      },
      { title: 'Next Cal', field: 'next_cal', minWidth: 110 },
      { title: 'Department', field: 'assigned_department', minWidth: 140 },
      {
        title: 'Status',
        field: 'status',
        minWidth: 160,
        formatter: (cell) => formatCalibrationStatus(cell.getRow().getData()),
      },
      {
        title: 'Actions',
        field: 'actions',
        minWidth: 300,
        headerSort: false,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          const disabled = isCalibrationRed(row) ? 'disabled' : '';
          return [
            '<div class="table-actions">',
            `<button class="table-button" data-action="checkout" ${disabled}>Check-out</button>`,
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
          if (action === 'checkout' && !isCalibrationRed(row)) openCheckoutModal(row);
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
        rowClick: (event, row) => {
          if (eventTargetAction(event)) return;
          openAssetDetailModal(row.getData(), 'calibration');
        },
        rowFormatter: (row) => {
          const data = row.getData();
          row.getElement().classList.remove('row-danger', 'row-amber');
          if (isCalibrationRed(data)) row.getElement().classList.add('row-danger');
          else if (data.warning) row.getElement().classList.add('row-amber');
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

    elements.logList.innerHTML = state.logs.slice(0, 14).map((entry) => {
      const timestamp = formatDateTime(entry.timestamp);
      return [
        '<article class="log-entry">',
        '<div class="log-meta">',
        `<span class="status-chip status-blue">${escapeHtml(entry.module)}</span>`,
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
      elements.shell.dataset.view = nextView;
    }
    if (options.persist !== false) {
      persistView(nextView);
    }

    if (elements.viewSelector) {
      elements.viewSelector.value = nextView;
    }

    elements.viewPanels.forEach((panel) => {
      const isActive = panel.dataset.viewPanel === nextView;
      panel.classList.toggle('active', isActive);
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    updateSectionHeader();
    renderDashboardFocus();

    if (options.redraw === false) return;

    redrawVisibleTables(state.currentSection, nextView);
  }

  function setSection(section, options = {}) {
    const nextSection = normalizeSection(section);
    state.currentSection = nextSection;
    if (elements.shell) {
      elements.shell.dataset.section = nextSection;
    }
    if (options.persist !== false) {
      persistSection(nextSection);
    }

    elements.sectionButtons.forEach((button) => {
      const isActive = button.dataset.section === nextSection;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    elements.sections.forEach((panel) => {
      const isActive = panel.dataset.section === nextSection;
      panel.classList.toggle('active', isActive);
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    updateSectionHeader();

    if (options.redraw !== false) {
      redrawVisibleTables(nextSection, state.currentView);
    }
  }

  function redrawVisibleTables(section = state.currentSection, view = state.currentView) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (section === 'assets') {
          if (view === 'hazmat' && state.inventoryTable) state.inventoryTable.redraw(true);
          if (view === 'calibration' && state.calibrationTable) state.calibrationTable.redraw(true);
        }

        if (section === 'templates' && view === 'calibration' && state.templateTable) {
          state.templateTable.redraw(true);
        }
      });
    });
  }

  function updateSectionHeader() {
    const viewLabel = state.currentView === 'hazmat' ? 'Hazmat Database' : '';
    const meta = getSectionMeta(state.currentSection, state.currentView);
    elements.sectionLabel.textContent = meta.label;
    elements.sectionTitle.textContent = meta.title;
    elements.sectionSubtitle.textContent = meta.subtitle;
    elements.activeDatabaseChip.textContent = viewLabel;
  }

  function getSectionMeta(section, view) {
    const isHazmat = view === 'hazmat';
    const map = {
      dashboard: {
        label: 'Dashboard',
        title: 'Main Overview',
        subtitle: 'Monitor both databases, surface immediate exposure, and stay in a single-page tactical workflow.',
      },
      assets: {
        label: 'New Asset +',
        title: isHazmat ? 'Hazmat Inventory Operations' : 'Calibration Asset Operations',
        subtitle: isHazmat
          ? 'Import stock, add material records, and manage the compact Midnight grid without reloading.'
          : 'Import calibration assets, add instruments from templates, and enforce RED or AMBER compliance logic.',
      },
      cfe: {
        label: 'New CFE',
        title: isHazmat ? 'Hazmat CFE Intake' : 'Calibration CFE Intake',
        subtitle: isHazmat
          ? 'Stage new CFE work for the Hazmat side without leaving the Command Center shell.'
          : 'Stage new CFE work for the Calibration side without leaving the Command Center shell.',
      },
      templates: {
        label: 'Templates',
        title: isHazmat ? 'Hazmat DNA Reference' : 'Calibration Template DNA',
        subtitle: isHazmat
          ? 'View hazard classification DNA, repository links, and warning-lead behavior for the hazmat database.'
          : 'Edit reusable calibration templates that drive new asset inheritance and compliance rules.',
      },
      reports: {
        label: 'Reports',
        title: 'Export Hub',
        subtitle: 'Generate local audit workbooks and review recent transaction history in one offline section.',
      },
      settings: {
        label: 'Settings',
        title: 'Departmental Config',
        subtitle: 'Store local lead-time and department defaults directly in the browser for low-overhead offline use.',
      },
    };
    return map[section] || map.dashboard;
  }

  function normalizeView(view) {
    return VALID_VIEWS.has(view) ? view : 'hazmat';
  }

  function normalizeSection(section) {
    return VALID_SECTIONS.has(section) ? section : 'dashboard';
  }

  function readStoredView() {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      return VALID_VIEWS.has(stored) ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function readStoredSection() {
    try {
      const stored = localStorage.getItem(SECTION_STORAGE_KEY);
      return VALID_SECTIONS.has(stored) ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function persistView(view) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, normalizeView(view));
    } catch (error) {
    }
  }

  function persistSection(section) {
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, normalizeSection(section));
    } catch (error) {
    }
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      return {
        defaultDepartment: normalizeText(parsed.defaultDepartment || parsed.default_department, DEFAULT_SETTINGS.defaultDepartment),
        hazmatWarningLeadDays: normalizePositiveInteger(parsed.hazmatWarningLeadDays || parsed.hazmat_warning_lead_days, DEFAULT_SETTINGS.hazmatWarningLeadDays),
        calibrationAlertLeadDays: normalizeNonNegativeInteger(parsed.calibrationAlertLeadDays || parsed.calibration_alert_lead_days, DEFAULT_SETTINGS.calibrationAlertLeadDays),
        calibrationGraceDays: normalizeNonNegativeInteger(parsed.calibrationGraceDays || parsed.calibration_grace_days, DEFAULT_SETTINGS.calibrationGraceDays),
      };
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
    } catch (error) {
    }
  }

  function hydrateSettingsForm() {
    if (!elements.settingsForm) return;
    elements.settingsForm.default_department.value = state.settings.defaultDepartment;
    elements.settingsForm.hazmat_warning_lead_days.value = String(state.settings.hazmatWarningLeadDays);
    elements.settingsForm.calibration_alert_lead_days.value = String(state.settings.calibrationAlertLeadDays);
    elements.settingsForm.calibration_grace_days.value = String(state.settings.calibrationGraceDays);
  }

  function submitSettingsForm(event) {
    event.preventDefault();
    state.settings = {
      defaultDepartment: normalizeText(elements.settingsForm.default_department.value, DEFAULT_SETTINGS.defaultDepartment),
      hazmatWarningLeadDays: normalizePositiveInteger(elements.settingsForm.hazmat_warning_lead_days.value, DEFAULT_SETTINGS.hazmatWarningLeadDays),
      calibrationAlertLeadDays: normalizeNonNegativeInteger(elements.settingsForm.calibration_alert_lead_days.value, DEFAULT_SETTINGS.calibrationAlertLeadDays),
      calibrationGraceDays: normalizeNonNegativeInteger(elements.settingsForm.calibration_grace_days.value, DEFAULT_SETTINGS.calibrationGraceDays),
    };
    persistSettings();
    hydrateSettingsForm();
    renderDashboard();
    renderDashboardFocus();
    renderHazmatDna();
    if (state.inventoryTable) state.inventoryTable.redraw(true);
    if (state.calibrationTable) state.calibrationTable.redraw(true);
    setStatus('Departmental config saved locally.', 'info');
  }

  function renderGhsSelector() {
    elements.ghsSelector.innerHTML = GHS_OPTIONS.map((item) => [
      `<button class="ghs-token" type="button" data-ghs-symbol="${item.key}">`,
      `<span class="ghs-icon" aria-hidden="true">${getGhsSvg(item.key)}</span>`,
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
    elements.templateForm.alert_lead_days.value = template ? template.alert_lead_days : String(state.settings.calibrationAlertLeadDays);
    elements.templateForm.grace_period_days.value = template ? template.grace_period_days : String(state.settings.calibrationGraceDays);
    elements.templateForm.unit_of_measure.value = template ? template.unit_of_measure : 'days';
    elements.templateForm.assigned_department.value = template ? template.assigned_department : state.settings.defaultDepartment;
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
      `${template.assigned_department}`,
    ].join(' · ');
  }

  function openCalibrationModal(asset) {
    if (!state.templates.length) {
      setSection('templates');
      setView('calibration');
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

  function openAssetDetailModal(asset, kind) {
    if (!asset || !elements.assetDetailGrid) return;

    const normalizedKind = kind === 'calibration' ? 'calibration' : 'hazmat';
    const isCalibration = normalizedKind === 'calibration';
    const title = isCalibration
      ? `${asset.tool_name || 'Calibration Asset'} · ${asset.serial_number || 'No serial'}`
      : `${asset.name || 'Hazmat Material'} · ${asset.batch_id || 'No batch'}`;

    elements.assetDetailEyebrow.textContent = isCalibration ? 'Calibration Asset Details' : 'Hazmat Asset Details';
    elements.assetDetailTitle.textContent = title;
    elements.assetDetailKind.className = `status-chip ${isCalibration ? 'status-amber' : 'status-blue'}`;
    elements.assetDetailKind.textContent = isCalibration ? 'Calibration' : 'Hazmat';
    elements.assetDetailStatus.innerHTML = isCalibration ? formatCalibrationStatus(asset) : formatMaterialStatus(asset);
    elements.assetDetailGrid.innerHTML = renderDetailItems(isCalibration ? buildCalibrationDetailItems(asset) : buildMaterialDetailItems(asset));
    openModal('asset-detail-modal');
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function submitMaterialForm(event) {
    event.preventDefault();
    const isEditing = Boolean(state.editingMaterialId);
    const payload = {
      name: elements.materialForm.name.value.trim(),
      batch_id: elements.materialForm.batch_id.value.trim(),
      expiration_date: elements.materialForm.expiration_date.value || null,
      stock_level: Number(elements.materialForm.stock_level.value || 0),
      min_threshold: Number(elements.materialForm.min_threshold.value || 0),
      ghs_symbols: getSelectedGhsSymbols(),
    };

    try {
      let material;
      if (state.editingMaterialId) {
        material = await apiFetch(`/api/command-center/materials/${state.editingMaterialId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setStatus('Material updated.', 'info');
      } else {
        material = await apiFetch('/api/command-center/materials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStatus('Material created.', 'info');
      }
      closeModal('material-modal');
      await refreshPortal({ silentStatus: true });
      if (!isEditing) {
        openAssetDetailModal(findMaterialById(material && material.id) || material, 'hazmat');
      }
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
      await refreshPortal({ silentStatus: true });
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
      alert_lead_days: Number(elements.templateForm.alert_lead_days.value || state.settings.calibrationAlertLeadDays),
      grace_period_days: Number(elements.templateForm.grace_period_days.value || state.settings.calibrationGraceDays),
      unit_of_measure: elements.templateForm.unit_of_measure.value.trim() || 'days',
      assigned_department: elements.templateForm.assigned_department.value.trim() || state.settings.defaultDepartment,
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
      await refreshPortal({ silentStatus: true });
      if (!elements.calibrationModal.classList.contains('hidden')) {
        syncTemplateOptions(response && response.id ? response.id : null);
      }
    } catch (error) {
      setStatus(error.message || 'Failed to save calibration template.', 'error');
    }
  }

  async function submitCalibrationForm(event) {
    event.preventDefault();
    const isEditing = Boolean(state.editingCalibrationId);
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
      let asset;
      if (state.editingCalibrationId) {
        asset = await apiFetch(`/api/command-center/calibration/${state.editingCalibrationId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setStatus('Calibration asset updated.', 'info');
      } else {
        asset = await apiFetch('/api/command-center/calibration', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStatus('Calibration asset created.', 'info');
      }
      closeModal('calibration-modal');
      await refreshPortal({ silentStatus: true });
      if (!isEditing) {
        openAssetDetailModal(findCalibrationById(asset && asset.id) || asset, 'calibration');
      }
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
      await refreshPortal({ silentStatus: true });
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
      await refreshPortal({ silentStatus: true });
    } catch (error) {
      setStatus(error.message || 'Failed to generate certificate.', 'error');
    }
  }

  async function deleteMaterial(material) {
    if (!window.confirm(`Delete ${material.name}? This removes its usage history as well.`)) return;
    try {
      await apiFetch(`/api/command-center/materials/${material.id}`, { method: 'DELETE' });
      setStatus('Material deleted.', 'info');
      await refreshPortal({ silentStatus: true });
    } catch (error) {
      setStatus(error.message || 'Failed to delete material.', 'error');
    }
  }

  async function deleteCalibration(asset) {
    if (!window.confirm(`Delete ${asset.tool_name}?`)) return;
    try {
      await apiFetch(`/api/command-center/calibration/${asset.id}`, { method: 'DELETE' });
      setStatus('Calibration asset deleted.', 'info');
      await refreshPortal({ silentStatus: true });
    } catch (error) {
      setStatus(error.message || 'Failed to delete calibration asset.', 'error');
    }
  }

  async function deleteTemplate(template) {
    if (!window.confirm(`Delete template ${template.template_name}?`)) return;
    try {
      await apiFetch(`/api/command-center/calibration/templates/${template.id}`, { method: 'DELETE' });
      setStatus('Calibration template deleted.', 'info');
      await refreshPortal({ silentStatus: true });
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
      setStatus(`Imported ${materials.length} hazmat rows.`, 'info');
      await refreshPortal({ silentStatus: true });
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
      await refreshPortal({ silentStatus: true });
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
      WarningLead: isHazmatWarning(item) ? 'AMBER' : 'CLEAR',
      Expired: item.expired ? 'RED' : 'NO',
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
      CheckOutLocked: isCalibrationRed(item) ? 'YES' : 'NO',
    }));
    const logRows = state.logs.map((item) => ({
      Module: item.module,
      Action: item.action,
      Detail: item.detail,
      Actor: item.actor_name,
      Timestamp: item.timestamp,
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventoryRows), 'Hazmat');
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

    if (typeof auth.clearToken === 'function') {
      auth.clearToken();
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }

    if (typeof auth.redirectToLogin === 'function') {
      auth.redirectToLogin();
      return;
    }

    window.location.href = '/login.html';
  }

  async function apiFetch(url, options) {
    const opts = options || {};
    const headers = new Headers(opts.headers || {});
    if (opts.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      credentials: 'same-origin',
    });

    if (typeof auth.handleUnauthorized === 'function' && auth.handleUnauthorized(response.status)) {
      throw new Error('Session expired. Redirecting to login.');
    }

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

  function renderDetailItems(items) {
    return items.map((item) => [
      '<article class="detail-item">',
      `<small>${escapeHtml(item.label)}</small>`,
      item.html
        ? `<div class="detail-html">${item.html}</div>`
        : `<strong>${escapeHtml(formatDetailValue(item.value))}</strong>`,
      '</article>',
    ].join('')).join('');
  }

  function buildMaterialDetailItems(item) {
    return [
      { label: 'Material Name', value: item.name },
      { label: 'Batch ID', value: item.batch_id },
      { label: 'GHS Symbols', html: renderGhsSymbols(item.ghs_symbols) },
      { label: 'Expiration Date', value: item.expiration_date || 'Open' },
      { label: 'Shelf Life', value: describeMaterialWindow(item) },
      { label: 'Stock Level', value: item.stock_level },
      { label: 'Minimum Threshold', value: item.min_threshold },
      { label: 'High Hazard', value: item.high_hazard ? 'Yes' : 'No' },
    ];
  }

  function buildCalibrationDetailItems(item) {
    return [
      { label: 'Tool Name', value: item.tool_name },
      { label: 'Serial Number', value: item.serial_number },
      { label: 'Template', value: item.template_name || 'Not assigned' },
      { label: 'Category', value: item.category || 'Not assigned' },
      { label: 'Department', value: item.assigned_department || state.settings.defaultDepartment },
      { label: 'Last Calibration', value: item.last_cal || 'Not set' },
      { label: 'Next Calibration', value: item.next_cal || 'Not scheduled' },
      { label: 'Interval Rule', value: `${item.cal_frequency || 0} day(s)` },
      { label: 'Alert Lead', value: `${item.alert_lead_days || 0} day(s)` },
      { label: 'Grace Period', value: `${item.grace_period_days || 0} day(s)` },
      { label: 'Due Window', value: describeCalibrationWindow(item) },
      { label: 'Check-Out', value: item.locked_for_checkout ? 'Locked' : 'Available' },
    ];
  }

  function formatDetailValue(value) {
    if (value === undefined || value === null || value === '') return 'Not set';
    return String(value);
  }

  function describeMaterialWindow(item) {
    if (item.days_remaining === null || item.days_remaining === undefined) return 'Open';
    if (item.days_remaining < 0) return `Expired ${Math.abs(item.days_remaining)} day(s) ago`;
    if (isHazmatWarning(item)) return `Warning window with ${item.days_remaining} day(s) remaining`;
    return `${item.days_remaining} day(s) remaining`;
  }

  function describeCalibrationWindow(item) {
    if (item.locked_for_checkout) return 'Locked for check-out';
    if (item.expired) {
      if (typeof item.days_until_due === 'number') {
        return `Overdue by ${Math.abs(item.days_until_due)} day(s)`;
      }
      return 'Expired';
    }
    if (item.warning) {
      if (item.days_until_due === 0) return 'Due today';
      if (typeof item.days_until_due === 'number') return `${item.days_until_due} day(s) until due`;
      return 'Warning window active';
    }
    if (typeof item.days_until_due === 'number') return `${item.days_until_due} day(s) until next calibration`;
    return 'Scheduled';
  }

  function findMaterialById(id) {
    return state.materials.find((item) => String(item.id) === String(id)) || null;
  }

  function findCalibrationById(id) {
    return state.calibration.find((item) => String(item.id) === String(id)) || null;
  }

  function buildCertificatePdf(payload) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF is not available locally.');
    }

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const rows = [
      ['Certificate ID', payload.certificate_id],
      ['Issued At', formatDateTime(payload.issued_at)],
      ['Technician', payload.technician],
      ['Template', payload.asset.template_name || 'Not assigned'],
      ['Category', payload.asset.category || 'Not assigned'],
      ['Department', payload.asset.assigned_department || state.settings.defaultDepartment],
      ['Asset ID', String(payload.asset.id)],
      ['Tool Name', payload.asset.tool_name],
      ['Serial Number', payload.asset.serial_number],
      ['Last Calibration', payload.asset.last_cal || 'Not set'],
      ['Next Calibration', payload.asset.next_cal || 'Not scheduled'],
      ['Alert Lead', `${payload.asset.alert_lead_days || 0} days`],
      ['Grace Period', `${payload.asset.grace_period_days || 0} days`],
      ['Status', payload.asset.status],
    ];

    doc.setFillColor(18, 18, 18);
    doc.rect(0, 0, 210, 34, 'F');
    doc.setTextColor(255, 180, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Command Center', 16, 15);
    doc.setTextColor(244, 244, 244);
    doc.setFontSize(11);
    doc.text('Calibration Certificate', 16, 23);

    doc.setTextColor(18, 18, 18);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(14, 42, 182, 168, 4, 4, 'F');

    let y = 54;
    rows.forEach((entry) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${entry[0]}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(entry[1] || ''), 66, y);
      y += 9;
    });

    doc.setDrawColor(58, 134, 255);
    doc.setLineWidth(0.4);
    doc.line(20, 182, 188, 182);
    doc.setFont('helvetica', 'bold');
    doc.text('Operational Statement', 20, 191);
    doc.setFont('helvetica', 'normal');
    doc.text('This certificate was generated locally by the Tactical Dark Command Center.', 20, 198);
    doc.text('Any RED calibration asset remains unavailable for check-out until compliance is restored.', 20, 204);

    if (payload.qr_data_url) {
      doc.addImage(payload.qr_data_url, 'PNG', 153, 52, 28, 28);
      doc.setFontSize(9);
      doc.text('Verification', 153, 85);
    }

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
    if (item.days_remaining === null || item.days_remaining === undefined) return '<span class="status-chip status-blue">Open</span>';
    if (item.days_remaining < 0) return `<span class="status-chip status-danger">Expired ${Math.abs(item.days_remaining)}d</span>`;
    if (isHazmatWarning(item)) return `<span class="status-chip status-amber">Warning ${item.days_remaining}d</span>`;
    return `<span class="status-chip status-safe">${item.days_remaining}d Remaining</span>`;
  }

  function formatMaterialStatus(item) {
    if (item.expired) return '<span class="status-chip status-danger">RED</span>';
    if (isHazmatWarning(item)) return '<span class="status-chip status-amber">AMBER</span>';
    if (item.low_stock) return '<span class="status-chip status-amber">LOW STOCK</span>';
    if (item.high_hazard) return '<span class="status-chip status-blue">HIGH HAZARD</span>';
    return '<span class="status-chip status-safe">READY</span>';
  }

  function formatCalibrationStatus(item) {
    if (item.locked_for_checkout) return '<span class="status-chip status-danger">LOCKED</span>';
    if (item.expired) return '<span class="status-chip status-danger">EXPIRED</span>';
    if (item.warning) {
      if (item.days_until_due === 0) return '<span class="status-chip status-amber">WARNING TODAY</span>';
      if (typeof item.days_until_due === 'number') return `<span class="status-chip status-amber">WARNING ${item.days_until_due}d</span>`;
      return '<span class="status-chip status-amber">WARNING</span>';
    }
    return '<span class="status-chip status-safe">SAFE</span>';
  }

  function renderGhsSymbols(symbols) {
    if (!Array.isArray(symbols) || !symbols.length) return '<span class="status-chip status-blue">None</span>';
    return `<div class="ghs-icon-stack">${symbols.map((symbol) => `<span class="ghs-icon" title="${escapeHtml(symbol)}">${getGhsSvg(symbol)}</span>`).join('')}</div>`;
  }

  function isHazmatWarning(item) {
    const lead = normalizePositiveInteger(state.settings.hazmatWarningLeadDays, DEFAULT_SETTINGS.hazmatWarningLeadDays);
    return typeof item.days_remaining === 'number' && item.days_remaining >= 0 && item.days_remaining <= lead;
  }

  function isCalibrationRed(item) {
    return Boolean(item.locked_for_checkout || item.expired);
  }

  function getGhsSvg(symbol) {
    const key = String(symbol || '').trim().toLowerCase();
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

  function normalizeText(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function normalizeFilterTag(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  function startCase(value) {
    return String(value || '')
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function normalizePositiveInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
  }

  function normalizeNonNegativeInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
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
