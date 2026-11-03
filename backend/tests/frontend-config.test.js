const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../frontend/config.js'), 'utf8');
const actualBackend = 'https://camera-security-demo-1.onrender.com';
const previousMisconfiguredHost = 'https://news-kerala-vision-malayalam.onrender.com';

function loadConfig(search = '', savedApi = '') {
  const values = new Map();
  if (savedApi) values.set('CAMERA_DEMO_API_URL', savedApi);
  const localStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const window = {
    location: {
      search,
      port: '',
      origin: 'https://news-kerala-vision-malayalam-fronte-five.vercel.app',
      pathname: '/admin.html'
    }
  };
  vm.runInNewContext(source, { window, localStorage, URL, URLSearchParams, console });
  return { config: window.APP_CONFIG, values };
}

test('frontend routes legacy API URLs to the live Render backend', () => {
  const queryConfig = loadConfig(`?api=${encodeURIComponent(previousMisconfiguredHost)}`);
  assert.strictEqual(queryConfig.config.getApiBaseUrl(), actualBackend);

  const savedConfig = loadConfig('', previousMisconfiguredHost);
  assert.strictEqual(savedConfig.config.getApiBaseUrl(), actualBackend);
  assert.strictEqual(savedConfig.values.get('CAMERA_DEMO_API_URL'), actualBackend);
  assert.strictEqual(
    savedConfig.config.getPermanentDemoPageUrl('test-token').includes(`api=${encodeURIComponent(previousMisconfiguredHost)}`),
    false
  );
});
