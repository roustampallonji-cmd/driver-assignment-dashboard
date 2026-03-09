// ── Date Formatting ──

export function formatDate(d) {
  if (!d) return '—';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDateShort(d) {
  if (!d) return '—';
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

export function toISODate(d) {
  return d.toISOString().split('T')[0];
}

export function formatRelativeTime(dateStr) {
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

// ── Text Helpers ──

export function escapeHtml(s) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(s));
  return div.innerHTML;
}

export function driverDisplayName(user) {
  return ((user.firstName || '') + ' ' + (user.lastName || '')).trim();
}

// ── Lookups ──

export function findDriverById(drivers, id) {
  for (var i = 0; i < drivers.length; i++) {
    if (drivers[i].id === id) return drivers[i];
  }
  return null;
}

export function findRowByDriverId(rows, id) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}

export function findLastVehicleForDriver(driverChanges, devices, rows, driverId, beforeDateTime) {
  var lastAssign = null;
  var beforeTime = new Date(beforeDateTime).getTime();
  driverChanges.forEach(function (dc) {
    if (dc.driver && dc.driver.id === driverId &&
        dc.device && dc.device.id && dc.device.id !== 'NoDeviceId') {
      var dcTime = new Date(dc.dateTime).getTime();
      if (dcTime <= beforeTime) {
        if (!lastAssign || dcTime > new Date(lastAssign.dateTime).getTime()) {
          lastAssign = dc;
        }
      }
    }
  });
  if (lastAssign) {
    var dev = devices[lastAssign.device.id];
    return dev ? dev.name : lastAssign.device.id;
  }
  var row = findRowByDriverId(rows, driverId);
  if (row && row.vehicle && row.vehicle !== '—') return row.vehicle;
  return 'Unknown Vehicle';
}

export function getChildGroupIds(groups, parentId) {
  var ids = [parentId];
  groups.forEach(function (g) {
    if (g.parent && g.parent.id === parentId) {
      ids = ids.concat(getChildGroupIds(groups, g.id));
    }
  });
  return ids;
}

// ── Data Processing ──

export function processDriverData(drivers, devices, statusInfos, driverChanges) {
  // Build driver → current status map from DeviceStatusInfo
  var driverStatusMap = {};
  statusInfos.forEach(function (si) {
    if (si.driver && si.driver.id && si.driver.id !== 'UnknownDriverId') {
      driverStatusMap[si.driver.id] = si;
    }
  });

  // Build driver → latest change from DriverChange
  var driverLatestChange = {};
  driverChanges.forEach(function (dc) {
    if (dc.driver && dc.driver.id) {
      var existing = driverLatestChange[dc.driver.id];
      if (!existing || new Date(dc.dateTime) > new Date(existing.dateTime)) {
        driverLatestChange[dc.driver.id] = dc;
      }
    }
  });

  return drivers.map(function (driver) {
    var statusInfo = driverStatusMap[driver.id];
    var latestChange = driverLatestChange[driver.id];
    var isAssigned = !!statusInfo && statusInfo.device &&
      statusInfo.device.id && statusInfo.device.id !== 'NoDeviceId';
    var device = isAssigned ? devices[statusInfo.device.id] : null;
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

    var driverGroups = [];
    if (driver.companyGroups) {
      driver.companyGroups.forEach(function (g) { driverGroups.push(g.id); });
    }
    if (driver.driverGroups) {
      driver.driverGroups.forEach(function (g) { driverGroups.push(g.id); });
    }

    return {
      id: driver.id,
      name: driverDisplayName(driver),
      vehicle: vehicleName,
      assignedSince: assignedSince,
      unassignedAt: unassignedAt,
      status: isAssigned ? 'Assigned' : 'Unassigned',
      groups: driverGroups,
      raw: driver
    };
  }).filter(function (r) { return r.name.length > 0; });
}

// ── CSV Export ──

export function exportCSV(rows) {
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
