import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  processDriverData, getChildGroupIds, exportCSV,
  formatDate, findDriverById, driverDisplayName,
  findLastVehicleForDriver, findRowByDriverId
} from "./helpers";
import StatsRow from "./components/StatsRow";
import ControlsBar from "./components/ControlsBar";
import ActionBar from "./components/ActionBar";
import LiveFeed from "./components/LiveFeed";
import DriverTable from "./components/DriverTable";
import NotifModal from "./components/NotifModal";

export default function App({ apiRef }) {
  // ── Core data state ──
  const [drivers, setDrivers] = useState([]);
  const [devices, setDevices] = useState({});
  const [groups, setGroups] = useState([]);
  const [statusInfos, setStatusInfos] = useState([]);
  const [driverChanges, setDriverChanges] = useState([]);
  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);

  // ── UI state ──
  const [selected, setSelected] = useState(new Set());
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // ── Live feed state ──
  const [liveChanges, setLiveChanges] = useState([]);
  const [liveMinutes, setLiveMinutes] = useState(5);

  // ── Modal state ──
  const [notifModalOpen, setNotifModalOpen] = useState(false);

  // ── Timeline state ──
  const [timelineDriverId, setTimelineDriverId] = useState(null);

  // ── Refs ──
  const liveTimerRef = useRef(null);
  const dataTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const liveLoadingRef = useRef(false); // guard against overlapping live polls
  const prevDriverToDeviceRef = useRef(null); // tracks driver→device for change detection
  const prevDeviceToDriverRef = useRef(null); // tracks device→driver for same-vehicle switch detection

  // ── Data Loading ──
  const loadData = useCallback(function () {
    const api = apiRef.current;
    if (!api) return;

    setLoading(true);
    setError(null);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const calls = [
      ["Get", { typeName: "User", search: { isDriver: true } }],
      ["Get", { typeName: "Device" }],
      ["Get", { typeName: "DeviceStatusInfo" }],
      ["Get", { typeName: "Group" }],
      ["Get", {
        typeName: "DriverChange",
        search: {
          fromDate: thirtyDaysAgo.toISOString(),
          toDate: now.toISOString(),
          includeOverlappedChanges: true
        }
      }]
    ];

    api.multiCall(calls, function (results) {
      if (!mountedRef.current) return;

      const drv = results[0] || [];
      const deviceList = results[1] || [];
      const si = results[2] || [];
      const grp = results[3] || [];
      const dc = results[4] || [];

      const deviceMap = {};
      deviceList.forEach(function (d) { deviceMap[d.id] = d; });

      setDrivers(drv);
      setDevices(deviceMap);
      setStatusInfos(si);
      setGroups(grp);
      setDriverChanges(dc);

      const processed = processDriverData(drv, deviceMap, si, dc);
      setRows(processed);
      setLoading(false);
      setLastRefresh(new Date());
    }, function (err) {
      if (!mountedRef.current) return;
      setLoading(false);
      setError("Failed to load data: " + (err.message || err));
    });
  }, [apiRef]);

  // ── Live Activity Loading ──
  // Uses state-comparison approach: polls DeviceStatusInfo each cycle and
  // compares with previous snapshot to detect assignments/unassignments.
  // This is reliable even when DriverChange API doesn't return unassignment records.
  const loadLiveActivity = useCallback(function () {
    const api = apiRef.current;
    if (!api) return;
    if (liveLoadingRef.current) return; // skip if previous poll still in-flight
    liveLoadingRef.current = true;

    const now = new Date();
    const from = new Date(now.getTime() - liveMinutes * 60 * 1000);

    api.multiCall([
      ["Get", {
        typeName: "DriverChange",
        search: {
          fromDate: from.toISOString(),
          toDate: now.toISOString(),
          includeOverlappedChanges: true
        }
      }],
      ["Get", { typeName: "DeviceStatusInfo" }]
    ], function (results) {
      if (!mountedRef.current) return;

      var changes = results[0] || [];
      var currentStatusInfos = results[1] || [];

      // Build current maps: driverId→deviceId and deviceId→driverId
      var curDriverToDevice = {};
      var curDeviceToDriver = {};
      currentStatusInfos.forEach(function (si) {
        if (si.driver && si.driver.id && si.driver.id !== "UnknownDriverId" &&
            si.device && si.device.id && si.device.id !== "NoDeviceId") {
          curDriverToDevice[si.driver.id] = si.device.id;
          curDeviceToDriver[si.device.id] = si.driver.id;
        }
      });

      // Detect state changes by comparing with previous snapshot
      var detectedEvents = [];
      var prevD2D = prevDriverToDeviceRef.current;
      var prevDev2Drv = prevDeviceToDriverRef.current;
      if (prevD2D && prevDev2Drv) {
        var nowISO = new Date().toISOString();
        var switchedDriverIds = {};

        // 1. Same driver moved to different vehicle
        Object.keys(curDriverToDevice).forEach(function (driverId) {
          if (prevD2D[driverId] && prevD2D[driverId] !== curDriverToDevice[driverId]) {
            switchedDriverIds[driverId] = true;
            detectedEvents.push({
              id: "detected-switch-" + driverId + "-" + Date.now(),
              dateTime: nowISO,
              driver: { id: driverId },
              device: { id: curDriverToDevice[driverId] },
              _detectedType: "switch",
              _previousDeviceId: prevD2D[driverId]
            });
          }
        });

        // 2. Same vehicle now has a different driver (Driver B replaced Driver A)
        Object.keys(curDeviceToDriver).forEach(function (deviceId) {
          if (prevDev2Drv[deviceId] && prevDev2Drv[deviceId] !== curDeviceToDriver[deviceId]) {
            var newDriverId = curDeviceToDriver[deviceId];
            var oldDriverId = prevDev2Drv[deviceId];
            // Skip if already captured as a driver-move switch above
            if (!switchedDriverIds[newDriverId]) {
              detectedEvents.push({
                id: "detected-vswitch-" + deviceId + "-" + Date.now(),
                dateTime: nowISO,
                driver: { id: newDriverId },
                device: { id: deviceId },
                _detectedType: "switch",
                _previousDriverId: oldDriverId
              });
            }
          }
        });

        // 3. Unassignments: driver was assigned, now isn't
        Object.keys(prevD2D).forEach(function (driverId) {
          if (!curDriverToDevice[driverId] && !switchedDriverIds[driverId]) {
            detectedEvents.push({
              id: "detected-unassign-" + driverId + "-" + Date.now(),
              dateTime: nowISO,
              driver: { id: driverId },
              device: { id: "NoDeviceId" },
              _detectedType: "unassign",
              _previousDeviceId: prevD2D[driverId]
            });
          }
        });

        // 4. New assignments: driver wasn't assigned, now is
        Object.keys(curDriverToDevice).forEach(function (driverId) {
          if (!prevD2D[driverId] && !switchedDriverIds[driverId]) {
            detectedEvents.push({
              id: "detected-assign-" + driverId + "-" + Date.now(),
              dateTime: nowISO,
              driver: { id: driverId },
              device: { id: curDriverToDevice[driverId] },
              _detectedType: "assign"
            });
          }
        });
      }

      // Update snapshots for next cycle
      prevDriverToDeviceRef.current = curDriverToDevice;
      prevDeviceToDriverRef.current = curDeviceToDriver;

      // Process DriverChange records (existing approach)
      var fromTime = from.getTime();
      var apiEvents = changes
        .filter(function (c) { return new Date(c.dateTime).getTime() >= fromTime; })
        .filter(function (c) {
          if (c.driver && c.driver.id && c.driver.id !== "UnknownDriverId") return true;
          return false;
        });

      // Merge: detected events + API events, deduplicate by driverId+type within 5 seconds
      var allEvents = detectedEvents.concat(apiEvents);
      var seen = {};
      var deduped = allEvents.filter(function (c) {
        var dId = c.driver.id;
        var devId = c.device.id;
        var isAssign = devId && devId !== "NoDeviceId";
        var key = dId + "_" + (isAssign ? "assign" : "unassign") + "_" + Math.round(new Date(c.dateTime).getTime() / 5000);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });

      deduped.sort(function (a, b) { return new Date(b.dateTime) - new Date(a.dateTime); });
      setLiveChanges(deduped);

      // Also update statusInfos so stats row reflects current state
      setStatusInfos(currentStatusInfos);
      liveLoadingRef.current = false;
    }, function () {
      if (!mountedRef.current) return;
      setLiveChanges([]);
      liveLoadingRef.current = false;
    });
  }, [apiRef, liveMinutes]);

  // ── Load on mount ──
  useEffect(function () {
    mountedRef.current = true;
    loadData();
    return function () { mountedRef.current = false; };
  }, [loadData]);

  // ── Live feed timer (5s for near-instant detection) ──
  useEffect(function () {
    loadLiveActivity();
    liveTimerRef.current = setInterval(loadLiveActivity, 5000);
    return function () {
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [loadLiveActivity]);

  // ── Auto-refresh data (stats + table) every 30s ──
  useEffect(function () {
    dataTimerRef.current = setInterval(function () {
      if (mountedRef.current) loadData();
    }, 30000);
    return function () {
      if (dataTimerRef.current) clearInterval(dataTimerRef.current);
    };
  }, [loadData]);

  // ── Filtering & Sorting ──
  useEffect(function () {
    let result = rows;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(function (row) {
        return row.name.toLowerCase().indexOf(term) !== -1;
      });
    }

    // Group filter
    if (groupFilter) {
      const childIds = getChildGroupIds(groups, groupFilter);
      result = result.filter(function (row) {
        for (let i = 0; i < row.groups.length; i++) {
          if (childIds.indexOf(row.groups[i]) !== -1) return true;
        }
        return false;
      });
    }

    // Sort
    const dir = sortDir === "asc" ? 1 : -1;
    result = [...result].sort(function (a, b) {
      let va = a[sortCol] || "";
      let vb = b[sortCol] || "";

      if (sortCol === "assignedSince" || sortCol === "unassignedAt") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
        return (va - vb) * dir;
      }

      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    setFiltered(result);
  }, [rows, searchTerm, groupFilter, sortCol, sortDir, groups]);

  // ── Handlers ──
  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function handleToggleRow(id) {
    setSelected(function (prev) {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAll(checked) {
    if (checked) {
      setSelected(new Set(filtered.map(function (r) { return r.id; })));
    } else {
      setSelected(new Set());
    }
  }

  function handleClearSelection() {
    setSelected(new Set());
  }

  function handleExport() {
    const exportRows = filtered.filter(function (r) { return selected.has(r.id); });
    exportCSV(exportRows.length > 0 ? exportRows : filtered);
  }

  function handleRefresh() {
    setSelected(new Set());
    setTimelineDriverId(null);
    loadData();
    loadLiveActivity();
  }

  function handleLiveMinutesChange(minutes) {
    setLiveMinutes(minutes);
  }

  // ── Computed ──
  const totalCount = filtered.length;
  const assignedCount = filtered.filter(function (r) { return r.status === "Assigned"; }).length;
  const unassignedCount = totalCount - assignedCount;

  return (
    <div className="dad-app">
      {/* Header */}
      <div className="dad-header">
        <div className="dad-header-content">
          <div className="dad-header-left">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="7" width="18" height="11" rx="2"/>
              <circle cx="7.5" cy="18" r="1.5"/>
              <circle cx="16.5" cy="18" r="1.5"/>
              <path d="M5 7V5a2 2 0 012-2h10a2 2 0 012 2v2"/>
              <path d="M9 11h6"/>
            </svg>
            <div>
              <h1 className="dad-title">Driver Assignment Dashboard</h1>
              <p className="dad-subtitle">Real-time driver-vehicle assignment tracking</p>
            </div>
          </div>
          <div className="dad-header-right">
            <span className="dad-last-refresh">
              {lastRefresh ? "Last refreshed: " + formatDate(lastRefresh) : "Last refreshed: —"}
            </span>
            <button className={"dad-refresh-btn" + (loading ? " dad-spinning" : "")} onClick={handleRefresh} title="Refresh data">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsRow total={totalCount} assigned={assignedCount} unassigned={unassignedCount} />

      {/* Controls */}
      <ControlsBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        groupFilter={groupFilter}
        onGroupFilterChange={setGroupFilter}
        groups={groups}
      />

      {/* Action Bar */}
      <ActionBar
        selectedCount={selected.size}
        onNotifications={function () { setNotifModalOpen(true); }}
        onExport={handleExport}
        onClear={handleClearSelection}
      />

      {/* Loading */}
      {loading && (
        <div className="dad-loading">
          <div className="dad-spinner"></div>
          <span>Loading driver data...</span>
        </div>
      )}

      {/* Error */}
      {error && <div className="dad-error">{error}</div>}

      {/* Live Activity Feed */}
      {!loading && (
        <LiveFeed
          liveChanges={liveChanges}
          liveMinutes={liveMinutes}
          onMinutesChange={handleLiveMinutesChange}
          drivers={drivers}
          devices={devices}
          driverChanges={driverChanges}
          rows={rows}
        />
      )}

      {/* Driver Table */}
      {!loading && (
        <DriverTable
          filtered={filtered}
          selected={selected}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          onToggleRow={handleToggleRow}
          onSelectAll={handleSelectAll}
          timelineDriverId={timelineDriverId}
          onToggleTimeline={setTimelineDriverId}
          apiRef={apiRef}
          devices={devices}
        />
      )}

      {/* Notification Modal */}
      {notifModalOpen && (
        <NotifModal
          apiRef={apiRef}
          selected={selected}
          rows={rows}
          onClose={function () { setNotifModalOpen(false); }}
        />
      )}
    </div>
  );
}
