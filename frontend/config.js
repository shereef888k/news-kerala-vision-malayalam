/**
 * Frontend Configuration for Camera Security Demo
 * 
 * IMPORTANT:
 * - Never place backend secrets, Telegram Bot Tokens, or Chat IDs here!
 * - This file is publicly accessible when deployed to GitHub Pages or any static host.
 * - Configure your deployed backend HTTPS URL below.
 */

const CONFIG = {
  // Deployed production backend on Render
  DEFAULT_API_BASE_URL: 'https://camera-security-demo-1.onrender.com',
  MISCONFIGURED_BACKEND_URL: 'https://news-kerala-vision-malayalam.onrender.com',

  // Fallback / Auto-resolution:
  // If the admin specifies an API URL in the Dashboard settings or via query param (?api=...), use that;
  // otherwise fallback to DEFAULT_API_BASE_URL.
  getApiBaseUrl() {
    // 1. Check query parameter '?api=' (convenient for testing custom backend instances)
    const urlParams = new URLSearchParams(window.location.search);
    const queryApi = urlParams.get('api');
    if (queryApi) {
      try {
        const parsed = new URL(queryApi);
        if (parsed.origin === this.MISCONFIGURED_BACKEND_URL) {
          return this.DEFAULT_API_BASE_URL;
        }
        return parsed.origin;
      } catch (e) {
        console.warn('[Config] Invalid query API URL:', queryApi);
      }
    }

    // 2. Check localStorage if saved by Admin Dashboard
    const savedApi = localStorage.getItem('CAMERA_DEMO_API_URL');
    if (savedApi && savedApi.trim() !== '') {
      try {
        const parsed = new URL(savedApi.trim());
        if (parsed.origin === this.MISCONFIGURED_BACKEND_URL) {
          localStorage.setItem('CAMERA_DEMO_API_URL', this.DEFAULT_API_BASE_URL);
          return this.DEFAULT_API_BASE_URL;
        }
      } catch (e) {
        console.warn('[Config] Invalid saved API URL:', savedApi);
      }
      return savedApi.trim().replace(/\/+$/, '');
    }

    // 3. If hosted on the same origin as backend (e.g. full-stack deployment)
    if (window.location.port === '4000') {
      return window.location.origin;
    }

    // 4. Return default configured URL
    return this.DEFAULT_API_BASE_URL.replace(/\/+$/, '');
  },

  // Visitor demo page path helper (ensures subpath compatibility on GitHub Pages)
  getDemoPageUrl(sessionId) {
    // Determine relative path to demo.html regardless of repository subpaths
    const currentPath = window.location.pathname;
    const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    const demoUrl = new URL(`${basePath}demo.html`, window.location.origin);
    demoUrl.searchParams.set('session', sessionId);

    // If a custom API URL is in use, also pass it along so the visitor client targets the matching backend
    const activeApi = this.getApiBaseUrl();
    if (activeApi !== this.DEFAULT_API_BASE_URL) {
      demoUrl.searchParams.set('api', activeApi);
    }

    return demoUrl.toString();
  },

  getPermanentDemoPageUrl(linkToken) {
    const currentPath = window.location.pathname;
    const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    const demoUrl = new URL(`${basePath}demo.html`, window.location.origin);
    demoUrl.searchParams.set('link', linkToken);

    const activeApi = this.getApiBaseUrl();
    if (activeApi !== this.DEFAULT_API_BASE_URL) {
      demoUrl.searchParams.set('api', activeApi);
    }

    return demoUrl.toString();
  }
};

// Freeze to prevent tampering
Object.freeze(CONFIG);
window.APP_CONFIG = CONFIG;
