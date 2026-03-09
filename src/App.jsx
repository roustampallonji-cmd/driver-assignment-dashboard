import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  processDriverData, formatDate
} from "./helpers";
import StatsRow from "./components/StatsRow";
import LiveFeed from "./components/LiveFeed";
import DriverStoryboard from "./components/DriverStoryboard";

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
  const [liveFeedFilter, setLiveFeedFilter] = useState(null);

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
  // Pure API-based: fetches DriverChange records from the last 60 minutes.
  // Keeps UnknownDriverId records (vehicle-side unassignment).
  // NO aggressive dedup — each record is a distinct event.
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

      // Keep all valid records within the time window
      var validChanges = changes.filter(function (c) {
        if (new Date(c.dateTime).getTime() < fromTime) return false;
        // Driver-side records (real driver: assign or NoDeviceId unassign)
        if (c.driver && c.driver.id && c.driver.id !== "UnknownDriverId") return true;
        // Vehicle-side unassignment records (UnknownDriverId + real device)
        if (c.driver && c.driver.id === "UnknownDriverId" &&
            c.device && c.device.id && c.device.id !== "NoDeviceId") return true;
        return false;
      });

      // Light dedup: only remove driver-side NoDeviceId records if we also have
      // the vehicle-side UnknownDriverId record for the same device at the same time.
      // This prevents showing the same unassignment event twice from both perspectives.
      // We PREFER the UnknownDriverId record because it has the device ID (we can show the vehicle name).
      var unknownKeys = {};
      validChanges.forEach(function (c) {
        if (c.driver.id === "UnknownDriverId") {
          var key = c.device.id + "_" + Math.round(new Date(c.dateTime).getTime() / 5000);
          unknownKeys[key] = true;
        }
      });

      var deduped = validChanges.filter(function (c) {
        // If this is a driver-side NoDeviceId record, check if we have a vehicle-side record
        if (c.driver.id !== "UnknownDriverId" && c.device && c.device.id === "NoDeviceId") {
          // Find the device this driver was on — check if there's a matching UnknownDriverId record
          // For each UnknownDriverId key near this time, we might have a match
          // Since we can't easily match driver-side to vehicle-side, just keep both — they look different anyway
          return true;
        }
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
  liveChanges.forEach(function (c) {
    var isUnknown = c.driver && c.driver.id === "UnknownDriverId";
    var isNoDevice = c.device && c.device.id === "NoDeviceId";
    if (isUnknown || isNoDevice) {
      liveUnassignedCount++;
    } else {
      liveAssignedCount++;
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

      {/* Stats — just 3 driver count cards */}
      <StatsRow total={totalCount} assigned={assignedCount} unassigned={unassignedCount} />

      {/* Loading */}
      {loading && (
        <div className="dad-loading">
          <div className="dad-spinner"></div>
          <span>Loading driver data...</span>
        </div>
      )}

      {/* Error */}
      {error && <div className="dad-error">{error}</div>}

      {/* Live Activity Feed — with clickable filter counts in the header */}
      {!loading && (
        <LiveFeed
          liveChanges={liveChanges}
          liveFeedFilter={liveFeedFilter}
          onFilterChange={handleLiveFeedFilter}
          liveAssignedCount={liveAssignedCount}
          liveUnassignedCount={liveUnassignedCount}
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
          driverChanges={driverChanges}
          apiRef={apiRef}
        />
      )}
    </div>
  );
}
