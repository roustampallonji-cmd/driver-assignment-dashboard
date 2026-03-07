'use strict';

const { Firestore } = require('@google-cloud/firestore');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const nodemailer = require('nodemailer');
const https = require('https');

// ── Constants ──
const ADDIN_GUID = '0b12e5f9-b943-4a76-b09d-59fe896bb1b6';
const RULE_TYPE = 'driverAssignmentNotification';
const FIRESTORE_COLLECTION = 'driverAssignmentNotifier';
const FIRESTORE_DOC = 'feedState';

const firestore = new Firestore();
const secretClient = new SecretManagerServiceClient();

// ── Secret Manager ──
async function getSecret(name) {
  const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/${name}/versions/latest`
  });
  return version.payload.data.toString('utf8');
}

async function loadSecrets() {
  const mygRaw = await getSecret('mygeotab-service-account');
  const gmailRaw = await getSecret('gmail-smtp-credentials');
  return {
    mygeotab: JSON.parse(mygRaw),
    gmail: JSON.parse(gmailRaw)
  };
}

// ── MyGeotab JSONRPC ──
function mygeotabCall(server, method, params) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      method,
      params
    });

    const url = new URL(`https://${server}/apiv1`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error('Failed to parse response: ' + body.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function authenticateMyGeotab(creds) {
  const result = await mygeotabCall(creds.server || 'my.geotab.com', 'Authenticate', {
    userName: creds.userName,
    password: creds.password,
    database: creds.database
  });

  const server = result.path || creds.server || 'my.geotab.com';
  const sessionId = result.credentials.sessionId;
  const database = result.credentials.database;
  const userName = result.credentials.userName;

  return {
    server,
    call: (method, params) => mygeotabCall(server, method, {
      ...params,
      credentials: { sessionId, database, userName }
    })
  };
}

// ── Firestore Feed State ──
async function loadFeedState() {
  const doc = await firestore
    .collection(FIRESTORE_COLLECTION)
    .doc(FIRESTORE_DOC)
    .get();

  if (doc.exists) {
    return doc.data();
  }
  return { toVersion: null };
}

async function saveFeedState(toVersion) {
  await firestore
    .collection(FIRESTORE_COLLECTION)
    .doc(FIRESTORE_DOC)
    .set({ toVersion, updatedAt: new Date().toISOString() }, { merge: true });
}

// ── GetFeed for DriverChange ──
async function pollDriverChangeFeed(api, fromVersion) {
  const params = {
    typeName: 'DriverChange'
  };
  if (fromVersion) {
    params.fromVersion = fromVersion;
  } else {
    // First run: start from now (no historical backfill)
    params.fromDate = new Date().toISOString();
  }

  const result = await api.call('GetFeed', params);
  return {
    data: result.data || [],
    toVersion: result.toVersion
  };
}

// ── Load Notification Rules from AddInData ──
async function loadNotifRules(api) {
  const results = await api.call('Get', {
    typeName: 'AddInData',
    search: { addInId: ADDIN_GUID }
  });

  return (results || []).filter(r => r.details && r.details.ruleType === RULE_TYPE);
}

// ── Resolve Names ──
async function resolveNames(api, changes) {
  const driverIds = new Set();
  const deviceIds = new Set();

  changes.forEach(c => {
    if (c.driver && c.driver.id) driverIds.add(c.driver.id);
    if (c.device && c.device.id && c.device.id !== 'NoDeviceId') deviceIds.add(c.device.id);
  });

  const calls = [];
  if (driverIds.size > 0) {
    calls.push(['Get', { typeName: 'User', search: { id: [...driverIds] } }]);
  }
  if (deviceIds.size > 0) {
    calls.push(['Get', { typeName: 'Device', search: { id: [...deviceIds] } }]);
  }

  if (calls.length === 0) return { drivers: {}, devices: {} };

  const results = await api.call('ExecuteMultiCall', { calls: calls.map(c => ({ method: c[0], params: c[1] })) });

  const drivers = {};
  const devices = {};

  let idx = 0;
  if (driverIds.size > 0) {
    (results[idx] || []).forEach(u => {
      drivers[u.id] = (u.firstName || '') + ' ' + (u.lastName || '');
    });
    idx++;
  }
  if (deviceIds.size > 0) {
    (results[idx] || []).forEach(d => {
      devices[d.id] = d.name || d.id;
    });
  }

  return { drivers, devices };
}

