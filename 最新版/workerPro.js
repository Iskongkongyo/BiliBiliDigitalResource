// ==========================================
// 1. 全局默认配置 (环境变量优先级更高)
// ==========================================
// 虽然代码这里配置全局变量也能正常运行，但是强烈建议按照下面的方式配置！
// 在 Cloudflare Worker 面板 -> Settings -> Variables and Secrets 中配置以下变量：
// 环境变量名：JWT_SECRET, BASIC_USER, BASIC_PASS
const DEFAULT_SECRET_KEY = "注意：请自行设置密钥内容，长度任意！";
const DEFAULT_USERNAME = ""; // 留空表示不开启 Basic Auth
const DEFAULT_PASSWORD = ""; // 留空表示不开启 Basic Auth

const textEncoder = new TextEncoder();

// ==========================================
// 2. 轻量级 JWT 工具库 (需传入动态 Secret)
// ==========================================
async function signJWT(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const data = textEncoder.encode(`${encodedHeader}.${encodedPayload}`);

    const key = await crypto.subtle.importKey(
        'raw', textEncoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, data);
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [header, payload, signature] = parts;

        const data = textEncoder.encode(`${header}.${payload}`);
        const key = await crypto.subtle.importKey(
            'raw', textEncoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );

        const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, data);

        if (!isValid) return null;
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
        return null;
    }
}

// ==========================================
// 3. 辅助函数：提取根域名
// ==========================================
function extractRootDomains(jsonData) {
    const origins = new Set();
    origins.add('bilibili.com');
    origins.add('hdslb.com');

    const jsonStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
    const urls = jsonStr.match(/https?:\/\/[a-zA-Z0-9.-]+/g) || [];

    urls.forEach(u => {
        try {
            const host = new URL(u).hostname;
            const parts = host.split('.');
            if (parts.length >= 2) {
                origins.add(parts.slice(-2).join('.'));
            } else {
                origins.add(host);
            }
        } catch (e) { }
    });

    return Array.from(origins);
}

const CLIPBOARD_META_DEFAULTS = Object.freeze({
    host: 'api.bilibili.com',
    path: '/x/share/clipboardMeta',
    appkey: '1d8b6e7d45233436',
    appsec: '560c52ccd288fed045859ed18bffd973',
    accessKey: '',
    build: '8120200',
    business: '2026DLCSHARE',
    cLocale: 'zh_CN',
    channel: 'oppo',
    disableRcmd: '0',
    mobiApp: 'android',
    platform: 'android',
    sLocale: 'zh_CN',
    startPattern: '2',
    statistics: JSON.stringify({ appId: 1, platform: 3, version: '8.12.0', abtest: '' }),
    buvid: 'XX7BCF57DD53811EBB19C4D5244C9A6AED9B0',
    fpLocal: 'd6094207a7f1d83699485edeb563ca9e20240905184123a3b2f31a7fecdecbaf',
    fpRemote: 'd6094207a7f1d83699485edeb563ca9e20240826150753d5975cd4642dd7d626',
    sessionId: '3075b492',
    guestid: '23535158781895',
    appKeyHeader: 'android64',
    env: 'prod',
    userAgent: 'Mozilla/5.0 BiliDroid/8.12.0 (bbcallen@gmail.com) os/android model/Nexus 5 mobi_app/android build/8120200 channel/oppo innerVer/8120210 osVer/7.1.2 network/2',
    httpEngine: 'cronet'
});

function httpError(message, status = 400) {
    const error = new Error(message);
    error.statusCode = status;
    return error;
}

function jsonResponse(data, init = {}) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json;charset=UTF-8');
    }
    return new Response(JSON.stringify(data), { ...init, headers });
}

function strictEncode(value) {
    return encodeURIComponent(String(value)).replace(/[!'()*]/g, ch =>
        `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function wrapBase64ForAndroid(base64Text) {
    return `${base64Text.match(/.{1,76}/g)?.join('\n') || ''}\n`;
}

function bytesToBinary(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return binary;
}

function bytesToBase64(bytes) {
    return btoa(bytesToBinary(bytes));
}

function generateTraceId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const full = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${full}:${full.slice(-16)}:0:0`;
}

function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >>> 16) + (y >>> 16) + (lsw >>> 16);
    return (msw << 16) | (lsw & 0xffff);
}

function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
}

function md5Cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5Ff(a, b, c, d, x, s, t) {
    return md5Cmn((b & c) | (~b & d), a, b, x, s, t);
}

