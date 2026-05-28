#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const https = require('https');
const zlib = require('zlib');

const SAMPLE_PLAINTEXT =
  '2026DLCSHARE$xxxxx$ UP主限定皮肤限时领取，【复制】整条消息，打开【哔哩哔哩】领取你的专属卡牌和表情包叭！ 下载地址【 https://www.bilibili.com/】';

const env = process.env;

const config = {
  host: 'api.bilibili.com',
  path: '/x/share/clipboardMeta',
  appkey: env.BILI_APPKEY || '1d8b6e7d45233436',
  appsec: env.BILI_APPSEC || '560c52ccd288fed045859ed18bffd973',
  accessKey: env.BILI_ACCESS_KEY || '',
  build: env.BILI_BUILD || '8120200',
  business: env.BILI_BUSINESS || '2026DLCSHARE',
  cLocale: env.BILI_C_LOCALE || 'zh_CN',
  channel: env.BILI_CHANNEL || 'oppo',
  disableRcmd: env.BILI_DISABLE_RCMD || '0',
  mobiApp: env.BILI_MOBI_APP || 'android',
  platform: env.BILI_PLATFORM || 'android',
  sLocale: env.BILI_S_LOCALE || 'zh_CN',
  startPattern: env.BILI_START_PATTERN || '2',
  statistics:
    env.BILI_STATISTICS ||
    JSON.stringify({
      appId: 1,
      platform: 3,
      version: '8.12.0',
      abtest: '',
    }),
  plaintext: env.BILI_PLAINTEXT || SAMPLE_PLAINTEXT,
  encryptionKey: env.BILI_ENCRYPTION_KEY || 'XX7BCF57DD53811EBB19C4D5244C9A6A',
  encryptionIv: env.BILI_ENCRYPTION_IV || 'XX7BCF57DD53811E',
  headers: {
    buvid: env.BILI_BUVID || 'XX7BCF57DD53811EBB19C4D5244C9A6AED9B0',
    fp_local:
      env.BILI_FP_LOCAL || 'd6094207a7f1d83699485edeb563ca9e20240905184123a3b2f31a7fecdecbaf',
    fp_remote:
      env.BILI_FP_REMOTE || 'd6094207a7f1d83699485edeb563ca9e20240826150753d5975cd4642dd7d626',
    session_id: env.BILI_SESSION_ID || '3075b492',
    guestid: env.BILI_GUEST_ID || '23535158781895',
    env: env.BILI_ENV || 'prod',
    appKeyHeader: env.BILI_APP_KEY_HEADER || 'android64',
    userAgent:
      env.BILI_USER_AGENT ||
      'Mozilla/5.0 BiliDroid/8.12.0 (bbcallen@gmail.com) os/android model/Nexus 5 mobi_app/android build/8120200 channel/oppo innerVer/8120210 osVer/7.1.2 network/2',
    traceId: env.BILI_TRACE_ID || '',
    auroraEid: env.BILI_AURORA_EID || '',
    mid: env.BILI_MID || '',
    auroraZone: env.BILI_AURORA_ZONE || '',
    gaiaVtoken: env.BILI_GAIA_VTOKEN || '',
    ticket:
      env.BILI_X_BILI_TICKET ||
      'eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzU2Nzc0NDYsImlhdCI6MTc3NTY0ODM0NiwiYnV2aWQiOiJYWDdCQ0Y1N0RENTM4MTFFQkIxOUM0RDUyNDRDOUE2QUVEOUIwIn0.yLC3iHE07rVSIPJwPUz3lDPwVATNzGHSrF_ShtR-ZbM',
    httpEngine: env.BILI_HTTP_ENGINE || 'cronet',
    acceptEncoding: env.BILI_ACCEPT_ENCODING || 'gzip, deflate, br',
  },
};

function strictEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function md5(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function getAesAlgorithm(keyText) {
  const keyLength = Buffer.byteLength(keyText, 'utf8');
  if (keyLength === 16) return 'aes-128-cbc';
  if (keyLength === 24) return 'aes-192-cbc';
  if (keyLength === 32) return 'aes-256-cbc';
  throw new Error(`不支持的 AES key 长度: ${keyLength} 字节`);
}

function wrapBase64ForAndroid(base64Text) {
  const lines = base64Text.match(/.{1,76}/g) || [];
  return `${lines.join('\n')}\n`;
}

function encryptClipboardData(plaintext, keyText, ivText) {
  const cipher = crypto.createCipheriv(
    getAesAlgorithm(keyText),
    Buffer.from(keyText, 'utf8'),
    Buffer.from(ivText, 'utf8')
  );
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return wrapBase64ForAndroid(encrypted.toString('base64'));
}

function buildSignedQuery() {
  const encryptedData = encryptClipboardData(
    config.plaintext,
    config.encryptionKey,
    config.encryptionIv
  );

  const params = {
    access_key: config.accessKey,
    appkey: config.appkey,
    build: config.build,
    business: config.business,
    c_locale: config.cLocale,
    channel: config.channel,
    data: encryptedData,
    disable_rcmd: config.disableRcmd,
    mobi_app: config.mobiApp,
    platform: config.platform,
    s_locale: config.sLocale,
    start_pattern: config.startPattern,
    statistics: config.statistics,
    ts: env.BILI_TS || Math.floor(Date.now() / 1000).toString(),
  };

  const orderedKeys = Object.keys(params).sort();
  const query = orderedKeys
    .map((key) => `${strictEncode(key)}=${strictEncode(params[key])}`)
    .join('&');
  const sign = md5(query + config.appsec);

  return {
    encryptedData,
    query,
    sign,
    signedQuery: `${query}&sign=${sign}`,
  };
}

function generateTraceId() {
  const full = crypto.randomBytes(16).toString('hex');
  return `${full}:${full.slice(-16)}:0:0`;
}

function buildHeaders() {
  const traceId = config.headers.traceId || generateTraceId();
  const headers = {
    host: config.host,
    buvid: config.headers.buvid,
    fp_local: config.headers.fp_local,
    fp_remote: config.headers.fp_remote,
    session_id: config.headers.session_id,
    guestid: config.headers.guestid,
    env: config.headers.env,
    'app-key': config.headers.appKeyHeader,
    'user-agent': config.headers.userAgent,
    'x-bili-trace-id': traceId,
    'x-bili-ticket': config.headers.ticket,
    'bili-http-engine': config.headers.httpEngine,
    'accept-encoding': config.headers.acceptEncoding,
    accept: 'application/json',
  };

  if (config.headers.auroraEid) headers['x-bili-aurora-eid'] = config.headers.auroraEid;
  if (config.headers.mid) headers['x-bili-mid'] = config.headers.mid;
  if (config.headers.auroraZone) headers['x-bili-aurora-zone'] = config.headers.auroraZone;
  if (config.headers.gaiaVtoken) headers['x-bili-gaia-vtoken'] = config.headers.gaiaVtoken;

  return headers;
}

function decodeResponseBody(buffer, encoding) {
  if (!encoding) return buffer;
  const normalized = encoding.toLowerCase();
  if (normalized.includes('br')) return zlib.brotliDecompressSync(buffer);
  if (normalized.includes('gzip')) return zlib.gunzipSync(buffer);
  if (normalized.includes('deflate')) return zlib.inflateSync(buffer);
  return buffer;
}

function sendRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const rawBody = Buffer.concat(chunks);
            const decoded = decodeResponseBody(rawBody, res.headers['content-encoding']);
            const text = decoded.toString('utf8');
            let json = null;
            try {
              json = JSON.parse(text);
            } catch {
              json = null;
            }

            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              text,
              json,
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const shouldSend = process.argv.includes('--send');
  const { encryptedData, query, sign, signedQuery } = buildSignedQuery();
  const url = `https://${config.host}${config.path}?${signedQuery}`;
  const headers = buildHeaders();

  console.log('明文 data:');
  console.log(config.plaintext);
  console.log('\n加密后的 data（Base64，保留 Android 换行）:');
  console.log(encryptedData);
  console.log(`sign: ${sign}`);
  console.log(`\n最终 URL:\n${url}`);
  console.log('\n请求头:');
  console.log(JSON.stringify(headers, null, 2));

  if (!shouldSend) {
    console.log('\n当前是 dry-run。加上 --send 才会真正发起请求。');
    return;
  }

  const response = await sendRequest(url, headers);
  console.log(`\nHTTP ${response.statusCode}`);
  console.log('\n响应头:');
  console.log(JSON.stringify(response.headers, null, 2));
  console.log('\n响应体:');
  console.log(response.json ? JSON.stringify(response.json, null, 2) : response.text);
}

main().catch((error) => {
  console.error('请求失败:');
  console.error(error);
  process.exitCode = 1;
});