// ── Match Changes to Rules ──
function matchChangesToRules(changes, rules, names) {
  const notifications = [];

  changes.forEach(change => {
    const driverId = change.driver ? change.driver.id : null;
    const deviceId = change.device ? change.device.id : null;
    const isAssign = deviceId && deviceId !== 'NoDeviceId';
    const driverName = driverId ? (names.drivers[driverId] || driverId) : 'Unknown';
    const deviceName = isAssign ? (names.devices[deviceId] || deviceId) : 'None';

    rules.forEach(rule => {
      const d = rule.details;

      // Check scope: specific driver or all
      if (d.driverId && d.driverId !== driverId) return;

      // Check event type
      if (isAssign && !d.notifyOnAssign) return;
      if (!isAssign && !d.notifyOnUnassign) return;

      notifications.push({
        recipientEmail: d.recipientEmail,
        recipientName: d.recipientName,
        driverName,
        deviceName,
        eventType: isAssign ? 'Assigned' : 'Unassigned',
        dateTime: change.dateTime
      });
    });
  });

  return notifications;
}

// ── Email ──
function buildEmailHtml(notif) {
  const eventColor = notif.eventType === 'Assigned' ? '#34a853' : '#ea4335';
  const eventLabel = notif.eventType === 'Assigned'
    ? `Assigned to <strong>${escapeHtml(notif.deviceName)}</strong>`
    : `Unassigned from vehicle`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:20px auto;">
    <tr>
      <td style="background:linear-gradient(135deg,#1a73e8 0%,#00897b 100%);padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">Driver Assignment Alert</h1>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;padding:28px 32px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Driver</td>
            <td style="padding:8px 0;font-size:15px;font-weight:600;color:#202124;">${escapeHtml(notif.driverName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Event</td>
            <td style="padding:8px 0;">
              <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:${eventColor}20;color:${eventColor};">
                ${notif.eventType}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Vehicle</td>
            <td style="padding:8px 0;font-size:15px;color:#202124;">${eventLabel}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Time</td>
            <td style="padding:8px 0;font-size:14px;color:#202124;">${new Date(notif.dateTime).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #e0e4ea;margin:20px 0 12px;">
        <p style="font-size:11px;color:#9aa0a6;margin:0;">Sent by Driver Assignment Dashboard</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmails(notifications, gmailCreds) {
  if (notifications.length === 0) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailCreds.user,
      pass: gmailCreds.appPassword
    }
  });

  // Group by recipient to batch
  const byRecipient = {};
  notifications.forEach(n => {
    if (!byRecipient[n.recipientEmail]) {
      byRecipient[n.recipientEmail] = [];
    }
    byRecipient[n.recipientEmail].push(n);
  });

  for (const [email, notifs] of Object.entries(byRecipient)) {
    for (const notif of notifs) {
      const subject = `Driver ${notif.eventType}: ${notif.driverName}`;
      try {
        await transporter.sendMail({
          from: `"Driver Assignment Dashboard" <${gmailCreds.user}>`,
          to: email,
          subject,
          html: buildEmailHtml(notif)
        });
        console.log(`Email sent to ${email}: ${subject}`);
      } catch (err) {
        console.error(`Failed to send email to ${email}:`, err.message);
      }
    }
  }
}

// ── Entry Point ──
exports.checkDriverChanges = async (req, res) => {
  try {
    console.log('Starting driver change check...');

    // 1. Load secrets
    const secrets = await loadSecrets();

    // 2. Authenticate to MyGeotab
    const api = await authenticateMyGeotab(secrets.mygeotab);
    console.log('Authenticated to MyGeotab');

    // 3. Load feed state
    const feedState = await loadFeedState();
    console.log('Feed state loaded, toVersion:', feedState.toVersion || 'initial');

    // 4. Poll GetFeed
    const feed = await pollDriverChangeFeed(api, feedState.toVersion);
    console.log(`Got ${feed.data.length} new changes, new toVersion: ${feed.toVersion}`);

    // 5. Save new toVersion
    await saveFeedState(feed.toVersion);

    if (feed.data.length === 0) {
      console.log('No new changes, done.');
      if (res) res.status(200).send('No new changes');
      return;
    }

    // 6. Load notification rules
    const rules = await loadNotifRules(api);
    console.log(`Loaded ${rules.length} notification rules`);

    if (rules.length === 0) {
      console.log('No notification rules configured, done.');
      if (res) res.status(200).send('No rules configured');
      return;
    }

    // 7. Resolve driver/device names
    const names = await resolveNames(api, feed.data);

    // 8. Match changes to rules
    const notifications = matchChangesToRules(feed.data, rules, names);
    console.log(`Matched ${notifications.length} notifications to send`);

    // 9. Send emails
    await sendEmails(notifications, secrets.gmail);

    console.log('Done.');
    if (res) res.status(200).send(`Processed ${feed.data.length} changes, sent ${notifications.length} notifications`);
  } catch (err) {
    console.error('Error:', err);
    if (res) res.status(500).send('Error: ' + err.message);
  }
};
