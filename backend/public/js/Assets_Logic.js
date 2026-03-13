(function tacticalCommandCenter() {
  const auth = window.CommandCenterAuth || {};
  const TOKEN_KEY = auth.TOKEN_KEY || 'mack_token';
  const VIEW_STORAGE_KEY = 'mack_command_center_view';
  const SECTION_STORAGE_KEY = 'mack_command_center_section';
  const SETTINGS_STORAGE_KEY = 'mack_command_center_settings';
  const UNIT_LIBRARY_STORAGE_KEY = 'mack_command_center_units';
  const VALID_VIEWS = new Set(['hazmat', 'calibration', 'debug']);
  const VALID_SECTIONS = new Set(['dashboard', 'assets', 'cfe', 'reports', 'settings']);
  const DEFAULT_SETTINGS = {
    defaultDepartment: 'Operations',
    departments: ['Operations'],
    departmentSupervisors: {},
    departmentViewMode: 'expanded',
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

  const DEFAULT_TEMPLATE_UNITS = [
    { name: 'Unitless', symbol: '' },
    { name: 'Volt', symbol: 'V' },
    { name: 'Millivolt', symbol: 'mV' },
    { name: 'Kilovolt', symbol: 'kV' },
    { name: 'Ampere', symbol: 'A' },
    { name: 'Milliamp', symbol: 'mA' },
    { name: 'Microamp', symbol: '\u00B5A' },
    { name: 'Ohm', symbol: '\u03A9' },
    { name: 'Milliohm', symbol: 'm\u03A9' },
    { name: 'Kiloohm', symbol: 'k\u03A9' },
    { name: 'Megaohm', symbol: 'M\u03A9' },
    { name: 'Farad', symbol: 'F' },
    { name: 'Microfarad', symbol: '\u00B5F' },
    { name: 'Nanofarad', symbol: 'nF' },
    { name: 'Picofarad', symbol: 'pF' },
    { name: 'Henry', symbol: 'H' },
    { name: 'Millihenry', symbol: 'mH' },
    { name: 'Hertz', symbol: 'Hz' },
    { name: 'Kilohertz', symbol: 'kHz' },
    { name: 'Megahertz', symbol: 'MHz' },
    { name: 'Gigahertz', symbol: 'GHz' },
    { name: 'Watt', symbol: 'W' },
    { name: 'Kilowatt', symbol: 'kW' },
    { name: 'Milliwatt', symbol: 'mW' },
    { name: 'Volt-Ampere', symbol: 'VA' },
    { name: 'Power Factor', symbol: 'PF' },
    { name: 'Millimeter', symbol: 'mm' },
    { name: 'Micrometer', symbol: '\u00B5m' },
    { name: 'Inch', symbol: 'in' },
    { name: 'Thousandth inch', symbol: 'mil' },
    { name: 'Foot', symbol: 'ft' },
    { name: 'Meter', symbol: 'm' },
    { name: 'Caliper measurement', symbol: '' },
    { name: 'Depth measurement', symbol: '' },
    { name: 'Height measurement', symbol: '' },
    { name: 'Diameter', symbol: '' },
    { name: 'Radius', symbol: '' },
    { name: 'Angle degree', symbol: '\u00B0' },
    { name: 'Radian', symbol: 'rad' },
    { name: 'Newton meter', symbol: 'Nm' },
    { name: 'Foot-pound', symbol: 'ft-lb' },
    { name: 'Inch-pound', symbol: 'in-lb' },
    { name: 'Newton', symbol: 'N' },
    { name: 'Kilonewton', symbol: 'kN' },
    { name: 'Pound force', symbol: 'lbf' },
    { name: 'Gram force', symbol: 'gf' },
    { name: 'Celsius', symbol: '\u00B0C' },
    { name: 'Fahrenheit', symbol: '\u00B0F' },
    { name: 'Kelvin', symbol: 'K' },
    { name: 'Relative Humidity', symbol: '%RH' },
    { name: 'Pressure', symbol: 'Pa' },
    { name: 'Kilopascal', symbol: 'kPa' },
    { name: 'Bar', symbol: 'bar' },
    { name: 'PSI', symbol: 'psi' },
    { name: 'Lux', symbol: 'lx' },
    { name: 'Candela', symbol: 'cd' },
    { name: 'ESD Voltage', symbol: 'V' },
    { name: 'Surface Resistance', symbol: '\u03A9/sq' },
    { name: 'Ground Resistance', symbol: '\u03A9' },
    { name: 'Continuity', symbol: '' },
    { name: 'Leakage Current', symbol: 'A' },
    { name: 'Frequency Stability', symbol: 'ppm' },
    { name: 'Signal Amplitude', symbol: 'dB' },
    { name: 'Rise Time', symbol: 'ns' },
    { name: 'Propagation Delay', symbol: 'ns' },
    { name: 'Capacitance ESR', symbol: '\u03A9' },
  ];

  const DISALLOWED_TEMPLATE_UNIT_TOKENS = new Set(['day', 'days']);
  const DEFAULT_TEMPLATE_INTERVAL_MONTHS = 12;
  const AVERAGE_DAYS_PER_MONTH = 365 / 12;
  const TEMPLATE_ALLOWED_DAY_VALUES = ['1', '2', '3', '4', '5', '6', '7'];
  const TEMPLATE_ALLOWED_DAY_DEFAULTS = ['1', '2', '3', '4', '5'];

  const state = {
    user: null,
    currentView: 'hazmat',
    currentModule: 'hazmat',
    currentSection: 'dashboard',
    settings: {
      ...DEFAULT_SETTINGS,
      departments: DEFAULT_SETTINGS.departments.slice(),
    },
    departmentRecords: [],
    assetFilters: {
      duePreset: 'all',
      dueMin: '',
      dueMax: '',
      department: 'all',
      type: 'all',
      status: 'all',
    },
    debugQueueFilters: {
      boardType: 'all',
      failureMode: 'all',
      keyword: '',
    },
    materials: [],
    hazmatTemplates: [],
    templates: [],
    calibration: [],
    debugTickets: [],
    debugAnalytics: {
      pareto: [],
      yield_trends: [],
      systemic_alerts: [],
      chronic_failures: [],
    },
    logs: [],
    inventoryTable: null,
    templateTable: null,
    settingsTemplateTable: null,
    calibrationTable: null,
    debugTicketTable: null,
    editingMaterialId: null,
    editingTemplateId: null,
    editingTemplateModule: null,
    editingTemplateAssignedDepartment: '',
    editingDepartmentName: '',
    editingCalibrationId: null,
    editingDebugTicketId: null,
    editingDebugComponentId: null,
    activeMaterialId: null,
    activeCalibrationId: null,
    activeDebugTicketId: null,
    activeAssetLogKey: '',
    activeAssetDetailKind: '',
    activeAssetDetailId: null,
    currentReportModule: 'hazmat',
    currentStatusTimeout: null,
    currentPatternTimeout: null,
    unitLibrary: [],
    selectedTemplateUnitId: '',
    debugParetoChart: null,
    debugYieldChart: null,
  };

  const elements = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    state.settings = loadSettings();
    state.unitLibrary = loadUnitLibrary();
    state.currentView = readStoredView() || state.currentView;
    state.currentModule = normalizeModule(state.currentView);
    state.currentReportModule = normalizeModule(state.currentModule);
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
    elements.dashboardSummaryPanel = document.querySelector('.dashboard-summary-panel');
    elements.dashboardSummaryCards = Array.from(document.querySelectorAll('.summary-card-trigger'));
    elements.activeDatabaseChip = document.getElementById('active-database-chip');
    elements.quickNewAssetButton = document.getElementById('quick-new-asset-button');
    elements.dashboardCalibrationSearch = document.getElementById('dashboard-calibration-search');
    elements.assetDuePresetFilter = document.getElementById('asset-due-preset-filter');
    elements.assetDueMinFilter = document.getElementById('asset-due-min-filter');
    elements.assetDueMaxFilter = document.getElementById('asset-due-max-filter');
    elements.assetDepartmentFilter = document.getElementById('asset-department-filter');
    elements.assetTypeFilter = document.getElementById('asset-type-filter');
    elements.assetStatusFilter = document.getElementById('asset-status-filter');
    elements.clearAssetFiltersButton = document.getElementById('clear-asset-filters-button');
    elements.dashboardAssetResults = document.getElementById('dashboard-asset-results');
    elements.expiredCount = document.getElementById('expired-count');
    elements.lowStockCount = document.getElementById('low-stock-count');
    elements.warningCount = document.getElementById('warning-count');
    elements.lockedCount = document.getElementById('locked-count');
    elements.expiredLabel = document.getElementById('expired-label');
    elements.warningLabel = document.getElementById('warning-label');
    elements.secondaryLabel = document.getElementById('secondary-label');
    elements.lockLabel = document.getElementById('lock-label');
    elements.expiredCopy = document.getElementById('expired-copy');
    elements.warningCopy = document.getElementById('warning-copy');
    elements.secondaryCopy = document.getElementById('secondary-copy');
    elements.lockCopy = document.getElementById('lock-copy');
    elements.doctrineRedCopy = document.getElementById('doctrine-red-copy');
    elements.doctrineAmberCopy = document.getElementById('doctrine-amber-copy');
    elements.doctrineLockCopy = document.getElementById('doctrine-lock-copy');
    elements.reportSummary = document.getElementById('report-summary');
    elements.reportModuleSwitch = document.querySelector('.report-module-switch');
    elements.reportModuleHazmatButton = document.getElementById('report-module-hazmat');
    elements.reportModuleCalibrationButton = document.getElementById('report-module-calibration');
    elements.reportModuleDebugButton = document.getElementById('report-module-debug');
    elements.reportInterfaceCopy = document.getElementById('report-interface-copy');
    elements.hazmatReportPanel = document.getElementById('hazmat-report-panel');
    elements.calibrationReportPanel = document.getElementById('calibration-report-panel');
    elements.debugReportPanel = document.getElementById('debug-report-panel');
    elements.hazmatReportMetrics = document.getElementById('hazmat-report-metrics');
    elements.calibrationReportMetrics = document.getElementById('calibration-report-metrics');
    elements.debugReportMetrics = document.getElementById('debug-report-metrics');
    elements.hazmatReportImprovements = document.getElementById('hazmat-report-improvements');
    elements.calibrationReportImprovements = document.getElementById('calibration-report-improvements');
    elements.debugReportImprovements = document.getElementById('debug-report-improvements');
    elements.debugParetoChart = document.getElementById('debug-pareto-chart');
    elements.debugYieldChart = document.getElementById('debug-yield-chart');
    elements.debugGenerateReportButton = document.getElementById('debug-generate-report-button');
    elements.settingsOpenHazmatReportButton = document.getElementById('settings-open-hazmat-report');
    elements.settingsOpenCalibrationReportButton = document.getElementById('settings-open-calibration-report');
    elements.settingsOpenDebugReportButton = document.getElementById('settings-open-debug-report');
    elements.hazmatDnaGrid = document.getElementById('hazmat-dna-grid');
    elements.logList = document.getElementById('recent-log-list');
    elements.inventorySearch = document.getElementById('inventory-search');
    elements.templateSearch = document.getElementById('template-search');
    elements.settingsTemplateSearch = document.getElementById('settings-template-search');
    elements.inventoryTable = document.getElementById('inventory-table');
    elements.templateTable = document.getElementById('template-table');
    elements.settingsTemplateTable = document.getElementById('settings-template-table');
    elements.calibrationTable = document.getElementById('calibration-table');
    elements.debugTicketTable = document.getElementById('debug-ticket-table');
    elements.debugQueueKeywordFilter = document.getElementById('debug-queue-keyword-filter');
    elements.debugBoardTypeFilter = document.getElementById('debug-board-type-filter');
    elements.debugFailureModeFilter = document.getElementById('debug-failure-mode-filter');
    elements.debugClearQueueFiltersButton = document.getElementById('debug-clear-queue-filters-button');
    elements.inventoryImportInput = document.getElementById('inventory-import-input');
    elements.calibrationImportInput = document.getElementById('calibration-import-input');
    elements.debugRefreshButton = document.getElementById('debug-refresh-button');
    elements.debugTicketForm = document.getElementById('debug-ticket-form');
    elements.debugTicketResetButton = document.getElementById('debug-ticket-reset-button');
    elements.debugTicketDeleteButton = document.getElementById('debug-ticket-delete-button');
    elements.debugTicketDepartment = document.getElementById('debug-ticket-department');
    elements.debugFailureSignatureInput = document.getElementById('debug-failure-signature-input');
    elements.debugPatternAlert = document.getElementById('debug-pattern-alert');
    elements.debugComponentForm = document.getElementById('debug-component-form');
    elements.debugComponentResetButton = document.getElementById('debug-component-reset-button');
    elements.debugComponentList = document.getElementById('debug-component-list');
    elements.debugLiveBenchList = document.getElementById('debug-live-bench-list');
    elements.materialModal = document.getElementById('material-modal');
    elements.materialForm = document.getElementById('material-form');
    elements.materialModalTitle = document.getElementById('material-modal-title');
    elements.usageModal = document.getElementById('usage-modal');
    elements.usageForm = document.getElementById('usage-form');
    elements.usageModalTitle = document.getElementById('usage-modal-title');
    elements.templateModal = document.getElementById('template-modal');
    elements.templateForm = document.getElementById('template-form');
    elements.templateModalTitle = document.getElementById('template-modal-title');
    elements.templateDepartmentSelect = document.getElementById('template-assigned-department');
    elements.templateAddDepartmentToggle = document.getElementById('template-add-department-toggle');
    elements.templateAddDepartmentInline = document.getElementById('template-add-department-inline');
    elements.templateNewDepartmentName = document.getElementById('template-new-department-name');
    elements.templateNewDepartmentSupervisorWrap = document.getElementById('template-new-department-supervisor-wrap');
    elements.templateNewDepartmentSupervisor = document.getElementById('template-new-department-supervisor');
    elements.templateSaveDepartmentButton = document.getElementById('template-save-department-button');
    elements.templateCancelDepartmentButton = document.getElementById('template-cancel-department-button');
    elements.templateIntervalMode = document.getElementById('template-interval-mode');
    elements.templateIntervalMonthsWrap = document.getElementById('template-interval-months-wrap');
    elements.templateIntervalDaysWrap = document.getElementById('template-interval-days-wrap');
    elements.templateIntervalMonths = document.getElementById('template-interval-months');
    elements.templateIntervalDays = document.getElementById('template-interval-days');
    elements.templateCalIntervalDays = document.getElementById('template-cal-interval-days');
    elements.templateMaxDailyCalibrations = document.getElementById('template-max-daily-calibrations');
    elements.templateAllowedDays = document.getElementById('template-allowed-days');
    elements.templateUnitField = document.getElementById('template-unit-field');
    elements.templateUnitSearch = document.getElementById('template-unit-search');
    elements.templateUnitSelect = document.getElementById('template-unit-select');
    elements.templateUnitEmpty = document.getElementById('template-unit-empty');
    elements.templateUnitSelected = document.getElementById('template-unit-selected');
    elements.templateAddUnitToggle = document.getElementById('template-add-unit-toggle');
    elements.templateAddUnitInline = document.getElementById('template-add-unit-inline');
    elements.templateNewUnitName = document.getElementById('template-new-unit-name');
    elements.templateNewUnitSymbol = document.getElementById('template-new-unit-symbol');
    elements.templateSaveUnitButton = document.getElementById('template-save-unit-button');
    elements.templateCancelUnitButton = document.getElementById('template-cancel-unit-button');
    elements.departmentModal = document.getElementById('department-modal');
    elements.departmentModalForm = document.getElementById('department-modal-form');
    elements.departmentModalTitle = document.getElementById('department-modal-title');
    elements.departmentModalNote = document.getElementById('department-modal-note');
    elements.departmentModalSupervisor = document.getElementById('department-modal-supervisor');
    elements.calibrationModal = document.getElementById('calibration-modal');
    elements.calibrationForm = document.getElementById('calibration-form');
    elements.calibrationModalTitle = document.getElementById('calibration-modal-title');
    elements.calibrationAssignmentMode = document.getElementById('calibration-assignment-mode');
    elements.calibrationOwnerInput = document.getElementById('calibration-owner-input');
    elements.manageTemplateButton = document.getElementById('manage-template-button');
    elements.calibrationTemplateSummary = document.getElementById('calibration-template-summary');
    elements.calibrationAttachmentPath = document.getElementById('calibration-attachment-path');
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
    elements.assetDetailLogList = document.getElementById('asset-detail-log-list');
    elements.assetDetailActions = document.getElementById('asset-detail-actions');
    elements.assetDetailPrimaryAction = document.getElementById('asset-detail-primary-action');
    elements.assetDetailEditAction = document.getElementById('asset-detail-edit-action');
    elements.assetDetailDeleteAction = document.getElementById('asset-detail-delete-action');
    elements.ghsSelector = document.getElementById('ghs-selector');
    elements.settingsForm = document.getElementById('settings-form');
    elements.departmentCreateForm = document.getElementById('department-create-form');
    elements.departmentAdminList = document.getElementById('department-admin-list');
    elements.departmentSupervisorField = document.getElementById('department-supervisor-field');
    elements.departmentViewMode = document.getElementById('department-view-mode');
    elements.settingsAddTemplateButton = document.getElementById('settings-add-template-button');
    elements.settingsTemplateTitle = document.getElementById('settings-template-title');
    elements.failureAnalysisButton = document.getElementById('failure-analysis-button');
    elements.settingsTemplatePanel = document.querySelector('.settings-template-panel');
    elements.cfeSectionButton = document.querySelector('.sidebar-nav-button[data-section="cfe"]');
    elements.viewSelector = document.getElementById('view-selector');
    elements.sectionButtons = Array.from(document.querySelectorAll('.sidebar-nav-button'));
    elements.sections = Array.from(document.querySelectorAll('.workspace-section'));
    elements.viewPanels = Array.from(document.querySelectorAll('.view-panel'));
  }

  function wireEvents() {
    addEvent(document.getElementById('refresh-button'), 'click', refreshPortal);
    addEvent(document.getElementById('export-audit-button'), 'click', exportAuditWorkbook);
    addEvent(elements.reportModuleHazmatButton, 'click', () => setReportModule('hazmat'));
    addEvent(elements.reportModuleCalibrationButton, 'click', () => setReportModule('calibration'));
    addEvent(elements.reportModuleDebugButton, 'click', () => setReportModule('debug'));
    addEvent(elements.settingsOpenHazmatReportButton, 'click', () => openReportsInterface('hazmat'));
    addEvent(elements.settingsOpenCalibrationReportButton, 'click', () => openReportsInterface('calibration'));
    addEvent(elements.settingsOpenDebugReportButton, 'click', () => openReportsInterface('debug'));
    addEvent(document.getElementById('logout-button'), 'click', logout);
    addEvent(elements.quickNewAssetButton, 'click', () => {
      const moduleName = normalizeModule(state.currentModule);
      if (moduleName === 'hazmat') {
        setView('hazmat');
        openMaterialModal();
        return;
      }
      if (moduleName === 'debug') {
        setView('debug');
        setSection('assets');
        resetDebugTicketForm();
        if (elements.debugTicketForm && typeof elements.debugTicketForm.scrollIntoView === 'function') {
          elements.debugTicketForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      setView('calibration');
      openCalibrationModal();
    });
    addEvent(elements.failureAnalysisButton, 'click', () => {
      setView('debug');
      setSection('assets');
    });
    addEvent(elements.dashboardSummaryPanel, 'click', handleSummaryCardInteraction);
    addEvent(elements.dashboardSummaryPanel, 'keydown', handleSummaryCardInteraction);
    addEvent(elements.clearAssetFiltersButton, 'click', clearAssetFilters);
    addEvent(elements.templateIntervalMode, 'change', handleTemplateIntervalModeChange);
    addEvent(elements.templateIntervalMonths, 'change', syncTemplateCalIntervalField);
    addEvent(elements.templateIntervalDays, 'input', syncTemplateCalIntervalField);
    addEvent(elements.templateDepartmentSelect, 'change', handleTemplateDepartmentChange);
    addEvent(elements.templateAddDepartmentToggle, 'click', toggleTemplateAddDepartmentInline);
    addEvent(elements.templateSaveDepartmentButton, 'click', handleTemplateSaveDepartment);
    addEvent(elements.templateCancelDepartmentButton, 'click', closeTemplateAddDepartmentInline);
    addEvent(elements.templateUnitSearch, 'input', renderTemplateUnitOptions);
    addEvent(elements.templateUnitSelect, 'change', handleTemplateUnitSelectionChange);
    addEvent(elements.templateAddUnitToggle, 'click', toggleTemplateAddUnitInline);
    addEvent(elements.templateSaveUnitButton, 'click', handleTemplateSaveUnit);
    addEvent(elements.templateCancelUnitButton, 'click', closeTemplateAddUnitInline);
    addEvent(elements.calibrationAssignmentMode, 'change', handleCalibrationAssignmentModeChange);
    addEvent(document.getElementById('add-material-button'), 'click', () => openMaterialModal());
    addEvent(document.getElementById('add-template-button'), 'click', () => openTemplateModal(null, state.currentModule));
    addEvent(elements.settingsAddTemplateButton, 'click', () => openTemplateModal(null, state.currentModule));
    addEvent(document.getElementById('add-calibration-button'), 'click', () => {
      setView('calibration');
      openCalibrationModal();
    });
    addEvent(elements.debugRefreshButton, 'click', () => refreshPortal({ silentStatus: true }));
    addEvent(elements.debugTicketResetButton, 'click', resetDebugTicketForm);
    addEvent(elements.debugTicketDeleteButton, 'click', handleDebugTicketDeleteRequest);
    addEvent(elements.debugTicketForm, 'submit', submitDebugTicketForm);
    addEvent(elements.debugComponentForm, 'submit', submitDebugComponentForm);
    addEvent(elements.debugComponentResetButton, 'click', resetDebugComponentForm);
    addEvent(elements.debugComponentList, 'click', handleDebugComponentListClick);
    addEvent(elements.debugLiveBenchList, 'click', handleDebugBenchClick);
    addEvent(elements.debugGenerateReportButton, 'click', handleGenerateDebugReport);
    addEvent(elements.debugFailureSignatureInput, 'input', handleDebugFailureSignatureInput);
    addEvent(elements.debugQueueKeywordFilter, 'input', (event) => updateDebugQueueFilter('keyword', event.target.value));
    addEvent(elements.debugBoardTypeFilter, 'change', (event) => updateDebugQueueFilter('boardType', event.target.value));
    addEvent(elements.debugFailureModeFilter, 'change', (event) => updateDebugQueueFilter('failureMode', event.target.value));
    addEvent(elements.debugClearQueueFiltersButton, 'click', clearDebugQueueFilters);

    addEvent(elements.viewSelector, 'change', (event) => setView(event.target.value));
    addEvent(elements.dashboardCalibrationSearch, 'input', renderAssetConsole);
    addEvent(elements.assetDuePresetFilter, 'change', (event) => updateAssetFilter('duePreset', event.target.value));
    addEvent(elements.assetDueMinFilter, 'input', (event) => updateAssetFilter('dueMin', event.target.value));
    addEvent(elements.assetDueMaxFilter, 'input', (event) => updateAssetFilter('dueMax', event.target.value));
    addEvent(elements.assetDepartmentFilter, 'change', (event) => updateAssetFilter('department', event.target.value));
    addEvent(elements.assetTypeFilter, 'change', (event) => updateAssetFilter('type', event.target.value));
    addEvent(elements.assetStatusFilter, 'change', (event) => updateAssetFilter('status', event.target.value));
    addEvent(elements.dashboardAssetResults, 'click', handleAssetResultClick);

    elements.sectionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (!button.dataset.section) return;
        setSection(button.dataset.section);
      });
    });

    addEvent(elements.inventorySearch, 'input', applyInventoryTableFilters);

    addEvent(elements.templateSearch, 'input', () => {
      if (state.templateTable) {
        state.templateTable.setFilter(filterTemplateRows, elements.templateSearch.value);
      }
    });

    addEvent(elements.settingsTemplateSearch, 'input', () => {
      if (state.settingsTemplateTable) {
        state.settingsTemplateTable.setFilter(filterTemplateRows, elements.settingsTemplateSearch.value);
      }
    });

    addEvent(elements.materialForm, 'submit', submitMaterialForm);
    addEvent(elements.usageForm, 'submit', submitUsageForm);
    addEvent(elements.templateForm, 'submit', submitTemplateForm);
    addEvent(elements.calibrationForm, 'submit', submitCalibrationForm);
    addEvent(elements.manageTemplateButton, 'click', () => openTemplateModal(null, 'calibration'));
    addEvent(elements.checkoutForm, 'submit', submitCheckoutForm);
    addEvent(elements.certificateForm, 'submit', submitCertificateForm);
    addEvent(elements.inventoryImportInput, 'change', handleInventoryImport);
    addEvent(elements.calibrationImportInput, 'change', handleCalibrationImport);
    addEvent(elements.settingsForm, 'submit', submitSettingsForm);
    addEvent(elements.departmentCreateForm, 'submit', submitDepartmentCreateForm);
    addEvent(elements.departmentViewMode, 'change', handleDepartmentViewModeChange);
    addEvent(elements.departmentAdminList, 'click', handleDepartmentAdminClick);
    addEvent(elements.departmentModalForm, 'submit', submitDepartmentModalForm);
    addEvent(elements.assetDetailPrimaryAction, 'click', handleAssetDetailPrimaryAction);
    addEvent(elements.assetDetailEditAction, 'click', handleAssetDetailEditAction);
    addEvent(elements.assetDetailDeleteAction, 'click', handleAssetDetailDeleteAction);

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
    if (typeof window.Chart !== 'function') missing.push('chart.umd.js');

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
      const [
        session,
        materials,
        hazmatTemplates,
        calibrationTemplates,
        calibration,
        debugTickets,
        debugAnalytics,
        departments,
        logs,
      ] = await Promise.all([
        apiFetch('/api/command-center/session'),
        apiFetch('/api/command-center/materials'),
        apiFetch('/api/command-center/hazmat/templates'),
        apiFetch('/api/command-center/calibration/templates'),
        apiFetch('/api/command-center/calibration'),
        apiFetch('/api/command-center/debug-lab/tickets?limit=500').catch(() => []),
        apiFetch('/api/command-center/debug-lab/analytics').catch(() => ({
          pareto: [],
          yield_trends: [],
          systemic_alerts: [],
          chronic_failures: [],
        })),
        apiFetch('/api/command-center/departments').catch(() => []),
        apiFetch('/api/command-center/logs?limit=24'),
      ]);

      state.user = session.user;
      state.materials = Array.isArray(materials) ? materials : [];
      state.hazmatTemplates = Array.isArray(hazmatTemplates) ? hazmatTemplates : [];
      state.templates = Array.isArray(calibrationTemplates) ? calibrationTemplates : [];
      state.calibration = Array.isArray(calibration) ? calibration : [];
      state.debugTickets = Array.isArray(debugTickets) ? debugTickets : [];
      state.debugAnalytics = {
        pareto: Array.isArray(debugAnalytics && debugAnalytics.pareto) ? debugAnalytics.pareto : [],
        yield_trends: Array.isArray(debugAnalytics && debugAnalytics.yield_trends) ? debugAnalytics.yield_trends : [],
        systemic_alerts: Array.isArray(debugAnalytics && debugAnalytics.systemic_alerts) ? debugAnalytics.systemic_alerts : [],
        chronic_failures: Array.isArray(debugAnalytics && debugAnalytics.chronic_failures) ? debugAnalytics.chronic_failures : [],
      };
      state.departmentRecords = normalizeDepartmentRecords(departments);
      state.logs = Array.isArray(logs) ? logs : [];
      syncDepartmentsFromRuntime();

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
    renderReportSummary();
    renderReportInsights();
    renderHazmatDna();
    renderInventoryTable();
    renderTemplateTable();
    renderCalibrationTable();
    renderDebugTicketTable();
    syncDebugTicketDepartmentOptions();
    renderDebugLiveBench();
    renderDepartmentControls();
    renderAssetConsole();
    renderLogs();
    hydrateSettingsForm();
    setView(state.currentView, { persist: false });
    setSection(state.currentSection, { persist: false });
  }

  function renderDashboard() {
    const moduleName = normalizeModule(state.currentModule);
    if (moduleName === 'hazmat') {
      const expired = state.materials.filter((item) => item.expired).length;
      const warning = state.materials.filter(isHazmatWarning).length;
      const lowStock = state.materials.filter((item) => item.low_stock).length;
      const highHazard = state.materials.filter((item) => item.high_hazard).length;

      elements.expiredCount.textContent = String(expired);
      elements.warningCount.textContent = String(warning);
      elements.lowStockCount.textContent = String(lowStock);
      elements.lockedCount.textContent = String(highHazard);
    } else if (moduleName === 'calibration') {
      const redCalibrations = state.calibration.filter(isCalibrationRed).length;
      const warning = state.calibration.filter((item) => item.warning).length;
      const dueToday = state.calibration.filter((item) => item.days_until_due === 0).length;
      const locked = state.calibration.filter((item) => item.locked_for_checkout).length;

      elements.expiredCount.textContent = String(redCalibrations);
      elements.warningCount.textContent = String(warning);
      elements.lowStockCount.textContent = String(dueToday);
      elements.lockedCount.textContent = String(locked);
    } else {
      const bench = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'BENCH').length;
      const open = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'OPEN').length;
      const fixed = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'FIXED').length;
      const chronic = state.debugTickets.filter((item) => item.chronic_failure).length;

      elements.expiredCount.textContent = String(bench);
      elements.warningCount.textContent = String(open);
      elements.lowStockCount.textContent = String(fixed);
      elements.lockedCount.textContent = String(chronic);
    }

    renderModuleAwareCopy(moduleName);
  }

  function renderModuleAwareCopy(moduleName) {
    const activeModule = normalizeModule(moduleName || state.currentModule);
    const isHazmat = activeModule === 'hazmat';
    const isCalibration = activeModule === 'calibration';

    if (elements.expiredLabel) {
      elements.expiredLabel.textContent = isHazmat
        ? 'Expired Hazmat Stock'
        : (isCalibration ? 'Expired Calibrations' : 'Boards On Bench');
    }
    if (elements.warningLabel) {
      elements.warningLabel.textContent = isHazmat
        ? 'Hazmat Warning Window'
        : (isCalibration ? 'Calibration Warning Window' : 'Open Failure Tickets');
    }
    if (elements.secondaryLabel) {
      elements.secondaryLabel.textContent = isHazmat
        ? 'Low Stock Exposure'
        : (isCalibration ? 'Due Today' : 'Fixed Boards');
    }
    if (elements.lockLabel) {
      elements.lockLabel.textContent = isHazmat
        ? 'High Hazard Items'
        : (isCalibration ? 'Locked Check-Outs' : 'Chronic Failures 90d');
    }

    if (elements.expiredCopy) {
      elements.expiredCopy.textContent = isHazmat
        ? 'Red rows mark expired Hazmat stock.'
        : (isCalibration
          ? 'Red rows mark expired calibrations.'
          : 'Boards currently in BENCH status are shown as red-priority diagnostics.');
    }
    if (elements.warningCopy) {
      elements.warningCopy.textContent = isHazmat
        ? 'Amber rows show Hazmat stock inside the configured warning lead time.'
        : (isCalibration
          ? 'Amber rows show calibration assets inside alert lead time.'
          : 'OPEN failure tickets represent unresolved incoming bench demand.');
    }
    if (elements.secondaryCopy) {
      elements.secondaryCopy.textContent = isHazmat
        ? 'Amber rows also flag Hazmat stock below minimum threshold.'
        : (isCalibration
          ? 'Counts calibration assets that are due today.'
          : 'FIXED boards count successful repair and verification outcomes.');
    }
    if (elements.lockCopy) {
      elements.lockCopy.textContent = isHazmat
        ? 'Tracks Hazmat inventory tagged with high-hazard GHS symbols.'
        : (isCalibration
          ? 'Red calibration assets cannot be checked out.'
          : 'Boards failing more than twice in 90 days are flagged as chronic.');
    }

    if (elements.doctrineRedCopy) {
      elements.doctrineRedCopy.textContent = isHazmat
        ? 'Expiration date has already passed for the Hazmat item.'
        : (isCalibration
          ? 'Calibration due date has passed or the asset is now locked.'
          : 'Ticket is actively under bench diagnostics and requires immediate attention.');
    }
    if (elements.doctrineAmberCopy) {
      elements.doctrineAmberCopy.textContent = isHazmat
        ? 'Item is inside Hazmat warning lead time or below stock threshold.'
        : (isCalibration
          ? 'Asset is inside calibration alert lead time.'
          : 'Ticket is OPEN and pending technician bench assignment.');
    }
    if (elements.doctrineLockCopy) {
      elements.doctrineLockCopy.textContent = isHazmat
        ? 'High-hazard materials remain highlighted for handling controls.'
        : (isCalibration
          ? 'Check-out remains disabled for any locked calibration asset.'
          : 'Chronic and systemic fault signatures are escalated for design-level review.');
    }

    if (elements.settingsTemplateTitle) {
      elements.settingsTemplateTitle.textContent = isHazmat
        ? 'Hazmat Templates'
        : (isCalibration ? 'Calibration Templates' : 'Debug Lab Uses Ticket Models');
    }

    if (elements.settingsTemplatePanel) {
      elements.settingsTemplatePanel.classList.toggle('hidden', activeModule === 'debug');
    }
  }

  function renderAssetConsole() {
    const entries = buildAssetQueueEntries();
    syncAssetDepartmentOptions(entries);
    syncAssetTypeOptions(entries);
    syncAssetStatusOptions(entries);
    hydrateAssetFilterControls();
    syncSummaryCardState();
    renderAssetResults(applyAssetConsoleFilters(entries));
    applyInventoryTableFilters();
    applyCalibrationTableFilters();
  }

  function handleSummaryCardInteraction(event) {
    if (!elements.dashboardSummaryPanel) return;
    const trigger = event && event.target ? event.target.closest('.summary-card-trigger') : null;
    if (!trigger || !elements.dashboardSummaryPanel.contains(trigger)) return;

    if (event.type === 'keydown') {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
    }

    applySummaryCardFilter(trigger.dataset.summaryFilter);
  }

  function applySummaryCardFilter(filterValue) {
    const requested = String(filterValue || 'all').trim().toLowerCase();
    state.assetFilters.status = state.assetFilters.status === requested ? 'all' : requested;
    renderAssetConsole();
    if (elements.dashboardAssetResults) {
      elements.dashboardAssetResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function buildAssetQueueEntries() {
    const moduleName = normalizeModule(state.currentModule);
    if (moduleName === 'hazmat') return buildHazmatQueueEntries();
    if (moduleName === 'calibration') return buildCalibrationQueueEntries();
    return buildDebugQueueEntries();
  }

  function syncSummaryCardState() {
    if (!Array.isArray(elements.dashboardSummaryCards)) return;
    const activeStatus = state.assetFilters.status;

    elements.dashboardSummaryCards.forEach((card) => {
      const cardStatus = String(card.dataset.summaryFilter || '').toLowerCase();
      const isActive = activeStatus !== 'all' && cardStatus === activeStatus;
      card.classList.toggle('is-active', isActive);
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function buildHazmatQueueEntries() {
    return state.materials
      .map((item) => {
        const daysUntilDue = typeof item.days_remaining === 'number'
          ? item.days_remaining
          : null;
        const department = String(item.assigned_department || state.settings.defaultDepartment || 'Unassigned').trim();
        const statusKey = hazmatQueueStatusKey(item);

        return {
          key: `hazmat-${item.id}`,
          source: 'hazmat',
          view: 'hazmat',
          section: 'assets',
          id: item.id,
          title: item.name || 'Unnamed Material',
          subtitle: item.batch_id || `ID ${item.id}`,
          subtitleLabel: 'Batch',
          department,
          typeTags: getHazmatTypeTags(item),
          statusKey,
          daysUntilDue,
          nextCal: item.expiration_date || '',
          dueLabel: 'Expiration',
          detail: item.high_hazard ? 'High hazard material' : 'Hazmat material',
        };
      })
      .filter(Boolean);
  }

  function buildCalibrationQueueEntries() {
    return state.calibration
      .map((item) => {
        const daysUntilDue = resolveCalibrationDaysUntilDue(item);
        if (!Number.isFinite(daysUntilDue) || daysUntilDue < 0) return null;

        const department = String(item.assigned_department || '').trim();
        const typeTag = normalizeFilterTag(item.category || 'uncategorized');
        const statusKey = calibrationQueueStatusKey(item, daysUntilDue);

        return {
          key: `calibration-${item.id}`,
          source: 'calibration',
          view: 'calibration',
          section: 'assets',
          id: item.id,
          title: item.tool_name || 'Unnamed Asset',
          subtitle: item.serial_number || `ID ${item.id}`,
          subtitleLabel: 'Serial',
          department,
          typeTags: ['calibration', typeTag].filter(Boolean),
          statusKey,
          daysUntilDue,
          nextCal: item.next_cal || '',
          dueLabel: 'Next Cal',
          detail: item.category || 'Calibration asset',
        };
      })
      .filter(Boolean);
  }

  function buildDebugQueueEntries() {
    return state.debugTickets
      .map((item) => {
        const status = normalizeDebugStatus(item.status);
        const department = String(item.department_name || '').trim();
        const signatureTag = normalizeFilterTag(item.failure_signature || 'unknown_signature');
        const boardTag = normalizeFilterTag(item.model_rev || 'unknown_board');
        const failureModeTags = collectDebugFailureModeTags(item).map((tag) => `failure_mode_${tag}`);
        const chronicTag = item.chronic_failure ? 'chronic_failure' : '';

        return {
          key: `debug-${item.id}`,
          source: 'debug',
          view: 'debug',
          section: 'assets',
          id: item.id,
          title: item.failure_signature || 'Unnamed Failure Signature',
          subtitle: item.serial_number || `Ticket ${item.id}`,
          subtitleLabel: 'Board',
          department,
          typeTags: [
            'debug',
            'failure_ticket',
            `board_type_${boardTag}`,
            `failure_signature_${signatureTag}`,
            chronicTag,
          ].concat(failureModeTags).filter(Boolean),
          statusKey: debugTicketStatusKey(status, Boolean(item.chronic_failure)),
          daysUntilDue: null,
          nextCal: status,
          dueLabel: 'Status',
          detail: item.model_rev || 'Failure ticket',
        };
      })
      .filter(Boolean);
  }

  function hazmatQueueStatusKey(item) {
    if (item.expired) return 'red';
    if (isHazmatWarning(item) || item.low_stock) return 'amber';
    if (item.high_hazard) return 'locked';
    return 'safe';
  }

  function debugTicketStatusKey(status, chronicFailure) {
    if (chronicFailure || status === 'SCRAP') return 'locked';
    if (status === 'BENCH') return 'red';
    if (status === 'OPEN') return 'amber';
    return 'safe';
  }

  function syncAssetDepartmentOptions(entries) {
    if (!elements.assetDepartmentFilter) return;
    const departments = normalizeDepartmentList(
      (state.settings.departments || []).concat(entries.map((entry) => entry.department).filter(Boolean)),
      state.settings.defaultDepartment
    ).sort((left, right) => left.localeCompare(right));
    const options = ['<option value="all">All Departments</option>']
      .concat(departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`));
    elements.assetDepartmentFilter.innerHTML = options.join('');
    if (state.assetFilters.department !== 'all' && !departments.includes(state.assetFilters.department)) {
      state.assetFilters.department = 'all';
    }
  }

  function syncAssetTypeOptions(entries) {
    if (!elements.assetTypeFilter) return;
    const moduleTag = normalizeModule(state.currentModule);
    const typeValues = Array.from(
      new Set(entries.flatMap((entry) => entry.typeTags || []).filter((type) => type && type !== moduleTag))
    ).sort((left, right) => assetTypeLabel(left).localeCompare(assetTypeLabel(right)));
    const options = ['<option value="all">All Types</option>']
      .concat(typeValues.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(assetTypeLabel(type))}</option>`));
    elements.assetTypeFilter.innerHTML = options.join('');
    if (state.assetFilters.type !== 'all' && !typeValues.includes(state.assetFilters.type)) {
      state.assetFilters.type = 'all';
    }
  }

  function syncAssetStatusOptions(entries) {
    if (!elements.assetStatusFilter) return;
    const supportedStatuses = ['all', 'red', 'amber', 'safe', 'locked'];
    const statusValues = new Set(entries.map((entry) => entry.statusKey));
    const options = [
      '<option value="all">All Statuses</option>',
      statusValues.has('red') ? '<option value="red">Red</option>' : '',
      statusValues.has('amber') ? '<option value="amber">Amber</option>' : '',
      statusValues.has('safe') ? '<option value="safe">Safe</option>' : '',
      statusValues.has('locked') ? '<option value="locked">Locked</option>' : '',
    ].filter(Boolean);

    elements.assetStatusFilter.innerHTML = options.join('');
    if (!supportedStatuses.includes(state.assetFilters.status)) {
      state.assetFilters.status = 'all';
    }
    if (!statusValues.has(state.assetFilters.status) && state.assetFilters.status !== 'all') {
      state.assetFilters.status = 'all';
    }
  }

  function hydrateAssetFilterControls() {
    if (elements.assetDuePresetFilter) elements.assetDuePresetFilter.value = state.assetFilters.duePreset;
    if (elements.assetDueMinFilter) elements.assetDueMinFilter.value = state.assetFilters.dueMin;
    if (elements.assetDueMaxFilter) elements.assetDueMaxFilter.value = state.assetFilters.dueMax;
    if (elements.assetDepartmentFilter) elements.assetDepartmentFilter.value = state.assetFilters.department;
    if (elements.assetTypeFilter) elements.assetTypeFilter.value = state.assetFilters.type;
    if (elements.assetStatusFilter) elements.assetStatusFilter.value = state.assetFilters.status;
  }

  function applyAssetConsoleFilters(entries) {
    const filters = state.assetFilters;
    const searchTerm = normalizeSearchTerm(getCalibrationSearchTerm());
    const dueWindow = resolveDueWindow(filters);
    const activeModule = normalizeModule(state.currentModule);
    const isCalibrationModule = activeModule === 'calibration';
    const isDebugModule = activeModule === 'debug';
    return entries
      .filter((entry) => {
        if (isCalibrationModule && (!Number.isFinite(entry.daysUntilDue) || entry.daysUntilDue < 0)) return false;
        if (searchTerm && !matchesQueueSearch(entry, searchTerm)) return false;
        if (dueWindow.active && !isDebugModule) {
          if (!Number.isFinite(entry.daysUntilDue)) return false;
          if (!isWithinDueWindow(entry.daysUntilDue, dueWindow.min, dueWindow.max)) return false;
        }
        if (filters.department !== 'all' && entry.department !== filters.department) return false;
        if (filters.type !== 'all' && !(entry.typeTags || []).includes(filters.type)) return false;
        if (filters.status !== 'all' && entry.statusKey !== filters.status) return false;
        return true;
      })
      .sort((left, right) => {
        const leftDays = Number.isFinite(left.daysUntilDue) ? left.daysUntilDue : Number.MAX_SAFE_INTEGER;
        const rightDays = Number.isFinite(right.daysUntilDue) ? right.daysUntilDue : Number.MAX_SAFE_INTEGER;
        return leftDays - rightDays || Number(left.id || 0) - Number(right.id || 0);
      });
  }

  function renderAssetResults(entries) {
    if (!elements.dashboardAssetResults) return;

    const moduleName = normalizeModule(state.currentModule);
    const isHazmatModule = moduleName === 'hazmat';
    const isCalibrationModule = moduleName === 'calibration';

    if (!entries.length) {
      elements.dashboardAssetResults.innerHTML = isHazmatModule
        ? '<div class="focus-item"><strong>No matching hazmat assets</strong><p>Try a wider day window or clear filters.</p></div>'
        : (isCalibrationModule
          ? '<div class="focus-item"><strong>No matching calibration assets</strong><p>Try a wider day window or clear filters.</p></div>'
          : '<div class="focus-item"><strong>No matching debug tickets</strong><p>Try broadening the signature search or clearing filters.</p></div>');
      return;
    }

    elements.dashboardAssetResults.innerHTML = entries.slice(0, 12).map((entry) => {
      const isHazmatEntry = entry.source === 'hazmat';
      const isDebugEntry = entry.source === 'debug';
      const subtitleLabel = entry.subtitleLabel || (isHazmatEntry ? 'Batch' : (isDebugEntry ? 'Board' : 'Serial'));
      const dueLabel = entry.dueLabel || (isHazmatEntry ? 'Expiration' : (isDebugEntry ? 'Status' : 'Next Cal'));
      const dueFallback = isHazmatEntry ? 'Open' : (isDebugEntry ? 'OPEN' : 'Not scheduled');
      const primaryAction = isHazmatEntry ? 'verify' : (isDebugEntry ? 'bench' : 'calibrate');
      const primaryLabel = isHazmatEntry ? 'Verify' : (isDebugEntry ? 'Select' : 'Calibrate');
      return [
        `<article class="asset-result-card" data-asset-source="${escapeHtml(entry.source)}" data-asset-id="${escapeHtml(String(entry.id))}">`,
        '<div class="asset-result-head">',
        `<strong>${escapeHtml(entry.title)}</strong>`,
        `<span class="status-chip ${queueStatusClass(entry.statusKey)}">${escapeHtml(queueStatusLabel(entry.statusKey))}</span>`,
        '</div>',
        '<div class="asset-result-grid">',
        `<div><small>${escapeHtml(subtitleLabel)}</small><strong>${escapeHtml(entry.subtitle || 'Not set')}</strong></div>`,
        `<div><small>Department</small><strong>${escapeHtml(entry.department || 'Unassigned')}</strong></div>`,
        `<div><small>${escapeHtml(dueLabel)}</small><strong>${escapeHtml(entry.nextCal || dueFallback)}</strong></div>`,
        '</div>',
        '<div class="asset-result-actions">',
        '<button class="queue-action-button" type="button" data-result-action="view" aria-label="View asset details" title="View">',
        '<svg viewBox="0 0 24 24" class="icon-svg" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
        '</button>',
        '<button class="queue-action-button" type="button" data-result-action="edit" aria-label="Edit asset" title="Edit">',
        '<svg viewBox="0 0 24 24" class="icon-svg" aria-hidden="true"><path d="m4 20 4.2-1 10-10a2 2 0 0 0-2.8-2.8l-10 10L4 20Z"></path><path d="M13.5 6.5 17.5 10.5"></path></svg>',
        '</button>',
        `<button class="queue-action-button emphasize" type="button" data-result-action="${escapeHtml(primaryAction)}" aria-label="${escapeHtml(primaryLabel)} asset" title="${escapeHtml(primaryLabel)}">`,
        '<svg viewBox="0 0 24 24" class="icon-svg" aria-hidden="true"><path d="M7 12h10"></path><path d="M7 8h10"></path><path d="M7 16h6"></path><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>',
        '</button>',
        '</div>',
        '</article>',
      ].join('');
    }).join('');
  }

  function updateAssetFilter(key, value) {
    const normalizedValue = value === undefined || value === null ? '' : String(value).trim();

    if (key === 'duePreset') {
      state.assetFilters.duePreset = normalizeDuePreset(normalizedValue);
      applyDuePresetToFilter(state.assetFilters.duePreset);
    } else if (key === 'dueMin' || key === 'dueMax') {
      state.assetFilters[key] = normalizeDayFilterValue(normalizedValue);
      state.assetFilters.duePreset = state.assetFilters.dueMin || state.assetFilters.dueMax ? 'custom' : 'all';
    } else if (key === 'department' || key === 'type' || key === 'status') {
      state.assetFilters[key] = normalizedValue || 'all';
    }

    renderAssetConsole();
  }

  function clearAssetFilters() {
    state.assetFilters = {
      duePreset: 'all',
      dueMin: '',
      dueMax: '',
      department: 'all',
      type: 'all',
      status: 'all',
    };
    renderAssetConsole();
  }

  function handleAssetResultClick(event) {
    const card = event && event.target ? event.target.closest('[data-asset-source][data-asset-id]') : null;
    if (!card) return;

    const actionButton = event.target.closest('[data-result-action]');
    if (actionButton) {
      handleAssetResultAction(card.dataset.assetSource, card.dataset.assetId, actionButton.dataset.resultAction);
      return;
    }

    openAssetFromConsole(card.dataset.assetSource, card.dataset.assetId);
  }

  function handleAssetResultAction(source, id, action) {
    if (source === 'hazmat') {
      const material = findMaterialById(id);
      if (!material) return;

      setView('hazmat');

      if (action === 'edit') {
        openMaterialModal(material);
        return;
      }

      if (action === 'verify') {
        verifyMaterial(material);
        return;
      }

      openAssetDetailModal(material, 'hazmat');
      return;
    }

    if (source === 'debug') {
      const ticket = findDebugTicketById(id);
      if (!ticket) return;

      setView('debug');
      setSection('assets');
      selectDebugTicket(ticket.id);

      if (action === 'edit') {
        populateDebugTicketForm(ticket);
      }
      return;
    }

    if (source !== 'calibration') {
      openAssetFromConsole(source, id);
      return;
    }

    const asset = findCalibrationById(id);
    if (!asset) return;

    setView('calibration');

    if (action === 'edit') {
      openCalibrationModal(asset);
      return;
    }

    if (action === 'calibrate') {
      openCertificateModal(asset);
      return;
    }

    openAssetDetailModal(asset, 'calibration');
  }

  function openAssetFromConsole(source, id) {
    if (source === 'hazmat') {
      const material = findMaterialById(id);
      setView('hazmat');
      if (material) openAssetDetailModal(material, 'hazmat');
      return;
    }

    if (source === 'debug') {
      const ticket = findDebugTicketById(id);
      setView('debug');
      setSection('assets');
      if (ticket) {
        selectDebugTicket(ticket.id);
        populateDebugTicketForm(ticket);
      }
      return;
    }

    if (source === 'calibration') {
      const asset = findCalibrationById(id);
      setView('calibration');
      if (asset) openAssetDetailModal(asset, 'calibration');
      return;
    }
  }

  function applyInventoryTableFilters() {
    if (!state.inventoryTable) return;
    const searchTerm = elements.inventorySearch ? elements.inventorySearch.value : '';
    state.inventoryTable.setFilter((data) => matchesInventoryAssetFilters(data) && filterInventoryRows(data, searchTerm));
  }

  function getCalibrationSearchTerm() {
    return elements.dashboardCalibrationSearch ? elements.dashboardCalibrationSearch.value : '';
  }

  function normalizeSearchTerm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function matchesQueueSearch(entry, searchTerm) {
    return [
      entry.title,
      entry.subtitle,
      entry.department,
      entry.detail,
      entry.nextCal,
      queueStatusLabel(entry.statusKey),
    ].some((field) => normalizeSearchTerm(field).includes(searchTerm));
  }

  function applyCalibrationTableFilters() {
    if (!state.calibrationTable) return;
    const searchTerm = getCalibrationSearchTerm();
    state.calibrationTable.setFilter((data) => matchesCalibrationAssetFilters(data) && filterCalibrationRows(data, searchTerm));
  }

  function matchesInventoryAssetFilters(data) {
    void data;
    return true;
  }

  function matchesCalibrationAssetFilters(data) {
    const filters = state.assetFilters;
    const daysUntilDue = resolveCalibrationDaysUntilDue(data);
    const dueWindow = resolveDueWindow(filters);

    if (dueWindow.active && !isWithinDueWindow(daysUntilDue, dueWindow.min, dueWindow.max)) return false;
    if (filters.department !== 'all' && (data.assigned_department || '') !== filters.department) return false;
    if (filters.type !== 'all' && !getCalibrationTypeTags(data).includes(filters.type)) return false;
    if (filters.status !== 'all' && calibrationQueueStatusKey(data, daysUntilDue) !== filters.status) return false;
    return true;
  }

  function getHazmatTypeTags(item) {
    return ['material'].concat(item.high_hazard ? ['high_hazard'] : [], item.low_stock ? ['low_stock'] : [], item.expired ? ['expired'] : [], isHazmatWarning(item) ? ['warning'] : []);
  }

  function getCalibrationTypeTags(item) {
    return ['calibration', normalizeFilterTag(item.category || 'uncategorized')].filter(Boolean);
  }

  function normalizeDuePreset(value) {
    const preset = String(value || '').trim().toLowerCase();
    if (preset === '1' || preset === '3' || preset === '5' || preset === '1-5' || preset === 'custom') {
      return preset;
    }
    return 'all';
  }

  function normalizeDayFilterValue(value) {
    if (value === '') return '';
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return '';
    return String(parsed);
  }

  function applyDuePresetToFilter(preset) {
    switch (preset) {
      case '1':
        state.assetFilters.dueMin = '1';
        state.assetFilters.dueMax = '1';
        break;
      case '3':
        state.assetFilters.dueMin = '3';
        state.assetFilters.dueMax = '3';
        break;
      case '5':
        state.assetFilters.dueMin = '5';
        state.assetFilters.dueMax = '5';
        break;
      case '1-5':
        state.assetFilters.dueMin = '1';
        state.assetFilters.dueMax = '5';
        break;
      case 'all':
        state.assetFilters.dueMin = '';
        state.assetFilters.dueMax = '';
        break;
      default:
        break;
    }
  }

  function parseDayFilterValue(value) {
    if (value === '') return null;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }

  function resolveDueWindow(filters) {
    const min = parseDayFilterValue(filters.dueMin);
    const max = parseDayFilterValue(filters.dueMax);

    if (min === null && max === null) {
      return { active: false, min: null, max: null };
    }

    if (min !== null && max !== null && max < min) {
      return { active: true, min: max, max: min };
    }

    return { active: true, min, max };
  }

  function isWithinDueWindow(daysUntilDue, min, max) {
    if (!Number.isFinite(daysUntilDue) || daysUntilDue < 0) return false;
    if (min !== null && daysUntilDue < min) return false;
    if (max !== null && daysUntilDue > max) return false;
    return true;
  }

  function resolveCalibrationDaysUntilDue(item) {
    if (typeof item.days_until_due === 'number' && Number.isFinite(item.days_until_due)) {
      return item.days_until_due;
    }

    const nextCal = String(item.next_cal || '').trim();
    if (!nextCal) return null;

    if (window.luxon && window.luxon.DateTime) {
      const dueDate = window.luxon.DateTime.fromISO(nextCal).startOf('day');
      const now = window.luxon.DateTime.local().startOf('day');
      if (dueDate.isValid && now.isValid) {
        return Math.round(dueDate.diff(now, 'days').days);
      }
    }

    const targetDate = new Date(`${nextCal}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((targetDate.getTime() - today.getTime()) / 86400000);
  }

  function describeDueWindow(daysUntilDue, nextCal) {
    if (!Number.isFinite(daysUntilDue)) {
      return nextCal ? `Next calibration ${nextCal}` : 'No next calibration date';
    }
    if (daysUntilDue === 0) return 'Due today';
    if (daysUntilDue === 1) return 'Due in 1 day';
    return `Due in ${daysUntilDue} days`;
  }

  function calibrationQueueStatusKey(item, daysUntilDue) {
    if (item.locked_for_checkout) return 'locked';
    if (isCalibrationRed(item) || (Number.isFinite(daysUntilDue) && daysUntilDue < 0)) return 'red';
    if (item.warning || daysUntilDue === 0) return 'amber';
    return 'safe';
  }

  function normalizeDebugStatus(value) {
    const normalized = String(value || 'OPEN').trim().toUpperCase();
    return ['OPEN', 'BENCH', 'FIXED', 'SCRAP'].includes(normalized) ? normalized : 'OPEN';
  }

  function queueStatusLabel(statusKey) {
    const labels = {
      red: 'Red',
      amber: 'Amber',
      safe: 'Safe',
      locked: 'Locked',
    };
    return labels[statusKey] || startCase(statusKey || 'safe');
  }

  function queueStatusClass(statusKey) {
    const classes = {
      red: 'status-danger',
      amber: 'status-amber',
      safe: 'status-safe',
      locked: 'status-danger',
    };
    return classes[statusKey] || 'status-blue';
  }

  function assetTypeLabel(type) {
    if (String(type || '').startsWith('board_type_')) {
      return `Board Type: ${debugBoardTypeLabel(String(type).slice(11))}`;
    }
    if (String(type || '').startsWith('failure_mode_')) {
      return `Failure Mode: ${debugFailureModeLabel(String(type).slice(13))}`;
    }
    if (String(type || '').startsWith('failure_signature_')) {
      return `Signature: ${startCase(String(type).slice(18))}`;
    }

    const labels = {
      hazmat: 'Hazmat',
      calibration: 'Calibration',
      cfe: 'CFE',
      debug: 'Debug Lab',
      failure_ticket: 'Failure Ticket',
      chronic_failure: 'Chronic Failure',
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
    const moduleName = normalizeModule(state.currentModule);
    const scopedLogCount = state.logs.filter((entry) => logBelongsToModule(entry, moduleName)).length;
    let metrics;

    if (moduleName === 'hazmat') {
      metrics = [
        { label: 'Hazmat Rows', value: state.materials.length },
        { label: 'Hazmat Templates', value: state.hazmatTemplates.length },
        { label: 'Hazmat Logs', value: scopedLogCount },
      ];
    } else if (moduleName === 'calibration') {
      metrics = [
        { label: 'Calibration Rows', value: state.calibration.length },
        { label: 'Calibration Templates', value: state.templates.length },
        { label: 'Calibration Logs', value: scopedLogCount },
      ];
    } else {
      metrics = [
        { label: 'Failure Tickets', value: state.debugTickets.length },
        { label: 'Systemic Alerts', value: state.debugAnalytics.systemic_alerts.length },
        { label: 'Debug Logs', value: scopedLogCount },
      ];
    }

    elements.reportSummary.innerHTML = metrics.map((metric) => [
      '<div class="report-metric">',
      `<strong>${escapeHtml(String(metric.value))}</strong>`,
      `<small>${escapeHtml(metric.label)}</small>`,
      '</div>',
    ].join('')).join('');
  }

  function openReportsInterface(moduleName) {
    const nextModule = normalizeModule(moduleName || state.currentModule);
    setView(nextModule);
    state.currentReportModule = normalizeModule(state.currentModule);
    setSection('reports');
    syncReportModuleControls();
    renderReportSummary();
    renderLogs();
    renderReportInsights();
  }

  function setReportModule(moduleName) {
    const activeModule = normalizeModule(state.currentModule);
    const requestedModule = normalizeModule(moduleName || activeModule);
    state.currentReportModule = requestedModule === activeModule ? requestedModule : activeModule;
    syncReportModuleControls();
  }

  function syncReportModuleControls() {
    const activeModule = normalizeModule(state.currentModule);
    const requested = normalizeModule(state.currentReportModule || activeModule);
    const selected = requested === activeModule ? requested : activeModule;
    state.currentReportModule = selected;

    const reportButtons = {
      hazmat: elements.reportModuleHazmatButton,
      calibration: elements.reportModuleCalibrationButton,
      debug: elements.reportModuleDebugButton,
    };
    const reportPanels = {
      hazmat: elements.hazmatReportPanel,
      calibration: elements.calibrationReportPanel,
      debug: elements.debugReportPanel,
    };
    const settingsButtons = {
      hazmat: elements.settingsOpenHazmatReportButton,
      calibration: elements.settingsOpenCalibrationReportButton,
      debug: elements.settingsOpenDebugReportButton,
    };

    const labels = {
      hazmat: 'Hazmat report is active. Use this to track total stock, expired items, and where to improve handling readiness.',
      calibration: 'Calibration report is active. Use this to track on-time versus late assets, and where to improve scheduling discipline.',
      debug: 'Debug Lab report is active. Use Pareto and yield trends to isolate recurring faults and systemic design risk.',
    };

    if (elements.reportModuleSwitch) {
      elements.reportModuleSwitch.setAttribute('aria-hidden', 'false');
    }

    Object.keys(reportButtons).forEach((moduleName) => {
      const button = reportButtons[moduleName];
      const panel = reportPanels[moduleName];
      const launchButton = settingsButtons[moduleName];
      const showButton = moduleName === activeModule;
      const isSelected = moduleName === selected;

      if (button) {
        button.classList.toggle('hidden', !showButton);
        button.classList.toggle('is-active', isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      }

      if (launchButton) {
        launchButton.classList.toggle('hidden', moduleName !== activeModule);
      }

      if (panel) {
        panel.classList.toggle('hidden', !isSelected);
        panel.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
      }
    });

    if (elements.reportInterfaceCopy) {
      elements.reportInterfaceCopy.textContent = labels[selected] || labels.hazmat;
    }
  }

  function renderReportInsights() {
    const hazmatStats = buildHazmatReportStats();
    const calibrationStats = buildCalibrationReportStats();
    const debugStats = buildDebugReportStats();

    renderReportMetricCards(elements.hazmatReportMetrics, [
      {
        label: 'Total Hazmat Assets',
        value: hazmatStats.total,
        hint: `${hazmatStats.highHazard} high hazard item(s)`,
      },
      {
        label: 'On-Time / In-Date',
        value: hazmatStats.onTime,
        hint: `${formatRate(hazmatStats.onTime, hazmatStats.total)} compliance`,
      },
      {
        label: 'Late / Expired',
        value: hazmatStats.late,
        hint: `${formatRate(hazmatStats.late, hazmatStats.total)} risk`,
      },
      {
        label: 'Low Stock',
        value: hazmatStats.lowStock,
        hint: `${hazmatStats.warning} in warning window`,
      },
    ]);

    renderReportMetricCards(elements.calibrationReportMetrics, [
      {
        label: 'Total Calibration Assets',
        value: calibrationStats.total,
        hint: `${calibrationStats.locked} locked for checkout`,
      },
      {
        label: 'Calibrated On Time',
        value: calibrationStats.onTime,
        hint: `${formatRate(calibrationStats.onTime, calibrationStats.total)} on-time`,
      },
      {
        label: 'Calibrated Late',
        value: calibrationStats.late,
        hint: `${formatRate(calibrationStats.late, calibrationStats.total)} late`,
      },
      {
        label: 'Due Soon / Today',
        value: calibrationStats.warning,
        hint: `${calibrationStats.dueToday} due today`,
      },
    ]);

    renderReportImprovementList(elements.hazmatReportImprovements, buildHazmatImprovements(hazmatStats));
    renderReportImprovementList(elements.calibrationReportImprovements, buildCalibrationImprovements(calibrationStats));
    renderReportMetricCards(elements.debugReportMetrics, [
      {
        label: 'Total Failure Tickets',
        value: debugStats.total,
        hint: `${debugStats.bench} on bench`,
      },
      {
        label: 'Open Tickets',
        value: debugStats.open,
        hint: `${formatRate(debugStats.open, debugStats.total)} pending`,
      },
      {
        label: 'Fixed Tickets',
        value: debugStats.fixed,
        hint: `${formatRate(debugStats.fixed, debugStats.total)} resolved`,
      },
      {
        label: 'Chronic Boards',
        value: debugStats.chronic,
        hint: `${debugStats.systemic} systemic alert(s)`,
      },
    ]);
    renderReportImprovementList(elements.debugReportImprovements, buildDebugImprovements(debugStats));
    renderDebugCharts();
    syncReportModuleControls();
  }

  function renderReportMetricCards(container, metrics) {
    if (!container) return;
    const cards = Array.isArray(metrics) ? metrics : [];
    container.innerHTML = cards.map((metric) => [
      '<article class="report-kpi-card">',
      `<small>${escapeHtml(metric.label || '')}</small>`,
      `<strong>${escapeHtml(String(metric.value == null ? '' : metric.value))}</strong>`,
      `<p>${escapeHtml(metric.hint || '')}</p>`,
      '</article>',
    ].join('')).join('');
  }

  function renderReportImprovementList(container, items) {
    if (!container) return;
    const notes = Array.isArray(items) && items.length
      ? items
      : ['No priority improvements detected. Keep monitoring for drift.'];
    container.innerHTML = notes.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }

  function buildHazmatReportStats() {
    const total = state.materials.length;
    const late = state.materials.filter((item) => item.expired).length;
    const onTime = Math.max(0, total - late);
    const warning = state.materials.filter(isHazmatWarning).length;
    const lowStock = state.materials.filter((item) => item.low_stock).length;
    const highHazard = state.materials.filter((item) => item.high_hazard).length;
    const missingExpiration = state.materials.filter((item) => !item.expiration_date).length;
    return {
      total,
      late,
      onTime,
      warning,
      lowStock,
      highHazard,
      missingExpiration,
    };
  }

  function buildCalibrationReportStats() {
    const total = state.calibration.length;
    const late = state.calibration.filter((item) => isCalibrationRed(item)).length;
    const warning = state.calibration.filter((item) => item.warning).length;
    const onTime = state.calibration.filter((item) => !isCalibrationRed(item) && !item.warning).length;
    const dueToday = state.calibration.filter((item) => item.days_until_due === 0).length;
    const locked = state.calibration.filter((item) => item.locked_for_checkout).length;
    const missingTemplate = state.calibration.filter((item) => !item.template_id).length;
    const missingLastCal = state.calibration.filter((item) => !item.last_cal).length;
    return {
      total,
      late,
      onTime,
      warning,
      dueToday,
      locked,
      missingTemplate,
      missingLastCal,
    };
  }

  function buildDebugReportStats() {
    const total = state.debugTickets.length;
    const open = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'OPEN').length;
    const bench = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'BENCH').length;
    const fixed = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'FIXED').length;
    const scrap = state.debugTickets.filter((item) => normalizeDebugStatus(item.status) === 'SCRAP').length;
    const chronic = state.debugTickets.filter((item) => item.chronic_failure).length;
    const systemic = state.debugAnalytics.systemic_alerts.length;
    const chronicAlerts = state.debugAnalytics.chronic_failures.length;

    return {
      total,
      open,
      bench,
      fixed,
      scrap,
      chronic,
      systemic,
      chronicAlerts,
    };
  }

  function buildHazmatImprovements(stats) {
    const notes = [];
    if (stats.late > 0) {
      notes.push(`Resolve ${stats.late} expired hazmat asset(s) to reduce compliance risk.`);
    }
    if (stats.lowStock > 0) {
      notes.push(`Restock ${stats.lowStock} low-stock hazmat asset(s) before production impact.`);
    }
    if (stats.warning > 0) {
      notes.push(`Prioritize review for ${stats.warning} hazmat asset(s) in warning window.`);
    }
    if (stats.missingExpiration > 0) {
      notes.push(`Add expiration dates for ${stats.missingExpiration} hazmat asset(s) to improve tracking accuracy.`);
    }
    if (!notes.length) {
      notes.push('Hazmat performance is stable. Continue current handling cadence and periodic spot checks.');
    }
    return notes;
  }

  function buildCalibrationImprovements(stats) {
    const notes = [];
    if (stats.late > 0) {
      notes.push(`Recalibrate ${stats.late} late asset(s) first to recover compliance.`);
    }
    if (stats.warning > 0) {
      notes.push(`Schedule ${stats.warning} warning asset(s) before they become late.`);
    }
    if (stats.dueToday > 0) {
      notes.push(`Complete calibration for ${stats.dueToday} asset(s) due today.`);
    }
    if (stats.missingTemplate > 0) {
      notes.push(`Assign templates to ${stats.missingTemplate} calibration asset(s) to enforce rules.`);
    }
    if (stats.missingLastCal > 0) {
      notes.push(`Capture last calibration date for ${stats.missingLastCal} asset(s) to improve trend quality.`);
    }
    if (!notes.length) {
      notes.push('Calibration performance is stable. Maintain proactive scheduling and certificate discipline.');
    }
    return notes;
  }

  function buildDebugImprovements(stats) {
    const notes = [];
    const topSystemic = state.debugAnalytics.systemic_alerts.slice(0, 2);
    const topChronic = state.debugAnalytics.chronic_failures.slice(0, 2);

    if (stats.open > 0) {
      notes.push(`Prioritize assignment for ${stats.open} OPEN ticket(s) to reduce queue age.`);
    }
    if (stats.bench > 0) {
      notes.push(`Review ${stats.bench} BENCH ticket(s) for blocked diagnostics or missing components.`);
    }
    if (stats.scrap > 0) {
      notes.push(`${stats.scrap} board(s) were scrapped. Verify fault containment and salvage opportunities.`);
    }
    topChronic.forEach((alert) => {
      notes.push(alert.message || `Chronic failure trend detected for ${alert.serial_number}.`);
    });
    topSystemic.forEach((alert) => {
      notes.push(alert.message || `Systemic issue detected at ${alert.ref_designator}.`);
    });

    if (!notes.length) {
      notes.push('Debug Lab trends are stable. Continue logging board signatures and replaced components for stronger pattern confidence.');
    }

    return notes;
  }

  function renderDebugCharts() {
    if (!elements.debugParetoChart || !elements.debugYieldChart) return;

    if (state.debugParetoChart && typeof state.debugParetoChart.destroy === 'function') {
      state.debugParetoChart.destroy();
      state.debugParetoChart = null;
    }
    if (state.debugYieldChart && typeof state.debugYieldChart.destroy === 'function') {
      state.debugYieldChart.destroy();
      state.debugYieldChart = null;
    }

    if (typeof window.Chart !== 'function') {
      return;
    }

    const paretoRows = Array.isArray(state.debugAnalytics.pareto) ? state.debugAnalytics.pareto : [];
    const yieldRows = Array.isArray(state.debugAnalytics.yield_trends) ? state.debugAnalytics.yield_trends : [];

    state.debugParetoChart = new window.Chart(elements.debugParetoChart.getContext('2d'), {
      type: 'bar',
      data: {
        labels: paretoRows.map((row) => row.ref_designator || 'UNKNOWN'),
        datasets: [{
          label: 'Failures',
          data: paretoRows.map((row) => Number(row.failures) || 0),
          backgroundColor: 'rgba(204, 51, 51, 0.85)',
          borderColor: 'rgba(204, 51, 51, 1)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#b5b5b5' },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
          x: {
            ticks: { color: '#f4f4f4' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
      },
    });

    state.debugYieldChart = new window.Chart(elements.debugYieldChart.getContext('2d'), {
      type: 'line',
      data: {
        labels: yieldRows.map((row) => row.week_start || ''),
        datasets: [
          {
            label: 'Boards Received',
            data: yieldRows.map((row) => Number(row.boards_received) || 0),
            borderColor: 'rgba(244, 244, 244, 0.95)',
            backgroundColor: 'rgba(244, 244, 244, 0.18)',
            tension: 0.28,
            fill: true,
          },
          {
            label: 'Boards Fixed',
            data: yieldRows.map((row) => Number(row.boards_fixed) || 0),
            borderColor: 'rgba(204, 51, 51, 0.95)',
            backgroundColor: 'rgba(204, 51, 51, 0.18)',
            tension: 0.28,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#f4f4f4',
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#b5b5b5' },
            grid: { color: 'rgba(255,255,255,0.08)' },
          },
          x: {
            ticks: { color: '#f4f4f4' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
      },
    });
  }

  function formatRate(value, total) {
    if (!total) return '0%';
    const rate = Math.round((Number(value || 0) / Number(total)) * 100);
    return `${rate}%`;
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
      { title: 'Asset ID', field: 'asset_uid', minWidth: 150 },
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
      if (elements.templateTable) {
        elements.templateTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      }
      if (elements.settingsTemplateTable) {
        elements.settingsTemplateTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      }
      return;
    }

    state.templateTable = renderTemplateTableInstance(
      elements.templateTable,
      state.templateTable,
      elements.templateSearch ? elements.templateSearch.value : ''
    );

    state.settingsTemplateTable = renderTemplateTableInstance(
      elements.settingsTemplateTable,
      state.settingsTemplateTable,
      elements.settingsTemplateSearch ? elements.settingsTemplateSearch.value : ''
    );
  }

  function renderTemplateTableInstance(tableElement, tableInstance, searchTerm) {
    if (!tableElement) {
      return tableInstance;
    }

    const activeTemplates = getActiveTemplates();
    const moduleName = normalizeModule(state.currentModule);
    const placeholder = moduleName === 'hazmat'
      ? 'No hazmat templates are registered yet.'
      : (moduleName === 'calibration'
        ? 'No calibration templates are registered yet.'
        : 'Debug Lab does not use templates in this panel.');

    if (!tableInstance) {
      tableInstance = new window.Tabulator(tableElement, {
        data: activeTemplates,
        layout: 'fitColumns',
        reactiveData: false,
        placeholder,
        columns: templateColumns(),
      });
    } else {
      tableInstance.replaceData(activeTemplates);
    }

    tableInstance.setFilter(filterTemplateRows, searchTerm || '');
    return tableInstance;
  }

  function templateColumns() {
    return [
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
  }

  function renderCalibrationTable() {
    if (typeof window.Tabulator !== 'function') {
      elements.calibrationTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      return;
    }

    const columns = [
      { title: 'Asset', field: 'tool_name', minWidth: 170 },
      { title: 'Asset ID', field: 'asset_uid', minWidth: 150 },
      { title: 'CFE ID', field: 'cfe_uid', minWidth: 150 },
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
      { title: 'Assigned To', field: 'assigned_department', minWidth: 140 },
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

    applyCalibrationTableFilters();
  }

  function renderDebugTicketTable() {
    if (!elements.debugTicketTable) return;

    if (typeof window.Tabulator !== 'function') {
      elements.debugTicketTable.innerHTML = '<div class="log-entry">Tabulator is not available locally.</div>';
      return;
    }

    const columns = [
      { title: 'Board Serial', field: 'serial_number', minWidth: 130 },
      { title: 'Failure Signature', field: 'failure_signature', minWidth: 220 },
      { title: 'Department', field: 'department_name', minWidth: 140 },
      {
        title: 'Status',
        field: 'status',
        minWidth: 120,
        formatter: (cell) => formatDebugTicketStatusChip(cell.getRow().getData()),
      },
      {
        title: 'Bench Hrs',
        field: 'total_bench_time',
        minWidth: 98,
        hozAlign: 'right',
        formatter: (cell) => {
          const value = Number(cell.getValue());
          return Number.isFinite(value) ? value.toFixed(2) : '0.00';
        },
      },
      {
        title: 'Chronic',
        field: 'chronic_failure',
        minWidth: 100,
        formatter: (cell) => {
          return cell.getRow().getData().chronic_failure
            ? '<span class="status-chip status-danger">YES</span>'
            : '<span class="status-chip status-safe">NO</span>';
        },
      },
      {
        title: 'Actions',
        field: 'actions',
        minWidth: 230,
        headerSort: false,
        formatter: () => [
          '<div class="table-actions">',
          '<button class="table-button" data-action="edit">Edit</button>',
          '<button class="table-button" data-action="delete">Delete</button>',
          '<button class="table-button blue" data-action="report">FA Report</button>',
          '</div>',
        ].join(''),
        cellClick: async (event, cell) => {
          const action = eventTargetAction(event);
          if (!action) return;

          const row = cell.getRow().getData();
          if (action === 'edit') {
            selectDebugTicket(row.id);
            return;
          }

          if (action === 'delete') {
            await deleteDebugTicketById(row.id);
            return;
          }

          if (action === 'report') {
            await generateDebugReportForTicket(row.id);
          }
        },
      },
    ];

    if (!state.debugTicketTable) {
      state.debugTicketTable = new window.Tabulator(elements.debugTicketTable, {
        data: state.debugTickets,
        layout: 'fitColumns',
        reactiveData: false,
        placeholder: 'No failure tickets are currently logged in Debug Lab.',
        columns,
        rowClick: (event, row) => {
          if (eventTargetAction(event)) return;
          selectDebugTicket(row.getData().id);
        },
        rowFormatter: (row) => {
          const data = row.getData();
          const status = normalizeDebugStatus(data.status);
          row.getElement().classList.remove('row-danger', 'row-amber');
          if (status === 'BENCH' || data.chronic_failure) {
            row.getElement().classList.add('row-danger');
          } else if (status === 'OPEN') {
            row.getElement().classList.add('row-amber');
          }
        },
      });
    } else {
      state.debugTicketTable.replaceData(state.debugTickets);
    }

    syncDebugQueueFilterOptions();
    hydrateDebugQueueFilterControls();
    applyDebugTicketTableFilters();
    syncDebugTicketDepartmentOptions();

    const visibleTickets = state.debugTickets.filter(matchesDebugQueueFilters);
    if (state.activeDebugTicketId && visibleTickets.some((ticket) => ticket.id === state.activeDebugTicketId)) {
      selectDebugTicket(state.activeDebugTicketId, { populateForm: false });
    } else if (visibleTickets.length) {
      selectDebugTicket(visibleTickets[0].id);
    } else {
      state.activeDebugTicketId = null;
      renderDebugComponentList(null);
      resetDebugTicketForm();
    }

    renderDebugLiveBench();
  }

  function formatDebugTicketStatusChip(ticket) {
    const status = normalizeDebugStatus(ticket && ticket.status);
    if (status === 'BENCH') return '<span class="status-chip status-danger">BENCH</span>';
    if (status === 'OPEN') return '<span class="status-chip status-amber">OPEN</span>';
    if (status === 'SCRAP') return '<span class="status-chip status-danger">SCRAP</span>';
    return '<span class="status-chip status-safe">FIXED</span>';
  }

  function syncDebugTicketDepartmentOptions() {
    if (!elements.debugTicketDepartment) return;
    const currentValue = String(elements.debugTicketDepartment.value || '').trim();

    const options = ['<option value="">Unassigned</option>']
      .concat((state.departmentRecords || []).map((record) => {
        return `<option value="${escapeHtml(String(record.id))}">${escapeHtml(record.name)}</option>`;
      }));

    elements.debugTicketDepartment.innerHTML = options.join('');
    if (currentValue && Array.from(elements.debugTicketDepartment.options).some((option) => option.value === currentValue)) {
      elements.debugTicketDepartment.value = currentValue;
    }
  }

  function collectDebugFailureModeTags(ticket) {
    const components = Array.isArray(ticket && ticket.faulty_components)
      ? ticket.faulty_components
      : [];
    const tags = Array.from(new Set(components
      .map((component) => normalizeFilterTag(component && component.failure_mode ? component.failure_mode : ''))
      .filter(Boolean)));
    return tags.length ? tags : ['unreported_mode'];
  }

  function debugBoardTypeTag(ticket) {
    return normalizeFilterTag(ticket && ticket.model_rev ? ticket.model_rev : 'unknown_board');
  }

  function debugBoardTypeLabel(tag) {
    return tag === 'unknown_board' ? 'Unknown Board' : startCase(tag);
  }

  function debugFailureModeLabel(tag) {
    return tag === 'unreported_mode' ? 'Unreported Mode' : startCase(tag);
  }

  function normalizeDebugQueueFilterValue(value) {
    const normalized = normalizeFilterTag(value);
    return normalized || 'all';
  }

  function syncDebugQueueFilterOptions() {
    if (!elements.debugBoardTypeFilter || !elements.debugFailureModeFilter) return;

    const boardTypes = Array.from(new Set(state.debugTickets
      .map((ticket) => debugBoardTypeTag(ticket))
      .filter(Boolean)))
      .sort((left, right) => debugBoardTypeLabel(left).localeCompare(debugBoardTypeLabel(right)));

    const failureModes = Array.from(new Set(state.debugTickets
      .flatMap((ticket) => collectDebugFailureModeTags(ticket))
      .filter(Boolean)))
      .sort((left, right) => debugFailureModeLabel(left).localeCompare(debugFailureModeLabel(right)));

    elements.debugBoardTypeFilter.innerHTML = ['<option value="all">All Board Types</option>']
      .concat(boardTypes.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(debugBoardTypeLabel(tag))}</option>`))
      .join('');

    elements.debugFailureModeFilter.innerHTML = ['<option value="all">All Failure Modes</option>']
      .concat(failureModes.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(debugFailureModeLabel(tag))}</option>`))
      .join('');

    if (state.debugQueueFilters.boardType !== 'all' && !boardTypes.includes(state.debugQueueFilters.boardType)) {
      state.debugQueueFilters.boardType = 'all';
    }
    if (state.debugQueueFilters.failureMode !== 'all' && !failureModes.includes(state.debugQueueFilters.failureMode)) {
      state.debugQueueFilters.failureMode = 'all';
    }
  }

  function hydrateDebugQueueFilterControls() {
    if (elements.debugQueueKeywordFilter) {
      elements.debugQueueKeywordFilter.value = state.debugQueueFilters.keyword;
    }
    if (elements.debugBoardTypeFilter) {
      elements.debugBoardTypeFilter.value = state.debugQueueFilters.boardType;
    }
    if (elements.debugFailureModeFilter) {
      elements.debugFailureModeFilter.value = state.debugQueueFilters.failureMode;
    }
  }

  function matchesDebugQueueFilters(ticket) {
    const filters = state.debugQueueFilters;
    const keyword = normalizeSearchTerm(filters.keyword);

    if (keyword) {
      const components = Array.isArray(ticket && ticket.faulty_components)
        ? ticket.faulty_components
        : [];
      const searchFields = [
        ticket && ticket.serial_number,
        ticket && ticket.model_rev,
        ticket && ticket.failure_signature,
        ticket && ticket.department_name,
        ticket && ticket.status,
        ticket && ticket.technician_id,
        ticket && ticket.verification_pass,
      ].concat(components.flatMap((component) => [
        component && component.ref_designator,
        component && component.component_type,
        component && component.failure_mode,
        component && component.lot_code,
      ]));

      const matchesKeyword = searchFields.some((field) => normalizeSearchTerm(field).includes(keyword));
      if (!matchesKeyword) {
        return false;
      }
    }

    if (filters.boardType !== 'all' && debugBoardTypeTag(ticket) !== filters.boardType) {
      return false;
    }

    if (filters.failureMode !== 'all') {
      const failureModes = collectDebugFailureModeTags(ticket);
      if (!failureModes.includes(filters.failureMode)) {
        return false;
      }
    }

    return true;
  }

  function applyDebugTicketTableFilters() {
    if (!state.debugTicketTable) return;
    state.debugTicketTable.setFilter((data) => matchesDebugQueueFilters(data));
  }

  function updateDebugQueueFilter(key, value) {
    if (key !== 'boardType' && key !== 'failureMode' && key !== 'keyword') return;

    if (key === 'keyword') {
      state.debugQueueFilters.keyword = String(value || '').trim();
    } else {
      state.debugQueueFilters[key] = normalizeDebugQueueFilterValue(value);
    }

    renderDebugTicketTable();
  }

  function clearDebugQueueFilters() {
    state.debugQueueFilters = {
      boardType: 'all',
      failureMode: 'all',
      keyword: '',
    };
    renderDebugTicketTable();
  }

  function selectDebugTicket(ticketId, options = {}) {
    const ticket = findDebugTicketById(ticketId);
    if (!ticket) {
      state.activeDebugTicketId = null;
      renderDebugComponentList(null);
      renderDebugLiveBench();
      return;
    }

    state.activeDebugTicketId = ticket.id;
    if (options.populateForm !== false) {
      populateDebugTicketForm(ticket);
    }
    renderDebugComponentList(ticket);
    renderDebugLiveBench();
  }

  function populateDebugTicketForm(ticket) {
    if (!elements.debugTicketForm || !ticket) return;

    state.editingDebugTicketId = ticket.id;
    elements.debugTicketForm.ticket_id.value = String(ticket.id);
    elements.debugTicketForm.serial_number.value = ticket.serial_number || '';
    elements.debugTicketForm.model_rev.value = ticket.model_rev || '';
    elements.debugTicketForm.failure_signature.value = ticket.failure_signature || '';
    elements.debugTicketForm.technician_id.value = ticket.technician_id || '';
    elements.debugTicketForm.status.value = normalizeDebugStatus(ticket.status);
    elements.debugTicketForm.total_bench_time.value = Number(ticket.total_bench_time || 0);
    elements.debugTicketForm.verification_pass.value = ticket.verification_pass || '';
    if (elements.debugTicketDepartment) {
      const departmentValue = ticket.department_id ? String(ticket.department_id) : '';
      elements.debugTicketDepartment.value = departmentValue;
    }
    if (elements.debugTicketDeleteButton) {
      elements.debugTicketDeleteButton.disabled = false;
    }
    if (elements.debugPatternAlert) {
      elements.debugPatternAlert.textContent = 'Loading known pattern guidance...';
    }
    handleDebugFailureSignatureInput({ target: { value: ticket.failure_signature || '' } });
  }

  function resetDebugTicketForm() {
    if (!elements.debugTicketForm) return;

    state.editingDebugTicketId = null;
    state.activeDebugTicketId = null;
    elements.debugTicketForm.reset();
    elements.debugTicketForm.ticket_id.value = '';
    elements.debugTicketForm.status.value = 'OPEN';
    elements.debugTicketForm.total_bench_time.value = '0';
    if (elements.debugTicketDepartment) {
      elements.debugTicketDepartment.value = '';
    }
    if (elements.debugTicketDeleteButton) {
      elements.debugTicketDeleteButton.disabled = true;
    }
    if (elements.debugPatternAlert) {
      elements.debugPatternAlert.textContent = 'Pattern alert will appear here after entering a failure signature.';
    }

    resetDebugComponentForm();
    renderDebugComponentList(null);
    renderDebugLiveBench();
  }

  function renderDebugComponentList(ticket) {
    if (!elements.debugComponentList) return;

    if (!ticket) {
      elements.debugComponentList.innerHTML = '<div class="log-entry">Select a debug ticket to manage faulty components.</div>';
      return;
    }

    const components = Array.isArray(ticket.faulty_components) ? ticket.faulty_components : [];
    if (!components.length) {
      elements.debugComponentList.innerHTML = '<div class="log-entry">No components logged for this ticket yet.</div>';
      return;
    }

    elements.debugComponentList.innerHTML = components.map((component) => {
      return [
        `<article class="debug-component-item" data-component-id="${escapeHtml(String(component.id))}">`,
        '<div>',
        `<strong>${escapeHtml(component.ref_designator || 'Unknown Ref')}</strong>`,
        `<small>${escapeHtml(component.component_type || 'Unknown Type')} · ${escapeHtml(component.failure_mode || 'Unknown Mode')}</small>`,
        '</div>',
        '<div class="table-actions">',
        '<button class="table-button" data-action="edit">Edit</button>',
        '<button class="table-button" data-action="delete">Delete</button>',
        '</div>',
        '</article>',
      ].join('');
    }).join('');
  }

  function renderDebugLiveBench() {
    if (!elements.debugLiveBenchList) return;

    const queue = state.debugTickets
      .filter((ticket) => {
        const status = normalizeDebugStatus(ticket.status);
        if (status !== 'OPEN' && status !== 'BENCH') return false;
        return matchesDebugQueueFilters(ticket);
      })
      .sort((left, right) => {
        const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
        const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
        return rightTime - leftTime;
      });

    if (!queue.length) {
      elements.debugLiveBenchList.innerHTML = '<div class="focus-item"><strong>Bench is clear</strong><p>No OPEN or BENCH tickets at the moment.</p></div>';
      return;
    }

    elements.debugLiveBenchList.innerHTML = queue.slice(0, 10).map((ticket) => {
      const status = normalizeDebugStatus(ticket.status);
      return [
        `<article class="asset-result-card" data-debug-bench-id="${escapeHtml(String(ticket.id))}">`,
        '<div class="asset-result-head">',
        `<strong>${escapeHtml(ticket.serial_number || `Ticket ${ticket.id}`)}</strong>`,
        formatDebugTicketStatusChip(ticket),
        '</div>',
        '<div class="asset-result-grid">',
        `<div><small>Signature</small><strong>${escapeHtml(ticket.failure_signature || 'N/A')}</strong></div>`,
        `<div><small>Department</small><strong>${escapeHtml(ticket.department_name || 'Unassigned')}</strong></div>`,
        `<div><small>Bench Hours</small><strong>${escapeHtml(String(Number(ticket.total_bench_time || 0).toFixed(2)))}</strong></div>`,
        '</div>',
        '<div class="asset-result-actions">',
        `<button class="queue-action-button emphasize" type="button" data-ticket-id="${escapeHtml(String(ticket.id))}" title="Open in ticket editor">`,
        '<svg viewBox="0 0 24 24" class="icon-svg" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>',
        '</button>',
        '</div>',
        '</article>',
      ].join('');
    }).join('');
  }

  function handleDebugBenchClick(event) {
    const ticketButton = event && event.target
      ? event.target.closest('[data-ticket-id]')
      : null;
    if (!ticketButton) return;

    const ticketId = Number(ticketButton.dataset.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) return;

    selectDebugTicket(ticketId);
    if (elements.debugTicketForm && typeof elements.debugTicketForm.scrollIntoView === 'function') {
      elements.debugTicketForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleDebugFailureSignatureInput(event) {
    const signature = normalizeSearchTerm(event && event.target ? event.target.value : '');
    if (state.currentPatternTimeout) {
      window.clearTimeout(state.currentPatternTimeout);
      state.currentPatternTimeout = null;
    }

    if (!signature) {
      if (elements.debugPatternAlert) {
        elements.debugPatternAlert.textContent = 'Pattern alert will appear here after entering a failure signature.';
      }
      return;
    }

    if (elements.debugPatternAlert) {
      elements.debugPatternAlert.textContent = 'Checking previous repair patterns...';
    }

    state.currentPatternTimeout = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/command-center/debug-lab/pattern-alert?failure_signature=${encodeURIComponent(signature)}`);
        const patternAlert = response && response.pattern_alert ? response.pattern_alert : null;
        if (elements.debugPatternAlert) {
          elements.debugPatternAlert.textContent = patternAlert
            ? patternAlert.message
            : 'No confirmed pattern match found yet for this failure signature.';
        }
      } catch (error) {
        if (elements.debugPatternAlert) {
          elements.debugPatternAlert.textContent = 'Pattern lookup unavailable while offline diagnostics synchronize.';
        }
      }
    }, 300);
  }

  async function submitDebugTicketForm(event) {
    event.preventDefault();
    if (!elements.debugTicketForm) return;

    const departmentId = Number(elements.debugTicketForm.department_id.value || 0);
    const payload = {
      serial_number: elements.debugTicketForm.serial_number.value.trim(),
      model_rev: elements.debugTicketForm.model_rev.value.trim(),
      failure_signature: elements.debugTicketForm.failure_signature.value.trim(),
      technician_id: elements.debugTicketForm.technician_id.value.trim(),
      department_id: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
      status: normalizeDebugStatus(elements.debugTicketForm.status.value),
      total_bench_time: Number(elements.debugTicketForm.total_bench_time.value || 0),
      verification_pass: elements.debugTicketForm.verification_pass.value.trim(),
    };

    if (!payload.serial_number || !payload.failure_signature) {
      setStatus('Board serial and failure signature are required.', 'error');
      return;
    }

    try {
      const endpoint = state.editingDebugTicketId
        ? `/api/command-center/debug-lab/tickets/${state.editingDebugTicketId}`
        : '/api/command-center/debug-lab/tickets';
      const method = state.editingDebugTicketId ? 'PUT' : 'POST';
      const response = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      const targetId = response && response.id ? response.id : state.editingDebugTicketId;
      setStatus(state.editingDebugTicketId ? 'Debug ticket updated.' : 'Debug ticket created.', 'info');
      await refreshPortal({ silentStatus: true });
      if (targetId) {
        selectDebugTicket(targetId);
      }
    } catch (error) {
      setStatus(error.message || 'Failed to save debug ticket.', 'error');
    }
  }

  async function handleDebugTicketDeleteRequest() {
    const ticketId = Number(state.editingDebugTicketId || state.activeDebugTicketId || 0);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      setStatus('Select a debug ticket before deleting.', 'error');
      return;
    }
    await deleteDebugTicketById(ticketId);
  }

  async function deleteDebugTicketById(ticketId) {
    const ticket = findDebugTicketById(ticketId);
    if (!ticket) {
      setStatus('Debug ticket not found.', 'error');
      return;
    }

    if (!window.confirm(`Delete failure ticket ${ticket.serial_number}?`)) return;

    try {
      await apiFetch(`/api/command-center/debug-lab/tickets/${ticketId}`, {
        method: 'DELETE',
      });
      setStatus('Debug ticket deleted.', 'info');
      await refreshPortal({ silentStatus: true });
      resetDebugTicketForm();
    } catch (error) {
      setStatus(error.message || 'Failed to delete debug ticket.', 'error');
    }
  }

  async function submitDebugComponentForm(event) {
    event.preventDefault();
    if (!elements.debugComponentForm) return;

    const ticketId = Number(state.activeDebugTicketId || 0);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      setStatus('Select a debug ticket before adding components.', 'error');
      return;
    }

    const payload = {
      ref_designator: elements.debugComponentForm.ref_designator.value.trim(),
      component_type: elements.debugComponentForm.component_type.value.trim(),
      failure_mode: elements.debugComponentForm.failure_mode.value.trim(),
      lot_code: elements.debugComponentForm.lot_code.value.trim(),
    };

    if (!payload.ref_designator) {
      setStatus('Ref designator is required.', 'error');
      return;
    }

    try {
      const endpoint = state.editingDebugComponentId
        ? `/api/command-center/debug-lab/components/${state.editingDebugComponentId}`
        : `/api/command-center/debug-lab/tickets/${ticketId}/components`;
      const method = state.editingDebugComponentId ? 'PUT' : 'POST';
      await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      setStatus(state.editingDebugComponentId ? 'Faulty component updated.' : 'Faulty component logged.', 'info');
      await refreshPortal({ silentStatus: true });
      selectDebugTicket(ticketId, { populateForm: false });
      resetDebugComponentForm();
    } catch (error) {
      setStatus(error.message || 'Failed to save faulty component.', 'error');
    }
  }

  async function handleDebugComponentListClick(event) {
    const row = event && event.target ? event.target.closest('[data-component-id]') : null;
    if (!row) return;

    const action = eventTargetAction(event);
    if (!action) return;

    const componentId = Number(row.dataset.componentId || 0);
    if (!Number.isInteger(componentId) || componentId <= 0) return;

    const ticket = findDebugTicketById(state.activeDebugTicketId);
    const component = ticket && Array.isArray(ticket.faulty_components)
      ? ticket.faulty_components.find((entry) => Number(entry.id) === componentId)
      : null;
    if (!component) return;

    if (action === 'edit') {
      populateDebugComponentForm(component);
      return;
    }

    if (action === 'delete') {
      if (!window.confirm(`Delete component ${component.ref_designator}?`)) return;
      try {
        await apiFetch(`/api/command-center/debug-lab/components/${component.id}`, { method: 'DELETE' });
        setStatus('Faulty component deleted.', 'info');
        const ticketId = Number(state.activeDebugTicketId || 0);
        await refreshPortal({ silentStatus: true });
        if (ticketId) {
          selectDebugTicket(ticketId, { populateForm: false });
        }
        resetDebugComponentForm();
      } catch (error) {
        setStatus(error.message || 'Failed to delete faulty component.', 'error');
      }
    }
  }

  function populateDebugComponentForm(component) {
    if (!elements.debugComponentForm || !component) return;
    state.editingDebugComponentId = component.id;
    elements.debugComponentForm.component_id.value = String(component.id);
    elements.debugComponentForm.ref_designator.value = component.ref_designator || '';
    elements.debugComponentForm.component_type.value = component.component_type || '';
    elements.debugComponentForm.failure_mode.value = component.failure_mode || '';
    elements.debugComponentForm.lot_code.value = component.lot_code || '';
  }

  function resetDebugComponentForm() {
    if (!elements.debugComponentForm) return;
    state.editingDebugComponentId = null;
    elements.debugComponentForm.reset();
    elements.debugComponentForm.component_id.value = '';
  }

  async function handleGenerateDebugReport() {
    const ticketId = Number(state.activeDebugTicketId || state.editingDebugTicketId || 0);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      setStatus('Select a debug ticket before generating a report.', 'error');
      return;
    }

    await generateDebugReportForTicket(ticketId);
  }

  async function generateDebugReportForTicket(ticketId) {
    try {
      const payload = await apiFetch(`/api/command-center/debug-lab/tickets/${ticketId}/report`);
      buildDebugFailureReportPdf(payload);
      setStatus('Failure Analysis report generated locally.', 'info');
    } catch (error) {
      setStatus(error.message || 'Failed to generate Failure Analysis report.', 'error');
    }
  }

  function buildDebugFailureReportPdf(payload) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF is not available locally.');
    }

    const ticket = payload && payload.ticket ? payload.ticket : {};
    const components = Array.isArray(ticket.faulty_components) ? ticket.faulty_components : [];
    const history = Array.isArray(payload && payload.serial_history) ? payload.serial_history : [];
    const patternAlert = payload && payload.pattern_alert ? payload.pattern_alert : null;

    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFillColor(18, 18, 18);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(204, 51, 51);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Failure Analysis Report', 14, 14);
    doc.setTextColor(240, 240, 240);
    doc.setFontSize(10);
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 14, 22);

    doc.setTextColor(25, 25, 25);
    doc.setFillColor(248, 248, 248);
    doc.roundedRect(12, 36, 186, 64, 3, 3, 'F');

    const summaryRows = [
      ['Ticket ID', String(ticket.id || '')],
      ['Board Serial', ticket.serial_number || 'N/A'],
      ['Model Rev', ticket.model_rev || 'N/A'],
      ['Failure Signature', ticket.failure_signature || 'N/A'],
      ['Technician', ticket.technician_id || 'N/A'],
      ['Department', ticket.department_name || 'Unassigned'],
      ['Status', normalizeDebugStatus(ticket.status)],
      ['Bench Time (hrs)', String(Number(ticket.total_bench_time || 0).toFixed(2))],
    ];

    let y = 46;
    summaryRows.forEach((entry) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${entry[0]}:`, 18, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(entry[1] || ''), 70, y);
      y += 7;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Faulty Components Replaced', 14, 112);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    let componentY = 120;
    if (!components.length) {
      doc.text('No component replacements were logged for this ticket.', 16, componentY);
      componentY += 8;
    } else {
      components.forEach((component) => {
        if (componentY > 272) {
          doc.addPage();
          componentY = 20;
        }
        doc.text(
          `- ${component.ref_designator || 'N/A'} | ${component.component_type || 'N/A'} | ${component.failure_mode || 'N/A'} | Lot ${component.lot_code || 'N/A'}`,
          16,
          componentY
        );
        componentY += 6;
      });
    }

    if (patternAlert) {
      if (componentY > 258) {
        doc.addPage();
        componentY = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.text('Pattern Correlation', 14, componentY + 2);
      doc.setFont('helvetica', 'normal');
      doc.text(patternAlert.message || 'No pattern alert available.', 16, componentY + 9, { maxWidth: 176 });
      componentY += 20;
    }

    if (componentY > 246) {
      doc.addPage();
      componentY = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Board History', 14, componentY + 2);
    doc.setFont('helvetica', 'normal');
    componentY += 9;

    if (!history.length) {
      doc.text('No prior board history entries found.', 16, componentY);
    } else {
      history.slice(0, 20).forEach((entry) => {
        if (componentY > 276) {
          doc.addPage();
          componentY = 20;
        }
        const row = [
          formatDateTime(entry.created_at || entry.updated_at || ''),
          normalizeDebugStatus(entry.status),
          entry.failure_signature || 'N/A',
        ].join(' | ');
        doc.text(`- ${row}`, 16, componentY, { maxWidth: 176 });
        componentY += 6;
      });
    }

    if (componentY > 262) {
      doc.addPage();
      componentY = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Verification Pass', 14, componentY + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(ticket.verification_pass || 'No verification notes recorded.', 16, componentY + 16, { maxWidth: 176 });

    const serial = String(ticket.serial_number || ticket.id || 'debug-ticket').replace(/[^a-z0-9_-]+/gi, '-');
    doc.save(`fa-report-${serial}.pdf`);
  }

  function renderLogs() {
    const moduleName = normalizeModule(state.currentModule);
    const scopedLogs = state.logs.filter((entry) => logBelongsToModule(entry, moduleName));

    if (!scopedLogs.length) {
      elements.logList.innerHTML = moduleName === 'hazmat'
        ? '<div class="log-entry">No Hazmat transactions have been recorded yet.</div>'
        : (moduleName === 'calibration'
          ? '<div class="log-entry">No Calibration transactions have been recorded yet.</div>'
          : '<div class="log-entry">No Debug Lab transactions have been recorded yet.</div>');
      return;
    }

    elements.logList.innerHTML = scopedLogs.slice(0, 14).map((entry) => {
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

  function normalizeLogSource(value) {
    const source = String(value || '').trim().toLowerCase();
    if (source === 'hazmat') return 'hazmat';
    if (source === 'gages' || source === 'calibration') return 'calibration';
    if (source === 'debug' || source === 'debug_lab') return 'debug';
    return '';
  }

  function logBelongsToModule(entry, moduleName) {
    const activeModule = normalizeModule(moduleName || state.currentModule);
    const source = normalizeLogSource(entry && entry.source);
    const logModule = String(entry && entry.module ? entry.module : '').trim().toLowerCase();

    if (activeModule === 'hazmat') {
      return source === 'hazmat' || logModule === 'inventory' || logModule === 'hazmat';
    }

    if (activeModule === 'debug') {
      return source === 'debug' || logModule === 'debug_lab' || logModule === 'debug';
    }

    return source === 'calibration' || logModule === 'calibration' || logModule === 'gages' || logModule === 'gage';
  }

  function setView(view, options = {}) {
    const nextView = normalizeView(view);
    state.currentView = nextView;
    state.currentModule = normalizeModule(nextView);
    window.currentModule = state.currentModule;
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

    updateCfeVisibility();
    renderDepartmentControls();

    if (state.currentModule !== 'calibration' && state.currentSection === 'cfe') {
      setSection('dashboard', { redraw: options.redraw });
    }

    renderDashboard();
    renderTemplateTable();
    renderDebugTicketTable();
    renderDebugLiveBench();
    renderAssetConsole();
    renderReportSummary();
    renderReportInsights();
    renderLogs();

    updateSectionHeader();
    syncReportModuleControls();

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
    if (nextSection === 'reports') {
      syncReportModuleControls();
    }

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
          if (view === 'debug' && state.debugTicketTable) state.debugTicketTable.redraw(true);
        }

        if (view === 'calibration') {
          if (section === 'templates' && state.templateTable) {
            state.templateTable.redraw(true);
          }
          if (section === 'settings' && state.settingsTemplateTable) {
            state.settingsTemplateTable.redraw(true);
          }
        }
      });
    });
  }

  function updateSectionHeader() {
    const viewLabel = state.currentView === 'hazmat'
      ? 'Hazmat Database'
      : (state.currentView === 'calibration' ? 'Calibration Database' : 'Debug Lab Database');
    const meta = getSectionMeta(state.currentSection, state.currentView);
    const showDatabaseChip = state.currentSection === 'assets';
    elements.sectionLabel.textContent = meta.label;
    elements.sectionTitle.textContent = meta.title;
    elements.sectionSubtitle.textContent = meta.subtitle;
    if (elements.activeDatabaseChip) {
      elements.activeDatabaseChip.textContent = viewLabel;
      elements.activeDatabaseChip.classList.toggle('hidden', !showDatabaseChip);
    }
  }

  function getSectionMeta(section, view) {
    const moduleName = normalizeModule(view);
    const isHazmat = moduleName === 'hazmat';
    const isCalibration = moduleName === 'calibration';
    const map = {
      dashboard: {
        label: 'Dashboard',
        title: 'Main Overview',
        subtitle: 'Monitor both databases, surface immediate exposure, and stay in a single-page tactical workflow.',
      },
      assets: {
        label: 'New Asset +',
        title: isHazmat
          ? 'Hazmat Inventory Operations'
          : (isCalibration ? 'Calibration Asset Operations' : 'Failure Analysis & Debug Lab'),
        subtitle: isHazmat
          ? 'Import stock, add material records, and manage the compact Midnight grid without reloading.'
          : (isCalibration
            ? 'Import calibration assets, add instruments from templates, and enforce RED or AMBER compliance logic.'
            : 'Track failure tickets, faulty components, and smart diagnostics for offline bench operations.'),
      },
      cfe: {
        label: 'New CFE (+)',
        title: 'Calibration CFE Intake',
        subtitle: 'CFE is enabled for Calibration only.',
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
        title: 'Asset Report Interface',
        subtitle: 'Review module-specific analytics including Debug Lab Pareto failures, yield trends, and systemic issue alerts.',
      },
      settings: {
        label: 'Settings',
        title: 'Department Manager',
        subtitle: isCalibration || isHazmat
          ? 'Manage department records and template-linked assignments in one workspace.'
          : 'Manage shared department assignments used by Debug Lab failure tickets.',
      },
    };
    return map[section] || map.dashboard;
  }

  function normalizeView(view) {
    return VALID_VIEWS.has(view) ? view : 'hazmat';
  }

  function normalizeModule(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'calibration') return 'calibration';
    if (normalized === 'debug' || normalized === 'debug_lab') return 'debug';
    return 'hazmat';
  }

  function moduleLabel(moduleName) {
    const normalized = normalizeModule(moduleName);
    if (normalized === 'calibration') return 'Calibration';
    if (normalized === 'debug') return 'Debug Lab';
    return 'Hazmat';
  }

  function getTemplatesByModule(moduleName) {
    const normalized = normalizeModule(moduleName);
    if (normalized === 'calibration') return state.templates;
    if (normalized === 'hazmat') return state.hazmatTemplates;
    return [];
  }

  function getActiveTemplates() {
    return getTemplatesByModule(state.currentModule);
  }

  function getCalibrationTemplates() {
    return getTemplatesByModule('calibration');
  }

  function templateEndpointForModule(moduleName) {
    return normalizeModule(moduleName) === 'calibration'
      ? '/api/command-center/calibration/templates'
      : '/api/command-center/hazmat/templates';
  }

  function normalizeSection(section) {
    const requested = String(section || '').trim().toLowerCase();
    if (requested === 'templates') {
      return 'settings';
    }

    const normalized = VALID_SECTIONS.has(requested) ? requested : 'dashboard';
    if (normalized === 'cfe' && normalizeModule(state.currentModule) !== 'calibration') {
      return 'dashboard';
    }
    return normalized;
  }

  function updateCfeVisibility() {
    const showCfe = normalizeModule(state.currentModule) === 'calibration';
    if (!elements.cfeSectionButton) return;
    elements.cfeSectionButton.classList.toggle('hidden', !showCfe);
    elements.cfeSectionButton.setAttribute('aria-hidden', showCfe ? 'false' : 'true');
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
      const defaultDepartment = normalizeDepartmentName(parsed.defaultDepartment || parsed.default_department || DEFAULT_SETTINGS.defaultDepartment);
      const departments = normalizeDepartmentList(
        Array.isArray(parsed.departments) ? parsed.departments : [],
        defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
      );
      const resolvedDefault = resolveDepartmentName(defaultDepartment, departments) || departments[0];
      return {
        defaultDepartment: resolvedDefault,
        departments,
        departmentSupervisors: normalizeDepartmentSupervisorMap(parsed.departmentSupervisors, departments),
        departmentViewMode: normalizeDepartmentViewMode(parsed.departmentViewMode),
        hazmatWarningLeadDays: normalizePositiveInteger(parsed.hazmatWarningLeadDays || parsed.hazmat_warning_lead_days, DEFAULT_SETTINGS.hazmatWarningLeadDays),
        calibrationAlertLeadDays: normalizeNonNegativeInteger(parsed.calibrationAlertLeadDays || parsed.calibration_alert_lead_days, DEFAULT_SETTINGS.calibrationAlertLeadDays),
        calibrationGraceDays: normalizeNonNegativeInteger(parsed.calibrationGraceDays || parsed.calibration_grace_days, DEFAULT_SETTINGS.calibrationGraceDays),
      };
    } catch (error) {
      return {
        ...DEFAULT_SETTINGS,
        departments: DEFAULT_SETTINGS.departments.slice(),
      };
    }
  }

  function syncDepartmentsFromRuntime() {
    const persistedDepartments = collectPersistedDepartments();
    const baseline = Array.isArray(state.settings.departments)
      ? state.settings.departments.slice()
      : [];
    const supervisorSource = {
      ...buildPersistedDepartmentSupervisorMap(),
      ...(state.settings.departmentSupervisors || {}),
    };
    const supervisorBaseline = normalizeDepartmentSupervisorMap(
      supervisorSource,
      baseline.concat(persistedDepartments)
    );
    const merged = normalizeDepartmentList(
      baseline.concat(persistedDepartments).concat(collectRuntimeDepartments()),
      state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
    );
    const defaultDepartment = resolveDepartmentName(state.settings.defaultDepartment, merged) || merged[0];
    const departmentSupervisors = normalizeDepartmentSupervisorMap(supervisorBaseline, merged);
    const departmentViewMode = normalizeDepartmentViewMode(state.settings.departmentViewMode);
    const changed = !areDepartmentListsEqual(merged, baseline)
      || !isSameDepartment(defaultDepartment, state.settings.defaultDepartment)
      || !areDepartmentSupervisorMapsEqual(departmentSupervisors, supervisorBaseline)
      || departmentViewMode !== state.settings.departmentViewMode;

    state.settings.departments = merged;
    state.settings.defaultDepartment = defaultDepartment;
    state.settings.departmentSupervisors = departmentSupervisors;
    state.settings.departmentViewMode = departmentViewMode;

    if (changed) {
      persistSettings();
    }
  }

  function collectRuntimeDepartments() {
    return []
      .concat(state.hazmatTemplates.map((template) => template.assigned_department || ''))
      .concat(state.templates.map((template) => template.assigned_department || ''))
      .concat(state.calibration.map((asset) => normalizeCalibrationDepartmentValue(asset.assigned_department)))
      .concat([state.settings.defaultDepartment, DEFAULT_SETTINGS.defaultDepartment]);
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
    } catch (error) {
    }
  }

  function renderDepartmentControls() {
    renderDefaultDepartmentOptions();
    renderTemplateDepartmentOptions();
    renderCalibrationDepartmentOptions();
    syncDebugTicketDepartmentOptions();
    renderDepartmentFormControls();
    renderDepartmentAdminList();
  }

  function renderDepartmentFormControls() {
    const isCalibration = normalizeModule(state.currentModule) === 'calibration';
    const mode = normalizeDepartmentViewMode(state.settings.departmentViewMode);

    if (elements.departmentViewMode) {
      elements.departmentViewMode.value = mode;
    }

    if (elements.departmentSupervisorField) {
      elements.departmentSupervisorField.classList.toggle('hidden', !isCalibration);
    }

    if (elements.departmentCreateForm && elements.departmentCreateForm.department_supervisor) {
      elements.departmentCreateForm.department_supervisor.required = isCalibration;
      if (!isCalibration) {
        elements.departmentCreateForm.department_supervisor.value = '';
      }
    }
  }

  function renderDefaultDepartmentOptions() {
    const select = elements.settingsForm && elements.settingsForm.default_department;
    if (!select) return;

    const departments = normalizeDepartmentList(
      state.settings.departments,
      state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
    );
    const resolvedDefault = resolveDepartmentName(state.settings.defaultDepartment, departments) || departments[0];
    state.settings.departments = departments;
    state.settings.defaultDepartment = resolvedDefault;

    select.innerHTML = departments
      .map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`)
      .join('');
    select.value = resolvedDefault;
  }

  function renderTemplateDepartmentOptions(selectedDepartment) {
    const select = elements.templateDepartmentSelect;
    if (!select) return;

    const departments = normalizeDepartmentList(
      state.settings.departments,
      state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
    );
    const preferred = resolveDepartmentName(
      selectedDepartment || select.value || state.settings.defaultDepartment,
      departments
    ) || departments[0];

    select.innerHTML = departments
      .map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`)
      .join('');
    select.value = preferred;
    state.editingTemplateAssignedDepartment = preferred;
  }

  function handleTemplateDepartmentChange() {
    const current = elements.templateDepartmentSelect
      ? elements.templateDepartmentSelect.value
      : '';
    state.editingTemplateAssignedDepartment = resolveDepartmentName(
      current,
      state.settings.departments
    ) || state.settings.defaultDepartment;
  }

  function loadUnitLibrary() {
    let storedUnits = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(UNIT_LIBRARY_STORAGE_KEY) || '[]');
      storedUnits = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      storedUnits = [];
    }

    const merged = [];
    const seen = new Set();
    DEFAULT_TEMPLATE_UNITS.concat(storedUnits).forEach((entry) => {
      const unit = normalizeUnitEntry(entry);
      if (!unit || seen.has(unit.id)) return;
      seen.add(unit.id);
      merged.push(unit);
    });

    merged.sort((left, right) => left.label.localeCompare(right.label));
    persistUnitLibrary(merged);
    return merged;
  }

  function persistUnitLibrary(units = state.unitLibrary) {
    try {
      const payload = (Array.isArray(units) ? units : [])
        .map((unit) => ({ name: unit.name, symbol: unit.symbol }));
      localStorage.setItem(UNIT_LIBRARY_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      void error;
    }
  }

  function normalizeUnitToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function buildUnitId(name, symbol) {
    const normalizedName = normalizeUnitToken(name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unit';
    const normalizedSymbol = normalizeUnitToken(symbol).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'none';
    return `${normalizedName}__${normalizedSymbol}`;
  }

  function normalizeUnitEntry(entry) {
    const name = String(entry && entry.name ? entry.name : '').trim().replace(/\s+/g, ' ');
    const symbol = String(entry && entry.symbol ? entry.symbol : '').trim().replace(/\s+/g, ' ');
    if (!name) return null;

    if (DISALLOWED_TEMPLATE_UNIT_TOKENS.has(normalizeUnitToken(name))) {
      return null;
    }

    const label = symbol ? `${name} (${symbol})` : name;
    return {
      id: buildUnitId(name, symbol),
      name,
      symbol,
      label,
      search: normalizeUnitToken(`${name} ${symbol} ${label}`),
    };
  }

  function addUnitToLibrary(entry) {
    const unit = normalizeUnitEntry(entry);
    if (!unit) return null;

    const existing = state.unitLibrary.find((item) => item.id === unit.id);
    if (existing) return existing;

    state.unitLibrary = state.unitLibrary.concat(unit)
      .sort((left, right) => left.label.localeCompare(right.label));
    persistUnitLibrary(state.unitLibrary);
    return unit;
  }

  function normalizeTemplateIntervalMode(value) {
    return String(value || '').trim().toLowerCase() === 'months' ? 'months' : 'days';
  }

  function deriveTemplateIntervalDays(intervalMode, intervalMonths, intervalDays) {
    if (normalizeTemplateIntervalMode(intervalMode) === 'days') {
      return normalizePositiveInteger(intervalDays, 365);
    }
    const months = normalizePositiveInteger(intervalMonths, DEFAULT_TEMPLATE_INTERVAL_MONTHS);
    return Math.max(1, Math.round(months * AVERAGE_DAYS_PER_MONTH));
  }

  function syncTemplateCalIntervalField() {
    const intervalMode = normalizeTemplateIntervalMode(
      elements.templateIntervalMode ? elements.templateIntervalMode.value : 'months'
    );
    const intervalMonths = normalizePositiveInteger(
      elements.templateIntervalMonths ? elements.templateIntervalMonths.value : DEFAULT_TEMPLATE_INTERVAL_MONTHS,
      DEFAULT_TEMPLATE_INTERVAL_MONTHS
    );
    const intervalDays = normalizePositiveInteger(
      elements.templateIntervalDays ? elements.templateIntervalDays.value : 365,
      365
    );
    const derived = deriveTemplateIntervalDays(intervalMode, intervalMonths, intervalDays);
    if (elements.templateCalIntervalDays) {
      elements.templateCalIntervalDays.value = String(derived);
    }
    return derived;
  }

  function syncTemplateIntervalModeFields(mode) {
    const intervalMode = normalizeTemplateIntervalMode(mode || (elements.templateIntervalMode ? elements.templateIntervalMode.value : 'months'));

    if (elements.templateIntervalMode) {
      elements.templateIntervalMode.value = intervalMode;
    }
    if (elements.templateIntervalMonthsWrap) {
      elements.templateIntervalMonthsWrap.classList.toggle('hidden', intervalMode === 'days');
    }
    if (elements.templateIntervalDaysWrap) {
      elements.templateIntervalDaysWrap.classList.toggle('hidden', intervalMode !== 'days');
    }
    if (elements.templateIntervalMonths) {
      elements.templateIntervalMonths.required = intervalMode !== 'days';
    }
    if (elements.templateIntervalDays) {
      elements.templateIntervalDays.required = intervalMode === 'days';
    }

    syncTemplateCalIntervalField();
  }

  function handleTemplateIntervalModeChange() {
    syncTemplateIntervalModeFields(elements.templateIntervalMode ? elements.templateIntervalMode.value : 'months');
  }

  function getTemplateAllowedDayInputs() {
    if (!elements.templateAllowedDays) return [];
    return Array.from(elements.templateAllowedDays.querySelectorAll('input[type="checkbox"][value]'));
  }

  function hydrateTemplateAllowedDays(allowedDays) {
    const rawValues = Array.isArray(allowedDays)
      ? allowedDays
      : String(allowedDays || '').split(/[;,|\s]+/);
    const normalized = rawValues
      .map((entry) => String(entry || '').trim())
      .filter((entry) => TEMPLATE_ALLOWED_DAY_VALUES.includes(entry));
    const selected = new Set(normalized.length ? normalized : TEMPLATE_ALLOWED_DAY_DEFAULTS);

    getTemplateAllowedDayInputs().forEach((input) => {
      input.checked = selected.has(String(input.value));
    });
  }

  function getSelectedTemplateAllowedDays() {
    const selected = getTemplateAllowedDayInputs()
      .filter((input) => input.checked)
      .map((input) => String(input.value));
    return selected.length ? selected : TEMPLATE_ALLOWED_DAY_DEFAULTS.slice();
  }

  function isTemplateSupervisorRequired() {
    const moduleName = normalizeModule(state.editingTemplateModule || state.currentModule);
    return moduleName === 'calibration';
  }

  function syncTemplateDepartmentInlineForm() {
    const requiresSupervisor = isTemplateSupervisorRequired();
    if (elements.templateNewDepartmentSupervisorWrap) {
      elements.templateNewDepartmentSupervisorWrap.classList.toggle('hidden', !requiresSupervisor);
    }
    if (elements.templateNewDepartmentSupervisor) {
      elements.templateNewDepartmentSupervisor.required = requiresSupervisor;
      if (!requiresSupervisor) {
        elements.templateNewDepartmentSupervisor.value = '';
      }
    }
  }

  function toggleTemplateAddDepartmentInline() {
    if (!elements.templateAddDepartmentInline) return;
    syncTemplateDepartmentInlineForm();
    const shouldOpen = elements.templateAddDepartmentInline.classList.contains('hidden');
    if (shouldOpen) {
      closeTemplateAddUnitInline();
    }
    elements.templateAddDepartmentInline.classList.toggle('hidden', !shouldOpen);

    if (shouldOpen && elements.templateNewDepartmentName) {
      elements.templateNewDepartmentName.focus();
    }
  }

  function closeTemplateAddDepartmentInline() {
    if (elements.templateAddDepartmentInline) {
      elements.templateAddDepartmentInline.classList.add('hidden');
    }
    if (elements.templateNewDepartmentName) {
      elements.templateNewDepartmentName.value = '';
    }
    if (elements.templateNewDepartmentSupervisor) {
      elements.templateNewDepartmentSupervisor.value = '';
    }
  }

  async function handleTemplateSaveDepartment() {
    const name = normalizeDepartmentName(
      elements.templateNewDepartmentName ? elements.templateNewDepartmentName.value : ''
    );
    const supervisor = normalizeSupervisorName(
      elements.templateNewDepartmentSupervisor ? elements.templateNewDepartmentSupervisor.value : ''
    );
    const requiresSupervisor = isTemplateSupervisorRequired();

    if (!name) {
      setStatus('Department name is required before saving.', 'error');
      if (elements.templateNewDepartmentName) elements.templateNewDepartmentName.focus();
      return;
    }

    if (requiresSupervisor && !supervisor) {
      setStatus('Supervisor is required for calibration departments.', 'error');
      if (elements.templateNewDepartmentSupervisor) elements.templateNewDepartmentSupervisor.focus();
      return;
    }

    if (resolveDepartmentName(name, state.settings.departments)) {
      setStatus('That department already exists.', 'error');
      return;
    }

    try {
      const persisted = await createPersistedDepartmentRecord(name, supervisor);
      const savedName = normalizeDepartmentName(persisted && persisted.name ? persisted.name : name);
      state.settings.departments = normalizeDepartmentList(
        (state.settings.departments || []).concat([savedName]),
        state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
      );
      setDepartmentSupervisor(savedName, supervisor);
      persistSettings();
      renderDepartmentControls();
      renderAssetConsole();
      state.editingTemplateAssignedDepartment = resolveDepartmentName(savedName, state.settings.departments) || savedName;
      renderTemplateDepartmentOptions(state.editingTemplateAssignedDepartment);
      closeTemplateAddDepartmentInline();
      setStatus(`Department ${savedName} created.`, 'info');
    } catch (error) {
      setStatus(error.message || 'Failed to create department.', 'error');
    }
  }

  function parseTemplateUnitToken(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry || '').trim()).find(Boolean) || '';
    }
    const text = String(value || '').trim();
    if (!text) return '';
    return text.split(/[;,]+/).map((entry) => entry.trim()).find(Boolean) || '';
  }

  function resolveTemplateUnitId(token) {
    const normalizedToken = normalizeUnitToken(token);
    if (!normalizedToken) return '';

    const existing = state.unitLibrary.find((unit) => (
      normalizeUnitToken(unit.label) === normalizedToken
      || normalizeUnitToken(unit.name) === normalizedToken
      || normalizeUnitToken(unit.symbol) === normalizedToken
    ));
    if (existing) return existing.id;

    const parsed = String(token || '').trim().match(/^(.+?)\s*\((.+)\)$/);
    const created = addUnitToLibrary(parsed
      ? { name: parsed[1], symbol: parsed[2] }
      : { name: String(token || '').trim(), symbol: '' });
    return created ? created.id : '';
  }

  function syncTemplateUnitSelectionValue() {
    if (!elements.templateForm || !elements.templateForm.unit_of_measure) return;

    const selectedUnit = state.unitLibrary.find((unit) => unit.id === state.selectedTemplateUnitId);
    elements.templateForm.unit_of_measure.value = selectedUnit ? selectedUnit.label : '';
    if (elements.templateUnitSelected) {
      elements.templateUnitSelected.textContent = selectedUnit
        ? `Selected unit: ${selectedUnit.label}`
        : 'Selected unit: none';
    }
  }

  function renderTemplateUnitOptions() {
    if (!elements.templateUnitSelect) return;

    const searchTerm = normalizeUnitToken(elements.templateUnitSearch ? elements.templateUnitSearch.value : '');
    const units = state.unitLibrary.filter((unit) => !searchTerm || unit.search.includes(searchTerm));

    elements.templateUnitSelect.innerHTML = units
      .map((unit) => `<option value="${escapeHtml(unit.id)}">${escapeHtml(unit.label)}</option>`)
      .join('');

    if (units.some((unit) => unit.id === state.selectedTemplateUnitId)) {
      elements.templateUnitSelect.value = state.selectedTemplateUnitId;
    }

    if (elements.templateUnitEmpty) {
      elements.templateUnitEmpty.classList.toggle('hidden', units.length > 0);
    }
  }

  function handleTemplateUnitSelectionChange() {
    if (!elements.templateUnitSelect) return;
    const selectedId = String(elements.templateUnitSelect.value || '').trim();
    if (!selectedId) return;
    state.selectedTemplateUnitId = selectedId;
    syncTemplateUnitSelectionValue();
  }

  function hydrateTemplateUnitPicker(unitValue) {
    const selectedToken = parseTemplateUnitToken(unitValue) || 'Unitless';
    state.selectedTemplateUnitId = resolveTemplateUnitId(selectedToken) || resolveTemplateUnitId('Unitless');

    if (elements.templateUnitSearch) {
      elements.templateUnitSearch.value = '';
    }

    renderTemplateUnitOptions();
    if (elements.templateUnitSelect && state.selectedTemplateUnitId) {
      elements.templateUnitSelect.value = state.selectedTemplateUnitId;
    }
    syncTemplateUnitSelectionValue();
    closeTemplateAddUnitInline();
  }

  function toggleTemplateAddUnitInline() {
    if (!elements.templateAddUnitInline) return;
    const shouldOpen = elements.templateAddUnitInline.classList.contains('hidden');
    if (shouldOpen) {
      closeTemplateAddDepartmentInline();
    }
    elements.templateAddUnitInline.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen && elements.templateNewUnitName) {
      elements.templateNewUnitName.focus();
    }
  }

  function closeTemplateAddUnitInline() {
    if (elements.templateAddUnitInline) {
      elements.templateAddUnitInline.classList.add('hidden');
    }
    if (elements.templateNewUnitName) elements.templateNewUnitName.value = '';
    if (elements.templateNewUnitSymbol) elements.templateNewUnitSymbol.value = '';
  }

  function handleTemplateSaveUnit() {
    const name = elements.templateNewUnitName ? elements.templateNewUnitName.value.trim() : '';
    const symbol = elements.templateNewUnitSymbol ? elements.templateNewUnitSymbol.value.trim() : '';

    if (!name) {
      setStatus('Unit name is required before saving.', 'error');
      if (elements.templateNewUnitName) elements.templateNewUnitName.focus();
      return;
    }

    const created = addUnitToLibrary({ name, symbol });
    if (!created) {
      setStatus('Failed to add unit.', 'error');
      return;
    }

    state.selectedTemplateUnitId = created.id;

    if (elements.templateUnitSearch) elements.templateUnitSearch.value = '';
    renderTemplateUnitOptions();
    if (elements.templateUnitSelect) {
      elements.templateUnitSelect.value = created.id;
    }
    syncTemplateUnitSelectionValue();
    closeTemplateAddUnitInline();
    setStatus(`Unit added: ${created.label}`, 'info');
  }

  function renderCalibrationDepartmentOptions(selectedDepartment) {
    const select = elements.calibrationForm && elements.calibrationForm.assigned_department;
    if (!select) return;

    const departments = normalizeDepartmentList(
      state.settings.departments,
      state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
    );
    const preferred = resolveDepartmentName(
      selectedDepartment || select.value || state.settings.defaultDepartment,
      departments
    ) || departments[0];

    select.innerHTML = departments
      .map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`)
      .join('');
    select.value = preferred;
  }

  function normalizeCalibrationDepartmentValue(value) {
    const text = String(value || '').trim();
    return isOwnerAssignment(text) ? '' : text;
  }

  function isOwnerAssignment(value) {
    return /^(?:owner|owned\s*by)\s*:/i.test(String(value || '').trim());
  }

  function extractOwnerAssignment(value) {
    const match = String(value || '').trim().match(/^(?:owner|owned\s*by)\s*:\s*(.+)$/i);
    return match ? match[1].trim() : '';
  }

  function calibrationAssignmentValue() {
    const mode = elements.calibrationAssignmentMode && elements.calibrationAssignmentMode.value === 'owner'
      ? 'owner'
      : 'department';

    if (mode === 'owner') {
      const ownerInfo = normalizeDepartmentName(elements.calibrationOwnerInput ? elements.calibrationOwnerInput.value : '');
      return ownerInfo ? `Owner: ${ownerInfo}` : '';
    }

    return resolveDepartmentName(
      elements.calibrationForm && elements.calibrationForm.assigned_department
        ? elements.calibrationForm.assigned_department.value
        : '',
      state.settings.departments
    ) || state.settings.defaultDepartment;
  }

  function syncCalibrationAssignmentMode(mode, options = {}) {
    const assignmentMode = mode === 'owner' ? 'owner' : 'department';
    const departmentSelect = elements.calibrationForm && elements.calibrationForm.assigned_department;
    const ownerInput = elements.calibrationOwnerInput;
    if (!departmentSelect || !ownerInput || !elements.calibrationAssignmentMode) return;

    elements.calibrationAssignmentMode.value = assignmentMode;
    const ownerSelected = assignmentMode === 'owner';
    departmentSelect.classList.toggle('hidden', ownerSelected);
    departmentSelect.required = !ownerSelected;
    ownerInput.classList.toggle('hidden', !ownerSelected);
    ownerInput.required = ownerSelected;

    if (ownerSelected && options.focusOwner && !ownerInput.disabled) {
      ownerInput.focus();
    }
  }

  function handleCalibrationAssignmentModeChange() {
    const mode = elements.calibrationAssignmentMode && elements.calibrationAssignmentMode.value === 'owner'
      ? 'owner'
      : 'department';
    syncCalibrationAssignmentMode(mode, { focusOwner: mode === 'owner' });
  }

  function renderDepartmentAdminList() {
    if (!elements.departmentAdminList) return;

    const departments = normalizeDepartmentList(
      state.settings.departments,
      state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
    );
    const resolvedDefault = resolveDepartmentName(state.settings.defaultDepartment, departments) || departments[0];
    const viewMode = normalizeDepartmentViewMode(state.settings.departmentViewMode);

    if (!departments.length) {
      elements.departmentAdminList.innerHTML = '<div class="department-admin-empty">No departments configured.</div>';
      return;
    }

    elements.departmentAdminList.innerHTML = departments.map((department) => {
      const isDefault = isSameDepartment(department, resolvedDefault);
      const deleteDisabled = departments.length <= 1 ? ' disabled' : '';
      const supervisor = readDepartmentSupervisor(department);
      return [
        `<div class="department-admin-row${isDefault ? ' is-default' : ''}${viewMode === 'compact' ? ' is-compact' : ''}">`,
        '<div class="department-admin-meta">',
        `<span class="department-admin-name">${escapeHtml(department)}</span>`,
        viewMode === 'compact'
          ? ''
          : `<small class="department-admin-supervisor">Supervisor: ${escapeHtml(supervisor || 'Not assigned')}</small>`,
        '</div>',
        '<div class="department-admin-actions">',
        isDefault ? '<span class="status-chip status-blue">Default</span>' : '',
        `<button class="table-button" type="button" data-department-action="edit" data-department-name="${escapeHtml(department)}">Edit</button>`,
        `<button class="table-button" type="button" data-department-action="delete" data-department-name="${escapeHtml(department)}"${deleteDisabled}>Delete</button>`,
        '</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  function hydrateSettingsForm() {
    if (!elements.settingsForm) return;
    renderDefaultDepartmentOptions();
    renderDepartmentFormControls();
    elements.settingsForm.hazmat_warning_lead_days.value = String(state.settings.hazmatWarningLeadDays);
    elements.settingsForm.calibration_alert_lead_days.value = String(state.settings.calibrationAlertLeadDays);
    elements.settingsForm.calibration_grace_days.value = String(state.settings.calibrationGraceDays);
  }

  function submitSettingsForm(event) {
    event.preventDefault();
    const departments = normalizeDepartmentList(state.settings.departments, DEFAULT_SETTINGS.defaultDepartment);
    const defaultDepartment = resolveDepartmentName(elements.settingsForm.default_department.value, departments) || departments[0];
    state.settings = {
      ...state.settings,
      departments,
      defaultDepartment,
      departmentSupervisors: normalizeDepartmentSupervisorMap(state.settings.departmentSupervisors, departments),
      departmentViewMode: normalizeDepartmentViewMode(state.settings.departmentViewMode),
      hazmatWarningLeadDays: normalizePositiveInteger(elements.settingsForm.hazmat_warning_lead_days.value, DEFAULT_SETTINGS.hazmatWarningLeadDays),
      calibrationAlertLeadDays: normalizeNonNegativeInteger(elements.settingsForm.calibration_alert_lead_days.value, DEFAULT_SETTINGS.calibrationAlertLeadDays),
      calibrationGraceDays: normalizeNonNegativeInteger(elements.settingsForm.calibration_grace_days.value, DEFAULT_SETTINGS.calibrationGraceDays),
    };
    persistSettings();
    renderDepartmentControls();
    hydrateSettingsForm();
    renderDashboard();
    renderHazmatDna();
    renderAssetConsole();
    if (state.inventoryTable) state.inventoryTable.redraw(true);
    if (state.calibrationTable) state.calibrationTable.redraw(true);
    setStatus('Settings saved locally.', 'info');
  }

  async function submitDepartmentCreateForm(event) {
    event.preventDefault();
    if (!elements.departmentCreateForm) return;

    const rawValue = elements.departmentCreateForm.department_name
      ? elements.departmentCreateForm.department_name.value
      : '';
    const rawSupervisor = elements.departmentCreateForm.department_supervisor
      ? elements.departmentCreateForm.department_supervisor.value
      : '';
    const department = normalizeDepartmentName(rawValue);
    const supervisor = normalizeSupervisorName(rawSupervisor);
    const isCalibration = normalizeModule(state.currentModule) === 'calibration';
    if (!department) {
      setStatus('Enter a department name to create.', 'error');
      return;
    }

    if (isCalibration && !supervisor) {
      setStatus('Supervisor is required when creating departments in Calibration mode.', 'error');
      return;
    }

    if (resolveDepartmentName(department, state.settings.departments)) {
      setStatus('That department already exists.', 'error');
      return;
    }

    try {
      const persisted = await createPersistedDepartmentRecord(department, supervisor);
      const savedDepartment = normalizeDepartmentName(persisted && persisted.name ? persisted.name : department);
      const savedSupervisor = normalizeSupervisorName(persisted && persisted.supervisor ? persisted.supervisor : supervisor);

      state.settings.departments = normalizeDepartmentList(
        (state.settings.departments || []).concat([savedDepartment]),
        state.settings.defaultDepartment || DEFAULT_SETTINGS.defaultDepartment
      );
      setDepartmentSupervisor(savedDepartment, savedSupervisor);

      persistSettings();
      elements.departmentCreateForm.reset();
      renderDepartmentControls();
      renderAssetConsole();
      setStatus(`Department ${savedDepartment} created.`, 'info');
    } catch (error) {
      setStatus(error.message || 'Failed to create department.', 'error');
    }
  }

  function handleDepartmentViewModeChange(event) {
    const nextMode = normalizeDepartmentViewMode(event && event.target ? event.target.value : 'expanded');
    state.settings.departmentViewMode = nextMode;
    persistSettings();
    renderDepartmentAdminList();
  }

  async function handleDepartmentAdminClick(event) {
    const button = event && event.target
      ? event.target.closest('[data-department-action][data-department-name]')
      : null;
    if (!button || (elements.departmentAdminList && !elements.departmentAdminList.contains(button))) {
      return;
    }

    const action = button.dataset.departmentAction;
    const departmentName = button.dataset.departmentName;
    if (action === 'edit') {
      editDepartment(departmentName);
      return;
    }
    if (action === 'delete') {
      await deleteDepartment(departmentName);
    }
  }

  function editDepartment(departmentName) {
    const currentName = resolveDepartmentName(departmentName, state.settings.departments);
    if (!currentName) return;

    state.editingDepartmentName = currentName;
    if (elements.departmentModalTitle) {
      elements.departmentModalTitle.textContent = `Edit Department · ${currentName}`;
    }

    if (!elements.departmentModalForm) {
      return;
    }

    const isCalibration = normalizeModule(state.currentModule) === 'calibration';
    elements.departmentModalForm.reset();
    elements.departmentModalForm.department_name.value = currentName;
    elements.departmentModalForm.department_supervisor.value = readDepartmentSupervisor(currentName);
    elements.departmentModalForm.department_supervisor.required = isCalibration;

    if (elements.departmentModalNote) {
      elements.departmentModalNote.textContent = isCalibration
        ? 'Supervisor is required in Calibration mode. Changes apply to both Hazmat and Calibration templates.'
        : 'Department changes apply to both Hazmat and Calibration templates.';
    }

    openModal('department-modal');
  }

  async function submitDepartmentModalForm(event) {
    event.preventDefault();
    if (!elements.departmentModalForm) return;

    const currentName = resolveDepartmentName(state.editingDepartmentName, state.settings.departments);
    if (!currentName) {
      closeModal('department-modal');
      return;
    }

    const nextName = normalizeDepartmentName(elements.departmentModalForm.department_name.value);
    const supervisor = normalizeSupervisorName(elements.departmentModalForm.department_supervisor.value);
    const isCalibration = normalizeModule(state.currentModule) === 'calibration';

    if (!nextName) {
      setStatus('Department name cannot be empty.', 'error');
      return;
    }

    if (isCalibration && !supervisor) {
      setStatus('Supervisor is required in Calibration mode.', 'error');
      return;
    }

    const renamed = !isSameDepartment(nextName, currentName);

    const existing = resolveDepartmentName(nextName, state.settings.departments);
    if (renamed && existing && !isSameDepartment(existing, currentName)) {
      setStatus('Another department already uses that name.', 'error');
      return;
    }

    const templatesUsingDepartment = renamed
      ? collectTemplatesUsingDepartment(currentName)
      : [];
    const confirmMessage = templatesUsingDepartment.length
      ? `Rename ${currentName} to ${nextName} and update ${templatesUsingDepartment.length} template(s)?`
      : renamed
        ? `Rename ${currentName} to ${nextName}?`
        : '';
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    try {
      if (renamed) {
        await updateTemplateDepartmentAssignments(currentName, nextName);
      }

      const persisted = await updatePersistedDepartmentRecord(currentName, nextName, supervisor);
      const savedName = normalizeDepartmentName(persisted && persisted.name ? persisted.name : nextName) || nextName;
      const savedSupervisor = normalizeSupervisorName(persisted && persisted.supervisor ? persisted.supervisor : supervisor);

      const nextDefaultDepartment = isSameDepartment(state.settings.defaultDepartment, currentName)
        ? savedName
        : state.settings.defaultDepartment;
      state.settings.departments = normalizeDepartmentList(
        (state.settings.departments || []).map((department) => (
          isSameDepartment(department, currentName) ? savedName : department
        )),
        nextDefaultDepartment || DEFAULT_SETTINGS.defaultDepartment
      );
      state.settings.defaultDepartment = resolveDepartmentName(
        nextDefaultDepartment,
        state.settings.departments
      ) || state.settings.departments[0];
      state.settings.departmentSupervisors = normalizeDepartmentSupervisorMap(
        state.settings.departmentSupervisors,
        state.settings.departments
      );
      setDepartmentSupervisor(savedName, savedSupervisor);

      persistSettings();
      closeModal('department-modal');
      state.editingDepartmentName = '';
      renderDepartmentControls();
      renderAssetConsole();
      await refreshPortal({ silentStatus: true });
      setStatus(renamed ? `Department renamed to ${savedName}.` : `Department ${savedName} updated.`, 'info');
    } catch (error) {
      setStatus(error.message || 'Failed to update department.', 'error');
    }
  }

  async function deleteDepartment(departmentName) {
    const currentName = resolveDepartmentName(departmentName, state.settings.departments);
    if (!currentName) return;

    const departments = normalizeDepartmentList(state.settings.departments, state.settings.defaultDepartment);
    if (departments.length <= 1) {
      setStatus('At least one department must remain.', 'error');
      return;
    }

    const remainingDepartments = departments.filter((department) => !isSameDepartment(department, currentName));
    const templatesUsingDepartment = collectTemplatesUsingDepartment(currentName);

    let replacement = resolveDepartmentName(state.settings.defaultDepartment, remainingDepartments)
      || remainingDepartments[0];

    if (templatesUsingDepartment.length) {
      const available = remainingDepartments.join(', ');
      const promptValue = window.prompt(
        `Department ${currentName} is used by ${templatesUsingDepartment.length} template(s). Enter replacement department (${available}):`,
        replacement
      );
      if (promptValue === null) return;

      const selectedReplacement = resolveDepartmentName(promptValue, remainingDepartments);
      if (!selectedReplacement) {
        setStatus('Choose a valid replacement department.', 'error');
        return;
      }
      replacement = selectedReplacement;
    }

    const confirmMessage = templatesUsingDepartment.length
      ? `Delete ${currentName} and reassign ${templatesUsingDepartment.length} template(s) to ${replacement}?`
      : `Delete ${currentName}?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      if (templatesUsingDepartment.length) {
        await updateTemplateDepartmentAssignments(currentName, replacement);
      }

      await deletePersistedDepartmentRecord(currentName);

      state.settings.departments = remainingDepartments;
      if (isSameDepartment(state.settings.defaultDepartment, currentName)) {
        state.settings.defaultDepartment = replacement;
      }
      state.settings.defaultDepartment = resolveDepartmentName(
        state.settings.defaultDepartment,
        state.settings.departments
      ) || state.settings.departments[0];
      state.settings.departmentSupervisors = normalizeDepartmentSupervisorMap(
        state.settings.departmentSupervisors,
        state.settings.departments
      );

      persistSettings();
      renderDepartmentControls();
      renderAssetConsole();
      await refreshPortal({ silentStatus: true });
      setStatus(`Department ${currentName} deleted.`, 'info');
    } catch (error) {
      setStatus(error.message || 'Failed to delete department.', 'error');
    }
  }

  async function updateTemplateDepartmentAssignments(fromDepartment, toDepartment) {
    const source = normalizeDepartmentName(fromDepartment);
    const target = normalizeDepartmentName(toDepartment);
    if (!source || !target || isSameDepartment(source, target)) {
      return 0;
    }

    const templatesToUpdate = collectTemplatesUsingDepartment(source);

    for (const template of templatesToUpdate) {
      const endpointBase = templateEndpointForModule(template.module);
      await apiFetch(`${endpointBase}/${template.id}`, {
        method: 'PUT',
        body: JSON.stringify(buildTemplatePayload(template, target)),
      });
    }

    return templatesToUpdate.length;
  }

  function collectTemplatesUsingDepartment(departmentName) {
    const source = normalizeDepartmentName(departmentName);
    if (!source) return [];

    const buckets = [
      { module: 'hazmat', templates: state.hazmatTemplates },
      { module: 'calibration', templates: state.templates },
    ];

    return buckets.flatMap((bucket) => (bucket.templates || [])
      .filter((template) => isSameDepartment(template.assigned_department, source))
      .map((template) => ({ ...template, module: normalizeModule(bucket.module) })));
  }

  function buildTemplatePayload(template, departmentOverride) {
    const intervalMode = normalizeTemplateIntervalMode(template && (template.interval_mode || template.intervalMode));
    const intervalMonths = normalizePositiveInteger(
      template && (template.interval_months || template.intervalMonths),
      DEFAULT_TEMPLATE_INTERVAL_MONTHS
    );
    const intervalDays = normalizePositiveInteger(
      template && (template.interval_days || template.intervalDays || template.cal_interval_days || template.cal_frequency),
      365
    );
    const maxDailyCalibrations = Math.min(10, Math.max(1, normalizePositiveInteger(
      template && (template.max_daily_calibrations || template.maxDailyCalibrations),
      10
    )));
    const rawAllowedDays = template && (template.allowed_days || template.allowedDays);
    const allowedDays = (Array.isArray(rawAllowedDays)
      ? rawAllowedDays
      : String(rawAllowedDays || '').split(/[;,|\s]+/))
      .map((entry) => String(entry || '').trim())
      .filter((entry) => TEMPLATE_ALLOWED_DAY_VALUES.includes(entry));

    return {
      template_name: normalizeText(template && template.template_name, ''),
      category: normalizeText(template && template.category, 'Mechanical'),
      interval_mode: intervalMode,
      interval_months: intervalMonths,
      interval_days: intervalDays,
      cal_interval_days: deriveTemplateIntervalDays(intervalMode, intervalMonths, intervalDays),
      alert_lead_days: normalizeNonNegativeInteger(template && template.alert_lead_days, state.settings.calibrationAlertLeadDays),
      grace_period_days: normalizeNonNegativeInteger(template && template.grace_period_days, state.settings.calibrationGraceDays),
      max_daily_calibrations: maxDailyCalibrations,
      allowed_days: allowedDays.length ? allowedDays : TEMPLATE_ALLOWED_DAY_DEFAULTS.slice(),
      unit_of_measure: normalizeText(template && template.unit_of_measure, 'Unitless'),
      assigned_department: normalizeText(departmentOverride || (template && template.assigned_department), state.settings.defaultDepartment),
    };
  }

  function normalizeDepartmentName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeSupervisorName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeDepartmentViewMode(value) {
    return String(value || '').toLowerCase() === 'compact' ? 'compact' : 'expanded';
  }

  function normalizeDepartmentSupervisorMap(value, departments) {
    const source = value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
    const normalizedDepartments = Array.isArray(departments) ? departments : [];
    const output = {};

    for (const department of normalizedDepartments) {
      const resolvedDepartment = normalizeDepartmentName(department);
      if (!resolvedDepartment) continue;

      const sourceKey = Object.keys(source).find((key) => isSameDepartment(key, resolvedDepartment));
      const supervisor = normalizeSupervisorName(sourceKey ? source[sourceKey] : '');
      if (supervisor) {
        output[resolvedDepartment] = supervisor;
      }
    }

    return output;
  }

  function normalizeDepartmentRecord(record) {
    const id = Number(record && record.id);
    const name = normalizeDepartmentName(record && (record.name || record.department_name));
    if (!Number.isInteger(id) || id <= 0 || !name) return null;
    return {
      id,
      name,
      supervisor: normalizeSupervisorName(record && (record.supervisor || record.department_supervisor)),
    };
  }

  function normalizeDepartmentRecords(records) {
    const output = [];
    const seen = new Set();

    for (const entry of Array.isArray(records) ? records : []) {
      const normalized = normalizeDepartmentRecord(entry);
      if (!normalized) continue;
      const key = normalized.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
    }

    output.sort((left, right) => left.name.localeCompare(right.name));
    return output;
  }

  function findDepartmentRecordByName(name) {
    const resolvedName = normalizeDepartmentName(name);
    if (!resolvedName) return null;

    return (state.departmentRecords || []).find((record) => (
      isSameDepartment(record.name, resolvedName)
    )) || null;
  }

  function upsertDepartmentRecord(record) {
    const normalized = normalizeDepartmentRecord(record);
    if (!normalized) return null;

    const list = (state.departmentRecords || []).slice();
    const existingIndex = list.findIndex((entry) => Number(entry.id) === Number(normalized.id));
    if (existingIndex >= 0) {
      list[existingIndex] = normalized;
    } else {
      list.push(normalized);
    }

    state.departmentRecords = normalizeDepartmentRecords(list);
    return normalized;
  }

  function removeDepartmentRecordById(id) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) return;
    state.departmentRecords = normalizeDepartmentRecords(
      (state.departmentRecords || []).filter((record) => Number(record.id) !== numericId)
    );
  }

  function collectPersistedDepartments() {
    return (state.departmentRecords || []).map((record) => record.name);
  }

  function buildPersistedDepartmentSupervisorMap() {
    const output = {};
    for (const record of state.departmentRecords || []) {
      const name = normalizeDepartmentName(record && record.name);
      const supervisor = normalizeSupervisorName(record && record.supervisor);
      if (!name || !supervisor) continue;
      output[name] = supervisor;
    }
    return output;
  }

  async function createPersistedDepartmentRecord(name, supervisor) {
    const created = await apiFetch('/api/command-center/departments', {
      method: 'POST',
      body: JSON.stringify({
        name: normalizeDepartmentName(name),
        supervisor: normalizeSupervisorName(supervisor),
      }),
    });
    return upsertDepartmentRecord(created);
  }

  async function updatePersistedDepartmentRecord(currentName, nextName, supervisor) {
    const currentRecord = findDepartmentRecordByName(currentName);
    if (!currentRecord) {
      return createPersistedDepartmentRecord(nextName, supervisor);
    }

    const updated = await apiFetch(`/api/command-center/departments/${currentRecord.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: normalizeDepartmentName(nextName),
        supervisor: normalizeSupervisorName(supervisor),
      }),
    });
    return upsertDepartmentRecord(updated);
  }

  async function deletePersistedDepartmentRecord(name) {
    const existing = findDepartmentRecordByName(name);
    if (!existing) return false;
    await apiFetch(`/api/command-center/departments/${existing.id}`, {
      method: 'DELETE',
    });
    removeDepartmentRecordById(existing.id);
    return true;
  }

  function readDepartmentSupervisor(departmentName) {
    const resolved = resolveDepartmentName(departmentName, state.settings.departments) || normalizeDepartmentName(departmentName);
    if (!resolved) return '';

    const map = normalizeDepartmentSupervisorMap(state.settings.departmentSupervisors, state.settings.departments);
    const key = Object.keys(map).find((entry) => isSameDepartment(entry, resolved));
    return key ? normalizeSupervisorName(map[key]) : '';
  }

  function setDepartmentSupervisor(departmentName, supervisorName) {
    const resolved = resolveDepartmentName(departmentName, state.settings.departments) || normalizeDepartmentName(departmentName);
    if (!resolved) return;

    const map = normalizeDepartmentSupervisorMap(state.settings.departmentSupervisors, state.settings.departments);
    const key = Object.keys(map).find((entry) => isSameDepartment(entry, resolved));
    if (key) {
      delete map[key];
    }

    const supervisor = normalizeSupervisorName(supervisorName);
    if (supervisor) {
      map[resolved] = supervisor;
    }

    state.settings.departmentSupervisors = map;
  }

  function normalizeDepartmentList(values, fallbackDepartment) {
    const queue = Array.isArray(values) ? values.slice() : [];
    const fallback = normalizeDepartmentName(fallbackDepartment || DEFAULT_SETTINGS.defaultDepartment);
    if (fallback) queue.push(fallback);

    const seen = new Set();
    const output = [];
    for (const entry of queue) {
      const name = normalizeDepartmentName(entry);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(name);
    }

    if (!output.length) {
      output.push(DEFAULT_SETTINGS.defaultDepartment);
    }
    return output;
  }

  function resolveDepartmentName(value, availableDepartments) {
    const expected = normalizeDepartmentName(value);
    if (!expected) return '';

    const options = [];
    const seen = new Set();
    for (const entry of Array.isArray(availableDepartments) ? availableDepartments : []) {
      const name = normalizeDepartmentName(entry);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(name);
    }
    return options.find((item) => item.toLowerCase() === expected.toLowerCase()) || '';
  }

  function isSameDepartment(left, right) {
    const normalizedLeft = normalizeDepartmentName(left).toLowerCase();
    const normalizedRight = normalizeDepartmentName(right).toLowerCase();
    return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
  }

  function areDepartmentListsEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!isSameDepartment(left[index], right[index])) return false;
    }
    return true;
  }

  function areDepartmentSupervisorMapsEqual(left, right) {
    const leftMap = left && typeof left === 'object' && !Array.isArray(left) ? left : {};
    const rightMap = right && typeof right === 'object' && !Array.isArray(right) ? right : {};
    const leftKeys = Object.keys(leftMap).sort((a, b) => a.localeCompare(b));
    const rightKeys = Object.keys(rightMap).sort((a, b) => a.localeCompare(b));

    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      if (!isSameDepartment(leftKeys[index], rightKeys[index])) return false;

      const leftValue = normalizeSupervisorName(leftMap[leftKeys[index]]);
      const rightValue = normalizeSupervisorName(rightMap[rightKeys[index]]);
      if (leftValue !== rightValue) return false;
    }

    return true;
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

  function openTemplateModal(template, moduleOverride) {
    const moduleName = normalizeModule(moduleOverride || (template && template.module) || state.currentModule);
    const moduleText = moduleLabel(moduleName);
    const intervalMode = normalizeTemplateIntervalMode(template ? template.interval_mode : 'months');
    const intervalMonths = normalizePositiveInteger(
      template && (template.interval_months || template.intervalMonths),
      DEFAULT_TEMPLATE_INTERVAL_MONTHS
    );
    const intervalDays = normalizePositiveInteger(
      template && (template.interval_days || template.intervalDays || template.cal_interval_days),
      365
    );
    const maxDailyCalibrations = normalizePositiveInteger(
      template && (template.max_daily_calibrations || template.maxDailyCalibrations),
      10
    );
    const allowedDays = template && (template.allowed_days || template.allowedDays)
      ? (template.allowed_days || template.allowedDays)
      : TEMPLATE_ALLOWED_DAY_DEFAULTS;

    state.editingTemplateId = template ? template.id : null;
    state.editingTemplateModule = moduleName;
    state.editingTemplateAssignedDepartment = template
      ? normalizeText(template.assigned_department, state.settings.defaultDepartment)
      : state.settings.defaultDepartment;
    elements.templateModalTitle.textContent = template ? `Edit ${moduleText} Template` : `Add ${moduleText} Template`;
    elements.templateForm.reset();
    elements.templateForm.template_name.value = template ? template.template_name : '';
    elements.templateForm.category.value = template ? template.category : 'Mechanical';
    if (elements.templateIntervalMode) elements.templateIntervalMode.value = intervalMode;
    if (elements.templateIntervalMonths) elements.templateIntervalMonths.value = String(intervalMonths);
    if (elements.templateIntervalDays) elements.templateIntervalDays.value = String(intervalDays);
    if (elements.templateMaxDailyCalibrations) {
      elements.templateMaxDailyCalibrations.value = String(Math.min(10, Math.max(1, maxDailyCalibrations)));
    }
    renderTemplateDepartmentOptions(state.editingTemplateAssignedDepartment);
    syncTemplateDepartmentInlineForm();
    closeTemplateAddDepartmentInline();
    hydrateTemplateAllowedDays(allowedDays);
    syncTemplateIntervalModeFields(intervalMode);
    elements.templateForm.alert_lead_days.value = template ? template.alert_lead_days : String(state.settings.calibrationAlertLeadDays);
    elements.templateForm.grace_period_days.value = template ? template.grace_period_days : String(state.settings.calibrationGraceDays);
    hydrateTemplateUnitPicker(template ? template.unit_of_measure : 'Unitless');
    openModal('template-modal');
  }

  function syncTemplateOptions(selectedId) {
    const calibrationTemplates = getCalibrationTemplates();
    const options = ['<option value="">Select a template</option>']
      .concat(calibrationTemplates.map((template) => `<option value="${template.id}">${escapeHtml(template.template_name)} · ${escapeHtml(template.category)}</option>`));
    elements.calibrationForm.template_id.innerHTML = options.join('');

    if (selectedId) {
      elements.calibrationForm.template_id.value = String(selectedId);
    } else if (calibrationTemplates.length) {
      elements.calibrationForm.template_id.value = String(calibrationTemplates[0].id);
    }

    updateCalibrationTemplateSummary(elements.calibrationForm.template_id.value);
  }

  function updateCalibrationTemplateSummary(templateId) {
    const template = getCalibrationTemplates().find((entry) => String(entry.id) === String(templateId));
    if (!template) {
      elements.calibrationTemplateSummary.textContent = 'Select a calibration template to inherit category, interval, alert lead, grace period, and unit settings.';
      return;
    }

    const intervalMode = normalizeTemplateIntervalMode(template.interval_mode || template.intervalMode);
    const intervalValue = intervalMode === 'days'
      ? `${normalizePositiveInteger(template.interval_days || template.intervalDays || template.cal_interval_days, 365)} day interval`
      : `${normalizePositiveInteger(template.interval_months || template.intervalMonths, DEFAULT_TEMPLATE_INTERVAL_MONTHS)} month interval`;
    const maxDaily = normalizePositiveInteger(
      template.max_daily_calibrations || template.maxDailyCalibrations,
      10
    );
    const allowedDays = template.allowed_days || template.allowedDays;

    elements.calibrationTemplateSummary.textContent = [
      `${template.template_name} (${template.category})`,
      intervalValue,
      `${template.alert_lead_days} day alert`,
      `${template.grace_period_days} day grace`,
      `${Math.min(10, Math.max(1, maxDaily))}/day cap`,
      `${formatAllowedDaysSummary(allowedDays)}`,
      `${template.unit_of_measure || 'No unit defined'}`,
    ].join(' · ');
  }

  function openCalibrationModal(asset) {
    if (!getCalibrationTemplates().length) {
      setSection('settings');
      setView('calibration');
      setStatus('Create a calibration template before adding an asset.', 'error');
      openTemplateModal(null, 'calibration');
      return;
    }

    state.editingCalibrationId = asset ? asset.id : null;
    elements.calibrationModalTitle.textContent = asset ? 'Edit Calibration Asset' : 'Add Calibration Asset';
    elements.calibrationForm.reset();
    elements.calibrationForm.attachment_path.value = asset ? (asset.attachment_path || '') : '';
    syncTemplateOptions(asset ? asset.template_id : null);
    const existingAssignment = asset ? String(asset.assigned_department || '').trim() : '';
    const ownerAssignment = extractOwnerAssignment(existingAssignment);
    const resolvedDepartment = resolveDepartmentName(existingAssignment, state.settings.departments);
    const ownerMode = Boolean(ownerAssignment || (existingAssignment && !resolvedDepartment));
    renderCalibrationDepartmentOptions(existingAssignment || state.settings.defaultDepartment);
    if (elements.calibrationOwnerInput) {
      elements.calibrationOwnerInput.value = ownerAssignment || (ownerMode ? existingAssignment : '');
    }
    syncCalibrationAssignmentMode(ownerMode ? 'owner' : 'department');
    elements.calibrationForm.tool_name.value = asset ? asset.tool_name : '';
    elements.calibrationForm.serial_number.value = asset ? asset.serial_number : '';
    elements.calibrationForm.asset_type.value = asset ? (asset.asset_type || '') : '';
    elements.calibrationForm.model.value = asset ? (asset.model || '') : '';
    elements.calibrationForm.manufacturer.value = asset ? (asset.manufacturer || '') : '';
    elements.calibrationForm.measurement_types.value = asset ? (asset.measurement_types || '') : '';
    elements.calibrationForm.unit_of_measure.value = asset ? (asset.unit_of_measure || '') : '';
    elements.calibrationForm.range_size.value = asset ? (asset.range_size || '') : '';
    elements.calibrationForm.accuracy.value = asset ? (asset.accuracy || '') : '';
    elements.calibrationForm.date_acquired.value = asset ? (asset.date_acquired || '') : '';
    elements.calibrationForm.source_vendor.value = asset ? (asset.source_vendor || '') : '';
    elements.calibrationForm.cost.value = asset && asset.cost != null ? String(asset.cost) : '';
    elements.calibrationForm.environment.value = asset ? (asset.environment || '') : '';
    elements.calibrationForm.instructions.value = asset ? (asset.instructions || '') : '';
    elements.calibrationForm.notes.value = asset ? (asset.notes || '') : '';
    elements.calibrationForm.last_cal.value = asset ? (asset.last_cal || '') : '';
    elements.calibrationForm.date_created_display.value = asset
      ? (asset.date_created || asset.dateCreated || '')
      : 'Auto-generated on save';
    if (elements.calibrationAttachmentPath) {
      elements.calibrationAttachmentPath.textContent = asset && asset.attachment_path
        ? `Attached file: ${asset.attachment_path}`
        : 'No attachment uploaded.';
    }
    if (elements.calibrationForm.attachment) {
      elements.calibrationForm.attachment.value = '';
    }
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
    state.activeAssetDetailKind = normalizedKind;
    state.activeAssetDetailId = asset.id;
    syncAssetDetailActions(asset, normalizedKind);
    renderAssetDetailLogs([], { loading: true });
    const logKey = `${normalizedKind}:${String(asset.id)}`;
    state.activeAssetLogKey = logKey;
    openModal('asset-detail-modal');
    loadAssetDetailLogs(normalizedKind, asset.id, logKey);
  }

  function syncAssetDetailActions(asset, kind) {
    if (!elements.assetDetailActions) return;
    const normalizedKind = kind === 'calibration' ? 'calibration' : 'hazmat';
    const isCalibration = normalizedKind === 'calibration';

    if (elements.assetDetailPrimaryAction) {
      elements.assetDetailPrimaryAction.textContent = isCalibration ? 'Calibration' : 'Verification';
      elements.assetDetailPrimaryAction.classList.toggle('amber', isCalibration);
      elements.assetDetailPrimaryAction.classList.toggle('blue', !isCalibration);
      elements.assetDetailPrimaryAction.disabled = !asset;
    }

    if (elements.assetDetailEditAction) {
      elements.assetDetailEditAction.textContent = 'Edit';
      elements.assetDetailEditAction.disabled = !asset;
    }

    if (elements.assetDetailDeleteAction) {
      elements.assetDetailDeleteAction.textContent = 'Delete';
      elements.assetDetailDeleteAction.disabled = !asset;
    }
  }

  function getActiveAssetDetail() {
    const kind = state.activeAssetDetailKind === 'calibration' ? 'calibration' : 'hazmat';
    const id = state.activeAssetDetailId;
    if (!id) return null;
    const asset = kind === 'calibration' ? findCalibrationById(id) : findMaterialById(id);
    if (!asset) return null;
    return { kind, asset };
  }

  function handleAssetDetailPrimaryAction() {
    const active = getActiveAssetDetail();
    if (!active) return;

    if (active.kind === 'calibration') {
      closeModal('asset-detail-modal');
      openCertificateModal(active.asset);
      return;
    }

    verifyMaterial(active.asset);
  }

  function handleAssetDetailEditAction() {
    const active = getActiveAssetDetail();
    if (!active) return;

    closeModal('asset-detail-modal');
    if (active.kind === 'calibration') {
      openCalibrationModal(active.asset);
      return;
    }
    openMaterialModal(active.asset);
  }

  function handleAssetDetailDeleteAction() {
    const active = getActiveAssetDetail();
    if (!active) return;

    closeModal('asset-detail-modal');
    if (active.kind === 'calibration') {
      deleteCalibration(active.asset);
      return;
    }
    deleteMaterial(active.asset);
  }

  async function loadAssetDetailLogs(source, assetId, expectedKey) {
    if (!elements.assetDetailLogList) return;
    try {
      const logs = await apiFetch(`/api/command-center/asset-logs?source=${encodeURIComponent(source)}&id=${encodeURIComponent(String(assetId))}&limit=60`);
      if (expectedKey && state.activeAssetLogKey !== expectedKey) return;
      renderAssetDetailLogs(Array.isArray(logs) ? logs : []);
    } catch (error) {
      if (expectedKey && state.activeAssetLogKey !== expectedKey) return;
      renderAssetDetailLogs([], { error: true });
    }
  }

  function renderAssetDetailLogs(logs, options = {}) {
    if (!elements.assetDetailLogList) return;
    if (options.loading) {
      elements.assetDetailLogList.innerHTML = '<div class="log-entry">Loading change history...</div>';
      return;
    }
    if (options.error) {
      elements.assetDetailLogList.innerHTML = '<div class="log-entry">Unable to load change history.</div>';
      return;
    }

    const rows = Array.isArray(logs) ? logs : [];
    if (!rows.length) {
      elements.assetDetailLogList.innerHTML = '<div class="log-entry">No recorded changes for this asset yet.</div>';
      return;
    }

    elements.assetDetailLogList.innerHTML = rows.map((entry) => {
      const action = startCase(String(entry && entry.action ? entry.action : 'updated'));
      const actor = entry && entry.actor_name ? entry.actor_name : 'System';
      return [
        '<article class="log-entry">',
        '<div class="log-meta">',
        `<span class="status-chip status-blue">${escapeHtml(action)}</span>`,
        `<small>${escapeHtml(formatDateTime(entry && entry.timestamp ? entry.timestamp : ''))}</small>`,
        '</div>',
        `<strong>${escapeHtml(entry && entry.detail ? entry.detail : 'Change recorded')}</strong>`,
        `<small>${escapeHtml(actor)}</small>`,
        '</article>',
      ].join('');
    }).join('');
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
    if (id === 'department-modal') {
      state.editingDepartmentName = '';
    }
    if (id === 'template-modal') {
      closeTemplateAddUnitInline();
      closeTemplateAddDepartmentInline();
      state.editingTemplateAssignedDepartment = '';
    }
    if (id === 'asset-detail-modal') {
      state.activeAssetLogKey = '';
      state.activeAssetDetailKind = '';
      state.activeAssetDetailId = null;
    }
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
    const moduleName = normalizeModule(state.editingTemplateModule || state.currentModule);
    const moduleText = moduleLabel(moduleName);
    const endpointBase = templateEndpointForModule(moduleName);
    const selectedDepartment = elements.templateDepartmentSelect
      ? elements.templateDepartmentSelect.value
      : state.editingTemplateAssignedDepartment;
    const assignedDepartment = resolveDepartmentName(
      selectedDepartment,
      state.settings.departments
    ) || state.settings.defaultDepartment;
    state.editingTemplateAssignedDepartment = assignedDepartment;
    const intervalMode = normalizeTemplateIntervalMode(
      elements.templateIntervalMode ? elements.templateIntervalMode.value : 'months'
    );
    const intervalMonths = normalizePositiveInteger(
      elements.templateIntervalMonths ? elements.templateIntervalMonths.value : DEFAULT_TEMPLATE_INTERVAL_MONTHS,
      DEFAULT_TEMPLATE_INTERVAL_MONTHS
    );
    const intervalDays = normalizePositiveInteger(
      elements.templateIntervalDays ? elements.templateIntervalDays.value : 365,
      365
    );
    const calIntervalDays = syncTemplateCalIntervalField();
    const maxDailyCalibrations = Math.min(10, Math.max(1, normalizePositiveInteger(
      elements.templateMaxDailyCalibrations ? elements.templateMaxDailyCalibrations.value : 10,
      10
    )));
    const allowedDays = getSelectedTemplateAllowedDays();

    if (!allowedDays.length) {
      setStatus('Select at least one allowed calibration day.', 'error');
      return;
    }

    syncTemplateUnitSelectionValue();
    const payload = {
      template_name: elements.templateForm.template_name.value.trim(),
      category: elements.templateForm.category.value,
      interval_mode: intervalMode,
      interval_months: intervalMonths,
      interval_days: intervalDays,
      cal_interval_days: Number(calIntervalDays || 365),
      alert_lead_days: Number(elements.templateForm.alert_lead_days.value || state.settings.calibrationAlertLeadDays),
      grace_period_days: Number(elements.templateForm.grace_period_days.value || state.settings.calibrationGraceDays),
      max_daily_calibrations: maxDailyCalibrations,
      allowed_days: allowedDays,
      unit_of_measure: elements.templateForm.unit_of_measure.value.trim() || 'Unitless',
      assigned_department: assignedDepartment,
    };

    try {
      const response = state.editingTemplateId
        ? await apiFetch(`${endpointBase}/${state.editingTemplateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await apiFetch(endpointBase, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      closeModal('template-modal');
      setStatus(state.editingTemplateId ? `${moduleText} template updated.` : `${moduleText} template created.`, 'info');
      await refreshPortal({ silentStatus: true });
      if (moduleName === 'calibration' && !elements.calibrationModal.classList.contains('hidden')) {
        syncTemplateOptions(response && response.id ? response.id : null);
      }
    } catch (error) {
      setStatus(error.message || `Failed to save ${moduleText.toLowerCase()} template.`, 'error');
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

    const assignedDepartment = calibrationAssignmentValue();
    if (!assignedDepartment) {
      setStatus('Owner information is required when Owned By is selected.', 'error');
      if (elements.calibrationOwnerInput) {
        elements.calibrationOwnerInput.focus();
      }
      return;
    }

    const rawCost = elements.calibrationForm.cost.value;
    const parsedCost = rawCost === '' ? null : Number(rawCost);

    const payload = {
      template_id: templateId,
      tool_name: elements.calibrationForm.tool_name.value.trim(),
      serial_number: elements.calibrationForm.serial_number.value.trim(),
      last_cal: elements.calibrationForm.last_cal.value || null,
      asset_type: elements.calibrationForm.asset_type.value.trim(),
      model: elements.calibrationForm.model.value.trim(),
      manufacturer: elements.calibrationForm.manufacturer.value.trim(),
      measurement_types: elements.calibrationForm.measurement_types.value.trim(),
      unit_of_measure: elements.calibrationForm.unit_of_measure.value.trim(),
      range_size: elements.calibrationForm.range_size.value.trim(),
      accuracy: elements.calibrationForm.accuracy.value.trim(),
      date_acquired: elements.calibrationForm.date_acquired.value || null,
      source_vendor: elements.calibrationForm.source_vendor.value.trim(),
      cost: Number.isFinite(parsedCost) ? parsedCost : null,
      environment: elements.calibrationForm.environment.value.trim(),
      instructions: elements.calibrationForm.instructions.value.trim(),
      notes: elements.calibrationForm.notes.value.trim(),
      assigned_department: assignedDepartment,
      attachment_path: elements.calibrationForm.attachment_path.value || null,
    };

    try {
      const attachmentFile = elements.calibrationForm.attachment
        && elements.calibrationForm.attachment.files
        && elements.calibrationForm.attachment.files[0]
        ? elements.calibrationForm.attachment.files[0]
        : null;

      if (attachmentFile) {
        const uploadedPath = await uploadCalibrationAttachment(attachmentFile);
        if (uploadedPath) {
          payload.attachment_path = uploadedPath;
          elements.calibrationForm.attachment_path.value = uploadedPath;
        }
      }

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

  async function uploadCalibrationAttachment(file) {
    if (!file) return null;
    const body = new FormData();
    body.append('attachment', file);
    const response = await apiFetch('/api/command-center/calibration/attachments', {
      method: 'POST',
      body,
    });
    return response && response.path ? response.path : null;
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

  async function verifyMaterial(material) {
    if (!material || !material.id) return;
    const notesInput = window.prompt('Optional verification notes', '');
    if (notesInput === null) return;
    try {
      await apiFetch(`/api/command-center/materials/${material.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ notes: notesInput.trim() }),
      });
      setStatus('Hazmat material verified.', 'info');
      await refreshPortal({ silentStatus: true });
      const refreshed = findMaterialById(material.id) || material;
      openAssetDetailModal(refreshed, 'hazmat');
    } catch (error) {
      setStatus(error.message || 'Failed to verify hazmat material.', 'error');
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
    const moduleName = normalizeModule(template && template.module ? template.module : state.currentModule);
    const moduleText = moduleLabel(moduleName);
    if (!window.confirm(`Delete ${moduleText.toLowerCase()} template ${template.template_name}?`)) return;
    try {
      await apiFetch(`${templateEndpointForModule(moduleName)}/${template.id}`, { method: 'DELETE' });
      setStatus(`${moduleText} template deleted.`, 'info');
      await refreshPortal({ silentStatus: true });
    } catch (error) {
      setStatus(error.message || `Failed to delete ${moduleText.toLowerCase()} template.`, 'error');
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
      AssetID: item.asset_uid,
      Name: item.name,
      Batch: item.batch_id,
      Symbols: item.ghs_symbols.join(', '),
      Expiration: item.expiration_date,
      StockLevel: item.stock_level,
      MinThreshold: item.min_threshold,
      WarningLead: isHazmatWarning(item) ? 'AMBER' : 'CLEAR',
      Expired: item.expired ? 'RED' : 'NO',
    }));
    const hazmatTemplateRows = state.hazmatTemplates.map((item) => ({
      TemplateName: item.template_name,
      Category: item.category,
      IntervalDays: item.cal_interval_days,
      AlertLeadDays: item.alert_lead_days,
      GracePeriodDays: item.grace_period_days,
      UnitOfMeasure: item.unit_of_measure,
      AssignedDepartment: item.assigned_department,
      AssetCount: item.asset_count,
    }));
    const calibrationTemplateRows = state.templates.map((item) => ({
      TemplateName: item.template_name,
      Category: item.category,
      IntervalMode: normalizeTemplateIntervalMode(item.interval_mode || item.intervalMode),
      IntervalMonths: item.interval_months || item.intervalMonths || '',
      IntervalDaysInput: item.interval_days || item.intervalDays || item.cal_interval_days,
      IntervalDays: item.cal_interval_days,
      AlertLeadDays: item.alert_lead_days,
      GracePeriodDays: item.grace_period_days,
      MaxDailyCalibrations: item.max_daily_calibrations || item.maxDailyCalibrations || 10,
      AllowedDays: formatAllowedDaysSummary(item.allowed_days || item.allowedDays),
      UnitOfMeasure: item.unit_of_measure,
      AssignedDepartment: item.assigned_department,
      AssetCount: item.asset_count,
    }));
    const calibrationRows = state.calibration.map((item) => ({
      AssetID: item.asset_uid,
      CFEID: item.cfe_uid,
      TemplateName: item.template_name,
      ToolName: item.tool_name,
      SerialNumber: item.serial_number,
      Category: item.category,
      AssignedDepartment: item.assigned_department,
      LastCalibration: item.last_cal,
      IntervalMode: normalizeTemplateIntervalMode(item.interval_mode),
      IntervalMonths: item.interval_months || '',
      IntervalDaysInput: item.interval_days || item.cal_frequency,
      FrequencyDays: item.cal_frequency,
      AlertLeadDays: item.alert_lead_days,
      GracePeriodDays: item.grace_period_days,
      MaxDailyCalibrations: item.max_daily_calibrations || 10,
      AllowedDays: formatAllowedDaysSummary(item.allowed_days),
      NextCalibration: item.next_cal,
      Status: item.status,
      CheckOutLocked: isCalibrationRed(item) ? 'YES' : 'NO',
    }));
    const debugTicketRows = state.debugTickets.map((item) => ({
      TicketID: item.id,
      SerialNumber: item.serial_number,
      ModelRev: item.model_rev,
      FailureSignature: item.failure_signature,
      TechnicianID: item.technician_id,
      Department: item.department_name || '',
      Status: normalizeDebugStatus(item.status),
      BenchHours: Number(item.total_bench_time || 0),
      ChronicFailure: item.chronic_failure ? 'YES' : 'NO',
      VerificationPass: item.verification_pass || '',
      CreatedAt: item.created_at,
      UpdatedAt: item.updated_at,
      ClosedAt: item.closed_at,
    }));
    const debugComponentRows = state.debugTickets.flatMap((ticket) => {
      const components = Array.isArray(ticket.faulty_components) ? ticket.faulty_components : [];
      return components.map((component) => ({
        TicketID: ticket.id,
        SerialNumber: ticket.serial_number,
        RefDesignator: component.ref_designator,
        ComponentType: component.component_type,
        FailureMode: component.failure_mode,
        LotCode: component.lot_code,
      }));
    });
    const debugAlertRows = []
      .concat((state.debugAnalytics.chronic_failures || []).map((alert) => ({
        AlertType: 'ChronicFailure',
        Subject: alert.serial_number,
        Detail: alert.message,
      })))
      .concat((state.debugAnalytics.systemic_alerts || []).map((alert) => ({
        AlertType: 'SystemicIssue',
        Subject: alert.ref_designator,
        Detail: alert.message,
      })));
    const logRows = state.logs.map((item) => ({
      Module: item.module,
      Action: item.action,
      Detail: item.detail,
      Actor: item.actor_name,
      Timestamp: item.timestamp,
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventoryRows), 'Hazmat');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(hazmatTemplateRows), 'Hazmat Templates');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(calibrationTemplateRows), 'Calibration Templates');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(calibrationRows), 'Calibration');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(debugTicketRows), 'Debug Tickets');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(debugComponentRows), 'Debug Components');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(debugAlertRows), 'Debug Alerts');
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
    const isFormDataBody = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body && !isFormDataBody && !headers.has('Content-Type')) {
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
      asset_type: pickValue(row, ['asset_type', 'type']),
      model: pickValue(row, ['model', 'model_number']),
      manufacturer: pickValue(row, ['manufacturer', 'maker']),
      measurement_types: pickValue(row, ['measurement_types', 'measurement_type', 'measurements']),
      category: pickValue(row, ['category', 'template_category']),
      range_size: pickValue(row, ['range_size', 'range', 'size']),
      accuracy: pickValue(row, ['accuracy']),
      last_cal: pickValue(row, ['last_cal', 'last_calibration', 'last_cal_date', 'calibrated_on']),
      date_acquired: pickValue(row, ['date_acquired', 'acquired_on', 'purchase_date']),
      source_vendor: pickValue(row, ['source_vendor', 'vendor', 'source']),
      cost: pickValue(row, ['cost', 'price']),
      environment: pickValue(row, ['environment']),
      instructions: pickValue(row, ['instructions', 'instruction']),
      notes: pickValue(row, ['notes', 'note']),
      interval_mode: pickValue(row, ['interval_mode', 'intervalmode', 'mode']),
      interval_months: pickValue(row, ['interval_months', 'intervalmonths', 'months']),
      interval_days: pickValue(row, ['interval_days', 'intervaldays', 'days']),
      cal_interval_days: pickValue(row, ['cal_interval_days', 'cal_frequency', 'frequency', 'frequency_days', 'cal_days', 'interval_days']),
      alert_lead_days: pickValue(row, ['alert_lead_days', 'alert_window', 'lead_days', 'notify_days']),
      grace_period_days: pickValue(row, ['grace_period_days', 'grace_days', 'lock_after_days']),
      max_daily_calibrations: pickValue(row, ['max_daily_calibrations', 'maxdailycalibrations', 'max_daily', 'daily_capacity']),
      allowed_days: pickValue(row, ['allowed_days', 'alloweddays', 'allowed_weekdays', 'weekdays']),
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

  function formatAllowedDaysSummary(value) {
    const source = Array.isArray(value)
      ? value
      : String(value || '').split(/[;,|\s]+/);
    const normalized = source
      .map((entry) => String(entry || '').trim())
      .filter((entry) => /^[1-7]$/.test(entry));
    const selected = normalized.length ? normalized : TEMPLATE_ALLOWED_DAY_DEFAULTS;
    const labels = {
      '1': 'Mon',
      '2': 'Tue',
      '3': 'Wed',
      '4': 'Thu',
      '5': 'Fri',
      '6': 'Sat',
      '7': 'Sun',
    };
    return selected.map((day) => labels[day] || day).join('/');
  }

  function formatTemplateIntervalSummary(data) {
    const intervalMode = normalizeTemplateIntervalMode(data && (data.interval_mode || data.intervalMode));
    if (intervalMode === 'days') {
      const days = normalizePositiveInteger(data && (data.interval_days || data.intervalDays || data.cal_interval_days || data.cal_frequency), 365);
      return `${days}d interval`;
    }

    const months = normalizePositiveInteger(data && (data.interval_months || data.intervalMonths), DEFAULT_TEMPLATE_INTERVAL_MONTHS);
    return `${months}mo interval`;
  }

  function formatTemplateRules(data) {
    const maxDaily = Math.min(10, Math.max(1, normalizePositiveInteger(
      data && (data.max_daily_calibrations || data.maxDailyCalibrations),
      10
    )));
    return [
      formatTemplateIntervalSummary(data),
      `${data.alert_lead_days}d alert`,
      `${data.grace_period_days}d grace`,
      `${maxDaily}/day`,
      formatAllowedDaysSummary(data && (data.allowed_days || data.allowedDays)),
    ].join(' · ');
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
      { label: 'Asset ID', value: item.asset_uid || `HAZ-ASSET-${String(item.id || '').padStart(6, '0')}` },
      { label: 'Material Name', value: item.name },
      { label: 'Batch ID', value: item.batch_id },
      { label: 'Assigned Department / Owner', value: item.assigned_department || state.settings.defaultDepartment },
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
      { label: 'Asset ID', value: item.asset_uid || `CAL-ASSET-${String(item.id || '').padStart(6, '0')}` },
      { label: 'CFE ID', value: item.cfe_uid || `CFE-CAL-${String(item.id || '').padStart(6, '0')}` },
      { label: 'Created Date', value: item.date_created || item.dateCreated || 'Auto-generated' },
      { label: 'Tool Name', value: item.tool_name },
      { label: 'Serial Number', value: item.serial_number },
      { label: 'Type', value: item.asset_type || item.category || 'Not set' },
      { label: 'Model', value: item.model || 'Not set' },
      { label: 'Manufacturer', value: item.manufacturer || 'Not set' },
      { label: 'Template', value: item.template_name || 'Not assigned' },
      { label: 'Category', value: item.category || 'Not assigned' },
      { label: 'Department', value: item.assigned_department || state.settings.defaultDepartment },
      { label: 'Measurement Types', value: item.measurement_types || 'Not set' },
      { label: 'Unit of Measure', value: item.unit_of_measure || 'Not set' },
      { label: 'Range / Size', value: item.range_size || 'Not set' },
      { label: 'Accuracy', value: item.accuracy || 'Not set' },
      { label: 'Last Calibration', value: item.last_cal || 'Not set' },
      { label: 'Next Calibration', value: item.next_cal || 'Not scheduled' },
      { label: 'Date Acquired', value: item.date_acquired || 'Not set' },
      { label: 'Source / Vendor', value: item.source_vendor || 'Not set' },
      { label: 'Cost', value: item.cost == null ? 'Not set' : item.cost },
      { label: 'Environment', value: item.environment || 'Not set' },
      { label: 'Instructions', value: item.instructions || 'Not set' },
      { label: 'Notes', value: item.notes || 'Not set' },
      { label: 'Interval Rule', value: formatTemplateIntervalSummary(item) },
      { label: 'Daily Capacity', value: `${Math.min(10, Math.max(1, normalizePositiveInteger(item.max_daily_calibrations, 10)))} per day` },
      { label: 'Allowed Days', value: formatAllowedDaysSummary(item.allowed_days) },
      { label: 'Alert Lead', value: `${item.alert_lead_days || 0} day(s)` },
      { label: 'Grace Period', value: `${item.grace_period_days || 0} day(s)` },
      { label: 'Due Window', value: describeCalibrationWindow(item) },
      { label: 'Check-Out', value: item.locked_for_checkout ? 'Locked' : 'Available' },
      { label: 'Attachment', html: formatAttachmentDetail(item.attachment_path) },
    ];
  }

  function formatAttachmentDetail(pathValue) {
    const path = String(pathValue || '').trim();
    if (!path) {
      return '<span class="status-chip">No attachment</span>';
    }
    return `<a class="resource-link" href="${escapeHtml(path)}" target="_blank" rel="noreferrer">Open Attachment</a>`;
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

  function findDebugTicketById(id) {
    return state.debugTickets.find((item) => String(item.id) === String(id)) || null;
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
    return [data.name, data.asset_uid, data.batch_id, (data.ghs_symbols || []).join(' '), data.expiration_date].some((field) => String(field || '').toLowerCase().includes(value));
  }

  function filterCalibrationRows(data, term) {
    const value = String(term || '').trim().toLowerCase();
    if (!value) return true;
    return [
      data.tool_name,
      data.template_name,
      data.serial_number,
      data.asset_uid,
      data.cfe_uid,
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
