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
		.media-card { background: #ffffff; border-radius: var(--border-radius); overflow: hidden; display: flex; flex-direction: column; align-items: center; align-self: start; border: 1px solid var(--border-color); transition: transform 0.3s, border-color 0.3s, box-shadow 0.3s; }
		.media-card:hover { transform: scale(1.02); border-color: var(--primary); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
		.media-card video, .media-card img { width: 100%; height: 380px; object-fit: cover; background: #f3f4f6; }
		.laser-preview { width: 100%; background: #0f172a; }
		.laser-stage { position: relative; width: 100%; aspect-ratio: 2 / 3; overflow: hidden; background: #0f172a; touch-action: none; cursor: crosshair; }
		.laser-stage canvas { display: block; width: 100%; height: 100%; }
		.laser-badge { position: absolute; top: 10px; left: 10px; z-index: 2; padding: 4px 9px; border: 1px solid rgba(255,255,255,0.55); border-radius: 999px; color: #fff; background: rgba(15,23,42,0.68); box-shadow: 0 4px 14px rgba(0,0,0,0.2); backdrop-filter: blur(6px); font-size: 12px; font-weight: bold; pointer-events: none; }
		.laser-status { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px; box-sizing: border-box; color: #e2e8f0; background: #0f172a; font-size: 13px; text-align: center; }
		.laser-status button, .media-retry button { padding: 8px 14px; box-shadow: none; }
		.media-retry { width: 100%; height: 380px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 20px; box-sizing: border-box; color: var(--text-muted); background: #f3f4f6; text-align: center; }
		.laser-actions { display: flex; gap: 8px; padding: 9px; background: #f8fafc; border-top: 1px solid var(--border-color); }
		.laser-actions button { flex: 1; padding: 7px 8px; border-radius: 6px; font-size: 12px; box-shadow: none; }
		.laser-actions .secondary { color: var(--text-main); background: #e2e8f0; }
		.laser-actions .secondary:hover { background: #cbd5e1; }
		 .media-card video:fullscreen { object-fit: contain; background: #000; }
		.media-card video:-webkit-full-screen { object-fit: contain; background: #000; }
		.media-card video:-moz-full-screen { object-fit: contain; background: #000; }
		.media-card .title { padding: 12px; font-size: 0.9em; text-align: center; color: var(--text-muted); width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #ffffff; border-top: 1px solid var(--border-color); }
		.progress-wrapper { display: none; margin: 20px 0; background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); }
		progress { width: 100%; height: 12px; border-radius: 6px; appearance: none; overflow: hidden; margin-bottom: 8px; }
		progress::-webkit-progress-bar { background-color: #f1f5f9; }
		progress::-webkit-progress-value { background-color: var(--primary); }
		#progressText { color: var(--primary); font-weight: bold; font-size: 0.9em; }
		.result-title-area { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; }
		.result-hints { color: var(--text-muted); font-size: 15px; font-weight: bold; line-height: 1.45; text-align: left; }
		.result-hints span { display: block; }
		.result-hints span + span { margin-top: 2px; }
		@media (max-width: 640px) {
			#result-title { align-items: flex-start; flex-direction: column; gap: 12px; }
			.result-title-area { align-items: flex-start; margin-left: 0; }
		}
		#lottery-selection-panel { display:none; margin-bottom:24px; border:1px solid var(--primary); border-radius:var(--border-radius); padding:20px; background:linear-gradient(135deg, #f0fdf4, #ecfdf5); }
		#lottery-buttons { display:flex; gap:12px; flex-wrap:wrap; margin-top:14px; }
		#lottery-buttons button { background:linear-gradient(135deg, #10b981, #059669); padding:12px 22px; border-radius:10px; font-size:14px; min-width:120px; }
		#lottery-buttons button:hover { background:linear-gradient(135deg, #059669, #047857); }
		#lottery-buttons button.recommended { box-shadow: 0 0 0 2px #fbbf24, 0 4px 16px rgba(251,191,36,0.35); position:relative; }
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
			<div id="lottery-selection-panel">
				<div class="step-title"><span class="step-badge">⚡</span> 检测到多个数字周边</div>
				<p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;">该活动包含多个数字周边，请选择要提取的：</p>
				<div id="lottery-buttons"></div>
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
					<br/>
					<textarea id="basic-data" rows="6" placeholder="把基础接口返回的 JSON 粘贴到这里..."></textarea>
					<div style="margin-top: 10px; text-align: right;">
						<button type="button" onclick="openDetailFromBasic()">解析基础数据并打开媒体接口</button>
					</div>
				</div>
				<div id="manual-lottery-selection" style="display:none; margin-bottom:16px; padding:14px; border:1px solid var(--primary); border-radius:10px; background:linear-gradient(135deg, #f0fdf4, #ecfdf5);">
					<div style="font-weight:bold; margin-bottom:8px; color:var(--primary);">⚡ 检测到多个数字周边，请选择要查看的数字周边：</div>
					<div id="manual-lottery-buttons" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
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
			<h2 id="result-title">
				<span class="result-title-area">
					<span id="result-name">提取结果</span>
					<span class="result-hints">
						<span>快捷键 S：鼠标位于某个数字周边上时，可单独下载该图片、视频或当前镭射效果。</span>
						<span>镭射预览仅供参考，实际效果可能与 B 站存在差异。</span>
					</span>
				</span>
				<button id="download-btn" onclick="downloadFilesAsZip()">打包下载全部</button>
			</h2>
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
		let laserControlFiles = [];
		let laserAssetPairs = [];
		let isDownloading = false;
		const laserRenderers = new Set();
		const singleDownloadsInProgress = new WeakSet();
		let laserAnimationFrame = null;
		const laserVisibilityObserver = typeof IntersectionObserver === 'function'
		    ? new IntersectionObserver(entries => {
		        entries.forEach(entry => {
		            if (entry.target._laserRenderer) {
		                entry.target._laserRenderer.visible = entry.isIntersecting;
		            }
		        });
		    }, { rootMargin: '200px 0px' })
		    : null;
		const laserMotionButtons = new Set();
		let laserMotionEnabled = false;
		let laserMotionListening = false;
		let laserMotionBaseline = null;

		function getScreenOrientationAngle() {
		    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
		    return ((Number(angle) % 360) + 360) % 360;
		}
		function normalizeTiltDelta(value) {
		    return ((value + 180) % 360 + 360) % 360 - 180;
		}
		function updateLaserMotionButtons(text) {
		    laserMotionButtons.forEach(button => {
		        if (button.isConnected) button.innerText = text;
		    });
		}
		function handleLaserDeviceOrientation(event) {
		    if (!laserMotionEnabled || event.beta == null || event.gamma == null) return;
		    const angle = getScreenOrientationAngle();
		    if (!laserMotionBaseline || laserMotionBaseline.angle !== angle) {
		        laserMotionBaseline = { beta: event.beta, gamma: event.gamma, angle };
		        updateLaserMotionButtons('晃动已开启');
		        return;
		    }

		    const betaDelta = normalizeTiltDelta(event.beta - laserMotionBaseline.beta);
		    const gammaDelta = normalizeTiltDelta(event.gamma - laserMotionBaseline.gamma);
		    let horizontal = gammaDelta;
		    let vertical = betaDelta;
		    if (angle === 90) {
		        horizontal = betaDelta;
		        vertical = -gammaDelta;
		    } else if (angle === 270) {
		        horizontal = -betaDelta;
		        vertical = gammaDelta;
		    } else if (angle === 180) {
		        horizontal = -gammaDelta;
		        vertical = -betaDelta;
		    }

		    const targetX = Math.max(0, Math.min(1, 0.5 + horizontal / 60));
		    const targetY = Math.max(0, Math.min(1, 0.5 + vertical / 60));
		    laserRenderers.forEach(renderer => {
		        renderer.pointerX += (targetX - renderer.pointerX) * 0.35;
		        renderer.pointerY += (targetY - renderer.pointerY) * 0.35;
		    });
		}
		async function enableLaserMotion() {
		    if (typeof DeviceOrientationEvent === 'undefined') {
		        alert('当前浏览器或设备不支持晃动感应。');
		        updateLaserMotionButtons('设备不支持晃动');
		        return;
		    }
		    try {
		        if (!laserMotionEnabled && typeof DeviceOrientationEvent.requestPermission === 'function') {
		            const permission = await DeviceOrientationEvent.requestPermission();
		            if (permission !== 'granted') throw new Error('未获得动作与方向访问权限');
		        }
		        if (!laserMotionListening) {
		            window.addEventListener('deviceorientation', handleLaserDeviceOrientation, true);
		            laserMotionListening = true;
		        }
		        laserMotionEnabled = true;
		        laserMotionBaseline = null;
		        updateLaserMotionButtons('请晃动手机');
		    } catch (error) {
		        alert('无法开启晃动感应：' + error.message);
		    }
		}
		function registerLaserMotionButton(button) {
		    const isMobileDevice = navigator.userAgentData?.mobile === true ||
		        /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) ||
		        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		    const supportsMobileMotion = isMobileDevice &&
		        typeof DeviceOrientationEvent !== 'undefined';
		    if (!supportsMobileMotion) {
		        button.style.display = 'none';
		        return;
		    }
		    laserMotionButtons.add(button);
		    button.innerText = laserMotionEnabled ? '校准晃动' : '开启晃动';
		    button.title = '移动端点击授权晃动感应；开启后再次点击可重新校准';
		    button.addEventListener('click', enableLaserMotion);
		}
		function attachMediaRetry(media, url, mediaLabel) {
		    let retryPlaceholder = null;
		    const showRetry = () => {
		        if (retryPlaceholder) return;
		        if (!media.isConnected) {
		            setTimeout(() => {
		                if (media.isConnected) showRetry();
		            }, 0);
		            return;
		        }
		        media.style.display = 'none';
		        retryPlaceholder = document.createElement('div');
		        retryPlaceholder.className = 'media-retry';
		        const message = document.createElement('div');
		        message.innerText = mediaLabel + '加载失败';
		        const retryButton = document.createElement('button');
		        retryButton.type = 'button';
		        retryButton.innerText = '↻ 重新加载';
		        retryButton.addEventListener('click', () => {
		            retryPlaceholder.remove();
		            retryPlaceholder = null;
		            media.style.display = '';
		            if (media instanceof HTMLVideoElement) {
		                media.pause();
		                media.removeAttribute('src');
		                media.load();
		                setTimeout(() => {
		                    media.src = url;
		                    media.load();
		                }, 0);
		            } else {
		                media.removeAttribute('src');
		                setTimeout(() => {
		                    media.src = url;
		                }, 0);
		            }
		        });
		        retryPlaceholder.appendChild(message);
		        retryPlaceholder.appendChild(retryButton);
		        media.insertAdjacentElement('afterend', retryPlaceholder);
		    };
		    media.addEventListener('error', showRetry);
		}
		
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
		function saveLaserPreview(renderer, titleText) {
		    return new Promise((resolve, reject) => {
		        if (!renderer?.ready) {
		            reject(new Error('镭射预览尚未加载完成'));
		            return;
		        }
		        drawLaserFrame(renderer, performance.now());
		        renderer.canvas.toBlob(blob => {
		            if (!blob) {
		                reject(new Error('无法生成当前镭射预览'));
		                return;
		            }
		            saveAs(blob, sanitizeFileName(titleText, '镭射预览') + '_镭射预览.png');
		            resolve();
		        }, 'image/png');
		    });
		}
		async function downloadSingleCard(card) {
		    if (!card || singleDownloadsInProgress.has(card)) return;
		    const downloadInfo = card._downloadInfo;
		    const renderer = card.querySelector('.laser-stage')?._laserRenderer;
		    singleDownloadsInProgress.add(card);
		    try {
		        if (renderer?.enabled) {
		            await saveLaserPreview(renderer, downloadInfo?.title);
		            return;
		        }
		        if (!downloadInfo?.url) throw new Error('没有找到可下载的资源');
		        const response = await fetchWithRetry(downloadInfo.url, {
		            referrerPolicy: 'no-referrer'
		        }, 3, 30000);
		        const blob = await response.blob();
		        const extension = inferExtFromUrlOrBlob(downloadInfo.url, blob);
		        saveAs(blob, sanitizeFileName(downloadInfo.title, '未命名素材') + extension);
		    } catch (error) {
		        console.error('单个资源下载失败：', error);
		        alert('单个资源下载失败：' + error.message);
		    } finally {
		        singleDownloadsInProgress.delete(card);
		    }
		}
		document.addEventListener('keydown', event => {
		    const target = event.target;
		    const isEditing = target instanceof HTMLElement &&
		        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
		    if (event.code !== 'KeyS' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || isEditing) return;
		    const hoveredCard = document.querySelector('.media-card:hover');
		    if (!hoveredCard) return;
		    event.preventDefault();
		    downloadSingleCard(hoveredCard);
		});
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
		const lotteryList = basicJson?.data?.lottery_list || [];
		const tabLotteryId = basicJson?.data?.tab_lottery_id;
		
		// 多个数字周边 → 显示选择按钮
		if (lotteryList.length >= 2) {
		    const selPanel = document.getElementById('manual-lottery-selection');
		    const btnContainer = document.getElementById('manual-lottery-buttons');
		    btnContainer.innerHTML = '';
		    lotteryList.forEach(function(lottery) {
		        const b = document.createElement('button');
		        b.innerText = lottery.lottery_name || ('周边 ' + lottery.lottery_id);
		        if (String(lottery.lottery_id) === String(tabLotteryId)) {
		            b.classList.add('recommended');
		            b.innerText += ' ★';
		        }
		        b.onclick = function() {
		            const detailUrl = buildDetailApiUrl(actId, lottery.lottery_id);
		            document.getElementById('detail-url').value = detailUrl;
		            selPanel.style.display = 'none';
		            alert('已选择「' + (lottery.lottery_name || lottery.lottery_id) + '」，已生成媒体接口地址，即将打开新窗口。');
		            window.open(detailUrl, '_blank', 'noopener,noreferrer');
		        };
		        btnContainer.appendChild(b);
		    });
		    selPanel.style.display = 'block';
		    selPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
		    return;
		}
		
		// 单个周边 → 直接继续
		const lotteryId = tabLotteryId || lotteryList[0]?.lottery_id;
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
		async function fetchAndRenderDetail(filepath, lotteryId) {
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
		}
		function showLotterySelection(actId, lotteryList, tabLotteryId) {
		    const panel = document.getElementById('lottery-selection-panel');
		    const container = document.getElementById('lottery-buttons');
		    container.innerHTML = '';
		    lotteryList.forEach(function(lottery) {
		        const b = document.createElement('button');
		        b.innerText = lottery.lottery_name || ('周边 ' + lottery.lottery_id);
		        if (String(lottery.lottery_id) === String(tabLotteryId)) {
		            b.classList.add('recommended');
		            b.innerText += ' ★';
		        }
		        b.onclick = function() { selectLottery(actId, lottery.lottery_id); };
		        container.appendChild(b);
		    });
		    panel.style.display = 'block';
		    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
		async function selectLottery(actId, lotteryId) {
		    const btn = document.getElementById('fetch-btn');
		    const originalBtnText = btn.innerText;
		    btn.innerText = '正在获取数据...';
		    btn.disabled = true;
		    document.getElementById('lottery-selection-panel').style.display = 'none';
		    try {
		        const filepath = document.getElementById('filepath').value.trim();
		        await fetchAndRenderDetail(filepath, lotteryId);
		    } catch (err) {
		        const msg = err?.message || '未知错误';
		        showManualFallback(msg, document.getElementById('filepath').value.trim());
		        alert('获取失败：' + msg);
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
		    const lotteryPanel = document.getElementById('lottery-selection-panel');
		    const basicDataBox = document.getElementById('basic-data');
		    const detailUrlBox = document.getElementById('detail-url');
		
		    btn.innerText = '正在自动解析...';
		    btn.disabled = true;
		
		    // 每次重新尝试自动解析前，先清空上次状态
		    manualPanel.style.display = 'none';
		    lotteryPanel.style.display = 'none';
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
		
		    const lotteryList = basicData?.data?.lottery_list || [];
		    const tabLotteryId = basicData?.data?.tab_lottery_id;
		
		    // 多个数字周边 → 展示选择按钮，等待用户点击
		    if (lotteryList.length >= 2) {
		        showLotterySelection(id, lotteryList, tabLotteryId);
		        btn.innerText = originalBtnText;
		        btn.disabled = false;
		        return;
		    }
		
		    // 单个周边 → 直接继续
		    lotteryId = tabLotteryId || lotteryList[0]?.lottery_id;
		    if (!lotteryId) {
		        throw new Error('未找到有效的 lottery_id!');
		    }
		}
		
		await fetchAndRenderDetail(filepath, lotteryId);
		
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
		        document.getElementById('result-name').innerText = zipName;
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
		        const extraRewardTypeNames = new Set(['评论背景', '典藏卡', '头像挂件']);
		        const collectChain = Array.isArray(infos.collect_list?.collect_chain)
		            ? infos.collect_list.collect_chain
		            : [];
		        const collectInfos = Array.isArray(infos.collect_list?.collect_infos)
		            ? infos.collect_list.collect_infos
		            : [];
		        [...collectChain, ...collectInfos].forEach(item => {
		            const itemName = item?.redeem_item_name || '';
		            const itemTypeName = item?.redeem_item_type_name || '';
		            const matchesExistingReward =
		                itemName === '钻石头像背景' || itemName.endsWith('表情包');
		            const matchesTypeReward = extraRewardTypeNames.has(itemTypeName);
		            if (matchesExistingReward || matchesTypeReward) {
		                addImageItem(itemName || itemTypeName, item?.redeem_item_image);
		            }
		        });
		        renderGrid(itemList);
		    } catch (err) {
		        alert(\`解析数据出错，请确保输入的是完整的 JSON 格式：\${err.message}\`);
		    }
		}
		function parseShineConfig(metaInfo) {
		    const defaults = {
		        laser_intensity: 1,
		        skin_protection: 1,
		        cloth_boost: 0.68,
		        hue_start: 0,
		        hue_range: 1
		    };
		    try {
		        const rawConfig = metaInfo?.shine_effect_config;
		        const parsed = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
		        return { ...defaults, ...(parsed || {}) };
		    } catch (error) {
		        console.warn('镭射参数解析失败，将使用默认值：', error);
		        return defaults;
		    }
		}
		function loadCorsImage(url) {
		    const load = source => new Promise((resolve, reject) => {
		        const image = new Image();
		        image.crossOrigin = 'anonymous';
		        image.referrerPolicy = 'no-referrer';
		        image.onload = () => resolve(image);
		        image.onerror = () => reject(new Error('图片加载失败：' + source));
		        image.src = source;
		    });
		    return load(url).catch(directError => {
		        console.warn('图片直连加载失败，尝试 Worker 代理：', directError);
		        return load('/proxy?url=' + encodeURIComponent(url));
		    });
		}
		function positiveModulo(value, divisor) {
		    return ((value % divisor) + divisor) % divisor;
		}
		function drawLaserFrame(renderer, timestamp = 0) {
		    if (!renderer.ready) return;
		    const {
		        canvas, context, baseImage, maskCanvas, effectCanvas,
		        config, pointerX, pointerY, enabled
		    } = renderer;
		    const width = canvas.width;
		    const height = canvas.height;
		    context.globalAlpha = 1;
		    context.globalCompositeOperation = 'source-over';
		    context.clearRect(0, 0, width, height);
		    context.drawImage(baseImage, 0, 0, width, height);
		    if (!enabled) return;

		    const effectContext = effectCanvas.getContext('2d');
		    const animatedPhase = positiveModulo(timestamp * 0.000045 + pointerX * 0.55 + pointerY * 0.2, 1);
		    const angle = (-55 + pointerX * 70) * Math.PI / 180;
		    const centerX = width / 2;
		    const centerY = height / 2;
		    const radius = Math.hypot(width, height) * 0.72;
		    const x0 = centerX - Math.cos(angle) * radius;
		    const y0 = centerY - Math.sin(angle) * radius;
		    const x1 = centerX + Math.cos(angle) * radius;
		    const y1 = centerY + Math.sin(angle) * radius;

		    effectContext.globalAlpha = 1;
		    effectContext.globalCompositeOperation = 'source-over';
		    effectContext.clearRect(0, 0, width, height);
		    const rainbow = effectContext.createLinearGradient(x0, y0, x1, y1);
		    const colorStops = 10;
		    for (let index = 0; index <= colorStops; index++) {
		        const position = index / colorStops;
		        const hueProgress = positiveModulo(position + animatedPhase, 1);
		        const hue = positiveModulo(
		            (Number(config.hue_start) + hueProgress * Number(config.hue_range)) * 360,
		            360
		        );
		        rainbow.addColorStop(position, 'hsl(' + hue + ' 94% 58%)');
		    }
		    effectContext.fillStyle = rainbow;
		    effectContext.fillRect(0, 0, width, height);
		    effectContext.globalCompositeOperation = 'destination-in';
		    effectContext.drawImage(maskCanvas, 0, 0);

		    const laserIntensity = Math.max(0, Number(config.laser_intensity) || 0);
		    context.globalCompositeOperation = 'source-over';
		    context.globalAlpha = Math.min(0.48, 0.16 + laserIntensity * 0.2);
		    context.drawImage(effectCanvas, 0, 0);
		    context.globalCompositeOperation = 'screen';
		    context.globalAlpha = Math.min(0.38, 0.1 + laserIntensity * 0.16);
		    context.drawImage(effectCanvas, 0, 0);

		    effectContext.globalCompositeOperation = 'source-over';
		    effectContext.clearRect(0, 0, width, height);
		    const shine = effectContext.createLinearGradient(x0, y0, x1, y1);
		    const shineCenter = positiveModulo(animatedPhase * 1.35, 1);
		    const shineWidth = 0.075;
		    const shineStops = [
		        [0, 'rgba(255,255,255,0)'],
		        [Math.max(0, shineCenter - shineWidth), 'rgba(255,255,255,0)'],
		        [shineCenter, 'rgba(255,255,255,0.95)'],
		        [Math.min(1, shineCenter + shineWidth), 'rgba(255,255,255,0)'],
		        [1, 'rgba(255,255,255,0)']
		    ];
		    shineStops
		        .sort((left, right) => left[0] - right[0])
		        .forEach(([position, color]) => shine.addColorStop(position, color));
		    effectContext.fillStyle = shine;
		    effectContext.fillRect(0, 0, width, height);
		    effectContext.globalCompositeOperation = 'destination-in';
		    effectContext.drawImage(maskCanvas, 0, 0);
		    context.globalCompositeOperation = 'screen';
		    context.globalAlpha = Math.min(0.38, 0.12 + laserIntensity * 0.12);
		    context.drawImage(effectCanvas, 0, 0);
		    context.globalAlpha = 1;
		    context.globalCompositeOperation = 'source-over';
		}
		function startLaserAnimation() {
		    if (laserAnimationFrame !== null) return;
		    const animate = timestamp => {
		        laserRenderers.forEach(renderer => {
		            if (renderer.enabled && renderer.ready && renderer.visible && renderer.canvas.isConnected) {
		                drawLaserFrame(renderer, timestamp);
		            }
		        });
		        laserAnimationFrame = requestAnimationFrame(animate);
		    };
		    laserAnimationFrame = requestAnimationFrame(animate);
		}
		function createLaserPreview(cardInfo, titleText) {
		    const metaInfo = cardInfo.meta_info || {};
		    const config = parseShineConfig(metaInfo);
		    const preview = document.createElement('div');
		    preview.className = 'laser-preview';
		    const stage = document.createElement('div');
		    stage.className = 'laser-stage';
		    const canvas = document.createElement('canvas');
		    canvas.width = 414;
		    canvas.height = 621;
		    canvas.setAttribute('aria-label', titleText + ' 镭射款动态预览');
		    const badge = document.createElement('div');
		    badge.className = 'laser-badge';
		    badge.innerText = '✦ 实验性镭射预览';
		    const status = document.createElement('div');
		    status.className = 'laser-status';
		    status.innerText = '正在加载卡面与镭射控制图...';
		    const actions = document.createElement('div');
		    actions.className = 'laser-actions';
		    const toggleButton = document.createElement('button');
		    toggleButton.type = 'button';
		    toggleButton.innerText = '关闭镭射';
		    const motionButton = document.createElement('button');
		    motionButton.type = 'button';
		    motionButton.className = 'secondary';
		    registerLaserMotionButton(motionButton);
		    const saveButton = document.createElement('button');
		    saveButton.type = 'button';
		    saveButton.className = 'secondary';
		    saveButton.innerText = '保存当前效果';
		    saveButton.disabled = true;

		    actions.appendChild(toggleButton);
		    actions.appendChild(motionButton);
		    actions.appendChild(saveButton);
		    stage.appendChild(canvas);
		    stage.appendChild(badge);
		    stage.appendChild(status);
		    preview.appendChild(stage);
		    preview.appendChild(actions);

		    const maskCanvas = document.createElement('canvas');
		    const effectCanvas = document.createElement('canvas');
		    const renderer = {
		        stage,
		        canvas,
		        context: canvas.getContext('2d'),
		        maskCanvas,
		        effectCanvas,
		        baseImage: null,
		        config,
		        pointerX: 0.5,
		        pointerY: 0.5,
		        enabled: true,
		        visible: true,
		        ready: false
		    };
		    laserRenderers.add(renderer);
		    stage._laserRenderer = renderer;
		    laserVisibilityObserver?.observe(stage);

		    const updatePointer = event => {
		        const rect = stage.getBoundingClientRect();
		        renderer.pointerX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
		        renderer.pointerY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
		    };
		    stage.addEventListener('pointermove', updatePointer);
		    toggleButton.addEventListener('click', () => {
		        renderer.enabled = !renderer.enabled;
		        toggleButton.innerText = renderer.enabled ? '关闭镭射' : '开启镭射';
		        badge.style.display = renderer.enabled ? 'block' : 'none';
		        drawLaserFrame(renderer, performance.now());
		    });
		    saveButton.addEventListener('click', async () => {
		        try {
		            await saveLaserPreview(renderer, titleText);
		        } catch (error) {
		            alert('当前镭射预览保存失败：' + error.message);
		        }
		    });

		    const loadLaserAssets = () => {
		        renderer.ready = false;
		        renderer.enabled = true;
		        toggleButton.innerText = '关闭镭射';
		        toggleButton.disabled = true;
		        motionButton.disabled = true;
		        saveButton.disabled = true;
		        badge.style.display = 'block';
		        canvas.style.display = 'block';
		        status.style.display = 'flex';
		        status.replaceChildren(document.createTextNode('正在加载卡面与镭射控制图...'));

		        Promise.all([
		            loadCorsImage(cardInfo.card_img),
		            loadCorsImage(metaInfo.upgrade_cover_url)
		        ]).then(([baseImage, coverImage]) => {
		            const renderWidth = Math.min(480, baseImage.naturalWidth || baseImage.width);
		            const renderHeight = Math.round(
		                renderWidth * (baseImage.naturalHeight || baseImage.height) /
		                (baseImage.naturalWidth || baseImage.width)
		            );
		            canvas.width = renderWidth;
		            canvas.height = renderHeight;
		            maskCanvas.width = renderWidth;
		            maskCanvas.height = renderHeight;
		            effectCanvas.width = renderWidth;
		            effectCanvas.height = renderHeight;

		            const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
		            maskContext.drawImage(coverImage, 0, 0, renderWidth, renderHeight);
		            const maskPixels = maskContext.getImageData(0, 0, renderWidth, renderHeight);
		            const skinProtection = Math.max(0, Number(config.skin_protection) || 0);
		            const clothBoost = Math.max(0, Number(config.cloth_boost) || 0);
		            const maskExponent = 0.82 + skinProtection * 0.34;
		            const maskBoost = 0.72 + clothBoost * 0.42;
		            for (let offset = 0; offset < maskPixels.data.length; offset += 4) {
		                const luminance = (
		                    maskPixels.data[offset] * 0.2126 +
		                    maskPixels.data[offset + 1] * 0.7152 +
		                    maskPixels.data[offset + 2] * 0.0722
		                ) / 255;
		                const alpha = Math.min(1, Math.pow(luminance, maskExponent) * maskBoost);
		                maskPixels.data[offset] = 255;
		                maskPixels.data[offset + 1] = 255;
		                maskPixels.data[offset + 2] = 255;
		                maskPixels.data[offset + 3] = Math.round(alpha * 255);
		            }
		            maskContext.putImageData(maskPixels, 0, 0);
		            renderer.baseImage = baseImage;
		            renderer.ready = true;
		            status.style.display = 'none';
		            toggleButton.disabled = false;
		            motionButton.disabled = false;
		            saveButton.disabled = false;
		            drawLaserFrame(renderer, performance.now());
		            startLaserAnimation();
		        }).catch(error => {
		            console.error('镭射预览加载失败：', error);
		            renderer.enabled = false;
		            canvas.style.display = 'none';
		            badge.style.display = 'none';
		            toggleButton.disabled = true;
		            motionButton.disabled = true;
		            saveButton.disabled = true;
		            status.replaceChildren();
		            const message = document.createElement('div');
		            message.innerText = '镭射预览加载失败\\n' + error.message;
		            const retryButton = document.createElement('button');
		            retryButton.type = 'button';
		            retryButton.innerText = '↻ 重新加载';
		            retryButton.addEventListener('click', loadLaserAssets);
		            status.appendChild(message);
		            status.appendChild(retryButton);
		        });
		    };
		    loadLaserAssets();
		    return preview;
		}
		function renderGrid(itemList) {
		    const grid = document.getElementById('videos-grid');
		    grid.innerHTML = '';
		    fileUrls = [];
		    fileNames = [];
		    laserControlFiles = [];
		    laserAssetPairs = [];
		    laserRenderers.forEach(renderer => laserVisibilityObserver?.unobserve(renderer.stage));
		    laserRenderers.clear();
		    laserMotionButtons.clear();
		
		    itemList.forEach((item, index) => {
		        if (!item || !item.card_info) return;
		
		        const cardInfo = item.card_info;
		        const rawVideoUrl = cardInfo.video_list && cardInfo.video_list[0];
		        const rawImgUrl = cardInfo.card_img;
		        const upgradeCoverUrl = cardInfo.meta_info?.upgrade_cover_url;
		
		        if (!rawVideoUrl && !rawImgUrl) return;
		
		        const wrapper = document.createElement('div');
		        wrapper.className = 'media-card';
		
		        const title = document.createElement('div');
		        title.className = 'title';
		        title.innerText = sanitizeFileName(cardInfo.card_name || ('未命名素材 ' + (index + 1)));
		        wrapper._downloadInfo = {
		            title: title.innerText,
		            url: rawVideoUrl || rawImgUrl
		        };
		
		        if (rawVideoUrl) {
		            const video = document.createElement('video');
		            video.controls = true;
		            video.preload = 'metadata';
			video.referrerPolicy = 'no-referrer';
		            video.setAttribute('playsinline', 'true');
		            attachMediaRetry(video, rawVideoUrl, '视频');
		            video.src = rawVideoUrl;
		            wrapper.appendChild(video);
		
		            fileUrls.push(rawVideoUrl);
		            fileNames.push({
		                name: title.innerText,
		                originalUrl: rawVideoUrl,
		                fetchUrl: rawVideoUrl,
		                mediaType: 'video',
		                viaProxy: false
		            });
		        } else if (rawImgUrl && upgradeCoverUrl) {
		            wrapper.classList.add('has-laser');
		            wrapper.appendChild(createLaserPreview(cardInfo, title.innerText));
		            fileUrls.push(rawImgUrl);
		            laserAssetPairs.push({
		                name: title.innerText,
		                imageUrl: rawImgUrl,
		                controlUrl: upgradeCoverUrl
		            });
		            fileNames.push({
		                name: title.innerText,
		                originalUrl: rawImgUrl,
		                fetchUrl: rawImgUrl,
		                mediaType: 'image',
		                viaProxy: false
		            });
		        } else {
		            const img = document.createElement('img');
		            img.alt = title.innerText;
			img.referrerPolicy = 'no-referrer';
		            attachMediaRetry(img, rawImgUrl, '图片');
		            img.src = rawImgUrl;
		            wrapper.appendChild(img);
		
		            fileUrls.push(rawImgUrl);
		            fileNames.push({
		                name: title.innerText,
		                originalUrl: rawImgUrl,
		                fetchUrl: rawImgUrl,
		                mediaType: 'image',
		                viaProxy: false
		            });
		        }
		        if (upgradeCoverUrl) {
		            laserControlFiles.push({
		                name: title.innerText,
		                originalUrl: upgradeCoverUrl,
		                fetchUrl: upgradeCoverUrl,
		                mediaType: 'laser-control',
		                viaProxy: false
		            });
		        }
		
		        wrapper.appendChild(title);
		        grid.appendChild(wrapper);
		    });
		}
		function buildLaserGalleryHtml(items) {
		    const galleryData = JSON.stringify(items).replace(/</g, '\\u003c');
		    return [
		        '<!DOCTYPE html>',
		        '<html lang="zh-CN">',
		        '<head>',
		        '<meta charset="utf-8">',
		        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		        '<title>镭射图展示</title>',
		        '<style>',
		        ':root{color-scheme:dark;--text:#f8fafc;--muted:#a7b0c3;--line:rgba(255,255,255,.16);--main:#10b981;}',
		        '*{box-sizing:border-box;}',
		        'body{margin:0;min-height:100vh;overflow:hidden;color:var(--text);font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif;background:#020403;}',
		        '.page{min-height:100vh;display:grid;grid-template-rows:1fr auto;align-items:center;padding:26px 0 32px;}',
		        '.carousel{position:relative;width:100vw;height:min(76vh,900px);display:flex;align-items:center;justify-content:center;perspective:1200px;touch-action:pan-y;user-select:none;}',
		        '.side{position:absolute;top:50%;width:min(30vw,260px);height:72%;border-radius:18px;opacity:.72;overflow:hidden;background:#111827;box-shadow:0 28px 80px rgba(0,0,0,.58);transform:translateY(-50%) scale(.86);}',
		        '.side img{width:100%;height:100%;object-fit:cover;display:block;}',
		        '.side.prev{left:-7vw;}',
		        '.side.next{right:-7vw;}',
		        '.stage{position:relative;width:min(70vw,560px);max-width:calc(100vw - 48px);max-height:100%;border-radius:22px;overflow:hidden;background:#020617;box-shadow:0 34px 110px rgba(0,0,0,.72),0 0 0 1px rgba(255,255,255,.12);cursor:grab;touch-action:none;}',
		        '.stage:active{cursor:grabbing;}',
		        'canvas{display:block;width:100%;height:auto;max-height:min(76vh,900px);}',
		        '.status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:26px;color:#dbeafe;background:rgba(2,6,23,.9);text-align:center;line-height:1.6;}',
		        '.nav{display:none;position:absolute;top:50%;width:52px;height:72px;padding:0;border:1px solid var(--line);border-radius:8px;color:#fff;background:rgba(15,23,42,.62);box-shadow:0 16px 38px rgba(0,0,0,.32);transform:translateY(-50%);backdrop-filter:blur(10px);font-size:48px;line-height:1;align-items:center;justify-content:center;}',
		        '.nav:hover{background:rgba(16,185,129,.78);}',
		        '.nav.prev{left:18px;}',
		        '.nav.next{right:18px;}',
		        '.caption{display:grid;place-items:center;gap:13px;padding:0 18px;text-align:center;}',
		        '.name{display:flex;align-items:center;justify-content:center;gap:18px;max-width:min(760px,92vw);color:#ece9ff;text-shadow:0 0 20px rgba(168,85,247,.62);font-size:clamp(24px,5vw,42px);font-weight:800;letter-spacing:0;}',
		        '.name:before,.name:after{content:"";width:min(130px,18vw);height:1px;background:linear-gradient(90deg,transparent,#c4b5fd,transparent);}',
		        '.actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}',
		        'button{border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:10px 16px;color:#fff;background:rgba(16,185,129,.9);font:inherit;font-weight:800;cursor:pointer;box-shadow:0 12px 28px rgba(16,185,129,.22);}',
		        'button.secondary{background:rgba(30,41,59,.82);box-shadow:none;}',
		        'button:disabled{opacity:.5;cursor:not-allowed;}',
		        '.counter{color:var(--muted);font-size:13px;}',
		        '@media (min-width:1025px) and (hover:hover) and (pointer:fine){.side{width:min(30vw,400px);}.side.prev{left:50%;right:auto;transform:translate(calc(-50% - min(39vw,500px)),-50%) scale(.86);}.side.next{left:50%;right:auto;transform:translate(calc(-50% + min(39vw,500px)),-50%) scale(.86);}.nav{display:flex;}.nav.prev{left:50%;right:auto;transform:translate(calc(-50% - min(36vw,430px)),-50%);}.nav.next{left:50%;right:auto;transform:translate(calc(-50% + min(36vw,430px)),-50%);}}',
		        '@media (max-width:1024px){.side{width:min(34vw,180px);height:66%;border-radius:14px;}.side.prev{left:50%;right:auto;transform:translate(calc(-50% - min(56vw,430px)),-50%) scale(.86);}.side.next{left:50%;right:auto;transform:translate(calc(-50% + min(56vw,430px)),-50%) scale(.86);}}',
		        '@media (max-width:700px){.page{padding:16px 0 22px;}.carousel{height:68vh;}.stage{width:min(82vw,520px);max-width:calc(100vw - 40px);border-radius:18px;}button{padding:9px 12px;font-size:14px;}}',
		        '</style>',
		        '</head>',
		        '<body>',
		        '<main class="page">',
		        '<section class="carousel" id="carousel">',
		        '<div class="side prev"><img id="prev-img" alt=""></div>',
		        '<div class="stage" id="stage"><canvas id="canvas" width="828" height="1242"></canvas><div class="status" id="status">正在加载镭射图...</div></div>',
		        '<div class="side next"><img id="next-img" alt=""></div>',
		        '<button class="nav prev" id="prev-btn" type="button">‹</button>',
		        '<button class="nav next" id="next-btn" type="button">›</button>',
		        '</section>',
		        '<section class="caption"><div class="name" id="name">镭射图</div><div class="actions"><button id="toggle-btn" type="button">关闭镭射</button><button id="save-btn" class="secondary" type="button">保存效果</button><button id="motion-btn" class="secondary" type="button">开启晃动</button></div><div class="counter" id="counter"></div></section>',
		        '</main>',
		        '<script>',
		        'const ITEMS=' + galleryData + ';',
		        'const state={index:0,enabled:true,ready:false,baseImage:null,maskImage:null,pointerX:.5,pointerY:.5,motionEnabled:false,motionListening:false,motionBaseline:null};',
		        'const canvas=document.getElementById("canvas"),ctx=canvas.getContext("2d"),maskCanvas=document.createElement("canvas"),effectCanvas=document.createElement("canvas"),stage=document.getElementById("stage"),statusBox=document.getElementById("status"),nameBox=document.getElementById("name"),counterBox=document.getElementById("counter"),toggleBtn=document.getElementById("toggle-btn"),saveBtn=document.getElementById("save-btn"),motionBtn=document.getElementById("motion-btn");',
		        'function fileSrc(path){return String(path||"").split("/").map(encodeURIComponent).join("/");}',
		        'function mod(value,divisor){return ((value%divisor)+divisor)%divisor;}',
		        'function cleanName(name){return String(name||"镭射图").replace(/[\\\\/:*?"<>|]/g,"").trim()||"镭射图";}',
		        'function loadImage(path){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("图片加载失败："+path));img.src=fileSrc(path);});}',
		        'function resizeCanvases(){const width=Math.min(1400,state.baseImage.naturalWidth||state.baseImage.width||828);const height=Math.round(width*(state.baseImage.naturalHeight||state.baseImage.height||1242)/(state.baseImage.naturalWidth||state.baseImage.width||828));canvas.width=width;canvas.height=height;maskCanvas.width=width;maskCanvas.height=height;effectCanvas.width=width;effectCanvas.height=height;}',
		        'function draw(timestamp){if(!state.ready)return;const width=canvas.width,height=canvas.height;ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";ctx.clearRect(0,0,width,height);ctx.drawImage(state.baseImage,0,0,width,height);if(!state.enabled)return;const ectx=effectCanvas.getContext("2d");const phase=mod(timestamp*.000045+state.pointerX*.55+state.pointerY*.2,1);const angle=(-55+state.pointerX*70)*Math.PI/180;const cx=width/2,cy=height/2,radius=Math.hypot(width,height)*.72;const x0=cx-Math.cos(angle)*radius,y0=cy-Math.sin(angle)*radius,x1=cx+Math.cos(angle)*radius,y1=cy+Math.sin(angle)*radius;ectx.globalAlpha=1;ectx.globalCompositeOperation="source-over";ectx.clearRect(0,0,width,height);const rainbow=ectx.createLinearGradient(x0,y0,x1,y1);for(let i=0;i<=10;i++)rainbow.addColorStop(i/10,"hsl("+mod((i/10+phase)*360,360)+" 94% 58%)");ectx.fillStyle=rainbow;ectx.fillRect(0,0,width,height);ectx.globalCompositeOperation="multiply";ectx.filter="contrast(170%) brightness(118%)";ectx.drawImage(state.maskImage,0,0,width,height);ectx.filter="none";ctx.globalCompositeOperation="screen";ctx.globalAlpha=.44;ctx.drawImage(effectCanvas,0,0);ectx.globalCompositeOperation="source-over";ectx.clearRect(0,0,width,height);const shine=ectx.createLinearGradient(x0,y0,x1,y1),center=mod(phase*1.35,1),sw=.075;[[0,"rgba(255,255,255,0)"],[Math.max(0,center-sw),"rgba(255,255,255,0)"],[center,"rgba(255,255,255,.95)"],[Math.min(1,center+sw),"rgba(255,255,255,0)"],[1,"rgba(255,255,255,0)"]].sort((a,b)=>a[0]-b[0]).forEach(stop=>shine.addColorStop(stop[0],stop[1]));ectx.fillStyle=shine;ectx.fillRect(0,0,width,height);ectx.globalCompositeOperation="multiply";ectx.filter="contrast(190%) brightness(125%)";ectx.drawImage(state.maskImage,0,0,width,height);ectx.filter="none";ctx.globalCompositeOperation="screen";ctx.globalAlpha=.24;ctx.drawImage(effectCanvas,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";}',
		        'function animate(timestamp){draw(timestamp);requestAnimationFrame(animate);}',
		        'async function show(index){if(!ITEMS.length){statusBox.textContent="这个压缩包里没有可展示的镭射图。";return;}state.index=mod(index,ITEMS.length);state.ready=false;statusBox.style.display="flex";statusBox.textContent="正在加载镭射图...";const item=ITEMS[state.index],prev=ITEMS[mod(state.index-1,ITEMS.length)],next=ITEMS[mod(state.index+1,ITEMS.length)];nameBox.textContent=item.title||"镭射图";counterBox.textContent=(state.index+1)+" / "+ITEMS.length;document.getElementById("prev-img").src=fileSrc(prev.image);document.getElementById("next-img").src=fileSrc(next.image);try{const images=await Promise.all([loadImage(item.image),loadImage(item.mask)]);state.baseImage=images[0];state.maskImage=images[1];resizeCanvases();state.ready=true;statusBox.style.display="none";draw(performance.now());}catch(error){statusBox.textContent=error.message;}}',
		        'function change(delta){show(state.index+delta);}',
		        'function orientationAngle(){const angle=screen.orientation?.angle??window.orientation??0;return ((Number(angle)%360)+360)%360;}',
		        'function tiltDelta(value){return ((value+180)%360+360)%360-180;}',
		        'function handleOrientation(event){if(!state.motionEnabled||event.beta==null||event.gamma==null)return;const angle=orientationAngle();if(!state.motionBaseline||state.motionBaseline.angle!==angle){state.motionBaseline={beta:event.beta,gamma:event.gamma,angle};motionBtn.textContent="晃动已开启";return;}const beta=tiltDelta(event.beta-state.motionBaseline.beta),gamma=tiltDelta(event.gamma-state.motionBaseline.gamma);let horizontal=gamma,vertical=beta;if(angle===90){horizontal=beta;vertical=-gamma;}else if(angle===270){horizontal=-beta;vertical=gamma;}else if(angle===180){horizontal=-gamma;vertical=-beta;}state.pointerX+=(Math.max(0,Math.min(1,.5+horizontal/60))-state.pointerX)*.35;state.pointerY+=(Math.max(0,Math.min(1,.5+vertical/60))-state.pointerY)*.35;}',
		        'async function enableMotion(){if(typeof DeviceOrientationEvent==="undefined"){alert("当前浏览器或设备不支持晃动感应。");return;}try{if(!state.motionEnabled&&typeof DeviceOrientationEvent.requestPermission==="function"){const permission=await DeviceOrientationEvent.requestPermission();if(permission!=="granted")throw new Error("未获得动作与方向访问权限");}if(!state.motionListening){window.addEventListener("deviceorientation",handleOrientation,true);state.motionListening=true;}state.motionEnabled=true;state.motionBaseline=null;motionBtn.textContent="请晃动手机";}catch(error){alert("无法开启晃动感应："+error.message);}}',
		        'stage.addEventListener("pointermove",event=>{const rect=stage.getBoundingClientRect();state.pointerX=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));state.pointerY=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));draw(performance.now());});',
		        'let startX=0;stage.addEventListener("pointerdown",event=>{startX=event.clientX;});stage.addEventListener("pointerup",event=>{const diff=event.clientX-startX;if(Math.abs(diff)>42)change(diff>0?-1:1);});',
		        'document.getElementById("prev-btn").addEventListener("click",()=>change(-1));document.getElementById("next-btn").addEventListener("click",()=>change(1));',
		        'toggleBtn.addEventListener("click",()=>{state.enabled=!state.enabled;toggleBtn.textContent=state.enabled?"关闭镭射":"开启镭射";draw(performance.now());});',
		        'saveBtn.addEventListener("click",()=>{if(!state.ready)return;draw(performance.now());try{canvas.toBlob(blob=>{if(!blob){alert("当前浏览器禁止保存本地图片合成结果，可以用本地服务器方式打开此 HTML 后再试。");return;}const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=cleanName(ITEMS[state.index]?.title)+"_镭射效果.png";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},"image/png");}catch(error){alert("当前浏览器禁止保存本地图片合成结果，可以用本地服务器方式打开此 HTML 后再试。");}});',
		        'motionBtn.addEventListener("click",enableMotion);',
		        'if(!(navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)))motionBtn.style.display="none";',
		        'document.addEventListener("keydown",event=>{if(event.key==="ArrowLeft")change(-1);if(event.key==="ArrowRight")change(1);});',
		        'show(0);requestAnimationFrame(animate);',
		        '<\\/script>',
		        '</body>',
		        '</html>'
		    ].join('\\n');
		}
		function buildSourceLinkHtml(title, sourceUrl) {
		    const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({
		        '&': '&amp;',
		        '<': '&lt;',
		        '>': '&gt;',
		        '"': '&quot;',
		        "'": '&#39;'
		    }[char]));
		    const safeTitle = escapeHtml(title || '数字周边');
		    const safeUrl = escapeHtml(sourceUrl || '');
		    const jsUrl = JSON.stringify(String(sourceUrl || '')).replace(/</g, '\\u003c');
		    return [
		        '<!DOCTYPE html>',
		        '<html lang="zh-CN">',
		        '<head>',
		        '<meta charset="utf-8">',
		        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		        '<title>' + safeTitle + '</title>',
		        '<style>',
		        '*{box-sizing:border-box;}',
		        'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#172033;font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif;background:linear-gradient(135deg,#f8fafc,#ecfdf5,#fff7ed);}',
		        'main{width:min(520px,100%);padding:28px;border:1px solid #dce4ee;border-radius:12px;background:rgba(255,255,255,.9);box-shadow:0 18px 60px rgba(15,23,42,.12);text-align:center;}',
		        'h1{margin:0 0 12px;font-size:24px;letter-spacing:0;}',
		        'p{margin:0 0 18px;color:#64748b;line-height:1.65;}',
		        'a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:8px;color:#fff;background:#10b981;font-weight:800;text-decoration:none;box-shadow:0 12px 26px rgba(16,185,129,.25);}',
		        '.url{margin-top:16px;color:#64748b;font-size:12px;overflow-wrap:anywhere;}',
		        '</style>',
		        '</head>',
		        '<body>',
		        '<main>',
		        '<h1>' + safeTitle + '</h1>',
		        '<p>正在跳转到原数字周边链接，若没有自动打开，请点击下方按钮。</p>',
		        '<a href="' + safeUrl + '" id="open-link">打开数字周边</a>',
		        '<div class="url">' + safeUrl + '</div>',
		        '</main>',
		        '<script>',
		        'const targetUrl=' + jsUrl + ';',
		        'if(targetUrl){setTimeout(()=>{window.location.href=targetUrl;},300);}',
		        '<\\/script>',
		        '</body>',
		        '</html>'
		    ].join('\\n');
		}
		async function downloadFilesAsZip() {
		    if (fileUrls.length === 0) { alert('没有找到可以下载的资源文件！'); return; }
		    if (isDownloading) { alert('当前有正在进行的下载任务，请等待其完成后再试！'); return; }
		    const targetUrls = [...fileUrls];
		    const targetData = [...fileNames];
		    const targetLaserControls = laserControlFiles.map(item => ({ ...item }));
		    const targetLaserPairs = laserAssetPairs.map(item => ({ ...item }));
		    const targetZipName = sanitizeFileName(zipName, '数字周边');
		    const sourceLink = document.getElementById('filepath').value.trim();
		    const createUniqueFileNames = (items, fallbackPrefix) => {
		        const nameOccurrenceMap = {};
		        return items.map((item, index) => {
		            const safeName = sanitizeFileName(item?.name, fallbackPrefix + '_' + (index + 1));
		            if (nameOccurrenceMap[safeName] !== undefined) {
		                nameOccurrenceMap[safeName]++;
		                return safeName + '_' + nameOccurrenceMap[safeName];
		            }
		            nameOccurrenceMap[safeName] = 0;
		            return safeName;
		        });
		    };
		    const finalFileNames = createUniqueFileNames(targetData, '未命名素材');
		    const finalLaserControlNames = createUniqueFileNames(targetLaserControls, '未命名镭射效果控制图');
		    const downloadTasks = targetData.map((meta, index) => ({
		        currentUrl: targetUrls[index],
		        meta,
		        baseName: finalFileNames[index],
		        directory: ''
		    })).concat(targetLaserControls.map((meta, index) => ({
		        currentUrl: meta.fetchUrl || meta.originalUrl,
		        meta,
		        baseName: finalLaserControlNames[index],
		        directory: '镭射效果控制图/'
		    })));
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
		    const downloadedPaths = new Map();
		    let completedCount = 0;
		    const CONCURRENCY_LIMIT = 2;
		    let currentIndex = 0;
		    const updateProgress = () => {
		        const percent = Math.floor((completedCount / downloadTasks.length) * 100);
		        progressBar.value = percent;
		        progressText.innerText = \`正在下载 [\${targetZipName}]... 进度 \${percent}% (\${completedCount}/\${downloadTasks.length})\`;
		    };
		    const downloadWorker = async () => {
		        while (currentIndex < downloadTasks.length) {
		            const index = currentIndex++;
		const task = downloadTasks[index];
		const currentUrl = task.currentUrl;
		const meta = task.meta || {};
		const originalUrl = meta.originalUrl || currentUrl;
		const fetchUrl = meta.fetchUrl || currentUrl;
		const mediaType = meta.mediaType || 'unknown';
		const viaProxy = !!meta.viaProxy;
		const baseName = task.baseName;
		const directory = task.directory;
		let inferredExt = '.bin';
		
		try {
		    const response = await fetchWithRetry(fetchUrl, {
		    referrerPolicy: 'no-referrer',
		    headers: {
		        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
		    }
		}, 3, 30000);
		    const blob = await response.blob();
		    inferredExt = inferExtFromUrlOrBlob(originalUrl, blob);
		    const fileName = directory + baseName + inferredExt;
		    zip.file(fileName, blob);
		    downloadedPaths.set(originalUrl, fileName);
		    downloadedPaths.set(fetchUrl, fileName);
		} catch (error) {
		    zip.file(
		directory + baseName + '_下载失败记录_' + (index + 1) + '.txt',
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
		        await Promise.all(Array.from({ length: Math.min(CONCURRENCY_LIMIT, downloadTasks.length) }, () => downloadWorker()));
		        const laserGalleryItems = targetLaserPairs
		            .map(item => ({
		                title: item.name,
		                image: downloadedPaths.get(item.imageUrl),
		                mask: downloadedPaths.get(item.controlUrl)
		            }))
		            .filter(item => item.image && item.mask);
		        if (laserGalleryItems.length > 0) {
		            zip.file('镭射图展示.html', buildLaserGalleryHtml(laserGalleryItems));
		        }
		        if (sourceLink) {
		            zip.file(sanitizeFileName(targetZipName, '数字周边') + '.html', buildSourceLinkHtml(targetZipName, sourceLink));
		        }
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
