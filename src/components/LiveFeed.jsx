import React from "react";
import {
  formatDate, formatRelativeTime, driverDisplayName,
  findDriverById, findRowByDriverId, findLastVehicleForDriver,
  findPreviousDriverForDevice
} from "../helpers";

const TIME_FILTERS = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hr" }
];

function resolveFeedItem(change, drivers, devices, driverChanges, rows) {
  var isUnknownDriver = change.driver.id === "UnknownDriverId";
  var isAssign = !isUnknownDriver && change.device && change.device.id && change.device.id !== "NoDeviceId";

  var driverName;
  if (isUnknownDriver) {
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
  if (isUnknownDriver) {
    var dev = devices[change.device.id];
    vehicleName = dev ? dev.name : change.device.id;
  } else if (isAssign) {
    var device = devices[change.device.id];
    vehicleName = device ? device.name : (change.device ? change.device.id : "Unknown");
  } else {
    vehicleName = findLastVehicleForDriver(driverChanges, devices, rows, change.driver.id, change.dateTime);
  }

  return { isAssign: isAssign, driverName: driverName, vehicleName: vehicleName };
}

function FeedItem({ change, drivers, devices, driverChanges, rows }) {
  var resolved = resolveFeedItem(change, drivers, devices, driverChanges, rows);
  var isAssign = resolved.isAssign;
  var driverName = resolved.driverName;
  var vehicleName = resolved.vehicleName;

  return (
    <div className="dad-live-item">
      <div className={"dad-live-icon " + (isAssign ? "dad-live-icon-assign" : "dad-live-icon-unassign")}>
        {isAssign ? (
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
          <span className={isAssign ? "dad-live-assigned-to" : "dad-live-removed"}>
            {isAssign ? "assigned to" : "unassigned from"}
          </span>{" "}
          <strong>{vehicleName}</strong>
        </div>
        <div className="dad-live-meta">
          <span className="dad-live-meta-item">
            <span className="dad-live-meta-label">Vehicle:</span> {vehicleName}
          </span>
          <span className="dad-live-meta-sep"></span>
          <span className="dad-live-meta-item">
            <span className="dad-live-meta-label">{isAssign ? "Assigned:" : "Unassigned at:"}</span> {formatDate(change.dateTime)}
          </span>
        </div>
      </div>
      <div className="dad-live-time">
        {formatRelativeTime(change.dateTime)}
      </div>
    </div>
  );
}

export default function LiveFeed({ liveChanges, liveMinutes, onMinutesChange, drivers, devices, driverChanges, rows }) {
  // Split changes into assigned vs unassigned
  var assignedChanges = [];
  var unassignedChanges = [];

  liveChanges.forEach(function (change) {
    var isUnknownDriver = change.driver.id === "UnknownDriverId";
    var isAssign = !isUnknownDriver && change.device && change.device.id && change.device.id !== "NoDeviceId";
    if (isAssign) {
      assignedChanges.push(change);
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
        {/* Assigned Column */}
        <div className="dad-live-column dad-live-column-assigned">
          <div className="dad-live-column-header dad-live-col-header-assigned">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>Assigned</span>
            <span className="dad-live-column-count">{assignedChanges.length}</span>
          </div>
          <div className="dad-live-column-body">
            {assignedChanges.length === 0 ? (
              <div className="dad-live-empty">No assigned activity</div>
            ) : (
              <div className="dad-live-feed">
                {assignedChanges.map(function (change, idx) {
                  return (
                    <FeedItem
                      key={change.id || ("a-" + idx)}
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

        {/* Unassigned Column */}
        <div className="dad-live-column dad-live-column-unassigned">
          <div className="dad-live-column-header dad-live-col-header-unassigned">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span>Unassigned</span>
            <span className="dad-live-column-count">{unassignedChanges.length}</span>
          </div>
          <div className="dad-live-column-body">
            {unassignedChanges.length === 0 ? (
              <div className="dad-live-empty">No unassigned activity</div>
            ) : (
              <div className="dad-live-feed">
                {unassignedChanges.map(function (change, idx) {
                  return (
                    <FeedItem
                      key={change.id || ("u-" + idx)}
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
      </div>
    </div>
  );
}
