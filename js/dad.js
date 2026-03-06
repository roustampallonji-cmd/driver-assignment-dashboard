/**
 * Driver Assignment Dashboard — MyGeotab Page Add-In
 * Provides real-time visibility into driver-vehicle assignments.
 */
geotab.addin.driverAssignmentDashboard = function () {
  'use strict';

  // ── State ──
  var api, state;

  function initState() {
    state = {
      drivers: [],        // User objects (isDriver)
      devices: {},        // id → Device
      groups: [],         // Group objects
      statusInfos: [],    // DeviceStatusInfo
      driverChanges: [],  // DriverChange (30-day)
      rows: [],           // processed row data
      filtered: [],       // after search/filter
      selected: new Set(),
      sortCol: 'name',
      sortDir: 'asc',
      searchTerm: '',
      groupFilter: '',
      timelineDriverId: null
    };
  }

  // ── DOM refs ──
  var dom = {};

  function cacheDom() {
    var ids = [
      'dad-search', 'dad-group-filter', 'dad-tbody', 'dad-select-all',
      'dad-loading', 'dad-error', 'dad-no-results', 'dad-action-bar',
      'dad-selected-count', 'dad-btn-email', 'dad-btn-export', 'dad-btn-clear',
      'dad-refresh-btn', 'dad-last-refresh',
      'dad-stat-total', 'dad-stat-assigned', 'dad-stat-unassigned',
      'dad-timeline-overlay', 'dad-timeline-panel', 'dad-timeline-title',
      'dad-timeline-close', 'dad-timeline-from', 'dad-timeline-to',
      'dad-timeline-apply', 'dad-timeline-loading', 'dad-timeline-body',
      'dad-email-modal', 'dad-email-to', 'dad-email-subject',
      'dad-email-content', 'dad-email-send', 'dad-email-cancel', 'dad-email-close'
    ];
    ids.forEach(function (id) {
      dom[id] = document.getElementById(id);
    });
    dom.sortHeaders = document.querySelectorAll('.dad-sortable');
  }

  // ── Helpers ──
  function show(el) { el && el.classList.remove('dad-hidden'); }
  function hide(el) { el && el.classList.add('dad-hidden'); }

  function formatDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDateShort(d) {
    if (!d) return '—';
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function toISODate(d) {
    return d.toISOString().split('T')[0];
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(s));
    return div.innerHTML;
  }

  function driverDisplayName(user) {
    return (user.firstName || '') + ' ' + (user.lastName || '');
  }

  // ── Data Loading ──
  function loadData() {
    show(dom['dad-loading']);
    hide(dom['dad-error']);
    dom['dad-refresh-btn'].classList.add('dad-spinning');

    var now = new Date();
    var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    var calls = [
      ['Get', { typeName: 'User', search: { isDriver: true } }],
      ['Get', { typeName: 'Device' }],
      ['Get', { typeName: 'DeviceStatusInfo' }],
      ['Get', { typeName: 'Group' }],
      ['Get', {
        typeName: 'DriverChange',
        search: {
          fromDate: thirtyDaysAgo.toISOString(),
          toDate: now.toISOString(),
          includeOverlappedChanges: true
        }
      }]
    ];

    api.multiCall(calls, function (results) {
      state.drivers = results[0] || [];
      var deviceList = results[1] || [];
      state.statusInfos = results[2] || [];
      state.groups = results[3] || [];
      state.driverChanges = results[4] || [];

      // Build device lookup
      state.devices = {};
      deviceList.forEach(function (d) {
        state.devices[d.id] = d;
      });

      processData();
      populateGroupFilter();
      applyFilters();
      updateStats();

      hide(dom['dad-loading']);
      dom['dad-refresh-btn'].classList.remove('dad-spinning');
      dom['dad-last-refresh'].textContent = 'Last refreshed: ' + formatDate(new Date());
    }, function (err) {
      hide(dom['dad-loading']);
      dom['dad-refresh-btn'].classList.remove('dad-spinning');
      showError('Failed to load data: ' + (err.message || err));
    });
  }

  function processData() {
    // Build driver→current status map from DeviceStatusInfo
    var driverStatusMap = {};
    state.statusInfos.forEach(function (si) {
      if (si.driver && si.driver.id && si.driver.id !== 'UnknownDriverId') {
        driverStatusMap[si.driver.id] = si;
      }
    });

    // Build driver→latest change from DriverChange for assigned-since time
    var driverLatestChange = {};
    state.driverChanges.forEach(function (dc) {
      if (dc.driver && dc.driver.id) {
        var existing = driverLatestChange[dc.driver.id];
        if (!existing || new Date(dc.dateTime) > new Date(existing.dateTime)) {
          driverLatestChange[dc.driver.id] = dc;
        }
      }
    });

    state.rows = state.drivers.map(function (driver) {
      var statusInfo = driverStatusMap[driver.id];
      var latestChange = driverLatestChange[driver.id];
      var isAssigned = !!statusInfo && statusInfo.device &&
        statusInfo.device.id && statusInfo.device.id !== 'NoDeviceId';
      var device = isAssigned ? state.devices[statusInfo.device.id] : null;
      var vehicleName = device ? device.name : '—';

      var assignedSince = null;
      var unassignedAt = null;

      if (latestChange) {
        if (isAssigned) {
          assignedSince = latestChange.dateTime;
        } else {
          unassignedAt = latestChange.dateTime;
        }
      }

      // Get driver groups
      var driverGroups = [];
      if (driver.companyGroups) {
        driver.companyGroups.forEach(function (g) {
          driverGroups.push(g.id);
        });
      }
      if (driver.driverGroups) {
        driver.driverGroups.forEach(function (g) {
          driverGroups.push(g.id);
        });
      }

      return {
        id: driver.id,
        name: driverDisplayName(driver).trim(),
        vehicle: vehicleName,
        assignedSince: assignedSince,
        unassignedAt: unassignedAt,
        status: isAssigned ? 'Assigned' : 'Unassigned',
        groups: driverGroups,
        raw: driver
      };
    }).filter(function (r) { return r.name.length > 0; });

    // Sort by name initially
    sortRows();
  }

  // ── Group Filter ──
  function populateGroupFilter() {
    var select = dom['dad-group-filter'];
    // Clear existing options except first
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Build group hierarchy
    var groupMap = {};
    state.groups.forEach(function (g) {
      groupMap[g.id] = g;
    });

    // Find root groups and build tree
    var rootGroups = state.groups.filter(function (g) {
      return !g.parent || g.parent.id === 'GroupCompanyId';
    });

    function addGroupOptions(groups, depth) {
      groups.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
      groups.forEach(function (g) {
        if (!g.name || g.name === 'Company Group') return;
        var opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = '\u00A0\u00A0'.repeat(depth) + (g.name || g.id);
        select.appendChild(opt);

        // Find children
        var children = state.groups.filter(function (child) {
          return child.parent && child.parent.id === g.id;
        });
        if (children.length) {
          addGroupOptions(children, depth + 1);
        }
      });
    }

    addGroupOptions(rootGroups, 0);
  }

  // ── Filtering & Sorting ──
  function applyFilters() {
    var term = state.searchTerm.toLowerCase();
    var group = state.groupFilter;

    state.filtered = state.rows.filter(function (row) {
      // Search filter
      if (term && row.name.toLowerCase().indexOf(term) === -1) {
        return false;
      }
      // Group filter
      if (group && row.groups.indexOf(group) === -1) {
        // Also check child groups
        var childIds = getChildGroupIds(group);
        var inChild = false;
        for (var i = 0; i < row.groups.length; i++) {
          if (childIds.indexOf(row.groups[i]) !== -1) {
            inChild = true;
            break;
          }
        }
        if (!inChild) return false;
      }
      return true;
    });

    renderTable();
    updateStats();
    updateActionBar();
  }

  function getChildGroupIds(parentId) {
    var ids = [parentId];
    state.groups.forEach(function (g) {
      if (g.parent && g.parent.id === parentId) {
        ids = ids.concat(getChildGroupIds(g.id));
      }
    });
    return ids;
  }

  function sortRows() {
    var col = state.sortCol;
    var dir = state.sortDir === 'asc' ? 1 : -1;

    state.rows.sort(function (a, b) {
      var va = a[col] || '';
      var vb = b[col] || '';

      if (col === 'assignedSince' || col === 'unassignedAt') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
        return (va - vb) * dir;
      }

      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function onSort(e) {
    var th = e.currentTarget;
    var col = th.getAttribute('data-sort');
    if (!col) return;

    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }

    // Update header classes
    dom.sortHeaders.forEach(function (h) {
      h.classList.remove('dad-sort-asc', 'dad-sort-desc');
    });
    th.classList.add('dad-sort-' + state.sortDir);

    sortRows();
    applyFilters();
  }

  // ── Rendering ──
  function renderTable() {
    var tbody = dom['dad-tbody'];
    var fragment = document.createDocumentFragment();

    if (state.filtered.length === 0) {
      tbody.innerHTML = '';
      show(dom['dad-no-results']);
      return;
    }

    hide(dom['dad-no-results']);

    state.filtered.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', row.id);
      if (state.selected.has(row.id)) {
        tr.classList.add('dad-row-selected');
      }

      // Checkbox cell
      var tdCheck = document.createElement('td');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selected.has(row.id);
      cb.addEventListener('change', function () {
        toggleRow(row.id);
      });
      tdCheck.appendChild(cb);
      tr.appendChild(tdCheck);

      // Name cell
      var tdName = document.createElement('td');
      var nameLink = document.createElement('a');
      nameLink.className = 'dad-driver-name';
      nameLink.textContent = row.name;
      nameLink.href = '#';
      nameLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        openTimeline(row.id, row.name);
      });
      tdName.appendChild(nameLink);
      tr.appendChild(tdName);

      // Vehicle cell
      var tdVehicle = document.createElement('td');
      tdVehicle.textContent = row.vehicle;
      tr.appendChild(tdVehicle);

      // Assigned Since cell
      var tdSince = document.createElement('td');
      tdSince.textContent = formatDate(row.assignedSince);
      tr.appendChild(tdSince);

      // Unassigned At cell
      var tdUnsigned = document.createElement('td');
      tdUnsigned.textContent = formatDate(row.unassignedAt);
      tr.appendChild(tdUnsigned);

      // Status cell
      var tdStatus = document.createElement('td');
      var pill = document.createElement('span');
      pill.className = 'dad-status-pill ' +
        (row.status === 'Assigned' ? 'dad-status-assigned' : 'dad-status-unassigned');
      pill.textContent = row.status;
      tdStatus.appendChild(pill);
      tr.appendChild(tdStatus);

      fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  }

  // ── Stats ──
  function updateStats() {
    var total = state.filtered.length;
    var assigned = state.filtered.filter(function (r) { return r.status === 'Assigned'; }).length;
    var unassigned = total - assigned;

    dom['dad-stat-total'].innerHTML = 'Total: <strong>' + total + '</strong>';
    dom['dad-stat-assigned'].innerHTML = 'Assigned: <strong>' + assigned + '</strong>';
    dom['dad-stat-unassigned'].innerHTML = 'Unassigned: <strong>' + unassigned + '</strong>';
  }

  // ── Selection ──
  function toggleRow(id) {
    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.add(id);
    }
    updateRowHighlight(id);
    updateActionBar();
    updateSelectAllCheckbox();
  }

  function updateRowHighlight(id) {
    var tr = dom['dad-tbody'].querySelector('tr[data-id="' + id + '"]');
    if (!tr) return;
    var cb = tr.querySelector('input[type="checkbox"]');
    if (state.selected.has(id)) {
      tr.classList.add('dad-row-selected');
      if (cb) cb.checked = true;
    } else {
      tr.classList.remove('dad-row-selected');
      if (cb) cb.checked = false;
    }
  }

  function updateSelectAllCheckbox() {
    var allSelected = state.filtered.length > 0 &&
      state.filtered.every(function (r) { return state.selected.has(r.id); });
    dom['dad-select-all'].checked = allSelected;
  }

  function selectAll(checked) {
    state.filtered.forEach(function (row) {
      if (checked) {
        state.selected.add(row.id);
      } else {
        state.selected.delete(row.id);
      }
    });
    renderTable();
    updateActionBar();
  }

  function clearSelection() {
    state.selected.clear();
    dom['dad-select-all'].checked = false;
    renderTable();
    updateActionBar();
  }

  function updateActionBar() {
    if (state.selected.size > 0) {
      show(dom['dad-action-bar']);
      dom['dad-selected-count'].textContent = state.selected.size + ' selected';
    } else {
      hide(dom['dad-action-bar']);
    }
  }

  // ── Timeline Panel ──
  function openTimeline(driverId, driverName) {
    state.timelineDriverId = driverId;
    dom['dad-timeline-title'].textContent = driverName + ' — Timeline';

    // Set default date range: 30 days
    var now = new Date();
    var thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dom['dad-timeline-from'].value = toISODate(thirtyAgo);
    dom['dad-timeline-to'].value = toISODate(now);

    show(dom['dad-timeline-overlay']);
    loadTimeline(driverId, thirtyAgo, now);
  }

  function closeTimeline() {
    hide(dom['dad-timeline-overlay']);
    state.timelineDriverId = null;
  }

  function loadTimeline(driverId, fromDate, toDate) {
    show(dom['dad-timeline-loading']);
    dom['dad-timeline-body'].innerHTML = '';

    api.call('Get', {
      typeName: 'DriverChange',
      search: {
        userSearch: { id: driverId },
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        includeOverlappedChanges: true
      }
    }, function (changes) {
      hide(dom['dad-timeline-loading']);
      renderTimeline(changes || []);
    }, function (err) {
      hide(dom['dad-timeline-loading']);
      dom['dad-timeline-body'].innerHTML =
        '<div class="dad-timeline-empty">Error loading timeline: ' +
        escapeHtml(err.message || String(err)) + '</div>';
    });
  }

  function renderTimeline(changes) {
    var body = dom['dad-timeline-body'];

    if (changes.length === 0) {
      body.innerHTML = '<div class="dad-timeline-empty">No assignment changes found for this date range.</div>';
      return;
    }

    // Sort chronologically (newest first)
    changes.sort(function (a, b) {
      return new Date(b.dateTime) - new Date(a.dateTime);
    });

    var list = document.createElement('div');
    list.className = 'dad-timeline-list';

    changes.forEach(function (change) {
      var device = change.device ? state.devices[change.device.id] : null;
      var deviceName = device ? device.name : (change.device ? change.device.id : 'Unknown');
      var isAssign = change.type === 'DriverChange' ||
        (change.device && change.device.id && change.device.id !== 'NoDeviceId');

      var item = document.createElement('div');
      item.className = 'dad-timeline-item ' +
        (isAssign ? 'dad-timeline-assign' : 'dad-timeline-unassign');

      var card = document.createElement('div');
      card.className = 'dad-timeline-card';

      var dateEl = document.createElement('div');
      dateEl.className = 'dad-timeline-date';
      dateEl.textContent = formatDate(change.dateTime);

      var vehicleEl = document.createElement('div');
      vehicleEl.className = 'dad-timeline-vehicle';
      vehicleEl.textContent = deviceName;

      var typeEl = document.createElement('div');
      typeEl.className = 'dad-timeline-type';
      typeEl.textContent = isAssign ? 'Assigned to vehicle' : 'Unassigned from vehicle';

      card.appendChild(dateEl);
      card.appendChild(vehicleEl);
      card.appendChild(typeEl);
      item.appendChild(card);
      list.appendChild(item);
    });

    body.innerHTML = '';
    body.appendChild(list);
  }

  // ── Email ──
  function openEmailModal() {
    var selectedRows = getSelectedRows();
    if (selectedRows.length === 0) return;

    var subject = 'Driver Assignment Update — ' + formatDateShort(new Date());
    var body = 'Driver Assignment Report\n';
    body += '========================\n\n';

    selectedRows.forEach(function (row) {
      body += 'Driver: ' + row.name + '\n';
      body += 'Vehicle: ' + row.vehicle + '\n';
      body += 'Status: ' + row.status + '\n';
      if (row.assignedSince) {
        body += 'Assigned Since: ' + formatDate(row.assignedSince) + '\n';
      }
      if (row.unassignedAt) {
        body += 'Unassigned At: ' + formatDate(row.unassignedAt) + '\n';
      }
      body += '\n---\n\n';
    });

    body += 'Generated by Driver Assignment Dashboard\n';

    dom['dad-email-subject'].value = subject;
    dom['dad-email-content'].value = body;
    dom['dad-email-to'].value = '';

    show(dom['dad-email-modal']);
  }

  function closeEmailModal() {
    hide(dom['dad-email-modal']);
  }

  function sendEmail() {
    var to = dom['dad-email-to'].value || '';
    var subject = encodeURIComponent(dom['dad-email-subject'].value);
    var body = encodeURIComponent(dom['dad-email-content'].value);
    var mailto = 'mailto:' + encodeURIComponent(to) + '?subject=' + subject + '&body=' + body;
    window.open(mailto, '_blank');
    closeEmailModal();
  }

  // ── CSV Export ──
  function exportCSV() {
    var rows = getSelectedRows();
    if (rows.length === 0) {
      rows = state.filtered;
    }

    var headers = ['Driver Name', 'Current Vehicle', 'Assigned Since', 'Unassigned At', 'Status'];
    var csv = headers.join(',') + '\n';

    rows.forEach(function (row) {
      var line = [
        '"' + (row.name || '').replace(/"/g, '""') + '"',
        '"' + (row.vehicle || '').replace(/"/g, '""') + '"',
        '"' + formatDate(row.assignedSince) + '"',
        '"' + formatDate(row.unassignedAt) + '"',
        '"' + row.status + '"'
      ];
      csv += line.join(',') + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'driver-assignments-' + toISODate(new Date()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getSelectedRows() {
    return state.filtered.filter(function (r) {
      return state.selected.has(r.id);
    });
  }

  // ── Error ──
  function showError(msg) {
    dom['dad-error'].textContent = msg;
    show(dom['dad-error']);
  }

  // ── Event Binding ──
  function bindEvents() {
    // Search
    dom['dad-search'].addEventListener('input', function () {
      state.searchTerm = this.value;
      applyFilters();
    });

    // Group filter
    dom['dad-group-filter'].addEventListener('change', function () {
      state.groupFilter = this.value;
      applyFilters();
    });

    // Sort headers
    dom.sortHeaders.forEach(function (th) {
      th.addEventListener('click', onSort);
    });

    // Select all
    dom['dad-select-all'].addEventListener('change', function () {
      selectAll(this.checked);
    });

    // Action buttons
    dom['dad-btn-email'].addEventListener('click', openEmailModal);
    dom['dad-btn-export'].addEventListener('click', exportCSV);
    dom['dad-btn-clear'].addEventListener('click', clearSelection);

    // Refresh
    dom['dad-refresh-btn'].addEventListener('click', function () {
      initState();
      clearSelection();
      loadData();
    });

    // Timeline
    dom['dad-timeline-close'].addEventListener('click', closeTimeline);
    dom['dad-timeline-overlay'].addEventListener('click', function (e) {
      if (e.target === dom['dad-timeline-overlay']) {
        closeTimeline();
      }
    });
    dom['dad-timeline-apply'].addEventListener('click', function () {
      var from = new Date(dom['dad-timeline-from'].value);
      var to = new Date(dom['dad-timeline-to'].value);
      to.setHours(23, 59, 59, 999);
      if (state.timelineDriverId && !isNaN(from.getTime()) && !isNaN(to.getTime())) {
        loadTimeline(state.timelineDriverId, from, to);
      }
    });

    // Email modal
    dom['dad-email-close'].addEventListener('click', closeEmailModal);
    dom['dad-email-cancel'].addEventListener('click', closeEmailModal);
    dom['dad-email-send'].addEventListener('click', sendEmail);
    dom['dad-email-modal'].addEventListener('click', function (e) {
      if (e.target === dom['dad-email-modal']) {
        closeEmailModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!dom['dad-email-modal'].classList.contains('dad-hidden')) {
          closeEmailModal();
        } else if (!dom['dad-timeline-overlay'].classList.contains('dad-hidden')) {
          closeTimeline();
        }
      }
    });
  }

  // ── Add-In Lifecycle ──
  return {
    initialize: function (freshApi, pageState, callback) {
      api = freshApi;

      initState();
      cacheDom();
      bindEvents();

      // Set initial sort indicator
      var firstSortable = document.querySelector('.dad-sortable[data-sort="name"]');
      if (firstSortable) firstSortable.classList.add('dad-sort-asc');

      loadData();
      callback();
    },

    focus: function (freshApi) {
      api = freshApi;
      // Optionally refresh on focus
    },

    blur: function () {
      // Cleanup if needed
    }
  };
};
