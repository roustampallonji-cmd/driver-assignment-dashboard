import React from "react";
import { formatDate } from "../helpers";
import TimelineExpand from "./TimelineExpand";

export default function DriverTable({
  filtered, selected, sortCol, sortDir, onSort, onToggleRow, onSelectAll,
  timelineDriverId, onToggleTimeline, apiRef, devices
}) {
  const allSelected = filtered.length > 0 && filtered.every(function (r) { return selected.has(r.id); });

  if (filtered.length === 0) {
    return (
      <div className="dad-table-wrap">
        <div className="dad-no-results">No drivers match your search criteria.</div>
      </div>
    );
  }

  function sortClass(col) {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " dad-sort-asc" : " dad-sort-desc";
  }

  return (
    <div className="dad-table-wrap">
      <table className="dad-table">
        <thead>
          <tr>
            <th className="dad-th-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={function (e) { onSelectAll(e.target.checked); }}
                title="Select all"
              />
            </th>
            <th className={"dad-sortable" + sortClass("name")} onClick={function () { onSort("name"); }}>
              Driver Name <span className="dad-sort-icon"></span>
            </th>
            <th className={"dad-sortable" + sortClass("vehicle")} onClick={function () { onSort("vehicle"); }}>
              Current Vehicle <span className="dad-sort-icon"></span>
            </th>
            <th className={"dad-sortable" + sortClass("assignedSince")} onClick={function () { onSort("assignedSince"); }}>
              Assigned Since <span className="dad-sort-icon"></span>
            </th>
            <th className={"dad-sortable" + sortClass("unassignedAt")} onClick={function () { onSort("unassignedAt"); }}>
              Unassigned At <span className="dad-sort-icon"></span>
            </th>
            <th className={"dad-sortable" + sortClass("status")} onClick={function () { onSort("status"); }}>
              Status <span className="dad-sort-icon"></span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(function (row) {
            const isSelected = selected.has(row.id);
            const isExpanded = timelineDriverId === row.id;

            return (
              <React.Fragment key={row.id}>
                <tr className={isSelected ? "dad-row-selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={function () { onToggleRow(row.id); }}
                    />
                  </td>
                  <td>
                    <a
                      className={"dad-driver-name" + (isExpanded ? " dad-expanded" : "")}
                      href="#"
                      onClick={function (e) {
                        e.preventDefault();
                        onToggleTimeline(isExpanded ? null : row.id);
                      }}
                    >
                      {row.name}
                    </a>
                  </td>
                  <td>{row.vehicle}</td>
                  <td>{formatDate(row.assignedSince)}</td>
                  <td>{formatDate(row.unassignedAt)}</td>
                  <td>
                    <span className={"dad-status-pill " + (row.status === "Assigned" ? "dad-status-assigned" : "dad-status-unassigned")}>
                      {row.status}
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="dad-expand-row">
                    <TimelineExpand
                      driverId={row.id}
                      apiRef={apiRef}
                      devices={devices}
                    />
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
