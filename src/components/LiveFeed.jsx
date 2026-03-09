import React from "react";
import {
  formatDate, formatRelativeTime, driverDisplayName,
  findDriverById, findRowByDriverId, findLastVehicleForDriver,
  findPreviousDriverForDevice
} from "../helpers";

var TIME_FILTERS = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hr" }
];

function classifyChange(change) {
  // Detected events have explicit type
  if (change._detectedType === "switch") return "switch";
  if (change._detectedType === "unassign") return "unassign";
  if (change._detectedType === "assign") return "assign";

  // API DriverChange records
  var isUnknownDriver = change.driver.id === "UnknownDriverId";
  var hasRealDevice = change.device && change.device.id && change.device.id !== "NoDeviceId";

  if (isUnknownDriver) return "unassign";
  if (hasRealDevice) return "assign";
  return "unassign";
}

function resolveFeedItem(change, drivers, devices, driverChanges, rows) {
  var type = classifyChange(change);

  var driverName;
  if (change.driver.id === "UnknownDriverId") {
    driverName = findPreviousDriverForDevice(driverChanges, drivers, change.device.id, change.dateTime);
    if (!driverName) driverName = "Unknown Driver";
  } else {
    var driver = findDriverById(drivers, change.driver.id);
    driverName = driver ? driverDisplayName(driver) : "";
    if (!driverName) {
      var row = findRowByDriverId(rows, change.driver.id);
      driverName = row ? row.name : change.driver.id;
    }
  }

  var vehicleName;
  if (type === "switch") {
    // Current vehicle (new assignment)
    var dev = devices[change.device.id];
    vehicleName = dev ? dev.name : change.device.id;
  } else if (type === "assign") {
    var device = devices[change.device.id];
    vehicleName = device ? device.name : (change.device ? change.device.id : "Unknown");
  } else {
    // Unassign: use _previousDeviceId if available, else look up from history
    if (change._previousDeviceId) {
      var prevDev = devices[change._previousDeviceId];
      vehicleName = prevDev ? prevDev.name : change._previousDeviceId;
    } else {
      vehicleName = findLastVehicleForDriver(driverChanges, devices, rows, change.driver.id, change.dateTime);
    }
  }

  // For switch events, resolve previous vehicle or previous driver
  var previousVehicleName = null;
  var previousDriverName = null;
  if (type === "switch") {
    if (change._previousDeviceId) {
      // Driver moved from one vehicle to another
      var prevDevice = devices[change._previousDeviceId];
      previousVehicleName = prevDevice ? prevDevice.name : change._previousDeviceId;
    }
    if (change._previousDriverId) {
      // Different driver replaced another on the same vehicle
      var prevDriver = findDriverById(drivers, change._previousDriverId);
      previousDriverName = prevDriver ? driverDisplayName(prevDriver) : "";
      if (!previousDriverName) {
        var prevRow = findRowByDriverId(rows, change._previousDriverId);
        previousDriverName = prevRow ? prevRow.name : change._previousDriverId;
      }
    }
  }

  return {
    type: type,
    driverName: driverName,
    vehicleName: vehicleName,
    previousVehicleName: previousVehicleName,
    previousDriverName: previousDriverName
  };
}

