import React, { useState } from "react";
import { formatDate, driverDisplayName } from "../helpers";

export default function DriverStoryboard({ drivers, devices, driverChanges, apiRef }) {
  var [searchTerm, setSearchTerm] = useState("");
  var [selectedDrivers, setSelectedDrivers] = useState([]);
  var [showDropdown, setShowDropdown] = useState(false);

  // Filter drivers by search term
  var searchResults = [];
  if (searchTerm.length >= 2) {
    var term = searchTerm.toLowerCase();
    searchResults = drivers.filter(function (d) {
      var name = driverDisplayName(d).toLowerCase();
      return name.indexOf(term) !== -1;
    }).filter(function (d) {
      for (var i = 0; i < selectedDrivers.length; i++) {
        if (selectedDrivers[i].id === d.id) return false;
      }
      return true;
    }).slice(0, 8);
  }

  // Build timeline from driverChanges (already loaded — 30 days of data)
  function getTimeline(driverId) {
    var changes = [];
    driverChanges.forEach(function (dc) {
      // Include records where this driver was assigned or unassigned
      if (dc.driver && dc.driver.id === driverId) {
        changes.push(dc);
      }
    });
    // Sort chronologically (oldest first for story reading)
    changes.sort(function (a, b) {
      return new Date(a.dateTime) - new Date(b.dateTime);
    });
    return changes;
  }

  function addDriver(driver) {
    setSelectedDrivers(function (prev) { return prev.concat([driver]); });
    setSearchTerm("");
    setShowDropdown(false);
  }

  function removeDriver(driverId) {
    setSelectedDrivers(function (prev) {
      return prev.filter(function (d) { return d.id !== driverId; });
    });
  }

  function renderTimeline(driverId) {
    var changes = getTimeline(driverId);

    if (changes.length === 0) {
      return (
        <div className="dad-story-empty">No assignment records found in the last 30 days.</div>
      );
    }

    return (
      <div className="dad-story-timeline">
        {changes.map(function (change, idx) {
          var device = change.device ? devices[change.device.id] : null;
          var deviceName = device ? device.name : (change.device ? change.device.id : "Unknown");
          var isAssign = change.device && change.device.id && change.device.id !== "NoDeviceId";

          var actionText = isAssign ? "Assigned to" : "Unassigned from";

          return (
            <div key={change.id || idx} className={"dad-story-event " + (isAssign ? "dad-story-assign" : "dad-story-unassign")}>
              <div className="dad-story-event-dot"></div>
              <div className="dad-story-event-content">
                <div className="dad-story-event-action">
                  <span className={"dad-story-action-text " + (isAssign ? "dad-story-action-assign" : "dad-story-action-unassign")}>
                    {actionText}
                  </span>
                  <strong className="dad-story-vehicle-name">{deviceName}</strong>
                </div>
                <div className="dad-story-event-time">{formatDate(change.dateTime)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="dad-storyboard-wrap">
      <div className="dad-storyboard-header">
        <div className="dad-storyboard-title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Driver Assignment Storyboard
        </div>
        <div className="dad-storyboard-search-area">
          <div className="dad-storyboard-search-wrap">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="dad-storyboard-search"
              placeholder="Search for a driver to view their story..."
              autoComplete="off"
              value={searchTerm}
              onChange={function (e) {
                setSearchTerm(e.target.value);
                setShowDropdown(e.target.value.length >= 2);
              }}
              onFocus={function () { if (searchTerm.length >= 2) setShowDropdown(true); }}
              onBlur={function () { setTimeout(function () { setShowDropdown(false); }, 250); }}
            />
          </div>
          {showDropdown && searchResults.length > 0 && (
            <div className="dad-storyboard-dropdown">
              {searchResults.map(function (driver) {
                return (
                  <div
                    key={driver.id}
                    className="dad-storyboard-dropdown-item"
                    onMouseDown={function (e) { e.preventDefault(); addDriver(driver); }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span>{driverDisplayName(driver)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected driver tags */}
      {selectedDrivers.length > 0 && (
        <div className="dad-storyboard-tags">
          {selectedDrivers.map(function (driver) {
            return (
              <span key={driver.id} className="dad-storyboard-tag">
                {driverDisplayName(driver)}
                <button
                  className="dad-storyboard-tag-remove"
                  onClick={function () { removeDriver(driver.id); }}
                  title="Remove"
                >
                  &times;
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Driver stories */}
      {selectedDrivers.length === 0 ? (
        <div className="dad-storyboard-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>Search for a driver above to see their assignment story</p>
          <span>View chronological assignment history for any driver</span>
        </div>
      ) : (
        <div className="dad-storyboard-stories">
          {selectedDrivers.map(function (driver) {
            var timeline = getTimeline(driver.id);
            return (
              <div key={driver.id} className="dad-story-card">
                <div className="dad-story-card-header">
                  <div className="dad-story-driver-avatar">
                    {driverDisplayName(driver).charAt(0).toUpperCase()}
                  </div>
                  <div className="dad-story-driver-info">
                    <div className="dad-story-driver-name">{driverDisplayName(driver)}</div>
                    <div className="dad-story-driver-subtitle">
                      {timeline.length} events — last 30 days
                    </div>
                  </div>
                  <button
                    className="dad-story-close"
                    onClick={function () { removeDriver(driver.id); }}
                    title="Remove driver"
                  >
                    &times;
                  </button>
                </div>
                <div className="dad-story-card-body">
                  {renderTimeline(driver.id)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
