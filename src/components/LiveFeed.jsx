import React from "react";
import {
  formatDate, formatRelativeTime, driverDisplayName,
  findDriverById, findRowByDriverId, findLastVehicleForDriver,
  findPreviousDriverForDevice
} from "../helpers";

function classifyChange(change) {
  var isUnknownDriver = change.driver && change.driver.id === "UnknownDriverId";
  var hasRealDevice = change.device && change.device.id && change.device.id !== "NoDeviceId";

  if (isUnknownDriver) return "unassign";
  if (hasRealDevice) return "assign";
  return "unassign";
}

function resolveFeedItem(change, drivers, devices, driverChanges, rows) {
  var type = classifyChange(change);

  var driverName;
  if (change.driver.id === "UnknownDriverId") {
    // Vehicle-side unassignment — resolve the previous driver from DriverChange history
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
  if (type === "assign") {
    var device = devices[change.device.id];
    vehicleName = device ? device.name : (change.device ? change.device.id : "Unknown");
  } else {
    // Unassign: for UnknownDriverId records, we have the device.id directly
    if (change.driver.id === "UnknownDriverId") {
      var dev = devices[change.device.id];
      vehicleName = dev ? dev.name : change.device.id;
    } else {
      vehicleName = findLastVehicleForDriver(driverChanges, devices, rows, change.driver.id, change.dateTime);
    }
  }

  return {
    type: type,
    driverName: driverName,
    vehicleName: vehicleName
  };
}

function FeedItem({ change, drivers, devices, driverChanges, rows }) {
  var resolved = resolveFeedItem(change, drivers, devices, driverChanges, rows);
  var type = resolved.type;
  var driverName = resolved.driverName;
  var vehicleName = resolved.vehicleName;

  var iconClass = type === "assign" ? "dad-live-icon-assign" : "dad-live-icon-unassign";

  return (
    <div className="dad-live-item">
      <div className={"dad-live-icon " + iconClass}>
        {type === "assign" ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
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
          <strong>{driverName}</strong>{" "}
          <span className={type === "assign" ? "dad-live-assigned-to" : "dad-live-removed"}>
            {type === "assign" ? "assigned to" : "unassigned from"}
          </span>{" "}
          <strong>{vehicleName}</strong>
        </div>
        <div className="dad-live-meta">
          <span className="dad-live-meta-item">
            <span className="dad-live-meta-label">Vehicle:</span> {vehicleName}
          </span>
          <span className="dad-live-meta-sep"></span>
          <span className="dad-live-meta-item">
            <span className="dad-live-meta-label">
              {type === "assign" ? "Assigned:" : "Unassigned at:"}
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

export default function LiveFeed({ liveChanges, liveFeedFilter, drivers, devices, driverChanges, rows }) {
  // Apply filter if active
  var displayChanges = liveChanges;
  if (liveFeedFilter) {
    displayChanges = liveChanges.filter(function (change) {
      var type = classifyChange(change);
      return type === liveFeedFilter;
    });
  }

  var filterLabel = liveFeedFilter === "assign" ? " — Assigned" :
                    liveFeedFilter === "unassign" ? " — Unassigned" :
                    liveFeedFilter === "switch" ? " — Driver Switch" : "";

  return (
    <div className="dad-live-wrap">
      <div className="dad-live-header">
        <div className="dad-live-title">
          <span className="dad-live-dot"></span>
          Live Activity{filterLabel}
          <span className="dad-live-total-count">{displayChanges.length}</span>
        </div>
        {liveFeedFilter && (
          <span className="dad-live-filter-label">
            Showing: {liveFeedFilter === "assign" ? "Assigned" : liveFeedFilter === "unassign" ? "Unassigned" : "Switches"} only
          </span>
        )}
      </div>
      <div className="dad-live-single-body">
        {displayChanges.length === 0 ? (
          <div className="dad-live-empty">
            {liveFeedFilter ? "No " + (liveFeedFilter === "assign" ? "assigned" : liveFeedFilter === "unassign" ? "unassigned" : "switch") + " activity in the last 60 minutes" : "No activity in the last 60 minutes"}
          </div>
        ) : (
          <div className="dad-live-feed">
            {displayChanges.map(function (change, idx) {
              return (
                <FeedItem
                  key={change.id || ("live-" + idx)}
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
