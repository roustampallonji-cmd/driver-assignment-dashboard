/**
 * Driver Assignment Dashboard — MyGeotab Page Add-In
 * Provides real-time visibility into driver-vehicle assignments.
 */
geotab.addin.driverAssignmentDashboard = function () {
  'use strict';

  // ── Constants ──
  var ADDIN_GUID = 'aECbVRyP_h0SwqL4l2-B5EQ';
  var RULE_TYPE = 'driverAssignmentNotification';

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
      timelineDriverId: null,
      notifRules: [],
      adminUsers: [],
      currentUser: null,
      liveMinutes: 5,
      liveChanges: [],
      liveTimer: null
    };
  }

  // ── DOM refs ──
  var dom = {};

  function cacheDom() {
    var ids = [
      'dad-search', 'dad-group-filter', 'dad-tbody', 'dad-select-all',
      'dad-loading', 'dad-error', 'dad-no-results', 'dad-action-bar',
      'dad-selected-count', 'dad-btn-notif', 'dad-btn-export', 'dad-btn-clear',
      'dad-refresh-btn', 'dad-last-refresh',
      'dad-stat-total', 'dad-stat-assigned', 'dad-stat-unassigned',
      'dad-live-feed', 'dad-live-empty',
      'dad-notif-modal', 'dad-notif-close', 'dad-notif-recipient',
      'dad-notif-email', 'dad-notif-assign', 'dad-notif-unassign',
      'dad-notif-error', 'dad-notif-rules-loading', 'dad-notif-rules-empty',
      'dad-notif-rules-list', 'dad-notif-add', 'dad-notif-cancel'
    ];
    ids.forEach(function (id) {
      dom[id] = document.getElementById(id);
    });
    dom.sortHeaders = document.querySelectorAll('.dad-sortable');
    dom.liveFilters = document.querySelectorAll('.dad-live-filter');
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

      // Load live activity feed
      loadLiveActivity();
      startLiveTimer();
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
        toggleTimeline(row.id, row.name, nameLink);
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

    var totalCard = dom['dad-stat-total'];
    var assignedCard = dom['dad-stat-assigned'];
    var unassignedCard = dom['dad-stat-unassigned'];
    if (totalCard) totalCard.querySelector('.dad-stat-value').textContent = total;
    if (assignedCard) assignedCard.querySelector('.dad-stat-value').textContent = assigned;
    if (unassignedCard) unassignedCard.querySelector('.dad-stat-value').textContent = unassigned;
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

  // ── Inline Timeline Expansion ──
  function toggleTimeline(driverId, driverName, nameLink) {
    var tbody = dom['dad-tbody'];
    var driverRow = tbody.querySelector('tr[data-id="' + driverId + '"]');
    if (!driverRow) return;

    // Check if already expanded
    var existingExpand = driverRow.nextElementSibling;
    if (existingExpand && existingExpand.classList.contains('dad-expand-row')) {
      // Collapse
      existingExpand.remove();
      nameLink.classList.remove('dad-expanded');
      state.timelineDriverId = null;
      return;
    }

    // Collapse any other open expansion
    var prevExpand = tbody.querySelector('.dad-expand-row');
    if (prevExpand) {
      prevExpand.remove();
      var prevLink = tbody.querySelector('.dad-driver-name.dad-expanded');
      if (prevLink) prevLink.classList.remove('dad-expanded');
    }

    // Create expand row
    state.timelineDriverId = driverId;
    nameLink.classList.add('dad-expanded');

    var expandRow = document.createElement('tr');
    expandRow.className = 'dad-expand-row';
    var expandTd = document.createElement('td');
    expandTd.setAttribute('colspan', '6');

    var content = document.createElement('div');
    content.className = 'dad-expand-content';

    // Header with date controls
    var header = document.createElement('div');
    header.className = 'dad-expand-header';

    var title = document.createElement('div');
    title.className = 'dad-expand-title';
    title.textContent = 'Assignment History';

    var controls = document.createElement('div');
    controls.className = 'dad-expand-controls';

    var now = new Date();
    var thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    var fromLabel = document.createElement('label');
    fromLabel.textContent = 'From: ';
    var fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.value = toISODate(thirtyAgo);
    fromLabel.appendChild(fromInput);

    var toLabel = document.createElement('label');
    toLabel.textContent = 'To: ';
    var toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.value = toISODate(now);
    toLabel.appendChild(toInput);

    var applyBtn = document.createElement('button');
    applyBtn.className = 'dad-expand-apply';
    applyBtn.textContent = 'Apply';

    controls.appendChild(fromLabel);
    controls.appendChild(toLabel);
    controls.appendChild(applyBtn);

    header.appendChild(title);
    header.appendChild(controls);
    content.appendChild(header);

    // Timeline body container
    var timelineBody = document.createElement('div');
    timelineBody.className = 'dad-expand-timeline-body';
    content.appendChild(timelineBody);

    expandTd.appendChild(content);
    expandRow.appendChild(expandTd);

    // Insert after the driver row
    driverRow.parentNode.insertBefore(expandRow, driverRow.nextSibling);

    // Load timeline data
    loadInlineTimeline(driverId, thirtyAgo, now, timelineBody);

    // Apply button handler
    applyBtn.addEventListener('click', function () {
      var from = new Date(fromInput.value);
      var to = new Date(toInput.value);
      to.setHours(23, 59, 59, 999);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        loadInlineTimeline(driverId, from, to, timelineBody);
      }
    });
  }

  function loadInlineTimeline(driverId, fromDate, toDate, container) {
    container.innerHTML = '<div class="dad-expand-loading"><div class="dad-spinner dad-spinner-sm"></div><span>Loading timeline...</span></div>';

    api.call('Get', {
      typeName: 'DriverChange',
      search: {
        userSearch: { id: driverId },
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        includeOverlappedChanges: true
      }
    }, function (changes) {
      renderInlineTimeline(changes || [], container);
    }, function (err) {
      container.innerHTML =
        '<div class="dad-timeline-empty">Error loading timeline: ' +
        escapeHtml(err.message || String(err)) + '</div>';
    });
  }

  function renderInlineTimeline(changes, container) {
    container.innerHTML = '';

    if (changes.length === 0) {
      container.innerHTML = '<div class="dad-timeline-empty">No assignment changes found for this date range.</div>';
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
      typeEl.textContent = isAssign ? 'Assigned' : 'Unassigned';

      card.appendChild(dateEl);
      card.appendChild(vehicleEl);
      card.appendChild(typeEl);
      item.appendChild(card);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  // ── Live Activity Feed ──
  function formatRelativeTime(dateStr) {
    var now = new Date();
    var dt = new Date(dateStr);
    var diffMs = now - dt;
    var diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + ' min ago';
    var diffHr = Math.floor(diffMin / 60);
    return diffHr + ' hr ago';
  }

  function loadLiveActivity() {
    var now = new Date();
    var from = new Date(now.getTime() - state.liveMinutes * 60 * 1000);

    api.call('Get', {
      typeName: 'DriverChange',
      search: {
        fromDate: from.toISOString(),
        toDate: now.toISOString(),
        includeOverlappedChanges: true
      }
    }, function (changes) {
      state.liveChanges = (changes || []).sort(function (a, b) {
        return new Date(b.dateTime) - new Date(a.dateTime);
      });
      renderLiveActivity();
    }, function () {
      // Silently fail — don't disrupt main UI
      state.liveChanges = [];
      renderLiveActivity();
    });
  }

  function renderLiveActivity() {
    var feed = dom['dad-live-feed'];
    var empty = dom['dad-live-empty'];
    feed.innerHTML = '';

    if (state.liveChanges.length === 0) {
      show(empty);
      return;
    }
    hide(empty);

    // Add column header row
    var headerRow = document.createElement('div');
    headerRow.className = 'dad-live-row dad-live-row-header';
    headerRow.innerHTML =
      '<div class="dad-live-col dad-live-col-name">Driver Name</div>' +
      '<div class="dad-live-col dad-live-col-vehicle">Current Vehicle</div>' +
      '<div class="dad-live-col dad-live-col-since">Assigned Since</div>' +
      '<div class="dad-live-col dad-live-col-at">Unassigned At</div>' +
      '<div class="dad-live-col dad-live-col-status">Status</div>' +
      '<div class="dad-live-col dad-live-col-time">When</div>';
    feed.appendChild(headerRow);

    state.liveChanges.forEach(function (change) {
      var driver = change.driver ? findDriverById(change.driver.id) : null;
      var driverName = driver ? driverDisplayName(driver).trim() : (change.driver ? change.driver.id : 'Unknown');
      var device = change.device ? state.devices[change.device.id] : null;
      var deviceName = device ? device.name : (change.device ? change.device.id : 'Unknown');
      var isAssign = change.device && change.device.id && change.device.id !== 'NoDeviceId';

      var row = document.createElement('div');
      row.className = 'dad-live-row';

      // Driver Name
      var colName = document.createElement('div');
      colName.className = 'dad-live-col dad-live-col-name';
      colName.innerHTML = '<strong>' + escapeHtml(driverName) + '</strong>';

      // Current Vehicle
      var colVehicle = document.createElement('div');
      colVehicle.className = 'dad-live-col dad-live-col-vehicle';
      colVehicle.textContent = isAssign ? deviceName : '—';

      // Assigned Since
      var colSince = document.createElement('div');
      colSince.className = 'dad-live-col dad-live-col-since';
      colSince.textContent = isAssign ? formatDate(change.dateTime) : '—';

      // Unassigned At
      var colAt = document.createElement('div');
      colAt.className = 'dad-live-col dad-live-col-at';
      colAt.textContent = isAssign ? '—' : formatDate(change.dateTime);

      // Status
      var colStatus = document.createElement('div');
      colStatus.className = 'dad-live-col dad-live-col-status';
      var pill = document.createElement('span');
      pill.className = 'dad-status-pill ' + (isAssign ? 'dad-status-assigned' : 'dad-status-unassigned');
      pill.textContent = isAssign ? 'Assigned' : 'Unassigned';
      colStatus.appendChild(pill);

      // When (relative time)
      var colTime = document.createElement('div');
      colTime.className = 'dad-live-col dad-live-col-time';
      colTime.textContent = formatRelativeTime(change.dateTime);

      row.appendChild(colName);
      row.appendChild(colVehicle);
      row.appendChild(colSince);
      row.appendChild(colAt);
      row.appendChild(colStatus);
      row.appendChild(colTime);
      feed.appendChild(row);
    });
  }

  function findDriverById(id) {
    for (var i = 0; i < state.drivers.length; i++) {
      if (state.drivers[i].id === id) return state.drivers[i];
    }
    return null;
  }

  function startLiveTimer() {
    stopLiveTimer();
    state.liveTimer = setInterval(function () {
      loadLiveActivity();
    }, 30000); // refresh every 30 seconds
  }

  function stopLiveTimer() {
    if (state.liveTimer) {
      clearInterval(state.liveTimer);
      state.liveTimer = null;
    }
  }

  // ── Notification Rules ──
  function openNotifModal() {
    hide(dom['dad-notif-error']);
    show(dom['dad-notif-modal']);
    loadAdminUsers();
    loadNotifRules();
  }

  function closeNotifModal() {
    hide(dom['dad-notif-modal']);
  }

  function showNotifError(msg) {
    dom['dad-notif-error'].textContent = msg;
    show(dom['dad-notif-error']);
  }

  function loadAdminUsers() {
    if (state.adminUsers.length > 0) {
      populateRecipientDropdown();
      return;
    }
    api.call('Get', {
      typeName: 'User',
      search: { isDriver: false }
    }, function (users) {
      state.adminUsers = (users || []).filter(function (u) {
        return u.name && u.name.indexOf('@') !== -1;
      }).sort(function (a, b) {
        var na = (a.firstName || '') + ' ' + (a.lastName || '');
        var nb = (b.firstName || '') + ' ' + (b.lastName || '');
        return na.localeCompare(nb);
      });
      populateRecipientDropdown();
    }, function (err) {
      showNotifError('Failed to load admin users: ' + (err.message || err));
    });
  }

  function populateRecipientDropdown() {
    var sel = dom['dad-notif-recipient'];
    while (sel.options.length > 1) {
      sel.remove(1);
    }
    state.adminUsers.forEach(function (u) {
      var opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = (u.firstName || '') + ' ' + (u.lastName || '') + ' (' + u.name + ')';
      opt.setAttribute('data-email', u.name);
      sel.appendChild(opt);
    });
  }

  function loadNotifRules() {
    show(dom['dad-notif-rules-loading']);
    hide(dom['dad-notif-rules-empty']);
    dom['dad-notif-rules-list'].innerHTML = '';

    api.call('Get', {
      typeName: 'AddInData',
      search: { addInId: ADDIN_GUID }
    }, function (results) {
      hide(dom['dad-notif-rules-loading']);
      state.notifRules = (results || []).filter(function (r) {
        return r.details && r.details.ruleType === RULE_TYPE;
      });
      renderNotifRules();
    }, function (err) {
      hide(dom['dad-notif-rules-loading']);
      showNotifError('Failed to load rules: ' + (err.message || err));
    });
  }

  function renderNotifRules() {
    var container = dom['dad-notif-rules-list'];
    container.innerHTML = '';

    if (state.notifRules.length === 0) {
      show(dom['dad-notif-rules-empty']);
      return;
    }
    hide(dom['dad-notif-rules-empty']);

    state.notifRules.forEach(function (rule) {
      var d = rule.details;
      var card = document.createElement('div');
      card.className = 'dad-notif-rule-card';

      var info = document.createElement('div');
      info.className = 'dad-notif-rule-info';

      var recipientEl = document.createElement('div');
      recipientEl.className = 'dad-notif-rule-recipient';
      recipientEl.textContent = d.recipientName || d.recipientEmail;

      var scopeEl = document.createElement('div');
      scopeEl.className = 'dad-notif-rule-scope';
      scopeEl.textContent = d.driverId ? 'Driver: ' + d.driverName : 'All Drivers';

      var eventsEl = document.createElement('div');
      eventsEl.className = 'dad-notif-rule-events';
      var events = [];
      if (d.notifyOnAssign) events.push('Assign');
      if (d.notifyOnUnassign) events.push('Unassign');
      eventsEl.textContent = 'Events: ' + events.join(', ');

      info.appendChild(recipientEl);
      info.appendChild(scopeEl);
      info.appendChild(eventsEl);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'dad-notif-rule-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function () {
        deleteNotifRule(rule.id);
      });

      card.appendChild(info);
      card.appendChild(deleteBtn);
      container.appendChild(card);
    });
  }

  function addNotifRule() {
    hide(dom['dad-notif-error']);

    var recipientSel = dom['dad-notif-recipient'];
    var recipientId = recipientSel.value;
    if (!recipientId) {
      showNotifError('Please select a recipient.');
      return;
    }

    var selectedOpt = recipientSel.options[recipientSel.selectedIndex];
    var recipientName = selectedOpt.textContent;
    var recipientEmail = selectedOpt.getAttribute('data-email') || '';

    var notifyAssign = dom['dad-notif-assign'].checked;
    var notifyUnassign = dom['dad-notif-unassign'].checked;
    if (!notifyAssign && !notifyUnassign) {
      showNotifError('Please select at least one event type.');
      return;
    }

    var scopeRadio = document.querySelector('input[name="dad-notif-scope"]:checked');
    var scope = scopeRadio ? scopeRadio.value : 'all';

    // Build rules — one per selected driver or one for all
    var rulesToAdd = [];
    if (scope === 'selected' && state.selected.size > 0) {
      var selectedRows = getSelectedRows();
      selectedRows.forEach(function (row) {
        rulesToAdd.push(buildRuleEntity(
          recipientId, recipientName, recipientEmail,
          notifyAssign, notifyUnassign,
          row.id, row.name
        ));
      });
    } else {
      rulesToAdd.push(buildRuleEntity(
        recipientId, recipientName, recipientEmail,
        notifyAssign, notifyUnassign,
        null, null
      ));
    }

    // Save each rule via AddInData Add
    var saved = 0;
    var errors = [];
    rulesToAdd.forEach(function (entity) {
      api.call('Add', {
        typeName: 'AddInData',
        entity: entity
      }, function () {
        saved++;
        if (saved + errors.length === rulesToAdd.length) {
          if (errors.length > 0) {
            showNotifError('Some rules failed to save.');
          }
          // Reset form
          dom['dad-notif-recipient'].value = '';
          dom['dad-notif-email'].value = '';
          dom['dad-notif-assign'].checked = true;
          dom['dad-notif-unassign'].checked = true;
          var allRadio = document.querySelector('input[name="dad-notif-scope"][value="all"]');
          if (allRadio) allRadio.checked = true;
          loadNotifRules();
        }
      }, function (err) {
        errors.push(err);
        if (saved + errors.length === rulesToAdd.length) {
          showNotifError('Failed to save rule: ' + (err.message || err));
        }
      });
    });
  }

  function buildRuleEntity(recipientId, recipientName, recipientEmail,
                           notifyAssign, notifyUnassign, driverId, driverName) {
    return {
      addInId: ADDIN_GUID,
      groups: [{ id: 'GroupCompanyId' }],
      details: {
        ruleType: RULE_TYPE,
        driverId: driverId || null,
        driverName: driverName || null,
        recipientUserId: recipientId,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        notifyOnAssign: notifyAssign,
        notifyOnUnassign: notifyUnassign,
        createdAt: new Date().toISOString()
      }
    };
  }

  function deleteNotifRule(ruleId) {
    api.call('Remove', {
      typeName: 'AddInData',
      entity: { id: ruleId }
    }, function () {
      loadNotifRules();
    }, function (err) {
      showNotifError('Failed to delete rule: ' + (err.message || err));
    });
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
    dom['dad-btn-notif'].addEventListener('click', openNotifModal);
    dom['dad-btn-export'].addEventListener('click', exportCSV);
    dom['dad-btn-clear'].addEventListener('click', clearSelection);

    // Refresh
    dom['dad-refresh-btn'].addEventListener('click', function () {
      initState();
      clearSelection();
      loadData();
    });

    // Notification modal
    dom['dad-notif-close'].addEventListener('click', closeNotifModal);
    dom['dad-notif-cancel'].addEventListener('click', closeNotifModal);
    dom['dad-notif-add'].addEventListener('click', addNotifRule);
    dom['dad-notif-modal'].addEventListener('click', function (e) {
      if (e.target === dom['dad-notif-modal']) {
        closeNotifModal();
      }
    });

    // Recipient dropdown → auto-fill email
    dom['dad-notif-recipient'].addEventListener('change', function () {
      var opt = this.options[this.selectedIndex];
      dom['dad-notif-email'].value = opt ? (opt.getAttribute('data-email') || '') : '';
    });

    // Live activity filters
    dom.liveFilters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        dom.liveFilters.forEach(function (b) { b.classList.remove('dad-live-filter-active'); });
        btn.classList.add('dad-live-filter-active');
        state.liveMinutes = parseInt(btn.getAttribute('data-minutes'), 10) || 5;
        loadLiveActivity();
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!dom['dad-notif-modal'].classList.contains('dad-hidden')) {
          closeNotifModal();
        } else if (state.timelineDriverId) {
          // Collapse any open inline timeline
          var expandRow = dom['dad-tbody'].querySelector('.dad-expand-row');
          if (expandRow) expandRow.remove();
          var expandedLink = dom['dad-tbody'].querySelector('.dad-driver-name.dad-expanded');
          if (expandedLink) expandedLink.classList.remove('dad-expanded');
          state.timelineDriverId = null;
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
      loadData();
    },

    blur: function () {
      stopLiveTimer();
    }
  };
};
