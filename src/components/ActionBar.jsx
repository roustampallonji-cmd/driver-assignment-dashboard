import React from "react";

export default function ActionBar({ selectedCount, onNotifications, onExport, onClear }) {
  if (selectedCount === 0) return null;

  return (
    <div className="dad-action-bar">
      <span className="dad-selected-count">{selectedCount} selected</span>
      <div className="dad-action-buttons">
        <button className="dad-action-btn dad-btn-notif" onClick={onNotifications} title="Notification rules">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          Notifications
        </button>
        <button className="dad-action-btn dad-btn-export" onClick={onExport} title="Export CSV">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
        <button className="dad-action-btn dad-btn-clear" onClick={onClear} title="Clear selection">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Clear
        </button>
      </div>
    </div>
  );
}
