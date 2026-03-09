import React from "react";

export default function StatsRow({ total, assigned, unassigned }) {
  return (
    <div className="dad-stats">
      <div className="dad-stat-card">
        <div className="dad-stat-icon dad-stat-icon-total">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <div className="dad-stat-info">
          <span className="dad-stat-value">{total}</span>
          <span className="dad-stat-label">Total Drivers</span>
        </div>
      </div>
      <div className="dad-stat-card">
        <div className="dad-stat-icon dad-stat-icon-assigned">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div className="dad-stat-info">
          <span className="dad-stat-value">{assigned}</span>
          <span className="dad-stat-label">Assigned</span>
        </div>
      </div>
      <div className="dad-stat-card">
        <div className="dad-stat-icon dad-stat-icon-unassigned">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <div className="dad-stat-info">
          <span className="dad-stat-value">{unassigned}</span>
          <span className="dad-stat-label">Unassigned</span>
        </div>
      </div>
    </div>
  );
}
