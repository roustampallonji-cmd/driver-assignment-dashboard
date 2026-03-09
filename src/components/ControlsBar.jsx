import React from "react";

export default function ControlsBar({ searchTerm, onSearchChange, groupFilter, onGroupFilterChange, groups }) {
  // Build group hierarchy for dropdown
  const groupMap = {};
  groups.forEach(function (g) { groupMap[g.id] = g; });

  const rootGroups = groups.filter(function (g) {
    return !g.parent || g.parent.id === "GroupCompanyId";
  });

  function buildOptions(parentGroups, depth) {
    const opts = [];
    const sorted = [...parentGroups].sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "");
    });
    sorted.forEach(function (g) {
      if (!g.name || g.name === "Company Group") return;
      const prefix = "\u00A0\u00A0".repeat(depth);
      opts.push(
        <option key={g.id} value={g.id}>{prefix + (g.name || g.id)}</option>
      );
      const children = groups.filter(function (child) {
        return child.parent && child.parent.id === g.id;
      });
      if (children.length > 0) {
        opts.push(...buildOptions(children, depth + 1));
      }
    });
    return opts;
  }

  return (
    <div className="dad-controls">
      <div className="dad-search-wrap">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          className="dad-search"
          placeholder="Search drivers..."
          autoComplete="off"
          value={searchTerm}
          onChange={function (e) { onSearchChange(e.target.value); }}
        />
      </div>
      <div className="dad-filter-wrap">
        <label>Group:</label>
        <select
          className="dad-group-filter"
          value={groupFilter}
          onChange={function (e) { onGroupFilterChange(e.target.value); }}
        >
          <option value="">All Groups</option>
          {buildOptions(rootGroups, 0)}
        </select>
      </div>
    </div>
  );
}