function md5Gg(a, b, c, d, x, s, t) {
    return md5Cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function md5Hh(a, b, c, d, x, s, t) {
    return md5Cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5Ii(a, b, c, d, x, s, t) {
    return md5Cmn(c ^ (b | ~d), a, b, x, s, t);
}

function binlMd5(words, bitLength) {
    words[bitLength >> 5] |= 0x80 << (bitLength % 32);
    words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;

    for (let i = 0; i < words.length; i += 16) {
        const oldA = a;
        const oldB = b;
        const oldC = c;
        const oldD = d;

        a = md5Ff(a, b, c, d, words[i + 0], 7, -680876936);
        d = md5Ff(d, a, b, c, words[i + 1], 12, -389564586);
        c = md5Ff(c, d, a, b, words[i + 2], 17, 606105819);
        b = md5Ff(b, c, d, a, words[i + 3], 22, -1044525330);
        a = md5Ff(a, b, c, d, words[i + 4], 7, -176418897);
        d = md5Ff(d, a, b, c, words[i + 5], 12, 1200080426);
        c = md5Ff(c, d, a, b, words[i + 6], 17, -1473231341);
        b = md5Ff(b, c, d, a, words[i + 7], 22, -45705983);
        a = md5Ff(a, b, c, d, words[i + 8], 7, 1770035416);
        d = md5Ff(d, a, b, c, words[i + 9], 12, -1958414417);
        c = md5Ff(c, d, a, b, words[i + 10], 17, -42063);
        b = md5Ff(b, c, d, a, words[i + 11], 22, -1990404162);
        a = md5Ff(a, b, c, d, words[i + 12], 7, 1804603682);
        d = md5Ff(d, a, b, c, words[i + 13], 12, -40341101);
        c = md5Ff(c, d, a, b, words[i + 14], 17, -1502002290);
        b = md5Ff(b, c, d, a, words[i + 15], 22, 1236535329);

        a = md5Gg(a, b, c, d, words[i + 1], 5, -165796510);
        d = md5Gg(d, a, b, c, words[i + 6], 9, -1069501632);
        c = md5Gg(c, d, a, b, words[i + 11], 14, 643717713);
        b = md5Gg(b, c, d, a, words[i + 0], 20, -373897302);
        a = md5Gg(a, b, c, d, words[i + 5], 5, -701558691);
        d = md5Gg(d, a, b, c, words[i + 10], 9, 38016083);
        c = md5Gg(c, d, a, b, words[i + 15], 14, -660478335);
        b = md5Gg(b, c, d, a, words[i + 4], 20, -405537848);
        a = md5Gg(a, b, c, d, words[i + 9], 5, 568446438);
        d = md5Gg(d, a, b, c, words[i + 14], 9, -1019803690);
        c = md5Gg(c, d, a, b, words[i + 3], 14, -187363961);
        b = md5Gg(b, c, d, a, words[i + 8], 20, 1163531501);
        a = md5Gg(a, b, c, d, words[i + 13], 5, -1444681467);
        d = md5Gg(d, a, b, c, words[i + 2], 9, -51403784);
        c = md5Gg(c, d, a, b, words[i + 7], 14, 1735328473);
        b = md5Gg(b, c, d, a, words[i + 12], 20, -1926607734);

        a = md5Hh(a, b, c, d, words[i + 5], 4, -378558);
        d = md5Hh(d, a, b, c, words[i + 8], 11, -2022574463);
        c = md5Hh(c, d, a, b, words[i + 11], 16, 1839030562);
        b = md5Hh(b, c, d, a, words[i + 14], 23, -35309556);
        a = md5Hh(a, b, c, d, words[i + 1], 4, -1530992060);
        d = md5Hh(d, a, b, c, words[i + 4], 11, 1272893353);
        c = md5Hh(c, d, a, b, words[i + 7], 16, -155497632);
        b = md5Hh(b, c, d, a, words[i + 10], 23, -1094730640);
        a = md5Hh(a, b, c, d, words[i + 13], 4, 681279174);
        d = md5Hh(d, a, b, c, words[i + 0], 11, -358537222);
        c = md5Hh(c, d, a, b, words[i + 3], 16, -722521979);
        b = md5Hh(b, c, d, a, words[i + 6], 23, 76029189);
        a = md5Hh(a, b, c, d, words[i + 9], 4, -640364487);
        d = md5Hh(d, a, b, c, words[i + 12], 11, -421815835);
        c = md5Hh(c, d, a, b, words[i + 15], 16, 530742520);
        b = md5Hh(b, c, d, a, words[i + 2], 23, -995338651);

        a = md5Ii(a, b, c, d, words[i + 0], 6, -198630844);
        d = md5Ii(d, a, b, c, words[i + 7], 10, 1126891415);
        c = md5Ii(c, d, a, b, words[i + 14], 15, -1416354905);
        b = md5Ii(b, c, d, a, words[i + 5], 21, -57434055);
        a = md5Ii(a, b, c, d, words[i + 12], 6, 1700485571);
        d = md5Ii(d, a, b, c, words[i + 3], 10, -1894986606);
        c = md5Ii(c, d, a, b, words[i + 10], 15, -1051523);
        b = md5Ii(b, c, d, a, words[i + 1], 21, -2054922799);
        a = md5Ii(a, b, c, d, words[i + 8], 6, 1873313359);
        d = md5Ii(d, a, b, c, words[i + 15], 10, -30611744);
        c = md5Ii(c, d, a, b, words[i + 6], 15, -1560198380);
        b = md5Ii(b, c, d, a, words[i + 13], 21, 1309151649);
        a = md5Ii(a, b, c, d, words[i + 4], 6, -145523070);
        d = md5Ii(d, a, b, c, words[i + 11], 10, -1120210379);
        c = md5Ii(c, d, a, b, words[i + 2], 15, 718787259);
        b = md5Ii(b, c, d, a, words[i + 9], 21, -343485551);

        a = safeAdd(a, oldA);
        b = safeAdd(b, oldB);
        c = safeAdd(c, oldC);
        d = safeAdd(d, oldD);
    }

    return [a, b, c, d];
}

function bytesToWords(bytes) {
    const output = new Array(((bytes.length + 3) >> 2)).fill(0);
    for (let i = 0; i < bytes.length; i++) {
        output[i >> 2] |= bytes[i] << ((i % 4) * 8);
    }
    return output;
}

function wordsToHex(words) {
    const hex = '0123456789abcdef';
    let output = '';
    for (let i = 0; i < words.length * 4; i++) {
        const value = (words[i >> 2] >> ((i % 4) * 8)) & 0xff;
        output += hex[(value >>> 4) & 0x0f] + hex[value & 0x0f];
    }
    return output;
}

function md5Hex(text) {
    const bytes = textEncoder.encode(text);
    return wordsToHex(binlMd5(bytesToWords(bytes), bytes.length * 8));
}

function extractUrlFromText(input) {
    const match = String(input || '').match(/https?:\/\/[^\s"'<>]+/i);
    if (!match) return null;
    return match[0].replace(/[)\]}>"'.,!?，。！？】》」]+$/u, '');
}

function extractActAndLottery(input) {
    const candidate = extractUrlFromText(input) || String(input || '').trim();
    try {
        const parsed = new URL(candidate);
        const actId = parsed.searchParams.get('act_id') || parsed.searchParams.get('id');
        const lotteryId = parsed.searchParams.get('lottery_id');
        if (!actId || !lotteryId) return null;
        return { actId, lotteryId, resolvedUrl: parsed.toString() };
    } catch (error) {
        return null;
    }
}

function looksLikeClipboardShareText(input) {
    return /^[A-Za-z0-9]+\$[^$]+\$/.test(String(input || '').trim());
}

function getClipboardMetaConfig(env, plaintext) {
    const buvid = env.BILI_BUVID || CLIPBOARD_META_DEFAULTS.buvid;
    const businessFromText = String(plaintext || '').split('$')[0]?.trim();
    const encryptionKey = env.BILI_ENCRYPTION_KEY || buvid.slice(0, 32);
    const encryptionIv = env.BILI_ENCRYPTION_IV || buvid.slice(0, 16);

    return {
        host: CLIPBOARD_META_DEFAULTS.host,
        path: CLIPBOARD_META_DEFAULTS.path,
        appkey: env.BILI_APPKEY || CLIPBOARD_META_DEFAULTS.appkey,
        appsec: env.BILI_APPSEC || CLIPBOARD_META_DEFAULTS.appsec,
        accessKey: env.BILI_ACCESS_KEY || CLIPBOARD_META_DEFAULTS.accessKey,
        build: env.BILI_BUILD || CLIPBOARD_META_DEFAULTS.build,
        business: env.BILI_BUSINESS || businessFromText || CLIPBOARD_META_DEFAULTS.business,
        cLocale: env.BILI_C_LOCALE || CLIPBOARD_META_DEFAULTS.cLocale,
        channel: env.BILI_CHANNEL || CLIPBOARD_META_DEFAULTS.channel,
        disableRcmd: env.BILI_DISABLE_RCMD || CLIPBOARD_META_DEFAULTS.disableRcmd,
        mobiApp: env.BILI_MOBI_APP || CLIPBOARD_META_DEFAULTS.mobiApp,
        platform: env.BILI_PLATFORM || CLIPBOARD_META_DEFAULTS.platform,
        sLocale: env.BILI_S_LOCALE || CLIPBOARD_META_DEFAULTS.sLocale,
        startPattern: env.BILI_START_PATTERN || CLIPBOARD_META_DEFAULTS.startPattern,
        statistics: env.BILI_STATISTICS || CLIPBOARD_META_DEFAULTS.statistics,
        plaintext,
        encryptionKey,
        encryptionIv,
        headers: {
            buvid,
            fpLocal: env.BILI_FP_LOCAL || CLIPBOARD_META_DEFAULTS.fpLocal,
            fpRemote: env.BILI_FP_REMOTE || CLIPBOARD_META_DEFAULTS.fpRemote,
            sessionId: env.BILI_SESSION_ID || CLIPBOARD_META_DEFAULTS.sessionId,
            guestid: env.BILI_GUEST_ID || CLIPBOARD_META_DEFAULTS.guestid,
            env: env.BILI_ENV || CLIPBOARD_META_DEFAULTS.env,
            appKeyHeader: env.BILI_APP_KEY_HEADER || CLIPBOARD_META_DEFAULTS.appKeyHeader,
            userAgent: env.BILI_USER_AGENT || CLIPBOARD_META_DEFAULTS.userAgent,
            traceId: env.BILI_TRACE_ID || '',
            ticket: env.BILI_X_BILI_TICKET || '',
            httpEngine: env.BILI_HTTP_ENGINE || CLIPBOARD_META_DEFAULTS.httpEngine
        }
    };
}

async function encryptClipboardPlaintext(plaintext, keyText, ivText) {
    const keyBytes = textEncoder.encode(keyText);
    const ivBytes = textEncoder.encode(ivText);

    if (![16, 24, 32].includes(keyBytes.length)) {
        throw httpError('Invalid clipboard encryption key length.', 500);
    }
    if (ivBytes.length !== 16) {
        throw httpError('Invalid clipboard encryption IV length.', 500);
    }

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-CBC' },
        false,
        ['encrypt']
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: ivBytes },
        cryptoKey,
        textEncoder.encode(plaintext)
    );

    return wrapBase64ForAndroid(bytesToBase64(new Uint8Array(encryptedBuffer)));
}

async function resolveClipboardShareUrl(plaintext, env) {
    const config = getClipboardMetaConfig(env, plaintext);
    const encryptedData = await encryptClipboardPlaintext(
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
        ts: Math.floor(Date.now() / 1000).toString()
    };

    const orderedKeys = Object.keys(params).sort();
    const query = orderedKeys
        .map(key => `${strictEncode(key)}=${strictEncode(params[key])}`)
        .join('&');
    const sign = md5Hex(query + config.appsec);
    const target = `https://${config.host}${config.path}?${query}&sign=${sign}`;

    const headers = new Headers({
        Accept: 'application/json',
        'app-key': config.headers.appKeyHeader,
        'bili-http-engine': config.headers.httpEngine,
        buvid: config.headers.buvid,
        env: config.headers.env,
        fp_local: config.headers.fpLocal,
        fp_remote: config.headers.fpRemote,
        guestid: config.headers.guestid,
        session_id: config.headers.sessionId,
        'user-agent': config.headers.userAgent,
        'x-bili-trace-id': config.headers.traceId || generateTraceId()
    });

    if (config.headers.ticket) {
        headers.set('x-bili-ticket', config.headers.ticket);
    }

    const response = await fetch(target, { method: 'GET', headers, redirect: 'follow' });
    const responseText = await response.text();

    let payload;
    try {
        payload = JSON.parse(responseText);
    } catch (error) {
        throw httpError(`clipboardMeta returned non-JSON response (${response.status}).`, 502);
    }

    if (!response.ok || payload?.code !== 0) {
        throw httpError(
            payload?.message || payload?.msg || `clipboardMeta request failed with HTTP ${response.status}.`,
            response.ok ? 502 : response.status
        );
    }

    const resolvedUrl = payload?.data?.url;
    if (!resolvedUrl) {
        throw httpError('clipboardMeta response missing data.url.', 502);
    }

    return resolvedUrl;
}

async function resolveShareInput(input, env) {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
        throw httpError('Input is required.', 400);
    }

    const directMatch = extractActAndLottery(trimmed);
    if (directMatch) {
        return { inputType: 'url', ...directMatch };
    }

    if (!looksLikeClipboardShareText(trimmed)) {
        throw httpError('Unable to find a valid bilibili share URL or supported clipboard text.', 400);
    }

    const resolvedUrl = await resolveClipboardShareUrl(trimmed, env);
    const resolvedMatch = extractActAndLottery(resolvedUrl);
    if (!resolvedMatch) {
        throw httpError('clipboardMeta returned a URL without act_id or lottery_id.', 502);
    }

    return { inputType: 'clipboard_text', ...resolvedMatch };
}

