import React, { useState, useEffect } from "react";

const ADDIN_GUID = "aECbVRyP_h0SwqL4l2-B5EQ";
const RULE_TYPE = "driverAssignmentNotification";

export default function NotifModal({ apiRef, selected, rows, onClose }) {
  const [adminUsers, setAdminUsers] = useState([]);
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [recipientId, setRecipientId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notifyAssign, setNotifyAssign] = useState(true);
  const [notifyUnassign, setNotifyUnassign] = useState(true);
  const [scope, setScope] = useState("all");

  useEffect(function () {
    loadAdminUsers();
    loadRules();
  }, []);

  function loadAdminUsers() {
    const api = apiRef.current;
    if (!api) return;

    api.call("Get", {
      typeName: "User",
      search: { isDriver: false }
    }, function (users) {
      const filtered = (users || [])
        .filter(function (u) { return u.name && u.name.indexOf("@") !== -1; })
        .sort(function (a, b) {
          const na = (a.firstName || "") + " " + (a.lastName || "");
          const nb = (b.firstName || "") + " " + (b.lastName || "");
          return na.localeCompare(nb);
        });
      setAdminUsers(filtered);
    }, function (err) {
      setError("Failed to load admin users: " + (err.message || err));
    });
  }

  function loadRules() {
    const api = apiRef.current;
    if (!api) return;

    setRulesLoading(true);
    api.call("Get", {
      typeName: "AddInData",
      search: { addInId: ADDIN_GUID }
    }, function (results) {
      const filtered = (results || []).filter(function (r) {
        return r.details && r.details.ruleType === RULE_TYPE;
      });
      setRules(filtered);
      setRulesLoading(false);
    }, function (err) {
      setError("Failed to load rules: " + (err.message || err));
      setRulesLoading(false);
    });
  }

  function handleRecipientChange(e) {
    const userId = e.target.value;
    setRecipientId(userId);
    const opt = e.target.options[e.target.selectedIndex];
    setRecipientEmail(opt ? (opt.getAttribute("data-email") || "") : "");
  }

  function addRule() {
    setError(null);
    const api = apiRef.current;
    if (!api) return;

    if (!recipientId) {
      setError("Please select a recipient.");
      return;
    }
    if (!notifyAssign && !notifyUnassign) {
      setError("Please select at least one event type.");
      return;
    }

    const selectedOpt = document.querySelector(".dad-notif-recipient");
    const recipientName = selectedOpt ? selectedOpt.options[selectedOpt.selectedIndex].textContent : "";

    const rulesToAdd = [];
    if (scope === "selected" && selected.size > 0) {
      const selectedRows = rows.filter(function (r) { return selected.has(r.id); });
      selectedRows.forEach(function (row) {
        rulesToAdd.push(buildEntity(recipientId, recipientName, recipientEmail, notifyAssign, notifyUnassign, row.id, row.name));
      });
    } else {
      rulesToAdd.push(buildEntity(recipientId, recipientName, recipientEmail, notifyAssign, notifyUnassign, null, null));
    }

    let saved = 0;
    const errors = [];
    rulesToAdd.forEach(function (entity) {
      api.call("Add", { typeName: "AddInData", entity: entity }, function () {
        saved++;
        if (saved + errors.length === rulesToAdd.length) {
          if (errors.length > 0) setError("Some rules failed to save.");
          setRecipientId("");
          setRecipientEmail("");
          setNotifyAssign(true);
          setNotifyUnassign(true);
          setScope("all");
          loadRules();
        }
      }, function (err) {
        errors.push(err);
        if (saved + errors.length === rulesToAdd.length) {
          setError("Failed to save rule: " + (err.message || err));
        }
      });
    });
  }

  function buildEntity(recipientId, recipientName, recipientEmail, notifyAssign, notifyUnassign, driverId, driverName) {
    return {
      addInId: ADDIN_GUID,
      groups: [{ id: "GroupCompanyId" }],
      details: {
        ruleType: RULE_TYPE,
        driverId: driverId || null,
        driverName: driverName || null,
        recipientUserId: recipientId,
        recipientName: recipientName,
        recipientEmail: recipientEmail,
        notifyOnAssign: notifyAssign,
        notifyOnUnassign: notifyUnassign,
        createdAt: new Date().toISOString()
      }
    };
  }

  function deleteRule(ruleId) {
    const api = apiRef.current;
    if (!api) return;

    api.call("Remove", { typeName: "AddInData", entity: { id: ruleId } }, function () {
      loadRules();
    }, function (err) {
      setError("Failed to delete rule: " + (err.message || err));
    });
  }

  return (
    <div className="dad-notif-modal" onClick={function (e) { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dad-notif-dialog">
        <div className="dad-notif-header">
          <h3>Notification Rules</h3>
          <button className="dad-notif-close" onClick={onClose} title="Close">&times;</button>
        </div>
        <div className="dad-notif-body">
          {error && <div className="dad-notif-error">{error}</div>}

          {/* Add Rule Form */}
          <div className="dad-notif-section-label">Add New Rule</div>
          <div className="dad-form-group">
            <label>Recipient</label>
            <select className="dad-notif-recipient" value={recipientId} onChange={handleRecipientChange}>
              <option value="">Select an admin user...</option>
              {adminUsers.map(function (u) {
                return (
                  <option key={u.id} value={u.id} data-email={u.name}>
                    {(u.firstName || "") + " " + (u.lastName || "") + " (" + u.name + ")"}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="dad-form-group">
            <label>Email</label>
            <input type="email" value={recipientEmail} readOnly placeholder="Auto-filled from recipient" />
          </div>
          <div className="dad-form-group">
            <label>Notify On</label>
            <div className="dad-notif-checkboxes">
              <label>
                <input type="checkbox" checked={notifyAssign} onChange={function (e) { setNotifyAssign(e.target.checked); }} />
                {" "}Assignment
              </label>
              <label>
                <input type="checkbox" checked={notifyUnassign} onChange={function (e) { setNotifyUnassign(e.target.checked); }} />
                {" "}Unassignment
              </label>
            </div>
          </div>
          <div className="dad-form-group">
            <label>Scope</label>
            <div className="dad-notif-checkboxes">
              <label>
                <input type="radio" name="notif-scope" value="all" checked={scope === "all"} onChange={function () { setScope("all"); }} />
                {" "}All Drivers
              </label>
              <label>
                <input type="radio" name="notif-scope" value="selected" checked={scope === "selected"} onChange={function () { setScope("selected"); }} />
                {" "}Selected Drivers Only
              </label>
            </div>
          </div>

          {/* Existing Rules */}
          <div className="dad-notif-section-label">Active Rules</div>
          {rulesLoading && (
            <div className="dad-notif-rules-loading">
              <div className="dad-spinner dad-spinner-sm"></div>
              <span>Loading rules...</span>
            </div>
          )}
          {!rulesLoading && rules.length === 0 && (
            <div className="dad-notif-rules-empty">No notification rules configured yet.</div>
          )}
          {!rulesLoading && rules.length > 0 && (
            <div className="dad-notif-rules-list">
              {rules.map(function (rule) {
                const d = rule.details;
                const events = [];
                if (d.notifyOnAssign) events.push("Assign");
                if (d.notifyOnUnassign) events.push("Unassign");

                return (
                  <div key={rule.id} className="dad-notif-rule-card">
                    <div className="dad-notif-rule-info">
                      <div className="dad-notif-rule-recipient">{d.recipientName || d.recipientEmail}</div>
                      <div className="dad-notif-rule-scope">{d.driverId ? "Driver: " + d.driverName : "All Drivers"}</div>
                      <div className="dad-notif-rule-events">Events: {events.join(", ")}</div>
                    </div>
                    <button className="dad-notif-rule-delete" onClick={function () { deleteRule(rule.id); }}>
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="dad-notif-footer">
          <button className="dad-action-btn dad-btn-notif" onClick={addRule}>Add Rule</button>
          <button className="dad-action-btn dad-btn-clear" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
