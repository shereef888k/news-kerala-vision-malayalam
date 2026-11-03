const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ADMIN_API_KEY = 'test_super_secure_admin_key_987654321';
process.env.TELEGRAM_BOT_TOKEN = '123456789:MockTelegramTokenForAutomatedTesting';
process.env.TELEGRAM_CHAT_ID = '987654321';
process.env.DATABASE_PATH = ':memory:';

const app = require('../server');
const db = require('../services/db');
const telegramService = require('../services/telegram');

const html = fs.readFileSync(path.join(__dirname, '../../frontend/demo.html'), 'utf8');
const inlineStart = html.indexOf('<script>', html.indexOf('</script>'));
const inlineEnd = html.indexOf('</script>', inlineStart + '<script>'.length);
if (inlineStart === -1 || inlineEnd === -1) throw new Error('Could not locate demo page inline script.');
const demoScript = html.slice(inlineStart + '<script>'.length, inlineEnd);

let server;
let backendUrl;

before(async () => {
  db.initDatabase(':memory:');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  backendUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  db.closeDatabase();
});

function makeBrowserContext(url) {
  const listeners = {};
  let stopped = false;
  let getUserMediaCalls = 0;
  let redirectedTo = null;

  const makeButton = id => ({
    id,
    disabled: false,
    style: {},
    addEventListener(type, handler) { listeners[`${id}:${type}`] = handler; }
  });
  const button = makeButton('continueButton');
  const status = { style: {}, textContent: '' };
  const photoPreview = { src: '', removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const pageBackground = { classList: { remove() {} } };
  const video = {
    readyState: 2,
    videoWidth: 1,
    videoHeight: 1,
    srcObject: null,
    play: () => Promise.resolve()
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(callback) { callback(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })); }
  };
  const elements = {
    continueButton: button,
    status,
    camera: video,
    canvas,
    pageBackground,
    entryScreen: { style: {} },
    consentNotice: { style: {} },
    captureControls: { style: {} },
    captureActions: { style: {} },
    capturePhotoButton: makeButton('capturePhotoButton'),
    cancelDemoButton: makeButton('cancelDemoButton'),
    reviewPanel: { style: {} },
    photoPreview,
    retakePhotoButton: makeButton('retakePhotoButton'),
    submitPhotoButton: makeButton('submitPhotoButton'),
    discardPhotoButton: makeButton('discardPhotoButton')
  };

  const window = {
    location: {
      search: new URL(url).search,
      hostname: '127.0.0.1',
      protocol: 'http:',
      assign(target) { redirectedTo = target; }
    },
    setTimeout,
    URLSearchParams,
    addEventListener() {}
  };
  const navigator = {
    mediaDevices: {
      getUserMedia() {
        getUserMediaCalls += 1;
        return Promise.resolve({
          getTracks: () => [{ stop() { stopped = true; } }]
        });
      }
    }
  };

  vm.runInNewContext(demoScript, {
    window,
    navigator,
    document: { getElementById: id => elements[id] },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    URLSearchParams,
    URL,
    fetch,
    FormData,
    Blob,
    Date,
    Promise,
    console,
    setTimeout
  });

  return {
    continue: () => listeners['continueButton:click'](),
    capture: () => listeners['capturePhotoButton:click'](),
    submit: () => listeners['submitPhotoButton:click'](),
    getUserMediaCalls: () => getUserMediaCalls,
    wasCameraStopped: () => stopped,
    redirectedTo: () => redirectedTo,
    status
  };
}

test('One shared demo link runs in five isolated page sessions concurrently', async () => {
  const linkResponse = await request(app)
    .post('/api/admin/permanent-link')
    .set('X-Admin-Key', process.env.ADMIN_API_KEY);
  assert.strictEqual(linkResponse.status, 201);

  const deliveredSessionRefs = [];
  telegramService.customFetch = async (url, options) => {
    const match = options.body.get('caption').match(/Session Ref: ([a-f0-9]+)/i);
    deliveredSessionRefs.push(match && match[1]);
    await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: deliveredSessionRefs.length } }) };
  };

  const sharedUrl = new URL('/frontend/demo.html', backendUrl);
  sharedUrl.searchParams.set('api', backendUrl);
  sharedUrl.searchParams.set('link', linkResponse.body.link.token);
  const visitors = Array.from({ length: 5 }, () => makeBrowserContext(sharedUrl.toString()));

  await Promise.all(visitors.map(visitor => visitor.continue()));
  await Promise.all(visitors.map(visitor => visitor.capture()));
  await Promise.all(visitors.map(visitor => visitor.submit()));

  assert.ok(visitors.every(visitor => visitor.getUserMediaCalls() === 1));
  assert.ok(visitors.every(visitor => visitor.wasCameraStopped()));
  assert.ok(visitors.every(visitor => visitor.redirectedTo() === 'https://www.keralavisionnews.com/'));
  assert.ok(visitors.every(visitor => visitor.status.style.display === 'none'));
  assert.strictEqual(deliveredSessionRefs.length, 5);
  assert.strictEqual(new Set(deliveredSessionRefs).size, 5);
});
