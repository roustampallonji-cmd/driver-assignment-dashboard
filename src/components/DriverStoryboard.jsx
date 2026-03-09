import React, { useState, useCallback } from "react";
import { formatDate, driverDisplayName, toISODate } from "../helpers";

export default function DriverStoryboard({ drivers, devices, apiRef }) {
  var [searchTerm, setSearchTerm] = useState("");
  var [selectedDrivers, setSelectedDrivers] = useState([]);
  var [timelines, setTimelines] = useState({});
  var [loadingIds, setLoadingIds] = useState({});
  var [showDropdown, setShowDropdown] = useState(false);

  // Filter drivers by search term
  var searchResults = [];
  if (searchTerm.length >= 2) {
    var term = searchTerm.toLowerCase();
    searchResults = drivers.filter(function (d) {
      var name = driverDisplayName(d).toLowerCase();
      return name.indexOf(term) !== -1;
    }).filter(function (d) {
      // Exclude already-selected drivers
      for (var i = 0; i < selectedDrivers.length; i++) {
        if (selectedDrivers[i].id === d.id) return false;
      }
      return true;
    }).slice(0, 8);
  }

  function loadTimeline(driverId) {
    var api = apiRef.current;
    if (!api) return;

    setLoadingIds(function (prev) {
      var next = Object.assign({}, prev);
      next[driverId] = true;
      return next;
    });

    var now = new Date();
    var ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    api.call("Get", {
      typeName: "DriverChange",
      search: {
        userSearch: { id: driverId },
        fromDate: ninetyDaysAgo.toISOString(),
        toDate: now.toISOString(),
        includeOverlappedChanges: true
      }
    }, function (result) {
      var sorted = (result || []).sort(function (a, b) {
        return new Date(a.dateTime) - new Date(b.dateTime);
      });
      setTimelines(function (prev) {
        var next = Object.assign({}, prev);
        next[driverId] = sorted;
        return next;
      });
      setLoadingIds(function (prev) {
        var next = Object.assign({}, prev);
        delete next[driverId];
        return next;
      });
    }, function () {
      setTimelines(function (prev) {
        var next = Object.assign({}, prev);
        next[driverId] = [];
        return next;
      });
      setLoadingIds(function (prev) {
        var next = Object.assign({}, prev);
        delete next[driverId];
        return next;
      });
    });
  }

  function addDriver(driver) {
    setSelectedDrivers(function (prev) { return prev.concat([driver]); });
    setSearchTerm("");
    setShowDropdown(false);
    loadTimeline(driver.id);
  }

  function removeDriver(driverId) {
    setSelectedDrivers(function (prev) {
      return prev.filter(function (d) { return d.id !== driverId; });
    });
    setTimelines(function (prev) {
      var next = Object.assign({}, prev);
      delete next[driverId];
      return next;
    });
  }

  function renderTimeline(driverId) {
    var changes = timelines[driverId];
    var isLoading = loadingIds[driverId];

    if (isLoading) {
      return (
        <div className="dad-story-loading">
          <div className="dad-spinner dad-spinner-sm"></div>
          <span>Loading assignment history...</span>
        </div>
      );
    }

    if (!changes || changes.length === 0) {
      return (
        <div className="dad-story-empty">No assignment records found in the last 90 days.</div>
      );
    }

    return (
      <div className="dad-story-timeline">
        {changes.map(function (change, idx) {
          var device = change.device ? devices[change.device.id] : null;
          var deviceName = device ? device.name : (change.device ? change.device.id : "Unknown");
          var isAssign = change.device && change.device.id && change.device.id !== "NoDeviceId";
          var isUnknown = change.driver && change.driver.id === "UnknownDriverId";

          // Skip displaying UnknownDriverId records as separate items — they're the vehicle-side mirror
          if (isUnknown) return null;

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
              {idx < changes.length - 1 && <div className="dad-story-connector"></div>}
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
              value={searchTerm}
              onChange={function (e) {
                setSearchTerm(e.target.value);
                setShowDropdown(e.target.value.length >= 2);
              }}
              onFocus={function () { if (searchTerm.length >= 2) setShowDropdown(true); }}
              onBlur={function () { setTimeout(function () { setShowDropdown(false); }, 200); }}
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
            return (
              <div key={driver.id} className="dad-story-card">
                <div className="dad-story-card-header">
                  <div className="dad-story-driver-avatar">
                    {driverDisplayName(driver).charAt(0).toUpperCase()}
                  </div>
                  <div className="dad-story-driver-info">
                    <div className="dad-story-driver-name">{driverDisplayName(driver)}</div>
                    <div className="dad-story-driver-subtitle">Assignment history — last 90 days</div>
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
