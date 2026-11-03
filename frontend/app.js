/**
 * Admin Dashboard Logic — Camera Security Demonstration Platform
 */

(() => {
  'use strict';

  // DOM Elements
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const alertContainer = document.getElementById('alert-container');
  const createSessionForm = document.getElementById('create-session-form');
  const sessionLabelInput = document.getElementById('session-label');
  const sessionDurationSelect = document.getElementById('session-duration');
  const btnCreateSession = document.getElementById('btn-create-session');
  const adminSettingsForm = document.getElementById('admin-settings-form');
  const adminApiKeyInput = document.getElementById('admin-api-key');
  const backendUrlInput = document.getElementById('backend-url-override');
  const keyStatusLabel = document.getElementById('key-status-label');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const btnRefreshSessions = document.getElementById('btn-refresh-sessions');
  const sessionsTableBody = document.getElementById('sessions-tbody');
  const permanentLinkStatus = document.getElementById('permanent-link-status');
  const permanentLinkUrlInput = document.getElementById('permanent-link-url');
  const btnCreatePermanentLink = document.getElementById('btn-create-permanent-link');
  const btnCopyPermanentLink = document.getElementById('btn-copy-permanent-link');
  const btnTogglePermanentLink = document.getElementById('btn-toggle-permanent-link');
  const btnRevokePermanentLink = document.getElementById('btn-revoke-permanent-link');

  // Modal Elements
  const linkModal = document.getElementById('link-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalLinkInput = document.getElementById('modal-link-input');
  const modalCopyBtn = document.getElementById('modal-copy-btn');
  const modalOpenLink = document.getElementById('modal-open-link');

  // State
  let pollIntervalId = null;
  let currentPermanentLink = null;

  // Initialize
  function init() {
    loadSettings();
    bindEvents();
    checkBackendHealth();
    fetchSessions();
    fetchPermanentDemoLink();

    // Auto-refresh sessions every 10 seconds to detect status changes
    pollIntervalId = setInterval(fetchSessions, 10000);
  }

  // Load saved credentials from localStorage (browser-local only)
  function loadSettings() {
    const savedKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';
    if (savedKey) {
      adminApiKeyInput.value = savedKey;
      keyStatusLabel.textContent = 'Configured';
      keyStatusLabel.style.color = '#34d399';
    } else {
      keyStatusLabel.textContent = 'Not Set';
      keyStatusLabel.style.color = '#f87171';
    }

    const currentApi = window.APP_CONFIG.getApiBaseUrl();
    backendUrlInput.value = currentApi;
  }

  // Bind Event Handlers
  function bindEvents() {
    // Admin Settings Form
    adminSettingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const keyVal = adminApiKeyInput.value.trim();
      const urlVal = backendUrlInput.value.trim();

      if (keyVal) {
        localStorage.setItem('CAMERA_DEMO_ADMIN_KEY', keyVal);
        keyStatusLabel.textContent = 'Configured';
        keyStatusLabel.style.color = '#34d399';
      } else {
        localStorage.removeItem('CAMERA_DEMO_ADMIN_KEY');
        keyStatusLabel.textContent = 'Not Set';
        keyStatusLabel.style.color = '#f87171';
      }

      if (urlVal) {
        localStorage.setItem('CAMERA_DEMO_API_URL', urlVal);
      } else {
        localStorage.removeItem('CAMERA_DEMO_API_URL');
      }

      showAlert('Settings updated successfully.', 'success');
      checkBackendHealth();
      fetchSessions();
      fetchPermanentDemoLink();
    });

    btnTestConnection.addEventListener('click', checkBackendHealth);

    // Create Session Form
    createSessionForm.addEventListener('submit', handleCreateSession);

    // Refresh Sessions Button
    btnRefreshSessions.addEventListener('click', () => {
      fetchSessions();
      fetchPermanentDemoLink();
    });

    btnCreatePermanentLink.addEventListener('click', createPermanentDemoLink);
    btnCopyPermanentLink.addEventListener('click', () => {
      if (permanentLinkUrlInput.value) copyToClipboard(permanentLinkUrlInput.value, btnCopyPermanentLink);
    });
    btnTogglePermanentLink.addEventListener('click', togglePermanentDemoLink);
    btnRevokePermanentLink.addEventListener('click', revokePermanentDemoLink);

    // Modal controls
    modalCloseBtn.addEventListener('click', () => {
      linkModal.classList.remove('active');
    });

    linkModal.addEventListener('click', (e) => {
      if (e.target === linkModal) {
        linkModal.classList.remove('active');
      }
    });

    modalCopyBtn.addEventListener('click', () => {
      copyToClipboard(modalLinkInput.value, modalCopyBtn);
    });
  }

  // Show dynamic notification alert
  function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `notice notice-${type}`;
    alert.style.marginBottom = '1rem';
    alert.innerHTML = `
      <div style="flex: 1;">${escapeHtml(message)}</div>
      <button style="background:none;border:none;color:inherit;cursor:pointer;font-weight:bold;margin-left:8px;" aria-label="Dismiss">&times;</button>
    `;

    const closeBtn = alert.querySelector('button');
    closeBtn.addEventListener('click', () => alert.remove());

    alertContainer.appendChild(alert);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (alert.parentElement) {
        alert.remove();
      }
    }, 5000);
  }

  // Check Backend Health
  async function checkBackendHealth() {
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    statusDot.className = 'indicator-dot checking';
    statusText.textContent = 'Checking API...';

    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.persistentStorageConfigured === false) {
          statusDot.className = 'indicator-dot offline';
          statusText.textContent = 'Online, but persistent storage is not configured';
        } else if (data.persistentStorageConfigured !== true) {
          statusDot.className = 'indicator-dot offline';
          statusText.textContent = 'Online, but backend storage status is unknown';
        } else {
          statusDot.className = 'indicator-dot';
          statusText.textContent = `Online (v${data.version || '1.0'})`;
        }
      } else {
        statusDot.className = 'indicator-dot offline';
        statusText.textContent = `Error ${response.status}`;
      }
    } catch (err) {
      statusDot.className = 'indicator-dot offline';
      statusText.textContent = 'Offline / CORS blocked';
      console.warn('[Dashboard] Health check failed:', err.message);
    }
  }

  function renderPermanentDemoLink(link) {
    currentPermanentLink = link || null;
    const hasLink = Boolean(link && link.token && link.id);
    const revoked = hasLink && link.status === 'revoked';

    permanentLinkUrlInput.value = hasLink ? window.APP_CONFIG.getPermanentDemoPageUrl(link.token) : '';
    btnCreatePermanentLink.hidden = hasLink && !revoked;
    btnCreatePermanentLink.textContent = revoked ? 'Create Replacement Link' : 'Create Permanent Link';
    btnCopyPermanentLink.disabled = !hasLink || revoked;
    btnTogglePermanentLink.hidden = !hasLink || revoked;
    btnRevokePermanentLink.hidden = !hasLink || revoked;

    if (!hasLink) {
      permanentLinkStatus.className = 'notice notice-info';
      permanentLinkStatus.textContent = 'No permanent link exists yet. Create one once, then share it until you disable or revoke access.';
      return;
    }

    if (revoked) {
      permanentLinkStatus.className = 'notice notice-danger';
      permanentLinkStatus.textContent = 'Access revoked. Create a replacement link to share again.';
      return;
    }

    const enabled = link.status === 'enabled';
    permanentLinkStatus.className = enabled ? 'notice notice-success' : 'notice notice-warning';
    permanentLinkStatus.textContent = enabled
      ? `Enabled — this URL does not expire. Visitor sessions expire after their configured session lifetime. Created ${formatDate(link.createdAt)}.`
      : `Disabled — visitors cannot start new sessions. Re-enable this same URL at any time. Created ${formatDate(link.createdAt)}.`;
    btnTogglePermanentLink.textContent = enabled ? 'Disable Link' : 'Enable Link';
  }

  async function fetchPermanentDemoLink() {
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';
    if (!adminKey) {
      currentPermanentLink = null;
      permanentLinkUrlInput.value = '';
      permanentLinkStatus.className = 'notice notice-info';
      permanentLinkStatus.textContent = 'Enter the administrator key to view and manage the permanent link.';
      btnCreatePermanentLink.disabled = true;
      btnCopyPermanentLink.disabled = true;
      btnTogglePermanentLink.hidden = true;
      btnRevokePermanentLink.hidden = true;
      return;
    }

    btnCreatePermanentLink.disabled = false;
    try {
      const response = await fetch(`${apiUrl}/api/admin/permanent-link`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'X-Admin-Key': adminKey }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.success !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}: Could not load the permanent link.`);
      }
      renderPermanentDemoLink(data.link);
    } catch (err) {
      permanentLinkStatus.className = 'notice notice-danger';
      permanentLinkStatus.textContent = `Could not load the permanent link: ${err.message}`;
    }
  }

  async function createPermanentDemoLink() {
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';
    if (!adminKey) {
      showAlert('Enter the administrator key before creating a permanent link.', 'warning');
      adminApiKeyInput.focus();
      return;
    }

    btnCreatePermanentLink.disabled = true;
    try {
      const response = await fetch(`${apiUrl}/api/admin/permanent-link`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'X-Admin-Key': adminKey }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.success !== true || !data.link) {
        throw new Error((data && data.error) || `HTTP ${response.status}: Could not create the permanent link.`);
      }
      renderPermanentDemoLink(data.link);
      showAlert('Permanent demo link is ready to copy.', 'success');
    } catch (err) {
      showAlert(`Permanent link creation failed: ${err.message}`, 'danger');
    } finally {
      btnCreatePermanentLink.disabled = false;
    }
  }

  async function togglePermanentDemoLink() {
    if (!currentPermanentLink) return;
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';
    btnTogglePermanentLink.disabled = true;
    try {
      const enabled = currentPermanentLink.status !== 'enabled';
      const response = await fetch(`${apiUrl}/api/admin/permanent-link/${currentPermanentLink.id}/status`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
        body: JSON.stringify({ enabled })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.success !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}: Could not change link status.`);
      }
      renderPermanentDemoLink(data.link);
      showAlert(enabled ? 'Permanent demo link enabled.' : 'Permanent demo link disabled.', 'success');
    } catch (err) {
      showAlert(`Link status update failed: ${err.message}`, 'danger');
    } finally {
      btnTogglePermanentLink.disabled = false;
    }
  }

  async function revokePermanentDemoLink() {
    if (!currentPermanentLink || !confirm('Revoke this permanent link? Visitors using it will no longer be able to continue.')) return;
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';
    btnRevokePermanentLink.disabled = true;
    try {
      const response = await fetch(`${apiUrl}/api/admin/permanent-link/${currentPermanentLink.id}/revoke`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'X-Admin-Key': adminKey }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.success !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}: Could not revoke link.`);
      }
      renderPermanentDemoLink(data.link);
      showAlert('Permanent demo link access revoked.', 'info');
      fetchSessions();
    } catch (err) {
      showAlert(`Link revocation failed: ${err.message}`, 'danger');
      btnRevokePermanentLink.disabled = false;
    }
  }

  // Create a new session
  async function handleCreateSession(e) {
    e.preventDefault();
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';

    if (!adminKey) {
      showAlert('Please configure your Administrator API Key under Backend & Credentials first.', 'warning');
      adminApiKeyInput.focus();
      return;
    }

    const label = sessionLabelInput.value.trim();
    const durationMinutes = parseInt(sessionDurationSelect.value, 10) || 30;

    btnCreateSession.disabled = true;
    btnCreateSession.innerHTML = '<span class="spinner"></span> Creating Session...';

    try {
      const response = await fetch(`${apiUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey
        },
        body: JSON.stringify({ label, durationMinutes })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}: Failed to create session`);
      }

      // Generate demo link
      const demoUrl = window.APP_CONFIG.getDemoPageUrl(data.session.id);

      modalLinkInput.value = demoUrl;
      modalOpenLink.href = demoUrl;
      linkModal.classList.add('active');

      // Clear label input
      sessionLabelInput.value = '';

      showAlert(`Demo session #${data.session.id.substring(0, 8)} created successfully!`, 'success');
      fetchSessions();
    } catch (err) {
      showAlert(`Creation failed: ${err.message}`, 'danger');
    } finally {
      btnCreateSession.disabled = false;
      btnCreateSession.innerHTML = '<span>Generate Secure Link</span>';
    }
  }

  // Fetch all sessions
  async function fetchSessions() {
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';

    if (!adminKey) {
      sessionsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Please enter your Administrator API Key in the settings box above to load sessions.
          </td>
        </tr>
      `;
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/api/sessions`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Admin-Key': adminKey
        }
      });

      if (response.status === 401 || response.status === 403) {
        sessionsTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: #f87171; padding: 2rem;">
              Authentication Error: Invalid Administrator API Key. Please verify your credentials.
            </td>
          </tr>
        `;
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      renderSessions(data.sessions || []);
    } catch (err) {
      sessionsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            Failed to connect to backend (${escapeHtml(err.message)}). Check server status and CORS configuration.
          </td>
        </tr>
      `;
    }
  }

  // Render sessions table
  function renderSessions(sessions) {
    if (!sessions || sessions.length === 0) {
      sessionsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No demonstration sessions found. Generate your first link using the form above.
          </td>
        </tr>
      `;
      return;
    }

    const rows = sessions.map(session => {
      const isExpired = new Date(session.expiresAt) < new Date();
      const statusBadge = getStatusBadge(session.status, isExpired, session.submissionsCount || 0);
      const demoUrl = window.APP_CONFIG.getDemoPageUrl(session.id);
      const createdFormatted = formatDate(session.createdAt);
      const expiresFormatted = formatExpiry(session.expiresAt, isExpired);

      const canRevoke = session.status !== 'revoked' && !isExpired;

      return `
        <tr data-session-id="${escapeHtml(session.id)}">
          <td>
            <span class="code-pill" title="${escapeHtml(session.id)}">
              ${escapeHtml(session.id.substring(0, 8))}...
            </span>
          </td>
          <td>
            <span style="color: ${session.label ? 'var(--text-main)' : 'var(--text-dim)'}; font-size: 0.85rem;">
              ${escapeHtml(session.label || '—')}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${createdFormatted}</td>
          <td style="font-size: 0.8rem; color: ${isExpired ? 'var(--text-dim)' : 'var(--accent-secondary)'};">
            ${expiresFormatted}
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 0.35rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary btn-sm btn-copy-link" data-url="${escapeHtml(demoUrl)}" title="Copy demo link">
                📋
              </button>
              <a href="${escapeHtml(demoUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Open demo link">
                ↗️
              </a>
              ${canRevoke ? `
                <button type="button" class="btn btn-danger btn-sm btn-revoke" data-id="${escapeHtml(session.id)}" title="Revoke session immediately">
                  Revoke
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    sessionsTableBody.innerHTML = rows;

    // Attach row events
    sessionsTableBody.querySelectorAll('.btn-copy-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = btn.getAttribute('data-url');
        copyToClipboard(url, btn);
      });
    });

    sessionsTableBody.querySelectorAll('.btn-revoke').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const sessionId = btn.getAttribute('data-id');
        if (confirm(`Are you sure you want to revoke session #${sessionId.substring(0, 8)}? Any ongoing demonstration will be invalidated immediately.`)) {
          await handleRevokeSession(sessionId, btn);
        }
      });
    });
  }

  // Handle Revoke
  async function handleRevokeSession(sessionId, buttonElement) {
    const apiUrl = window.APP_CONFIG.getApiBaseUrl();
    const adminKey = localStorage.getItem('CAMERA_DEMO_ADMIN_KEY') || '';

    buttonElement.disabled = true;
    buttonElement.textContent = '...';

    try {
      const response = await fetch(`${apiUrl}/api/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey
        }
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke session');
      }

      showAlert(`Session #${sessionId.substring(0, 8)} has been revoked.`, 'info');
      fetchSessions();
    } catch (err) {
      showAlert(`Revocation failed: ${err.message}`, 'danger');
      buttonElement.disabled = false;
      buttonElement.textContent = 'Revoke';
    }
  }

  // Helper: Status badge HTML
  function getStatusBadge(status, isExpired, submissionsCount = 0) {
    if (status === 'revoked') {
      return '<span class="badge badge-revoked">Revoked</span>';
    }
    if (isExpired) {
      return '<span class="badge badge-expired">Expired</span>';
    }
    if (submissionsCount > 0) {
      return `<span class="badge badge-submitted">${submissionsCount} Photo${submissionsCount === 1 ? '' : 's'} Submitted</span>`;
    }
    if (status === 'submitted') {
      return '<span class="badge badge-submitted">Photo Submitted</span>';
    }
    if (status === 'opened' || status === 'active') {
      return '<span class="badge badge-opened">Active</span>';
    }
    return '<span class="badge badge-created">Created</span>';
  }

  // Helper: Date format
  function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoStr;
    }
  }

  // Helper: Expiry countdown or date
  function formatExpiry(isoStr, isExpired) {
    if (!isoStr) return '—';
    if (isExpired) return 'Expired';
    try {
      const now = new Date();
      const exp = new Date(isoStr);
      const diffMs = exp - now;
      if (diffMs <= 0) return 'Expired';

      const mins = Math.floor(diffMs / 60000);
      const hours = Math.floor(mins / 60);

      if (hours > 0) {
        return `in ${hours}h ${mins % 60}m`;
      }
      return `in ${mins}m`;
    } catch {
      return isoStr;
    }
  }

  // Helper: Copy to clipboard
  async function copyToClipboard(text, triggerBtn) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-https or older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const originalHtml = triggerBtn.innerHTML;
      triggerBtn.innerHTML = '<span>✅ Copied!</span>';
      setTimeout(() => {
        triggerBtn.innerHTML = originalHtml;
      }, 2000);
    } catch (err) {
      showAlert('Unable to copy automatically. Please copy the link manually.', 'warning');
    }
  }

  // Helper: HTML escape
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run on DOM loaded
  document.addEventListener('DOMContentLoaded', init);
})();
