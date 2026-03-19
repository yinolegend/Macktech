(function adminConsoleBootstrap() {
  const TOKEN_KEY = 'command_center_token';
  const LEGACY_TOKEN_KEY = 'mack_token';
  const PERMISSION_DEFINITIONS = [
    { key: 'admin_console', label: 'Admin Console' },
    { key: 'user_management', label: 'User Management' },
    { key: 'department_management', label: 'Department Management' },
    { key: 'settings_access', label: 'Settings Access' },
    { key: 'edit_access', label: 'Edit Access' },
    { key: 'dashboard_access', label: 'Dashboard Access' },
    { key: 'hazmat_access', label: 'Hazmat Access' },
    { key: 'calibration_access', label: 'Calibration Access' },
    { key: 'failure_analysis_access', label: 'Failure Analysis Access' },
    { key: 'announcements_access', label: 'Announcements Access' },
    { key: 'reports_access', label: 'Reports Access' },
  ];
  const USER_ASSIGNABLE_MODULE_KEYS = ['failure_analysis', 'hazmat', 'calibration', 'announcements'];
  const ACCESS_LEVEL_VIEW_ONLY = 'view_only';
  const ACCESS_LEVEL_VIEW_EDIT = 'view_edit';

  const state = {
    session: null,
    overview: null,
    users: [],
    departments: [],
    roles: [],
    modules: [],
    selectedUserFormId: 0,
    selectedRoleUserId: 0,
    activeSection: 'overview',
    capabilities: {
      isAdmin: false,
      canEditUsers: false,
      canEditRoles: false,
      canManageDepartments: false,
    },
  };

  const refs = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    bindEvents();
    loadConsole();
  }

  function cacheDom() {
    refs.sessionUser = document.getElementById('session-user');
    refs.signOutButton = document.getElementById('sign-out-button');
    refs.statusBanner = document.getElementById('status-banner');
    refs.tabs = Array.from(document.querySelectorAll('.console-tab'));
    refs.sections = Array.from(document.querySelectorAll('.console-section'));
    refs.metricTotalUsers = document.getElementById('metric-total-users');
    refs.metricActiveUsers = document.getElementById('metric-active-users');
    refs.metricCalibrationAssets = document.getElementById('metric-calibration-assets');
    refs.metricHazmatInventory = document.getElementById('metric-hazmat-inventory');
    refs.metricUpcomingCalibrations = document.getElementById('metric-upcoming-calibrations');
    refs.overviewSummary = document.getElementById('overview-summary');
    refs.roleDistribution = document.getElementById('role-distribution');
    refs.userForm = document.getElementById('user-form');
    refs.userFormTitle = document.getElementById('user-form-title');
    refs.userId = document.getElementById('user-id');
    refs.userUsername = document.getElementById('user-username');
    refs.userPassword = document.getElementById('user-password');
    refs.userDisplayName = document.getElementById('user-display-name');
    refs.userDepartment = document.getElementById('user-department');
    refs.userRole = document.getElementById('user-role');
    refs.userStatus = document.getElementById('user-status');
    refs.userAccessLevel = document.getElementById('user-access-level');
    refs.moduleCheckboxes = document.getElementById('module-checkboxes');
    refs.applyRoleDefaultsButton = document.getElementById('apply-role-defaults-button');
    refs.clearUserFormButton = document.getElementById('clear-user-form-button');
    refs.usersUserSelect = document.getElementById('users-user-select');
    refs.userSearch = document.getElementById('user-search');
    refs.userTableBody = document.getElementById('user-table-body');
    refs.rolesGrid = document.getElementById('roles-grid');
    refs.rolesUserSelect = document.getElementById('roles-user-select');
    refs.departmentForm = document.getElementById('department-form');
    refs.departmentFormTitle = document.getElementById('department-form-title');
    refs.departmentId = document.getElementById('department-id');
    refs.departmentName = document.getElementById('department-name');
    refs.departmentSupervisor = document.getElementById('department-supervisor');
    refs.clearDepartmentFormButton = document.getElementById('clear-department-form-button');
    refs.departmentTableBody = document.getElementById('department-table-body');
    refs.departmentOptions = document.getElementById('department-options');
  }

  function safeOn(node, eventName, handler) {
    if (node && typeof node.addEventListener === 'function') {
      node.addEventListener(eventName, handler);
    }
  }

  function bindEvents() {
    safeOn(refs.signOutButton, 'click', handleSignOut);
    (refs.tabs || []).forEach((button) => {
      safeOn(button, 'click', () => setActiveSection(button.dataset.section));
    });

    safeOn(refs.userForm, 'submit', submitUserForm);
    safeOn(refs.clearUserFormButton, 'click', clearUserForm);
    safeOn(refs.applyRoleDefaultsButton, 'click', applyRoleDefaultsToForm);
    safeOn(refs.userRole, 'change', applyRoleDefaultsToForm);
    safeOn(refs.usersUserSelect, 'change', handleUsersUserSelectChange);
    safeOn(refs.userSearch, 'input', renderUsers);
    safeOn(refs.userTableBody, 'click', handleUserTableClick);

    safeOn(refs.departmentForm, 'submit', submitDepartmentForm);
    safeOn(refs.clearDepartmentFormButton, 'click', clearDepartmentForm);
    safeOn(refs.departmentTableBody, 'click', handleDepartmentTableClick);

    safeOn(refs.rolesGrid, 'click', handleRolesGridClick);
    safeOn(refs.rolesUserSelect, 'change', handleRolesUserSelectChange);
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch (error) {
    }
  }

  function redirectToLogin() {
    window.location.href = '/login.html';
  }

  async function requestJson(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
    });

    const data = await response.json().catch(() => null);
    if (response.status === 401) {
      clearToken();
      redirectToLogin();
      throw new Error((data && (data.error || data.message)) || 'Session expired. Redirecting to login.');
    }

    if (response.status === 403) {
      throw new Error((data && (data.error || data.message)) || 'You do not have permission to perform this action.');
    }

    if (!response.ok) {
      throw new Error((data && (data.error || data.message)) || 'Request failed.');
    }

    return data;
  }

  function normalizeCapabilities(capabilities) {
    const source = capabilities || {};
    return {
      isAdmin: Boolean(source.is_admin || source.isAdmin),
      canEditUsers: Boolean(source.can_edit_users || source.canEditUsers),
      canEditRoles: Boolean(source.can_edit_roles || source.canEditRoles),
      canManageDepartments: Boolean(source.can_manage_departments || source.canManageDepartments),
    };
  }

  function hasCapability(name) {
    return Boolean(state.capabilities && state.capabilities[name]);
  }

  function setStatus(message, tone) {
    if (!refs.statusBanner) return;
    refs.statusBanner.textContent = message || '';
    refs.statusBanner.className = 'status-banner';
    if (tone) {
      refs.statusBanner.classList.add(`is-${tone}`);
    }
  }

  function setActiveSection(section) {
    state.activeSection = section || 'overview';
    (refs.tabs || []).forEach((button) => {
      button.classList.toggle('active', button.dataset.section === state.activeSection);
    });
    (refs.sections || []).forEach((sectionNode) => {
      sectionNode.classList.toggle('active', sectionNode.dataset.section === state.activeSection);
    });
  }

  function rolesWorkingName(user) {
    if (!user) return '';
    return String(user.display_name || user.username || '').trim();
  }

  function formatUserSelectLabel(user) {
    if (!user) return '';
    return user.display_name && user.display_name !== user.username
      ? `${user.display_name} (${user.username})`
      : String(user.username || '');
  }

  function roleDefinitionMap() {
    return new Map((state.roles || []).map((role) => [role.key, role]));
  }

  function moduleDefinitionMap() {
    return new Map((state.modules || []).map((moduleDefinition) => [moduleDefinition.key, moduleDefinition]));
  }

  function assignableModuleDefinitions() {
    const map = moduleDefinitionMap();
    return USER_ASSIGNABLE_MODULE_KEYS.map((moduleKey) => map.get(moduleKey)).filter(Boolean);
  }

  function setFormDisabled(form, disabled) {
    if (!form) return;
    form.querySelectorAll('input, select, textarea, button').forEach((field) => {
      if (field.type === 'hidden') return;
      field.disabled = Boolean(disabled);
    });
  }

  function applyCapabilities() {
    const canEditUsers = hasCapability('canEditUsers');
    const canEditRoles = hasCapability('canEditRoles');
    const canManageDepartments = hasCapability('canManageDepartments');

    if (refs.userForm) {
      setFormDisabled(refs.userForm, !canEditUsers);
      refs.userForm.classList.toggle('is-readonly', !canEditUsers);
    }

    if (refs.userSearch) {
      refs.userSearch.disabled = false;
    }

    if (refs.clearUserFormButton) {
      refs.clearUserFormButton.disabled = !canEditUsers;
    }

    if (refs.applyRoleDefaultsButton) {
      refs.applyRoleDefaultsButton.disabled = !canEditUsers;
    }

    if (refs.usersUserSelect) {
      refs.usersUserSelect.disabled = !canEditUsers || !state.users.length;
    }

    if (refs.departmentForm) {
      setFormDisabled(refs.departmentForm, !canManageDepartments);
      refs.departmentForm.classList.toggle('is-readonly', !canManageDepartments);
    }

    if (refs.clearDepartmentFormButton) {
      refs.clearDepartmentFormButton.disabled = !canManageDepartments;
    }

    if (refs.rolesGrid) {
      refs.rolesGrid.classList.toggle('is-readonly', !canEditRoles);
    }

    renderUsers();
    renderRoles();
    renderDepartments();
  }

  async function loadConsole() {
    try {
      setStatus('Loading admin console...', null);
      const session = await requestJson('/api/admin-console/session');
      state.session = session;
      state.roles = Array.isArray(session.roles) ? session.roles : [];
      state.modules = Array.isArray(session.modules) ? session.modules : [];
      state.capabilities = normalizeCapabilities(session.capabilities);

      if (refs.sessionUser) {
        refs.sessionUser.textContent = session.user
          ? `${session.user.display_name || session.user.username} (${session.user.role})`
          : 'Administrator';
      }

      renderRoleOptions();
      renderModuleCheckboxes();
      renderRoles();
      applyRoleDefaultsToForm();
      applyCapabilities();

      const failures = [];
      await refreshOverview().catch((error) => failures.push(error.message || 'Failed to load overview.'));
      await refreshUsers().catch((error) => {
        state.users = [];
        renderUsers();
        renderOverviewSummaryFromUsers();
        failures.push(error.message || 'Failed to load users.');
      });
      await refreshDepartments().catch((error) => {
        state.departments = [];
        renderDepartments();
        failures.push(error.message || 'Failed to load departments.');
      });

      setActiveSection(state.activeSection);
      if (failures.length) {
        setStatus(`Admin console loaded with warnings: ${failures.join(' | ')}`, 'warning');
      } else {
        setStatus('Admin console synchronized.', 'success');
      }
    } catch (error) {
      setStatus(error.message || 'Failed to load admin console.', 'error');
    }
  }

  async function refreshOverview() {
    state.overview = await requestJson('/api/admin-console/overview');
    renderOverview();
  }

  async function refreshUsers() {
    state.users = await requestJson('/api/admin-console/users');
    renderUsers();
    renderUsersUserSelect();
    renderRolesUserSelect();
    renderRoles();
    renderOverviewSummaryFromUsers();
  }

  function renderUsersUserSelect() {
    if (!refs.usersUserSelect) return;

    const sortedUsers = state.users.slice().sort((left, right) => {
      const leftLabel = String(left.display_name || left.username || '').toLowerCase();
      const rightLabel = String(right.display_name || right.username || '').toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });

    if (!sortedUsers.length) {
      refs.usersUserSelect.innerHTML = '<option value="">No users available</option>';
      refs.usersUserSelect.value = '';
      refs.usersUserSelect.disabled = true;
      state.selectedUserFormId = 0;
      return;
    }

    refs.usersUserSelect.disabled = !hasCapability('canEditUsers');
    const currentValue = String(
      state.selectedUserFormId
      || (refs.usersUserSelect && refs.usersUserSelect.value)
      || (refs.userId && refs.userId.value)
      || ''
    );

    const options = sortedUsers.map((user) => {
      return `<option value="${escapeHtml(String(user.id))}">${escapeHtml(formatUserSelectLabel(user))}</option>`;
    }).join('');

    refs.usersUserSelect.innerHTML = '<option value="">Select user to edit</option>' + options;
    const hasCurrent = Boolean(currentValue) && sortedUsers.some((user) => String(user.id) === currentValue);
    refs.usersUserSelect.value = hasCurrent ? currentValue : '';
    state.selectedUserFormId = hasCurrent ? Number(currentValue) : 0;
  }

  function renderRolesUserSelect() {
    if (!refs.rolesUserSelect) return;

    const sortedUsers = state.users.slice().sort((left, right) => {
      const leftLabel = String(left.display_name || left.username || '').toLowerCase();
      const rightLabel = String(right.display_name || right.username || '').toLowerCase();
      return leftLabel.localeCompare(rightLabel);
    });

    if (!sortedUsers.length) {
      refs.rolesUserSelect.innerHTML = '<option value="">No users available</option>';
      refs.rolesUserSelect.value = '';
      refs.rolesUserSelect.disabled = true;
      state.selectedRoleUserId = 0;
      return;
    }

    refs.rolesUserSelect.disabled = false;
    const currentValue = String(state.selectedRoleUserId || refs.rolesUserSelect.value || '');
    const options = sortedUsers.map((user) => {
      return `<option value="${escapeHtml(String(user.id))}">${escapeHtml(formatUserSelectLabel(user))}</option>`;
    }).join('');

    refs.rolesUserSelect.innerHTML = '<option value="">Select user to work with</option>' + options;
    const hasCurrent = Boolean(currentValue) && sortedUsers.some((user) => String(user.id) === currentValue);
    const nextValue = hasCurrent ? currentValue : String(sortedUsers[0].id);
    refs.rolesUserSelect.value = nextValue;
    state.selectedRoleUserId = Number(nextValue);
  }

  async function refreshDepartments() {
    state.departments = await requestJson('/api/admin-console/departments');
    renderDepartments();
  }

  function renderRoleOptions() {
    if (!refs.userRole) return;
    refs.userRole.innerHTML = (state.roles || []).map((role) => {
      return `<option value="${escapeHtml(role.key)}">${escapeHtml(role.label)}</option>`;
    }).join('');
  }

  function renderModuleCheckboxes() {
    if (!refs.moduleCheckboxes) return;
    refs.moduleCheckboxes.innerHTML = assignableModuleDefinitions().map((moduleDefinition) => {
      return [
        '<label class="module-option">',
        `<input type="checkbox" value="${escapeHtml(moduleDefinition.key)}" />`,
        '<span>',
        `<strong>${escapeHtml(moduleDefinition.label)}</strong>`,
        `<small>${escapeHtml(moduleDefinition.description || '')}</small>`,
        '</span>',
        '</label>',
      ].join('');
    }).join('');
  }

  function selectedAccessLevelFromForm() {
    const selected = (refs.userAccessLevel && refs.userAccessLevel.value) || ACCESS_LEVEL_VIEW_ONLY;
    return selected === ACCESS_LEVEL_VIEW_EDIT ? ACCESS_LEVEL_VIEW_EDIT : ACCESS_LEVEL_VIEW_ONLY;
  }

  function selectedPermissionAccessFromForm() {
    const definition = roleDefinitionMap().get((refs.userRole && refs.userRole.value) || '');
    const basePermissions = Array.isArray(definition && definition.permissions) ? definition.permissions.slice() : [];
    const baseHasEdit = basePermissions.includes('edit_access');
    const targetHasEdit = selectedAccessLevelFromForm() === ACCESS_LEVEL_VIEW_EDIT;

    if (baseHasEdit === targetHasEdit) {
      return null;
    }

    const nextPermissions = basePermissions.filter((permission) => permission !== 'edit_access');
    if (targetHasEdit) {
      nextPermissions.push('edit_access');
    }
    return nextPermissions;
  }

  function inferAccessLevelFromUser(user) {
    const explicitPermissions = Array.isArray(user && user.permission_access) ? user.permission_access : [];
    if (user && user.permission_access_provided) {
      return explicitPermissions.includes('edit_access') ? ACCESS_LEVEL_VIEW_EDIT : ACCESS_LEVEL_VIEW_ONLY;
    }

    const effectivePermissions = Array.isArray(user && user.permissions) ? user.permissions : [];
    return effectivePermissions.includes('edit_access') ? ACCESS_LEVEL_VIEW_EDIT : ACCESS_LEVEL_VIEW_ONLY;
  }

  function selectedModulesFromForm() {
    if (!refs.moduleCheckboxes) return [];
    return Array.from(refs.moduleCheckboxes.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => input.value);
  }

  function setModuleSelections(modules) {
    if (!refs.moduleCheckboxes) return;
    const selected = new Set(Array.isArray(modules) ? modules : []);
    refs.moduleCheckboxes.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = selected.has(input.value);
    });
  }

  function applyRoleDefaultsToForm() {
    if (!refs.userRole) return;
    const selectedRole = refs.userRole.value;
    const definition = roleDefinitionMap().get(selectedRole);
    if (!definition) return;
    setModuleSelections(definition.modules || []);

    if (refs.userAccessLevel) {
      const defaultLevel = Array.isArray(definition.permissions) && definition.permissions.includes('edit_access')
        ? ACCESS_LEVEL_VIEW_EDIT
        : ACCESS_LEVEL_VIEW_ONLY;
      refs.userAccessLevel.value = defaultLevel;
    }
  }

  function renderOverview() {
    const overview = state.overview || {};
    if (refs.metricTotalUsers) refs.metricTotalUsers.textContent = String(overview.total_users || 0);
    if (refs.metricActiveUsers) refs.metricActiveUsers.textContent = String(overview.active_users || 0);
    if (refs.metricCalibrationAssets) refs.metricCalibrationAssets.textContent = String(overview.calibration_assets || 0);
    if (refs.metricHazmatInventory) refs.metricHazmatInventory.textContent = String(overview.hazmat_inventory || 0);
    if (refs.metricUpcomingCalibrations) refs.metricUpcomingCalibrations.textContent = String(overview.upcoming_calibrations || 0);

    if (refs.overviewSummary) {
      refs.overviewSummary.innerHTML = [
        summaryItem('Local Accounts', overview.total_users || 0, 'Administrators, technicians, and viewers stored in the offline database.'),
        summaryItem('Operational Assets', overview.calibration_assets || 0, 'Calibration assets currently tracked in the local gages database.'),
        summaryItem('Hazmat Records', overview.hazmat_inventory || 0, 'Material inventory entries available in the Hazmat module.'),
        summaryItem('Upcoming Due Window', overview.upcoming_calibrations || 0, 'Calibration assets scheduled inside the next 30 days.'),
      ].join('');
    }
  }

  function renderOverviewSummaryFromUsers() {
    if (!refs.roleDistribution) return;

    const counts = new Map();
    state.users.forEach((user) => {
      const current = counts.get(user.role) || 0;
      counts.set(user.role, current + 1);
    });

    refs.roleDistribution.innerHTML = Array.from(counts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([role, count]) => {
        return `<div class="stack-row"><span>${escapeHtml(role)}</span><strong>${escapeHtml(String(count))}</strong></div>`;
      })
      .join('') || '<div class="stack-row"><span>No users loaded</span><strong>0</strong></div>';
  }

  function summaryItem(label, value, copy) {
    return [
      '<div class="summary-item">',
      `<small>${escapeHtml(label)}</small>`,
      `<strong>${escapeHtml(String(value))}</strong>`,
      `<small>${escapeHtml(copy)}</small>`,
      '</div>',
    ].join('');
  }

  function renderUsers() {
    if (!refs.userTableBody) return;

    const query = String((refs.userSearch && refs.userSearch.value) || '').trim().toLowerCase();
    const moduleMap = moduleDefinitionMap();
    const canEditUsers = hasCapability('canEditUsers');
    const disabledAttr = canEditUsers ? '' : ' disabled aria-disabled="true" title="Admin role required"';

    const rows = state.users.filter((user) => {
      if (!query) return true;
      const accessLabel = inferAccessLevelFromUser(user) === ACCESS_LEVEL_VIEW_EDIT ? 'view edit' : 'view only';
      const haystack = [
        user.username,
        user.display_name,
        user.department,
        user.role,
        accessLabel,
        (user.modules || []).join(' '),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    }).map((user) => {
      const accessLevel = inferAccessLevelFromUser(user);
      const accessLabel = accessLevel === ACCESS_LEVEL_VIEW_EDIT ? 'View + Edit' : 'View Only';
      const accessClass = accessLevel === ACCESS_LEVEL_VIEW_EDIT ? 'view-edit' : 'view-only';
      const moduleBadges = (user.modules || []).map((moduleKey) => {
        const definition = moduleMap.get(moduleKey);
        return `<span class="module-pill">${escapeHtml(definition ? definition.label : moduleKey)}</span>`;
      }).join('');

      return [
        `<tr data-user-id="${escapeHtml(String(user.id))}">`,
        `<td data-label="User"><strong>${escapeHtml(user.display_name || user.username)}</strong><br /><small>${escapeHtml(user.username)}</small></td>`,
        `<td data-label="Department">${escapeHtml(user.department || 'Unassigned')}</td>`,
        `<td data-label="Role">${escapeHtml(user.role_label || user.role)}</td>`,
        `<td data-label="Status"><span class="status-pill ${escapeHtml(user.account_status)}">${escapeHtml(user.account_status)}</span></td>`,
        `<td data-label="Access"><span class="access-pill ${escapeHtml(accessClass)}">${escapeHtml(accessLabel)}</span></td>`,
        `<td data-label="Modules">${moduleBadges || '<span class="module-pill">No modules</span>'}</td>`,
        '<td data-label="Actions">',
        '<div class="table-actions">',
        `<button class="table-button-lite" type="button" data-action="edit"${disabledAttr}>Edit</button>`,
        `<button class="table-button-lite" type="button" data-action="toggle-status"${disabledAttr}>${user.account_status === 'disabled' ? 'Enable' : 'Disable'}</button>`,
        `<button class="table-button-lite" type="button" data-action="reset-password"${disabledAttr}>Reset Password</button>`,
        `<button class="table-button-lite danger" type="button" data-action="delete"${disabledAttr}>Delete</button>`,
        '</div>',
        '</td>',
        '</tr>',
      ].join('');
    });

    refs.userTableBody.innerHTML = rows.join('') || '<tr class="table-empty-row"><td colspan="7">No users found.</td></tr>';
  }

  function roleInputId(prefix, roleKey, itemKey) {
    return [prefix, roleKey, itemKey]
      .map((value) => String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-'))
      .join('-');
  }

  function renderRoles() {
    if (!refs.rolesGrid) return;

    const moduleDefs = state.modules || [];
    const canEditRoles = hasCapability('canEditRoles');
    const usersByRole = new Map();
    state.users.forEach((user) => {
      const roleKey = String(user.role || '');
      if (!usersByRole.has(roleKey)) {
        usersByRole.set(roleKey, []);
      }
      usersByRole.get(roleKey).push(user);
    });

    const selectedUserId = Number(state.selectedRoleUserId || (refs.rolesUserSelect && refs.rolesUserSelect.value) || 0);
    const selectedUser = state.users.find((entry) => Number(entry.id) === selectedUserId) || null;
    const selectedRoleKey = String((selectedUser && selectedUser.role) || '');
    const selectedRoleTemplate = selectedRoleKey
      ? (state.roles || []).find((role) => String(role.key) === selectedRoleKey)
      : null;

    let rolesForRender = state.roles || [];
    let focusNote = '';

    if (selectedUser && selectedRoleTemplate) {
      rolesForRender = [selectedRoleTemplate];
      const roleLabel = selectedRoleTemplate.label || selectedRoleTemplate.key;
      focusNote = '<p class="role-focus-note">Working with: <strong>'
        + escapeHtml(rolesWorkingName(selectedUser) || selectedUser.username)
        + '</strong> | Role: <strong>'
        + escapeHtml(roleLabel)
        + '</strong></p>';
    } else if (selectedUser) {
      focusNote = '<p class="role-focus-note is-warning">Working with: <strong>'
        + escapeHtml(rolesWorkingName(selectedUser) || selectedUser.username)
        + '</strong> | Role: <strong>'
        + escapeHtml(selectedUser.role_label || selectedRoleKey || 'Unknown')
        + '</strong> (template missing, showing all roles)</p>';
    } else if (state.users.length) {
      focusNote = '<p class="role-focus-note is-warning">No user selected. Showing all role templates.</p>';
    }

    const cards = rolesForRender.map((role) => {
      const selectedModules = new Set(Array.isArray(role.modules) ? role.modules : []);
      const selectedPermissions = new Set(Array.isArray(role.permissions) ? role.permissions : []);
      const disabled = canEditRoles ? '' : ' disabled';
      const assignedUsers = usersByRole.get(role.key) || [];

      const moduleOptions = moduleDefs.map((moduleDefinition) => {
        const inputId = roleInputId('role-module', role.key, moduleDefinition.key);
        return [
          `<label class="role-option" for="${escapeHtml(inputId)}">`,
          `<input id="${escapeHtml(inputId)}" type="checkbox" data-role-module value="${escapeHtml(moduleDefinition.key)}"${selectedModules.has(moduleDefinition.key) ? ' checked' : ''}${disabled} />`,
          '<span>',
          `<strong>${escapeHtml(moduleDefinition.label)}</strong>`,
          `<small>${escapeHtml(moduleDefinition.description || '')}</small>`,
          '</span>',
          '</label>',
        ].join('');
      }).join('');

      const permissionOptions = PERMISSION_DEFINITIONS.map((permissionDefinition) => {
        const inputId = roleInputId('role-permission', role.key, permissionDefinition.key);
        return [
          `<label class="role-option compact" for="${escapeHtml(inputId)}">`,
          `<input id="${escapeHtml(inputId)}" type="checkbox" data-role-permission value="${escapeHtml(permissionDefinition.key)}"${selectedPermissions.has(permissionDefinition.key) ? ' checked' : ''}${disabled} />`,
          `<span><strong>${escapeHtml(permissionDefinition.label)}</strong></span>`,
          '</label>',
        ].join('');
      }).join('');

      return [
        `<article class="role-card role-editor" data-role-key="${escapeHtml(role.key)}">`,
        `<small>${escapeHtml(role.key)}</small>`,
        '<div class="role-editor-head">',
        '<label class="role-field">',
        '<span>Role Label</span>',
        `<input class="role-text-input" data-role-label type="text" value="${escapeHtml(role.label || role.key)}"${disabled} />`,
        '</label>',
        '<label class="role-field">',
        '<span>Description</span>',
        `<textarea class="role-textarea" data-role-description rows="3"${disabled}>${escapeHtml(role.description || '')}</textarea>`,
        '</label>',
        '</div>',
        `<p class="role-impact">Assigned users: <strong>${escapeHtml(String(assignedUsers.length))}</strong></p>`,
        '<div class="role-editor-grid">',
        '<section>',
        '<h4>Modules</h4>',
        `<div class="role-options-grid">${moduleOptions}</div>`,
        '</section>',
        '<section>',
        '<h4>Permissions</h4>',
        `<div class="role-options-grid permissions">${permissionOptions}</div>`,
        '</section>',
        '</div>',
        '<div class="role-actions">',
        `<button class="table-button-lite" type="button" data-role-action="save"${disabled}>Save Role</button>`,
        `<button class="table-button-lite" type="button" data-role-action="reset"${disabled}>Reset</button>`,
        '</div>',
        '</article>',
      ].join('');
    });

    const readonly = canEditRoles
      ? ''
      : '<p class="role-readonly-note">Only Admin can edit role templates.</p>';

    refs.rolesGrid.innerHTML = readonly + focusNote + (cards.join('') || '<article class="role-card"><p>No roles available.</p></article>');
  }

  function handleRolesUserSelectChange() {
    const userId = Number((refs.rolesUserSelect && refs.rolesUserSelect.value) || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      if (state.users.length) {
        state.selectedRoleUserId = Number(state.users[0].id);
        renderRolesUserSelect();
      } else {
        state.selectedRoleUserId = 0;
      }
      renderRoles();
      return;
    }

    const user = state.users.find((entry) => Number(entry.id) === userId);
    if (!user) return;

    state.selectedRoleUserId = userId;
    renderRoles();
    setStatus(`Working with: ${rolesWorkingName(user) || user.username}`, 'success');
  }

  function handleUsersUserSelectChange() {
    if (!hasCapability('canEditUsers')) {
      return;
    }

    const userId = Number((refs.usersUserSelect && refs.usersUserSelect.value) || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      state.selectedUserFormId = 0;
      clearUserForm({ preserveUserSelect: true });
      setStatus('Create mode enabled. Select a user to load details.', 'success');
      return;
    }

    const user = state.users.find((entry) => Number(entry.id) === userId);
    if (!user) {
      state.selectedUserFormId = 0;
      clearUserForm({ preserveUserSelect: true });
      return;
    }

    state.selectedUserFormId = userId;
    populateUserForm(user, {
      skipSectionSwitch: true,
      skipFocus: true,
      skipUserSelectSync: true,
    });
    setStatus(`Loaded user: ${rolesWorkingName(user) || user.username}`, 'success');
  }

  function renderDepartments() {
    const canManageDepartments = hasCapability('canManageDepartments');
    const disabledAttr = canManageDepartments ? '' : ' disabled aria-disabled="true" title="Department management permission required"';

    if (refs.departmentOptions) {
      refs.departmentOptions.innerHTML = state.departments.map((department) => {
        return `<option value="${escapeHtml(department.name)}"></option>`;
      }).join('');
    }

    if (!refs.departmentTableBody) return;
    refs.departmentTableBody.innerHTML = state.departments.map((department) => {
      return [
        `<tr data-department-id="${escapeHtml(String(department.id))}">`,
        `<td data-label="Name">${escapeHtml(department.name)}</td>`,
        `<td data-label="Supervisor">${escapeHtml(department.supervisor || 'Unassigned')}</td>`,
        '<td data-label="Actions">',
        '<div class="table-actions">',
        `<button class="table-button-lite" type="button" data-action="edit"${disabledAttr}>Edit</button>`,
        `<button class="table-button-lite" type="button" data-action="delete"${disabledAttr}>Delete</button>`,
        '</div>',
        '</td>',
        '</tr>',
      ].join('');
    }).join('') || '<tr class="table-empty-row"><td colspan="3">No departments found.</td></tr>';
  }

  function clearUserForm(options = {}) {
    if (!hasCapability('canEditUsers')) return;
    if (!refs.userForm) return;

    const preserveUserSelect = Boolean(options.preserveUserSelect);

    refs.userForm.reset();
    if (refs.userId) refs.userId.value = '';
    if (refs.userFormTitle) refs.userFormTitle.textContent = 'Create User';
    if (refs.userRole && refs.userRole.options.length) {
      refs.userRole.selectedIndex = 0;
    }

    if (!preserveUserSelect && refs.usersUserSelect) {
      refs.usersUserSelect.value = '';
      state.selectedUserFormId = 0;
    }

    applyRoleDefaultsToForm();
  }

  function clearDepartmentForm() {
    if (!hasCapability('canManageDepartments')) return;
    if (!refs.departmentForm) return;

    refs.departmentForm.reset();
    if (refs.departmentId) refs.departmentId.value = '';
    if (refs.departmentFormTitle) refs.departmentFormTitle.textContent = 'Create Department';
  }

  function populateUserForm(user, options = {}) {
    if (!hasCapability('canEditUsers')) {
      setStatus('Only Admin can edit users.', 'error');
      return;
    }

    if (refs.userId) refs.userId.value = String(user.id);
    if (refs.userUsername) refs.userUsername.value = user.username || '';
    if (refs.userPassword) refs.userPassword.value = '';
    if (refs.userDisplayName) refs.userDisplayName.value = user.display_name || '';
    if (refs.userDepartment) refs.userDepartment.value = user.department || '';
    if (refs.userRole) refs.userRole.value = user.role || 'Viewer';
    if (refs.userStatus) refs.userStatus.value = user.account_status || 'active';
    if (refs.userAccessLevel) refs.userAccessLevel.value = inferAccessLevelFromUser(user);
    if (refs.userFormTitle) refs.userFormTitle.textContent = `Edit User: ${user.username}`;
    setModuleSelections(user.module_access_provided ? user.module_access : user.modules);

    state.selectedUserFormId = Number(user.id) || 0;
    if (!options.skipUserSelectSync && refs.usersUserSelect) {
      refs.usersUserSelect.value = String(user.id);
    }

    if (!options.skipSectionSwitch) {
      setActiveSection('users');
    }

    if (!options.skipFocus && refs.userUsername) {
      refs.userUsername.focus();
    }
  }

  function populateDepartmentForm(department) {
    if (!hasCapability('canManageDepartments')) {
      setStatus('Department management is read-only for this account.', 'error');
      return;
    }

    if (refs.departmentId) refs.departmentId.value = String(department.id);
    if (refs.departmentName) refs.departmentName.value = department.name || '';
    if (refs.departmentSupervisor) refs.departmentSupervisor.value = department.supervisor || '';
    if (refs.departmentFormTitle) refs.departmentFormTitle.textContent = `Edit Department: ${department.name}`;
    setActiveSection('departments');
    if (refs.departmentName) refs.departmentName.focus();
  }

  async function submitUserForm(event) {
    event.preventDefault();
    if (!hasCapability('canEditUsers')) {
      setStatus('Only Admin can create or edit users.', 'error');
      return;
    }

    const editingId = Number((refs.userId && refs.userId.value) || 0);
    const payload = {
      username: (refs.userUsername && refs.userUsername.value.trim()) || '',
      password: (refs.userPassword && refs.userPassword.value) || '',
      display_name: (refs.userDisplayName && refs.userDisplayName.value.trim()) || '',
      department: (refs.userDepartment && refs.userDepartment.value.trim()) || '',
      role: (refs.userRole && refs.userRole.value) || 'Viewer',
      account_status: (refs.userStatus && refs.userStatus.value) || 'active',
      module_access: selectedModulesFromForm(),
      permission_access: selectedPermissionAccessFromForm(),
    };

    if (!editingId && payload.password.length < 8) {
      setStatus('New users require a password with at least 8 characters.', 'error');
      return;
    }

    if (editingId && !payload.password) {
      delete payload.password;
    }

    try {
      setStatus(editingId ? 'Updating user...' : 'Creating user...', null);
      let savedUserId = editingId;
      if (editingId) {
        const updated = await requestJson(`/api/admin-console/users/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        savedUserId = Number(updated && updated.id) || editingId;
      } else {
        const created = await requestJson('/api/admin-console/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        savedUserId = Number(created && created.id) || 0;
      }

      await Promise.all([refreshUsers(), refreshOverview()]);
      const savedUser = state.users.find((entry) => Number(entry.id) === Number(savedUserId));
      if (savedUser) {
        populateUserForm(savedUser, {
          skipSectionSwitch: true,
          skipFocus: true,
        });
      } else {
        clearUserForm();
      }
      setStatus('User record saved.', 'success');
    } catch (error) {
      setStatus(error.message || 'Failed to save user.', 'error');
    }
  }

  async function handleUserTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    if (!hasCapability('canEditUsers')) {
      setStatus('Only Admin can edit user records.', 'error');
      return;
    }

    const row = button.closest('tr[data-user-id]');
    if (!row) return;
    const userId = Number(row.dataset.userId);
    const user = state.users.find((entry) => Number(entry.id) === userId);
    if (!user) return;

    const action = button.dataset.action;
    if (action === 'edit') {
      populateUserForm(user);
      return;
    }

    if (action === 'toggle-status') {
      const nextStatus = user.account_status === 'disabled' ? 'active' : 'disabled';
      try {
        setStatus('Updating account status...', null);
        await requestJson(`/api/admin-console/users/${user.id}`, {
          method: 'PUT',
          body: JSON.stringify({ account_status: nextStatus }),
        });
        await Promise.all([refreshUsers(), refreshOverview()]);
        setStatus(`User ${nextStatus === 'disabled' ? 'disabled' : 'enabled'}.`, 'success');
      } catch (error) {
        setStatus(error.message || 'Failed to update user status.', 'error');
      }
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm(
        `Delete user ${user.username}? This disables login and removes the account from active user lists. Historical module records will remain.`
      );
      if (!confirmed) return;

      try {
        setStatus('Deleting user...', null);
        await requestJson(`/api/admin-console/users/${user.id}`, {
          method: 'DELETE',
        });

        const editingDeletedUser = Number((refs.userId && refs.userId.value) || 0) === Number(user.id);
        if (editingDeletedUser) {
          clearUserForm();
        }

        await Promise.all([refreshUsers(), refreshOverview()]);
        setStatus(`User deleted: ${rolesWorkingName(user) || user.username}. Historical data retained.`, 'success');
      } catch (error) {
        setStatus(error.message || 'Failed to delete user.', 'error');
      }
      return;
    }

    if (action === 'reset-password') {
      const nextPassword = window.prompt(`Enter a new password for ${user.username}:`, '');
      if (!nextPassword) return;
      try {
        setStatus('Resetting password...', null);
        await requestJson(`/api/admin-console/users/${user.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ password: nextPassword }),
        });
        setStatus('Password reset completed.', 'success');
      } catch (error) {
        setStatus(error.message || 'Failed to reset password.', 'error');
      }
    }
  }

  function collectRolePayloadFromCard(card) {
    const labelInput = card.querySelector('[data-role-label]');
    const descriptionInput = card.querySelector('[data-role-description]');
    const modules = Array.from(card.querySelectorAll('input[data-role-module]:checked')).map((input) => input.value);
    const permissions = Array.from(card.querySelectorAll('input[data-role-permission]:checked')).map((input) => input.value);

    return {
      label: (labelInput && labelInput.value.trim()) || '',
      description: (descriptionInput && descriptionInput.value.trim()) || '',
      modules,
      permissions,
    };
  }

  async function handleRolesGridClick(event) {
    const button = event.target.closest('button[data-role-action]');
    if (!button) return;

    if (!hasCapability('canEditRoles')) {
      setStatus('Only Admin can edit role templates.', 'error');
      return;
    }

    const card = button.closest('.role-editor[data-role-key]');
    if (!card) return;

    const roleKey = card.dataset.roleKey;
    const action = button.dataset.roleAction;

    if (action === 'reset') {
      renderRoles();
      setStatus(`Role template reset: ${roleKey}`, 'success');
      return;
    }

    if (action !== 'save') return;

    try {
      button.disabled = true;
      setStatus(`Saving role template: ${roleKey}...`, null);
      const payload = collectRolePayloadFromCard(card);
      const response = await requestJson(`/api/admin-console/roles/${encodeURIComponent(roleKey)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (Array.isArray(response && response.roles)) {
        state.roles = response.roles;
      } else {
        const roleData = await requestJson('/api/admin-console/roles');
        state.roles = Array.isArray(roleData && roleData.roles) ? roleData.roles : [];
      }

      renderRoleOptions();
      if (!((refs.userId && refs.userId.value) || '')) {
        applyRoleDefaultsToForm();
      }
      renderRoles();
      await Promise.all([refreshUsers(), refreshOverview()]);
      setStatus(`Role template saved: ${roleKey}`, 'success');
    } catch (error) {
      setStatus(error.message || 'Failed to save role template.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function submitDepartmentForm(event) {
    event.preventDefault();
    if (!hasCapability('canManageDepartments')) {
      setStatus('Department management is read-only for this account.', 'error');
      return;
    }

    const editingId = Number((refs.departmentId && refs.departmentId.value) || 0);
    const payload = {
      name: (refs.departmentName && refs.departmentName.value.trim()) || '',
      supervisor: (refs.departmentSupervisor && refs.departmentSupervisor.value.trim()) || '',
    };

    try {
      setStatus(editingId ? 'Updating department...' : 'Creating department...', null);
      if (editingId) {
        await requestJson(`/api/admin-console/departments/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson('/api/admin-console/departments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      clearDepartmentForm();
      await refreshDepartments();
      setStatus('Department saved.', 'success');
    } catch (error) {
      setStatus(error.message || 'Failed to save department.', 'error');
    }
  }

  async function handleDepartmentTableClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    if (!hasCapability('canManageDepartments')) {
      setStatus('Department management is read-only for this account.', 'error');
      return;
    }

    const row = button.closest('tr[data-department-id]');
    if (!row) return;
    const departmentId = Number(row.dataset.departmentId);
    const department = state.departments.find((entry) => Number(entry.id) === departmentId);
    if (!department) return;

    if (button.dataset.action === 'edit') {
      populateDepartmentForm(department);
      return;
    }

    if (button.dataset.action === 'delete') {
      const confirmed = window.confirm(`Delete department ${department.name}?`);
      if (!confirmed) return;
      try {
        setStatus('Deleting department...', null);
        await requestJson(`/api/admin-console/departments/${department.id}`, {
          method: 'DELETE',
        });
        clearDepartmentForm();
        await refreshDepartments();
        setStatus('Department deleted.', 'success');
      } catch (error) {
        setStatus(error.message || 'Failed to delete department.', 'error');
      }
    }
  }

  async function handleSignOut() {
    try {
      await requestJson('/api/logout', {
        method: 'POST',
      });
    } catch (error) {
    }
    clearToken();
    redirectToLogin();
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