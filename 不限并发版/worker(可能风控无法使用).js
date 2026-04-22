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
            const target = `https://api.bilibili.com/x/vas/dlc_act/act/basic?act_id=${actId}&csrf=`;
            const res = await fetch(target);
            return new Response(res.body, { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
        }

        if (url.pathname === '/api/detail') {
            const actId = url.searchParams.get('act_id');
            const lotteryId = url.searchParams.get('lottery_id');
            const target = `https://api.bilibili.com/x/vas/dlc_act/lottery_home_detail?act_id=${actId}&appkey=1d8b6e7d45233436&disable_rcmd=0&sign=341070dd7b86b7ce7c3655972d9824a7&lottery_id=${lotteryId}&ts=${Math.floor(Date.now() / 1000)}&mobi_app=android&platform=android`;

            try {
                const res = await fetch(target);
                const data = await res.json();

                const allowedDomains = extractRootDomains(data);
                const token = await signJWT({
                    origins: allowedDomains,
                    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 2)
                }, SECRET_KEY);

                return new Response(JSON.stringify(data), {
                    headers: {
                        'Content-Type': 'application/json;charset=UTF-8',
                        'Set-Cookie': `BiliProxyToken=${token}; Path=/; HttpOnly; SameSite=Strict`
                    }
                });
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500 });
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
        
        /* Github Icon Hover Effect */
        .github-icon { color: var(--text-main); transition: color 0.3s ease, filter 0.3s ease; display: flex; align-items: center; }
        .github-icon:hover { color: var(--primary); filter: drop-shadow(0 0 8px var(--primary-glow)); }

        .step-container { margin-bottom: 24px; }
        .step-title { font-size: 1.1em; font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; color: var(--primary); }
        .step-badge { background: var(--primary); color: #fff; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; justify-content: center; align-items: center; font-size: 14px; box-shadow: 0 0 8px var(--primary-glow); }
        textarea { width: 100%; box-sizing: border-box; background: #ffffff; border: 1px solid var(--border-color); color: var(--text-main); padding: 15px; border-radius: 8px; resize: vertical; font-family: monospace; transition: all 0.3s; }
        textarea:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px var(--primary-glow); }
        a {text-decoration: none; color: #1CBD87; font-weight: bold; }
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
            <h1>
                B站数字周边提取工具
                <a href="https://github.com/Iskongkongyo" target="_blank" class="github-icon" title="访问我的 GitHub 主页">
                    <svg height="28" width="28" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                </a>
            </h1>
            
            <div class="step-container">
                <div class="step-title"><span class="step-badge">1</span> 获取链接</div>
                <p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;">用B站移动端APP打开<a href="bilibili://forward?-Btarget=https%3A%2F%2Fwww.bilibili.com%2Fh5%2Fmall%2Fhome%3Fnavhide%3D1" >个性装扮(点我即达)</a>，进入想要下载的数字周边，点击右上角分享获取链接。</p>
                <textarea id="filepath" rows="4" placeholder="在此处粘贴分享URL，例如：https://www.bilibili.com/h5/mall/..."></textarea>
                <div style="margin-top: 10px; text-align: right;">
                    <button id="fetch-btn" onclick="getData()">一键智能解析</button>
                </div>
            </div>

            <div class="step-container">
                <div class="step-title"><span class="step-badge">2</span> 获取媒体数据</div>
                <p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;">正常情况下系统会自动完成并执行后续操作。</p>
                <textarea id="data" rows="6" placeholder="正常情况系统会自动解析，无需手动粘贴..."></textarea>
                <div style="margin-top: 10px; text-align: right;">
                    <button onclick="getVideos()">渲染视频与图片</button>
                </div>
            </div>
        </div>

        <div id="result-panel" class="panel" style="display: none;">
            <h2 id="result-title">提取结果 
                <button id="download-btn" onclick="downloadFilesAsZip()">打包下载全部</button>
            </h2>
            
            <div id="progress-container" class="progress-wrapper">
                <progress id="download-progress" max="100" value="0"></progress>
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

        async function fetchWithRetry(url, options = {}, retries = 3, timeoutMs = 15000) {
            for (let i = 0; i < retries; i++) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    options.credentials = 'same-origin'; 
                    const response = await fetch(url, { ...options, signal: controller.signal });
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

        async function getData() {
            const filepath = document.getElementById('filepath').value.trim();
            if (!filepath) { alert("URL路径不能为空！"); return; }
            const id = getParam(filepath, 'act_id') || getParam(filepath, 'id');
            if (!id) { alert("未找到有效的 act_id 或 id，请检查URL链接！"); return; }

            let lotteryId = getParam(filepath, 'lottery_id');

            const btn = document.getElementById('fetch-btn');
            const originalBtnText = btn.innerText;
            btn.innerText = "正在获取安全令牌与数据...";
            btn.disabled = true;

            try {
                // 如果没有 lottery_id，尝试从 basic 接口中提取
                if (!lotteryId || lotteryId == 'undefined' || lotteryId == 'null') {
                    const basicRes = await fetch(\`/api/basic?act_id=\${id}\`);
                    if (!basicRes.ok) throw new Error("基础接口请求失败");
                    const basicData = await basicRes.json();
                    lotteryId = basicData?.data?.tab_lottery_id || basicData?.data?.lottery_list?.[0]?.lottery_id;
                    if (!lotteryId) throw new Error("未找到有效的 lottery_id");
                }
                console.log("拉取详情并获取授权 Cookie...");
                const detailRes = await fetch(\`/api/detail?act_id=\${id}&lottery_id=\${lotteryId}\`);
                if (!detailRes.ok) throw new Error("详情接口请求失败");
                const detailData = await detailRes.json();

                document.getElementById('data').value = JSON.stringify(detailData, null, 2);
                console.log("数据与鉴权 Cookie 获取成功，开始渲染");
                getVideos(); 

            } catch (err) {
                alert(\`自动解析失败：\${err.message}。请检查链接是否正确或稍后再试。\`);
            } finally {
                btn.innerText = originalBtnText;
                btn.disabled = false;
            }
        }

        function getVideos() {
            try {
                const data = document.getElementById('data').value.trim();
                const jsonData = JSON.parse(data);
                const infos = jsonData.data;
                zipName = infos.name || '数字周边';
                
                document.getElementById('result-panel').style.display = 'block';
                document.getElementById('result-title').childNodes[0].nodeValue = \`\${zipName} \`;

                const collectChain = infos.collect_list?.collect_chain;
                if (collectChain) {
                    if (collectChain[0]?.redeem_item_name === "钻石头像背景") {
                        infos.item_list.push({ card_info: { card_name: collectChain[0].redeem_item_name, card_img: collectChain[0].redeem_item_image } });
                    }
                    if (collectChain[1]?.redeem_item_name?.endsWith("表情包")) {
                        infos.item_list.push({ card_info: { card_name: collectChain[1].redeem_item_name, card_img: collectChain[1].redeem_item_image } });
                    }
                }

                const collectInfos = infos.collect_list?.collect_infos;
                if (collectInfos?.length > 0) {
                    collectInfos.forEach(item => {
                        if (item?.redeem_item_name && (item.redeem_item_name.endsWith("表情包") || item.redeem_item_name.endsWith("动态表情包"))) {
                            infos.item_list.push({ card_info: { card_name: item.redeem_item_name, card_img: item.redeem_item_image } });
                        }
                    });
                }
                
                renderGrid(infos.item_list);
            } catch (err) {
                alert(\`解析出错：\${err.message}\`);
            }
        }

        function renderGrid(itemList) {
            const grid = document.getElementById('videos-grid');
            grid.innerHTML = ''; 
            fileUrls = [];
            fileNames = [];

            itemList.forEach((item, index) => {
                if (!item?.card_info) return;
                const cardInfo = item.card_info;
                const rawVideoUrl = cardInfo.video_list?.[0];
                const rawImgUrl = cardInfo.card_img;
                if (!rawVideoUrl && !rawImgUrl) return;

                const wrapper = document.createElement('div');
                wrapper.className = 'media-card';
                const title = document.createElement('div');
                title.className = 'title';
                title.innerText = cardInfo.card_name || \`未命名素材\`;

                if (rawVideoUrl) {
                    const proxiedVideoUrl = \`/proxy?url=\${encodeURIComponent(rawVideoUrl)}\`;
                    const video = document.createElement('video');
                    video.src = proxiedVideoUrl;
                    video.controls = true;
                    video.preload = 'metadata';
                    wrapper.appendChild(video);
                    
                    fileUrls.push(proxiedVideoUrl);
                    fileNames.push({ name: title.innerText, originalUrl: rawVideoUrl });
                } else if (rawImgUrl) {
                    const proxiedImgUrl = \`/proxy?url=\${encodeURIComponent(rawImgUrl)}\`;
                    const img = document.createElement('img');
                    img.src = proxiedImgUrl;
                    img.alt = title.innerText;
                    wrapper.appendChild(img);
                    
                    fileUrls.push(proxiedImgUrl);
                    fileNames.push({ name: title.innerText, originalUrl: rawImgUrl });
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
            const targetZipName = zipName;

            const nameOccurrenceMap = {};
            const finalFileNames = targetData.map(item => {
                let safeName = item.name.replace(/[\\\\/:*?"<>|]/g, '');
                if (nameOccurrenceMap[safeName] !== undefined) {
                    nameOccurrenceMap[safeName]++;
                    return \`\${safeName}_\${nameOccurrenceMap[safeName]}\`;
                } else {
                    nameOccurrenceMap[safeName] = 0;
                    return safeName; 
                }
            });

            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('download-progress');
            const progressText = document.getElementById('progressText');
            const downloadBtn = document.getElementById('download-btn');

            isDownloading = true;
            progressContainer.style.display = 'block';
            downloadBtn.disabled = true;
            
            const zip = new JSZip();
            let downloadedCount = 0;

            const promises = targetUrls.map(async (proxyUrl, index) => {
                try {
                    const response = await fetchWithRetry(proxyUrl, {}, 3, 30000); 
                    const blob = await response.blob();
                    
                    const originalUrlStr = targetData[index].originalUrl;
                    const urlObj = new URL(originalUrlStr);
                    const match = urlObj.pathname.match(/\\.[a-zA-Z0-9]{2,}$/i);
                    const ext = match ? match[0] : (blob.type.includes('video') ? '.mp4' : '.jpg');
                    
                    const fileName = \`\${finalFileNames[index]}\${ext}\`; 
                    zip.file(fileName, blob);
                    
                    downloadedCount++;
                    const percent = Math.floor((downloadedCount / targetUrls.length) * 100);
                    progressBar.value = percent;
                    progressText.innerText = \`正在下载 [\${targetZipName}]... 进度 \${percent}% (\${downloadedCount}/\${targetUrls.length})\`;
                } catch (error) {
                    console.error(\`文件下载失败: \${proxyUrl}\`, error);
                    zip.file(\`下载失败记录_\${index}.txt\`, \`代理链接下载失败: \${proxyUrl}\\n错误: \${error.message}\`);
                }
            });

            try {
                await Promise.all(promises);
                progressText.innerText = '资源下载完成，正在拼命压缩中，请稍候...';
                
                setTimeout(async () => {
                    const content = await zip.generateAsync({ type: 'blob' });
                    saveAs(content, \`\${targetZipName}.zip\`);
                    progressText.innerText = '压缩完毕！文件已保存。';
                    setTimeout(() => {
                        progressContainer.style.display = 'none';
                        progressBar.value = 0;
                        isDownloading = false;
                        downloadBtn.disabled = false;
                    }, 3000);
                }, 100);

            } catch (error) {
                alert(\`打包下载失败：\${error.message}\`);
                isDownloading = false;
                downloadBtn.disabled = false;
            }
        }
    </script>
</body>
</html>
`;