const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Writable} = require('node:stream');
const {gunzipSync} = require('node:zlib');
const fs = require('node:fs');
const {createApp, assetPath} = require('../server.js');

function request(app, url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const chunks = [], responseHeaders = {};
    let status;
    const res = new Writable({write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); }});
    res.setHeader = (key, value) => { responseHeaders[key] = value; };
    res.writeHead = (code, values = {}) => { status = code; Object.assign(responseHeaders, values); };
    res.on('error', reject);
    res.on('finish', () => resolve({status, headers: responseHeaders, body: Buffer.concat(chunks)}));
    app.server.emit('request', {url, method, headers}, res);
  });
}

test('text assets negotiate gzip, preserve bytes, and honor HEAD without a listener', async t => {
  const app = createApp(); t.after(() => app.close());
  const url = '/network-session.js', original = fs.readFileSync(assetPath(url));
  const compressed = await request(app, url, {'accept-encoding': 'br, gzip'});
  assert.equal(compressed.status, 200);
  assert.equal(compressed.headers['Content-Encoding'], 'gzip');
  assert.equal(compressed.headers.Vary, 'Accept-Encoding');
  assert.equal(compressed.headers['Content-Length'], undefined);
  assert.deepEqual(gunzipSync(compressed.body), original);
  assert.ok(compressed.body.length < original.length / 2);
  for (const encoding of ['', 'br', 'gzip;q=0, *;q=1']) {
    const plain = await request(app, url, {'accept-encoding': encoding});
    assert.equal(plain.headers['Content-Encoding'], undefined);
    assert.equal(plain.headers['Content-Length'], original.length);
    assert.deepEqual(plain.body, original);
  }
  const wildcard = await request(app, url, {'accept-encoding': '*;q=0.5'});
  assert.deepEqual(gunzipSync(wildcard.body), original);
  const head = await request(app, url, {'accept-encoding': 'gzip'}, 'HEAD');
  assert.equal(head.headers['Content-Encoding'], 'gzip');
  assert.equal(head.body.length, 0);
  const audio = await request(app, '/client/audio/tank-drive.mp3', {'accept-encoding': 'gzip'});
  assert.equal(audio.headers['Content-Encoding'], undefined);
});

test('validators return 304, stale ETags take precedence over dates, APIs remain fresh', async t => {
  const app = createApp(); t.after(() => app.close());
  const url = '/network-session.js', first = await request(app, url);
  assert.equal(first.headers['Cache-Control'], 'no-cache');
  for (const headers of [
    {'if-none-match': first.headers.ETag},
    {'if-none-match': '"stale", ' + first.headers.ETag, 'accept-encoding': 'gzip'},
    {'if-none-match': '*'},
    {'if-modified-since': first.headers['Last-Modified']},
  ]) {
    const result = await request(app, url, headers);
    assert.equal(result.status, 304);
    assert.equal(result.body.length, 0);
    assert.equal(result.headers.ETag, first.headers.ETag);
  }
  for (const headers of [
    {'if-none-match': '"stale"', 'if-modified-since': first.headers['Last-Modified']},
    {'if-modified-since': 'invalid'},
    {'if-modified-since': 'Thu, 01 Jan 1970 00:00:00 GMT'},
  ]) assert.equal((await request(app, url, headers)).status, 200);
  const rooms = await request(app, '/api/rooms', {'if-none-match': '*'});
  assert.equal(rooms.status, 200);
  assert.equal(rooms.headers['Cache-Control'], 'no-store');
});
