import React, { useState, useEffect } from "react";
import { formatDate, toISODate } from "../helpers";

export default function TimelineExpand({ driverId, apiRef, devices }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(toISODate(thirtyAgo));
  const [toDate, setToDate] = useState(toISODate(now));

  function loadTimeline(from, to) {
    const api = apiRef.current;
    if (!api) return;

    setLoading(true);
    setError(null);

    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);

    api.call("Get", {
      typeName: "DriverChange",
      search: {
        userSearch: { id: driverId },
        fromDate: new Date(from).toISOString(),
        toDate: toEnd.toISOString(),
        includeOverlappedChanges: true
      }
    }, function (result) {
      const sorted = (result || []).sort(function (a, b) {
        return new Date(b.dateTime) - new Date(a.dateTime);
      });
      setChanges(sorted);
      setLoading(false);
    }, function (err) {
      setError("Error loading timeline: " + (err.message || String(err)));
      setLoading(false);
    });
  }

  useEffect(function () {
    loadTimeline(fromDate, toDate);
  }, [driverId]);

  function handleApply() {
    loadTimeline(fromDate, toDate);
  }

  return (
    <td colSpan="6">
      <div className="dad-expand-content">
        <div className="dad-expand-header">
          <div className="dad-expand-title">Assignment History</div>
          <div className="dad-expand-controls">
            <label>
              From:{" "}
              <input type="date" value={fromDate} onChange={function (e) { setFromDate(e.target.value); }} />
            </label>
            <label>
              To:{" "}
              <input type="date" value={toDate} onChange={function (e) { setToDate(e.target.value); }} />
            </label>
            <button className="dad-expand-apply" onClick={handleApply}>Apply</button>
          </div>
        </div>
        <div className="dad-expand-timeline-body">
          {loading && (
            <div className="dad-expand-loading">
              <div className="dad-spinner dad-spinner-sm"></div>
              <span>Loading timeline...</span>
            </div>
          )}
          {error && <div className="dad-timeline-empty">{error}</div>}
          {!loading && !error && changes.length === 0 && (
            <div className="dad-timeline-empty">No assignment changes found for this date range.</div>
          )}
          {!loading && !error && changes.length > 0 && (
            <div className="dad-timeline-list">
              {changes.map(function (change, idx) {
                const device = change.device ? devices[change.device.id] : null;
                const deviceName = device ? device.name : (change.device ? change.device.id : "Unknown");
                const isAssign = change.device && change.device.id && change.device.id !== "NoDeviceId";

                return (
                  <div key={change.id || idx} className={"dad-timeline-item " + (isAssign ? "dad-timeline-assign" : "dad-timeline-unassign")}>
                    <div className="dad-timeline-card">
                      <div className="dad-timeline-date">{formatDate(change.dateTime)}</div>
                      <div className="dad-timeline-vehicle">{deviceName}</div>
                      <div className="dad-timeline-type">{isAssign ? "Assigned" : "Unassigned"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