function FeedItem({ change, drivers, devices, driverChanges, rows }) {
  var resolved = resolveFeedItem(change, drivers, devices, driverChanges, rows);
  var type = resolved.type;
  var driverName = resolved.driverName;
  var vehicleName = resolved.vehicleName;
  var previousVehicleName = resolved.previousVehicleName;
  var previousDriverName = resolved.previousDriverName;
  var isSameVehicleSwitch = type === "switch" && previousDriverName;

  var iconClass = type === "assign" ? "dad-live-icon-assign" :
                  type === "switch" ? "dad-live-icon-switch" :
                  "dad-live-icon-unassign";

  return (
    <div className="dad-live-item">
      <div className={"dad-live-icon " + iconClass}>
        {type === "assign" ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        ) : type === "switch" ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 014-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 01-4 4H3"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        )}
      </div>
      <div className="dad-live-details">
        <div className="dad-live-message">
          {type === "switch" ? (
            isSameVehicleSwitch ? (
              <>
                <strong>{driverName}</strong>{" "}
                <span className="dad-live-switched">replaced</span>{" "}
                <strong>{previousDriverName}</strong>{" "}
                <span className="dad-live-switched">on</span>{" "}
                <strong>{vehicleName}</strong>
              </>
            ) : (
              <>
                <strong>{driverName}</strong>{" "}
                <span className="dad-live-switched">switched from</span>{" "}
                <strong>{previousVehicleName || "Unknown"}</strong>{" "}
                <span className="dad-live-switched">to</span>{" "}
                <strong>{vehicleName}</strong>
              </>
            )
          ) : (
            <>
              <strong>{driverName}</strong>{" "}
              <span className={type === "assign" ? "dad-live-assigned-to" : "dad-live-removed"}>
                {type === "assign" ? "assigned to" : "unassigned from"}
              </span>{" "}
              <strong>{vehicleName}</strong>
            </>
          )}
        </div>
        <div className="dad-live-meta">
          <span className="dad-live-meta-item">
            <span className="dad-live-meta-label">Vehicle:</span> {vehicleName}
          </span>
          {isSameVehicleSwitch && (
            <>
              <span className="dad-live-meta-sep"></span>
              <span className="dad-live-meta-item">
                <span className="dad-live-meta-label">Replaced:</span> {previousDriverName}
              </span>
            </>
          )}
          {previousVehicleName && !isSameVehicleSwitch && (
            <>
              <span className="dad-live-meta-sep"></span>
              <span className="dad-live-meta-item">
                <span className="dad-live-meta-label">Previous:</span> {previousVehicleName}
              </span>
            </>
          )}
          <span className="dad-live-meta-sep"></span>
          <span className="dad-live-meta-item">
            <span className="dad-live-meta-label">
              {type === "assign" ? "Assigned:" : type === "switch" ? "Switched:" : "Unassigned at:"}
            </span> {formatDate(change.dateTime)}
          </span>
        </div>
      </div>
      <div className="dad-live-time">
        {formatRelativeTime(change.dateTime)}
      </div>
    </div>
  );
}

function FeedColumn({ title, icon, changes, headerClass, emptyText, drivers, devices, driverChanges, rows, keyPrefix }) {
  return (
    <div className="dad-live-column">
      <div className={"dad-live-column-header " + headerClass}>
        {icon}
        <span>{title}</span>
        <span className="dad-live-column-count">{changes.length}</span>
      </div>
      <div className="dad-live-column-body">
        {changes.length === 0 ? (
          <div className="dad-live-empty">{emptyText}</div>
        ) : (
          <div className="dad-live-feed">
            {changes.map(function (change, idx) {
              return (
                <FeedItem
                  key={change.id || (keyPrefix + "-" + idx)}
                  change={change}
                  drivers={drivers}
                  devices={devices}
                  driverChanges={driverChanges}
                  rows={rows}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveFeed({ liveChanges, liveMinutes, onMinutesChange, drivers, devices, driverChanges, rows }) {
  var assignedChanges = [];
  var unassignedChanges = [];
  var switchChanges = [];

  liveChanges.forEach(function (change) {
    var type = classifyChange(change);
    if (type === "assign") {
      assignedChanges.push(change);
    } else if (type === "switch") {
      switchChanges.push(change);
    } else {
      unassignedChanges.push(change);
    }
  });

  return (
    <div className="dad-live-wrap">
      <div className="dad-live-header">
        <div className="dad-live-title">
          <span className="dad-live-dot"></span>
          Live Activity
        </div>
        <div className="dad-live-filters">
          {TIME_FILTERS.map(function (f) {
            return (
              <button
                key={f.minutes}
                className={"dad-live-filter" + (liveMinutes === f.minutes ? " dad-live-filter-active" : "")}
                onClick={function () { onMinutesChange(f.minutes); }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="dad-live-body">
        <FeedColumn
          title="Assigned"
          headerClass="dad-live-col-header-assigned"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          }
          changes={assignedChanges}
          emptyText="No assigned activity"
          drivers={drivers}
          devices={devices}
          driverChanges={driverChanges}
          rows={rows}
          keyPrefix="a"
        />
        <FeedColumn
          title="Unassigned"
          headerClass="dad-live-col-header-unassigned"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          }
          changes={unassignedChanges}
          emptyText="No unassigned activity"
          drivers={drivers}
          devices={devices}
          driverChanges={driverChanges}
          rows={rows}
          keyPrefix="u"
        />
        <FeedColumn
          title="Driver Switch"
          headerClass="dad-live-col-header-switch"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 014-4h14"/>
              <polyline points="7 23 3 19 7 15"/>
              <path d="M21 13v2a4 4 0 01-4 4H3"/>
            </svg>
          }
          changes={switchChanges}
          emptyText="No driver switches"
          drivers={drivers}
          devices={devices}
          driverChanges={driverChanges}
          rows={rows}
          keyPrefix="s"
        />
      </div>
    </div>
  );
}
