import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  processDriverData, formatDate
} from "./helpers";
import StatsRow from "./components/StatsRow";
import LiveFeed from "./components/LiveFeed";
import DriverStoryboard from "./components/DriverStoryboard";
import NotifModal from "./components/NotifModal";

export default function App({ apiRef }) {
  // ── Core data state ──
  const [drivers, setDrivers] = useState([]);
  const [devices, setDevices] = useState({});
  const [statusInfos, setStatusInfos] = useState([]);
  const [driverChanges, setDriverChanges] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // ── Live feed state ──
  const [liveChanges, setLiveChanges] = useState([]);
  const [liveFeedFilter, setLiveFeedFilter] = useState(null); // null = all, "assign", "unassign"

  // ── Modal state ──
  const [notifModalOpen, setNotifModalOpen] = useState(false);

  // ── Refs ──
  const liveTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const liveLoadingRef = useRef(false);

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
      const dc = results[3] || [];

      const deviceMap = {};
      deviceList.forEach(function (d) { deviceMap[d.id] = d; });

      setDrivers(drv);
      setDevices(deviceMap);
      setStatusInfos(si);
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
  // Pure API-based approach: fetches DriverChange records from the last 60 minutes.
  // Keeps ALL records including UnknownDriverId (vehicle-side unassignment records).
  // The LiveFeed component resolves driver names from history for UnknownDriverId records.
  const loadLiveActivity = useCallback(function () {
    const api = apiRef.current;
    if (!api) return;
    if (liveLoadingRef.current) return;
    liveLoadingRef.current = true;

    var now = new Date();
    var from = new Date(now.getTime() - 60 * 60 * 1000);

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
      var fromTime = from.getTime();

      // Keep all records within the time window that have valid data
      var validChanges = changes.filter(function (c) {
        if (new Date(c.dateTime).getTime() < fromTime) return false;
        if (c.driver && c.driver.id && c.driver.id !== "UnknownDriverId") return true;
        if (c.driver && c.driver.id === "UnknownDriverId" &&
            c.device && c.device.id && c.device.id !== "NoDeviceId") return true;
        return false;
      });

      // Deduplicate: prefer driver-side over vehicle-side for same event
      var seen = {};
      var deduped = validChanges.filter(function (c) {
        var key = c.device.id + "_" + Math.round(new Date(c.dateTime).getTime() / 3000);
        if (c.driver.id === "UnknownDriverId") {
          if (seen[key]) return false;
        }
        seen[key] = true;
        return true;
      });

      deduped.sort(function (a, b) { return new Date(b.dateTime) - new Date(a.dateTime); });
      setLiveChanges(deduped);

      // Update statusInfos so stats reflect current state
      setStatusInfos(currentStatusInfos);
      liveLoadingRef.current = false;
    }, function () {
      if (!mountedRef.current) return;
      setLiveChanges([]);
      liveLoadingRef.current = false;
    });
  }, [apiRef]);

  // ── Load on mount ──
  useEffect(function () {
    mountedRef.current = true;
    loadData();
    return function () { mountedRef.current = false; };
  }, [loadData]);

  // ── Live feed timer (5s) ──
  useEffect(function () {
    loadLiveActivity();
    liveTimerRef.current = setInterval(loadLiveActivity, 5000);
    return function () {
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [loadLiveActivity]);

  // ── Recompute rows when statusInfos changes ──
  useEffect(function () {
    if (drivers.length > 0 && Object.keys(devices).length > 0) {
      var processed = processDriverData(drivers, devices, statusInfos, driverChanges);
      setRows(processed);
      setLastRefresh(new Date());
    }
  }, [statusInfos, drivers, devices, driverChanges]);

  // ── Handlers ──
  function handleRefresh() {
    loadData();
    loadLiveActivity();
  }

  function handleLiveFeedFilter(type) {
    setLiveFeedFilter(function (prev) {
      return prev === type ? null : type;
    });
  }

  // ── Computed ──
  const totalCount = rows.length;
  const assignedCount = rows.filter(function (r) { return r.status === "Assigned"; }).length;
  const unassignedCount = totalCount - assignedCount;

  // Live feed counts
  var liveAssignedCount = 0;
  var liveUnassignedCount = 0;
  var liveSwitchCount = 0;
  liveChanges.forEach(function (c) {
    var isUnknown = c.driver && c.driver.id === "UnknownDriverId";
    var hasRealDevice = c.device && c.device.id && c.device.id !== "NoDeviceId";
    if (isUnknown) {
      liveUnassignedCount++;
    } else if (hasRealDevice) {
      liveAssignedCount++;
    } else {
      liveUnassignedCount++;
    }
  });

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

      {/* Stats — Driver counts + Live feed counts */}
      <StatsRow
        total={totalCount}
        assigned={assignedCount}
        unassigned={unassignedCount}
        liveAssigned={liveAssignedCount}
        liveUnassigned={liveUnassignedCount}
        liveSwitch={liveSwitchCount}
        liveFeedFilter={liveFeedFilter}
        onLiveFeedFilter={handleLiveFeedFilter}
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
          liveFeedFilter={liveFeedFilter}
          drivers={drivers}
          devices={devices}
          driverChanges={driverChanges}
          rows={rows}
        />
      )}

      {/* Driver Storyboard */}
      {!loading && (
        <DriverStoryboard
          drivers={drivers}
          devices={devices}
          apiRef={apiRef}
        />
      )}

      {/* Notification Modal */}
      {notifModalOpen && (
        <NotifModal
          apiRef={apiRef}
          selected={new Set()}
          rows={rows}
          onClose={function () { setNotifModalOpen(false); }}
        />
      )}
    </div>
  );
}