async function readRequestInput(request) {
    if (request.method !== 'POST') return '';

    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
        const body = await request.clone().json().catch(() => null);
        return typeof body?.input === 'string' ? body.input : '';
    }

    if (contentType.includes('text/plain')) {
        return request.clone().text();
    }

    return '';
}

async function fetchBilibiliJson(target, label) {
    const response = await fetch(target);
    const responseText = await response.text();

    let data;
    try {
        data = JSON.parse(responseText);
    } catch (error) {
        throw httpError(`${label} returned non-JSON response (${response.status}).`, 502);
    }

    if (!response.ok || data?.code !== 0) {
        throw httpError(
            data?.message || data?.msg || `${label} failed with HTTP ${response.status}.`,
            response.ok ? 502 : response.status
        );
    }

    return data;
}

export default {
    async fetch(request, env, ctx) {
        // ==========================================
        // 初始化环境变量 (环境配置优先于代码全局变量)
        // ==========================================
        const SECRET_KEY = env.JWT_SECRET || DEFAULT_SECRET_KEY;
        const AUTH_USER = env.BASIC_USER || DEFAULT_USERNAME;
        const AUTH_PASS = env.BASIC_PASS || DEFAULT_PASSWORD;

        // ==========================================
        // Basic Authorization 鉴权拦截器
        // ==========================================
        if (AUTH_USER && AUTH_PASS) {
            const authHeader = request.headers.get('Authorization');
            const expectedAuth = 'Basic ' + btoa(`${AUTH_USER}:${AUTH_PASS}`);

            // 预检请求放行，避免跨域报错
            if (request.method !== 'OPTIONS' && authHeader !== expectedAuth) {
                return new Response('401 Unauthorized', {
                    status: 401,
                    headers: {
                        'WWW-Authenticate': 'Basic realm="BiliProxy Secure Area", charset="UTF-8"',
                        'Content-Type': 'text/plain;charset=UTF-8'
                    }
                });
            }
        }

        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Allow-Credentials': 'true'
                }
            });
        }

        // ==========================================
        // 路由逻辑
        // ==========================================
        if (url.pathname === '/api/basic') {
            const actId = url.searchParams.get('act_id');
            if (!actId) {
                return jsonResponse({ error: 'Missing act_id.' }, { status: 400 });
            }

            try {
                const target = `https://api.bilibili.com/x/vas/dlc_act/act/basic?act_id=${actId}&csrf=`;
                const data = await fetchBilibiliJson(target, 'basic API');
                return jsonResponse(data);
            } catch (err) {
                return jsonResponse(
                    { error: err.message },
                    { status: err.statusCode || 500 }
                );
            }
        }

        if (url.pathname === '/api/detail') {
            let actId = url.searchParams.get('act_id');
            let lotteryId = url.searchParams.get('lottery_id');
            let input = url.searchParams.get('input') || '';
            let resolvedShare = null;

            try {
                if (!input && (!actId || !lotteryId || request.method === 'POST')) {
                    input = (await readRequestInput(request)).trim();
                }

                if ((!actId || !lotteryId) && input) {
                    resolvedShare = await resolveShareInput(input, env);
                    actId = actId || resolvedShare.actId;
                    lotteryId = lotteryId || resolvedShare.lotteryId;
                }

                if (!actId || !lotteryId) {
                    throw httpError('Missing act_id / lottery_id, and no resolvable share input was provided.', 400);
                }

                const target = `https://api.bilibili.com/x/vas/dlc_act/lottery_home_detail?act_id=${actId}&appkey=1d8b6e7d45233436&disable_rcmd=0&sign=341070dd7b86b7ce7c3655972d9824a7&lottery_id=${lotteryId}&ts=${Math.floor(Date.now() / 1000)}&mobi_app=android&platform=android`;
                const data = await fetchBilibiliJson(target, 'detail API');

                const allowedDomains = extractRootDomains(data);
                const token = await signJWT({
                    origins: allowedDomains,
                    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 2)
                }, SECRET_KEY);

                const headers = new Headers({
                    'Set-Cookie': `BiliProxyToken=${token}; Path=/; HttpOnly; SameSite=Strict`
                });
                if (resolvedShare?.resolvedUrl) {
                    headers.set('X-Bili-Resolved-Url', resolvedShare.resolvedUrl);
                }

                return jsonResponse(data, { headers });
            } catch (err) {
                return jsonResponse(
                    { error: err.message },
                    { status: err.statusCode || 500 }
                );
            }
        }

        if (url.pathname === '/proxy') {
            const targetUrlStr = url.searchParams.get('url');
            if (!targetUrlStr) return new Response('Missing target URL', { status: 400 });

            const cookieHeader = request.headers.get('Cookie') || '';
            const match = cookieHeader.match(/BiliProxyToken=([^;]+)/);
            if (!match) return new Response('403 Forbidden: Missing Token', { status: 403 });

            const payload = await verifyJWT(match[1], SECRET_KEY);
            if (!payload || !payload.origins || payload.exp < Math.floor(Date.now() / 1000)) {
                return new Response('403 Forbidden: Invalid or Expired Token', { status: 403 });
            }

            try {
                const targetUrl = new URL(targetUrlStr);
                const parts = targetUrl.hostname.split('.');
                const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : targetUrl.hostname;

                if (!payload.origins.includes(rootDomain)) {
                    return new Response(`403 Forbidden: Domain ${rootDomain} not allowed`, { status: 403 });
                }

                const newHeaders = new Headers(request.headers);
                newHeaders.set('Origin', 'https://www.bilibili.com');
                newHeaders.set('Referer', 'https://www.bilibili.com/');
                newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                newHeaders.delete('Cookie');
                newHeaders.delete('Authorization'); // 防止 Basic Auth 头部传给目标站

                const proxyRequest = new Request(targetUrl, {
                    method: request.method,
                    headers: newHeaders,
                    redirect: 'follow'
                });

                const response = await fetch(proxyRequest);
                return new Response(response.body, {
                    status: response.status,
                    headers: {
                        ...Object.fromEntries(response.headers),
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': 'true'
                    }
                });
            } catch (error) {
                return new Response(`Proxy Error: ${error.message}`, { status: 500 });
            }
        }

        if (url.pathname === '/') {
            return new Response(htmlContent, {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' },
            });
        }

        return new Response('Not Found', { status: 404 });
    }
};

// ==========================================
// 4. 前端 HTML 源码
// ==========================================
const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>B站数字周边提取工具</title>
	<style>
		:root {
		    --primary: #10b981;
		    --primary-glow: rgba(16, 185, 129, 0.3);
		    --bg-color: #ffffff;
		    --panel-bg: #ffffff;
		    --text-main: #1f2937;
		    --text-muted: #6b7280;
		    --border-color: #e5e7eb;
		    --border-radius: 12px;
		}
		body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; line-height: 1.6; display: flex; flex-direction: column; justify-content: center; min-height: 100vh; box-sizing: border-box; }
		.container { width: 100%; max-width: 1200px; margin: auto; }
		.panel { background: var(--panel-bg); padding: 30px; border-radius: var(--border-radius); box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin-bottom: 24px; border: 1px solid var(--border-color); }
		h1, h2 { color: var(--text-main); margin-top: 0; display: flex; align-items: center; justify-content: space-between; }
		.github-icon { color: var(--text-main); transition: color 0.3s ease, filter 0.3s ease; display: flex; align-items: center; }
		.github-icon:hover { color: var(--primary); filter: drop-shadow(0 0 8px var(--primary-glow)); }
		.step-container { margin-bottom: 24px; }
		.step-title { font-size: 1.1em; font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; color: var(--primary); }
		.step-badge { background: var(--primary); color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; justify-content: center; align-items: center; font-size: 14px; box-shadow: 0 0 8px var(--primary-glow); }
		textarea { width: 100%; box-sizing: border-box; background: #ffffff; border: 1px solid var(--border-color); color: var(--text-main); padding: 15px; border-radius: 8px; resize: vertical; font-family: monospace; transition: all 0.3s; }
		textarea:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--primary-glow); }
		a {text-decoration: none; color: #1CBD87;      font-weight: bold; }
		button { background: var(--primary); color: #fff; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 15px; transition: all 0.3s ease; box-shadow: 0 4px 12px var(--primary-glow); }
		button:hover { background: #059669; transform: translateY(-2px); }
		button:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; transform: none; }
		#videos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; margin-top: 20px; }
		.media-card { background: #ffffff; border-radius: var(--border-radius); overflow: hidden; display: flex; flex-direction: column; align-items: center; border: 1px solid var(--border-color); transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s; }
		.media-card:hover { transform: scale(1.02); border-color: var(--primary); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
		.media-card video, .media-card img { width: 100%; height: 380px; object-fit: cover; background: #f3f4f6; }
		 .media-card video:fullscreen { object-fit: contain; background: #000; }
		.media-card video:-webkit-full-screen { object-fit: contain; background: #000; }
		.media-card video:-moz-full-screen { object-fit: contain; background: #000; }
		.media-card .title { padding: 12px; font-size: 0.9em; text-align: center; color: var(--text-muted); width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #ffffff; border-top: 1px solid var(--border-color); }
		.progress-wrapper { display: none; margin: 20px 0; background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); }
		progress { width: 100%; height: 12px; border-radius: 6px; appearance: none; overflow: hidden; margin-bottom: 8px; }
		progress::-webkit-progress-bar { background-color: #f1f5f9; }
		progress::-webkit-progress-value { background-color: var(--primary); }
		#progressText { color: var(--primary); font-weight: bold; font-size: 0.9em; }
	</style>
</head>
<body>
	<div class="container">
		<div class="panel">
			<h1> B站数字周边提取工具 <a href="https://github.com/Iskongkongyo" target="_blank" class="github-icon" title="访问我的 GitHub 主页">
					<svg height="28" width="28" viewBox="0 0 16 16" fill="currentColor">
						<path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z">
						</path>
					</svg>
				</a>
			</h1>
			<div class="step-container">
				<div class="step-title"><span class="step-badge">1</span> 获取链接</div>
				<p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;"> 用B站移动端APP打开 <a href="bilibili://forward?-Btarget=https%3A%2F%2Fwww.bilibili.com%2Fh5%2Fmall%2Fhome%3Fnavhide%3D1">个性装扮(点我即达)</a>， 进入想要下载的数字周边，点击右上角分享获取分享链接和文本。 </p>
				<textarea id="filepath" rows="4" placeholder="在此处粘贴分享URL或文本，例如：https://www.bilibili.com/h5/mall/... 或 2026DLCSHARE$xxxxxx$ ..."></textarea>
				<div style="margin-top: 10px; text-align: right;">
					<button id="fetch-btn" onclick="getData()">一键智能解析</button>
				</div>
			</div>
			<div id="manual-fallback-panel" class="step-container" style="display:none; border:1px solid var(--border-color); border-radius:12px; padding:16px; background:#fafafa;">
				<div class="step-title"><span class="step-badge">2</span> 自动失败，切换手动模式</div>
				<p id="manual-error-tip" style="color:#b91c1c; font-size:0.92em; margin-top:0;"> 自动获取失败，请按下面步骤手动继续。 </p>
				<div style="margin-bottom:16px;">
					<div style="font-weight:bold; margin-bottom:8px; color:var(--text-main);">2.1 获取数字周边基础信息</div>
					<p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;"> 点击按钮打开 basic 接口，复制页面中的完整 JSON，粘贴到下方。 </p>
					<textarea id="basic-url" rows="2" readonly placeholder="自动失败后会在这里生成 basic 接口地址..."></textarea>
					<div style="margin-top: 10px; text-align: right; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
						<button type="button" onclick="copyBasicUrl()">复制基础接口地址</button>
						<button type="button" onclick="openBasicUrl()">打开基础接口</button>
					</div>
					<textarea id="basic-data" rows="6" placeholder="把基础接口返回的 JSON 粘贴到这里..."></textarea>
					<div style="margin-top: 10px; text-align: right;">
						<button type="button" onclick="openDetailFromBasic()">解析基础数据并打开媒体接口</button>
					</div>
				</div>
				<div>
					<div style="font-weight:bold; margin-bottom:8px; color:var(--text-main);">2.2 获取媒体数据</div>
					<p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;"> 打开 detail 接口后，复制页面中的完整 JSON，粘贴到下方并渲染。 </p>
					<textarea id="detail-url" rows="3" readonly placeholder="解析基础数据后，这里会生成 detail 接口地址..."></textarea>
					<div style="margin-top: 10px; text-align: right; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
						<button type="button" onclick="copyDetailUrl()">复制媒体接口地址</button>
						<button type="button" onclick="openDetailUrl()">打开媒体接口</button>
					</div>
				</div>
			</div>
			<div class="step-container">
				<div class="step-title"><span class="step-badge">3</span> 获取媒体数据 / 手动粘贴结果</div>
				<p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;"> 正常情况下系统会自动完成；如果自动失败，请把手动获取到的 detail JSON 粘贴到这里。 </p>
				<textarea id="data" rows="6" placeholder="自动成功会自动填入；手动模式下请把 detail JSON 粘贴到这里..."></textarea>
				<div style="margin-top: 10px; text-align: right;">
					<button onclick="getVideos()">渲染视频与图片</button>
				</div>
			</div>
		</div>
		<div id="result-panel" class="panel" style="display: none;">
			<h2 id="result-title">提取结果 <button id="download-btn" onclick="downloadFilesAsZip()">打包下载全部</button></h2>
			<div id="progress-container" class="progress-wrapper"><progress id="download-progress" max="100" value="0"></progress>
				<div id="progressText">准备下载...</div>
			</div>
			<div id="videos-grid"></div>
		</div>
	</div>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
	<script>
		let zipName = '数字周边';
		let fileUrls = [];
		let fileNames = [];
		let isDownloading = false;
		
		function getParam(url, param) {
		    try { return new URL(url).searchParams.get(param); } catch (e) { return null; }
		}
		function sanitizeFileName(name, fallback = '未命名素材') {
		    const cleaned = String(name || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
		    return cleaned || fallback;
		}
		function inferExtFromUrlOrBlob(url, blob) {
		    try {
		        const urlObj = new URL(url, location.origin);
		        const match = urlObj.pathname.match(/\.[a-zA-Z0-9]{2,5}$/i);
		        if (match) return match[0];
		        const raw = urlObj.searchParams.get('url');
		        if (raw) {
		            const originalUrlObj = new URL(raw);
		            const rawMatch = originalUrlObj.pathname.match(/\.[a-zA-Z0-9]{2,5}$/i);
		            if (rawMatch) return rawMatch[0];
		        }
		    } catch (e) {}
		    const mime = blob?.type || '';
		    if (mime.includes('video/mp4')) return '.mp4';
		    if (mime.includes('video/webm')) return '.webm';
		    if (mime.includes('image/png')) return '.png';
		    if (mime.includes('image/webp')) return '.webp';
		    if (mime.includes('image/gif')) return '.gif';
		    if (mime.includes('image/jpeg')) return '.jpg';
		    return mime.startsWith('video/') ? '.mp4' : '.jpg';
		}
		async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 15000) {
		    for (let i = 0; i < retries; i++) {
		        const controller = new AbortController();
		        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		        try {
		            const response = await fetch(url, { ...options, credentials: 'same-origin', signal: controller.signal });
		            clearTimeout(timeoutId);
		            if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
		            return response;
		        } catch (error) {
		            clearTimeout(timeoutId);
		            if (i === retries - 1) throw new Error(\`重试 \${retries} 次失败: \${error.message}\`);
		            await new Promise(resolve => setTimeout(resolve, 1000));
		        }
		    }
		}
		
		function normalizeFilepath(filepath, lotteryId) {
		    try {
		        const url = new URL(filepath);
		        url.searchParams.set("lottery_id", lotteryId);
		        return url.toString();
		    } catch {
		        return filepath; // 不是 URL，保持原样
		    }
		}
		
		function buildBasicApiUrlFromInput(input) {
		    const id = getParam(input, 'act_id') || getParam(input, 'id');
		    if (!id) throw new Error('未找到有效的 act_id / id');
		    return 'https://api.bilibili.com/x/vas/dlc_act/act/basic?act_id='+encodeURIComponent(id)+'&csrf=';
		}
		
		function buildDetailApiUrl(actId, lotteryId) {
		    return (
		'https://api.bilibili.com/x/vas/dlc_act/lottery_home_detail' +
		'?act_id='+encodeURIComponent(actId) +
		'&lottery_id='+encodeURIComponent(lotteryId) +
		'&appkey=1d8b6e7d45233436' +
		'&disable_rcmd=0' +
		'&mobi_app=android' +
		'&platform=android'
		    );
		}
		
		function showManualFallback(message, inputValue = '') {
		    const panel = document.getElementById('manual-fallback-panel');
		    const tip = document.getElementById('manual-error-tip');
		    const basicUrlBox = document.getElementById('basic-url');
		
		    panel.style.display = 'block';
		    tip.innerText = '自动获取失败：'+message+'。可恶啊，被风控了，B站玩不起喵！已切换到手动模式，请手动继续下面的步骤。';
		    try {
		const basicUrl = buildBasicApiUrlFromInput(inputValue);
		basicUrlBox.value = basicUrl;
		    } catch (e) {
		basicUrlBox.value = '';
		    }
		
		    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
		
		function openBasicUrl() {
		    const url = document.getElementById('basic-url').value.trim();
		    if (!url) {
		alert('基础接口地址为空，请先输入有效分享链接并触发自动/手动流程。');
		return;
		    }
		    window.open(url, '_blank', 'noopener,noreferrer');
		}
		
		async function copyBasicUrl() {
		    const url = document.getElementById('basic-url').value.trim();
		    if (!url) {
		alert('基础接口地址为空！');
		return;
		    }
		    try {
		await navigator.clipboard.writeText(url);
		alert('基础接口地址已复制！');
		    } catch {
		alert('复制失败，请手动复制。');
		    }
		}
		
		function openDetailFromBasic() {
		    try {
		const filepath = document.getElementById('filepath').value.trim();
		if (!filepath) throw new Error('请先填写分享链接或文本');
		
		const actId = getParam(filepath, 'act_id') || getParam(filepath, 'id');
		if (!actId) throw new Error('未找到 act_id / id');
		
		const basicText = document.getElementById('basic-data').value.trim();
		if (!basicText) throw new Error('请先粘贴基础接口 JSON');
		
		const basicJson = JSON.parse(basicText);
		const lotteryId =
		    basicJson?.data?.tab_lottery_id ||
		    basicJson?.data?.lottery_list?.[0]?.lottery_id;
		
		if (!lotteryId) throw new Error('基础 JSON 中未找到有效 lottery_id');
		
		const detailUrl = buildDetailApiUrl(actId, lotteryId);
		document.getElementById('detail-url').value = detailUrl;
		
		alert('已生成媒体接口地址，即将打开新窗口，请复制返回的完整 JSON 后粘贴到第 3 步。');
		window.open(detailUrl, '_blank', 'noopener,noreferrer');
		    } catch (err) {
		alert('解析基础数据失败:' + err.message);
		    }
		}
		
		function openDetailUrl() {
		    const url = document.getElementById('detail-url').value.trim();
		    if (!url) {
		alert('媒体接口地址为空，请先完成基础数据解析。');
		return;
		    }
		    window.open(url, '_blank', 'noopener,noreferrer');
		}
		
		async function copyDetailUrl() {
		    const url = document.getElementById('detail-url').value.trim();
		    if (!url) {
		alert('媒体接口地址为空！');
		return;
		    }
		    try {
		await navigator.clipboard.writeText(url);
		alert('媒体接口地址已复制！');
		    } catch {
		alert('复制失败，请手动复制。');
		    }
		}
		
		async function getDataLegacy() {
		    const filepath = document.getElementById('filepath').value.trim();
		    if (!filepath) { alert('输入内容不能为空！'); return; }
		    const id = getParam(filepath, 'act_id') || getParam(filepath, 'id');
		    let lotteryId = getParam(filepath, 'lottery_id');
		    const btn = document.getElementById('fetch-btn');
		    const originalBtnText = btn.innerText;
		    btn.innerText = '正在获取安全令牌与数据...';
		    btn.disabled = true;
		
		    try {
		        // 如果没有 lottery_id，有id的情况下尝试从 basic 接口中提取
		        if ((!lotteryId || lotteryId == 'undefined' || lotteryId == 'null') && filepath.startsWith('http')) {
		            if (!id || id == 'undefined' || id == 'null') throw new Error('未找到有效的 id!');
		            const basicRes = await fetch(\`/api/basic?act_id=\${id}\`);
		            if (!basicRes.ok) throw new Error('基础接口请求失败!');
		            const basicData = await basicRes.json();
		            lotteryId = basicData?.data?.tab_lottery_id || basicData?.data?.lottery_list?.[0]?.lottery_id;
		            if (!lotteryId) throw new Error('未找到有效的 lottery_id!');
		        }
		
		        const finalPath = normalizeFilepath(filepath, lotteryId);
		
		        const detailRes = await fetch('/api/detail', {
		            method: 'POST',
		            headers: { 'Content-Type': 'application/json' },
		            body: JSON.stringify({ input: finalPath })
		        });
		        const detailData = await detailRes.json();
		        if (!detailRes.ok) throw new Error(detailData?.error || '详情接口请求失败!');
		        document.getElementById('data').value = JSON.stringify(detailData, null, 2);
		        getVideos();
		    } catch (err) {
		        alert(\`自动获取数据失败：\${err.message}\`);
		    } finally {
		        btn.innerText = originalBtnText;
		        btn.disabled = false;
		    }
		}
		async function getData() {
		    const filepath = document.getElementById('filepath').value.trim();
		    if (!filepath) {
		alert('输入内容不能为空！');
		return;
		    }
		
		    const btn = document.getElementById('fetch-btn');
		    const originalBtnText = btn.innerText;
		    const manualPanel = document.getElementById('manual-fallback-panel');
		    const basicDataBox = document.getElementById('basic-data');
		    const detailUrlBox = document.getElementById('detail-url');
		
		    btn.innerText = '正在自动解析...';
		    btn.disabled = true;
		
		    // 每次重新尝试自动解析前，先清空上次手动状态
		    manualPanel.style.display = 'none';
		    basicDataBox.value = '';
		    detailUrlBox.value = '';
		
		    try {
		const id = getParam(filepath, 'act_id') || getParam(filepath, 'id');
		let lotteryId = getParam(filepath, 'lottery_id');
		
		if ((!lotteryId || lotteryId === 'undefined' || lotteryId === 'null') && filepath.startsWith('http')) {
		    if (!id || id === 'undefined' || id === 'null') {
		        throw new Error('未找到有效的 id!');
		    }
		
		    const basicRes = await fetch('/api/basic?act_id=' + encodeURIComponent(id));
		    const basicText = await basicRes.text();
		
		    let basicData;
		    try {
		        basicData = JSON.parse(basicText);
		    } catch (e) {
		        throw new Error('basic 接口返回非 JSON：HTTP'+ basicRes.status + '，响应前300字：'+ basicText.slice(0, 300));
		    }
		
		    if (!basicRes.ok) {
		        throw new Error(basicData?.error || '基础接口请求失败!');
		    }
		
		    lotteryId =
		        basicData?.data?.tab_lottery_id ||
		        basicData?.data?.lottery_list?.[0]?.lottery_id;
		
		    if (!lotteryId) {
		        throw new Error('未找到有效的 lottery_id!');
		    }
		}
		
		const finalPath = normalizeFilepath(filepath, lotteryId);
		
		const detailRes = await fetch('/api/detail', {
		    method: 'POST',
		    headers: { 'Content-Type': 'application/json' },
		    body: JSON.stringify({ input: finalPath })
		});
		
		const detailText = await detailRes.text();
		
		let detailData;
		try {
		    detailData = JSON.parse(detailText);
		} catch (e) {
		    throw new Error('detail 接口返回非 JSON：HTTP'+ detailRes.status + '，响应前300字：'+ detailText.slice(0, 300));
		}
		
		if (!detailRes.ok) {
		    throw new Error(detailData?.error || '详情接口请求失败!');
		}
		
		document.getElementById('data').value = JSON.stringify(detailData, null, 2);
		getVideos();
		
		    } catch (err) {
		const msg = err?.message || '未知错误';
		showManualFallback(msg, filepath);
		alert('自动获取失败：'+ msg + '已自动切换到手动模式，请继续页面中的第 2 步。');
		    } finally {
		btn.innerText = originalBtnText;
		btn.disabled = false;
		    }
		}
		function getVideos() {
		    try {
		        const data = document.getElementById('data').value.trim();
		        if (!data) throw new Error('JSON 数据不能为空！');
		        const jsonData = JSON.parse(data);
		        const infos = jsonData?.data || {};
		        zipName = infos.name || '数字周边';
		        document.getElementById('result-panel').style.display = 'block';
		        document.getElementById('result-title').childNodes[0].nodeValue = \`\${zipName} \`;
		        const itemList = Array.isArray(infos.item_list) ? [...infos.item_list] : [];
		        const seen = new Set();
		        function addImageItem(cardName, cardImg) {
		            if (!cardImg) return;
		            const key = \`\${cardName || ''}::\${cardImg}\`;
		            if (seen.has(key)) return;
		            seen.add(key);
		            itemList.push({ card_info: { card_name: cardName, card_img: cardImg } });
		        }
		        itemList.forEach(item => {
		            const cardInfo = item?.card_info;
		            if (!cardInfo) return;
		            const key = \`\${cardInfo.card_name || ''}::\${cardInfo.card_img || cardInfo.video_list?.[0] || ''}\`;
		            seen.add(key);
		        });
		        const collectChain = infos.collect_list?.collect_chain;
		        if (Array.isArray(collectChain)) {
		            if (collectChain[0]?.redeem_item_name === '钻石头像背景') addImageItem(collectChain[0].redeem_item_name, collectChain[0].redeem_item_image);
		            if (collectChain[1]?.redeem_item_name?.endsWith('表情包')) addImageItem(collectChain[1].redeem_item_name, collectChain[1].redeem_item_image);
		        }
		        const collectInfos = infos.collect_list?.collect_infos;
		        if (Array.isArray(collectInfos)) {
		            collectInfos.forEach(item => {
		                const name = item?.redeem_item_name;
		                if (name && (name.endsWith('表情包') || name.endsWith('动态表情包'))) addImageItem(name, item.redeem_item_image);
		            });
		        }
		        renderGrid(itemList);
		    } catch (err) {
		        alert(\`解析数据出错，请确保输入的是完整的 JSON 格式：\${err.message}\`);
		    }
		}
		function renderGrid(itemList) {
		    const grid = document.getElementById('videos-grid');
		    grid.innerHTML = '';
		    fileUrls = [];
		    fileNames = [];
		
		    itemList.forEach((item, index) => {
		if (!item || !item.card_info) return;
		
		const cardInfo = item.card_info;
		const rawVideoUrl = cardInfo.video_list && cardInfo.video_list[0];
		const rawImgUrl = cardInfo.card_img;
		
		if (!rawVideoUrl && !rawImgUrl) return;
		
		const wrapper = document.createElement('div');
		wrapper.className = 'media-card';
		
		const title = document.createElement('div');
		title.className = 'title';
		title.innerText = sanitizeFileName(cardInfo.card_name || ('未命名素材 ' + (index + 1)));
		
		if (rawVideoUrl) {
		    // 视频：走本地直连，不走 CF /proxy
		    const video = document.createElement('video');
		    video.src = rawVideoUrl;
		    video.controls = true;
		    video.preload = 'metadata';
		    video.crossOrigin = 'anonymous';
		    video.setAttribute('playsinline', 'true');
		    wrapper.appendChild(video);
		
		    fileUrls.push(rawVideoUrl);
		    fileNames.push({
		        name: title.innerText,
		        originalUrl: rawVideoUrl,
		        fetchUrl: rawVideoUrl,
		        mediaType: 'video',
		        viaProxy: false
		    });
		} else {
		    // 图片：继续走 CF /proxy
		    const proxiedImgUrl = '/proxy?url=' + encodeURIComponent(rawImgUrl);
		    const img = document.createElement('img');
		    img.src = proxiedImgUrl;
		    img.alt = title.innerText;
		    wrapper.appendChild(img);
		
		    fileUrls.push(proxiedImgUrl);
		    fileNames.push({
		        name: title.innerText,
		        originalUrl: rawImgUrl,
		        fetchUrl: proxiedImgUrl,
		        mediaType: 'image',
		        viaProxy: true
		    });
		}
		
		wrapper.appendChild(title);
		grid.appendChild(wrapper);
		    });
		}
		async function downloadFilesAsZip() {
		    if (fileUrls.length === 0) { alert('没有找到可以下载的资源文件！'); return; }
		    if (isDownloading) { alert('当前有正在进行的下载任务，请等待其完成后再试！'); return; }
		    const targetUrls = [...fileUrls];
		    const targetData = [...fileNames];
		    const targetZipName = sanitizeFileName(zipName, '数字周边');
		    const nameOccurrenceMap = {};
		    const finalFileNames = targetData.map((item, index) => {
		        const safeName = sanitizeFileName(item?.name, \`未命名素材_\${index + 1}\`);
		        if (nameOccurrenceMap[safeName] !== undefined) {
		            nameOccurrenceMap[safeName]++;
		            return \`\${safeName}_\${nameOccurrenceMap[safeName]}\`;
		        }
		        nameOccurrenceMap[safeName] = 0;
		        return safeName;
		    });
		    const progressContainer = document.getElementById('progress-container');
		    const progressBar = document.getElementById('download-progress');
		    const progressText = document.getElementById('progressText');
		    const downloadBtn = document.getElementById('download-btn');
		    isDownloading = true;
		    progressContainer.style.display = 'block';
		    progressBar.value = 0;
		    progressText.innerText = '准备下载...';
		    downloadBtn.disabled = true;
		    const zip = new JSZip();
		    let completedCount = 0;
		    const CONCURRENCY_LIMIT = 2;
		    let currentIndex = 0;
		    const updateProgress = () => {
		        const percent = Math.floor((completedCount / targetUrls.length) * 100);
		        progressBar.value = percent;
		        progressText.innerText = \`正在下载 [\${targetZipName}]... 进度 \${percent}% (\${completedCount}/\${targetUrls.length})\`;
		    };
		    const downloadWorker = async () => {
		        while (currentIndex < targetUrls.length) {
		            const index = currentIndex++;
		           const currentUrl = targetUrls[index];
		const meta = targetData[index] || {};
		const originalUrl = meta.originalUrl || currentUrl;
		const fetchUrl = meta.fetchUrl || currentUrl;
		const mediaType = meta.mediaType || 'unknown';
		const viaProxy = !!meta.viaProxy;
		const baseName = finalFileNames[index];
		let inferredExt = '.bin';
		
		try {
		    const response = await fetchWithRetry(fetchUrl, {}, 3, 30000);
		    const blob = await response.blob();
		    inferredExt = inferExtFromUrlOrBlob(originalUrl, blob);
		    zip.file(baseName + inferredExt, blob);
		} catch (error) {
		    zip.file(
		baseName + '_下载失败记录_' + (index + 1) + '.txt',
		'下载地址: ' + fetchUrl + '\\n'
		+ '原始链接: ' + originalUrl + '\\n'
		+ '资源类型: ' + mediaType + '\\n'
		+ '是否经代理: ' + (viaProxy ? '是' : '否') + '\\n'
		+ '推断扩展名: ' + inferredExt + '\\n'
		+ '错误: ' + error.message
		    );
		} finally {
		                completedCount++;
		                updateProgress();
		            }
		        }
		    };
		    try {
		        await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, targetUrls.length) }, () => downloadWorker()));
		        progressText.innerText = '资源下载完成，正在拼命压缩中，请稍候...';
		        const content = await zip.generateAsync({ type: 'blob' });
		        saveAs(content, \`\${targetZipName}.zip\`);
		        progressText.innerText = '压缩完毕！文件已保存。';
		    } catch (error) {
		        alert(\`打包下载失败：\${error.message}\`);
		    } finally {
		        setTimeout(() => {
		            progressContainer.style.display = 'none';
		            progressBar.value = 0;
		            isDownloading = false;
		            downloadBtn.disabled = false;
		        }, 1500);
		    }
		}
	</script>
</body>
</html>
`;