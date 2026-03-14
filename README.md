# 🎁 B站数字周边提取工具 (Bili-Collectible-Extractor)

> 看到 B 站里炫酷的动态头像、精致的表情包和空间背景，却只能在 APP 里看着流口水？想保存下来当壁纸？
>
> **别慌，这个项目就是为了打破这些枷锁而生的！** 🚀

这是一个基于 **Cloudflare Workers** 打造的纯 Serverless 级 B 站数字周边解析与下载工具。前端极简唯美，后端硬核防盗。只需要一键部署，你就能实现B站数字周边自由！

> [!CAUTION]
>
> 注意：如果不想费时费力部署，可直接下载[index(手动版本).html](./index(手动版本).html)或[cors(自动版本).html](./cors(自动版本).html)到本地使用！这两者在操作上面有一定的区别！前者是全手动版本（需要在新弹窗获取数据并粘贴到“**获取数字周边信息**”和“**获取媒体数据**”输入框），后者是自动版本（只需粘贴链接到“**获取链接**”输入框并点击“一键智能解析”等待获取视频和图片即可）。

## ✨ 核心亮点 (Features)

- **🪄 一键智能解析**：只需粘贴 B 站 APP 里的分享链接，自动拉取所有高清卡面、视频素材、动态头像和表情包。
- **🛡️ 降维打击防盗链**：原生集成 Cloudflare Worker 反向代理。突破 B 站图片/视频 CDN 的 `403 Forbidden` 拦截，完美解决前端跨域 (CORS) 报错。
- **👮 接口防滥用 (JWT)**：后端自动抓取素材源域名并签发 JWT (JSON Web Token) 会话级 Cookie。就算别人摸到了你的 Worker 接口，没有合法 Token 也是一律拒之门外！
- **🔒 私有化部署 (Basic Auth)**：支持配置全局账号密码，把工具私有化，杜绝野生网友白嫖你的流量。
- **📦 强迫症福音的打包下载**：一键将数个视频和图片打包成 `.zip`。自带**智能去重命名**算法，不用担心同名表情包相互覆盖！
- **⚡ 纯粹的 Serverless**：零服务器成本！不需要购买 VPS，不需要装 Node.js，一个 Cloudflare 账号搞定一切前后端逻辑。

------

## 🚀 极速部署指南 (Deployment)

只需要 3 分钟，你就能拥有它！

### 第一步：创建 Worker

1. 登录你的 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 在左侧菜单找到 **Workers & Pages**，点击 `Create Application` -> `Create Worker`。
3. 随便起个炫酷的名字（比如 `bili-extractor`），点击 `Deploy`。
4. 点击 `Edit code`，把本项目中的 `worker.js` 代码 **全选复制粘贴** 进去，保存并部署。

### 第二步：配置环境变量（高能预警 ⚠️）

为了你的接口安全和私密性，**强烈建议**在控制台配置环境变量（不用改代码！）：

进入你刚建好的 Worker 详情页 -> **Settings (设置)** -> **Variables and Secrets (变量和机密)**，添加以下变量：

| **变量名 (Variable Name)** | **示例值 (Value)**   | **作用说明**                                        |
| -------------------------- | -------------------- | --------------------------------------------------- |
| `JWT_SECRET`               | `随便乱敲一长串字符` | **【必填】** 用于加密会话的密钥。越长越复杂越好！   |
| `BASIC_USER`               | `admin`              | **【选填】** 访问页面的账号。留空则所有人均可访问。 |
| `BASIC_PASS`               | `123456`             | **【选填】** 访问页面的密码。必须和上面搭配使用。   |

> *注：修改环境变量后，可能需要重新部署一下 Worker 才能生效哦！*

### 第三步：绑定自定义域名（可选）

嫌 Cloudflare 自带的 `workers.dev` 域名被墙了不好记？

在 Worker 详情页的 **Triggers (触发器)** -> **Custom Domains (自定义域)** 里，绑定一个你在 CF 托管的域名，比如 `bili.yourdomain.com`，瞬间逼格满满！

------

## 🎮 怎么玩？(Usage)

1. 打开 B 站移动端 APP，进入 **我的 -> 个性装扮 -> 搜索你想找的装扮**。
2. 点击右上角的 **分享**，复制链接（建议分享到 QQ 提取出纯净的 URL）。
3. 打开你部署好的工具网页，如果有提示框就输入你设置的账号密码。
4. 把链接往输入框里一扔，点击 **“一键智能解析”**。
5. 欣赏满屏的高清素材，点击 **“打包下载全部”**。泡杯茶，等待 ZIP 文件落入你的硬盘。☕

------

## 🛠️ 技术栈 (Tech Stack)

- **前端**：原生 HTML + CSS Grid + 原生 Fetch API
- **第三方库**：[JSZip](https://stuk.github.io/jszip/) (打包压缩) + [FileSaver.js](https://www.google.com/search?q=https://github.com/eligrey/FileSaver.js) (触发下载)
- **后端**：Cloudflare Workers (V8 引擎) + Web Crypto API (手搓 JWT)

------

## ✨ 一些数字周边链接

我找到了一些还不错的数字周边链接，拿出来分享一下！

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104671&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=weixin

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=103031&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=101221&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=100858&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102605&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=103874&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102546&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=279&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=100858&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102794&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=293&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104783&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104572&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=148&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102546&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=113&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104459&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=105435&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=106098&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102857&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104978&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

------

## ⚠️ 免责声明 (Disclaimer)

1. 本工具仅供个人学习、研究前端跨域及 Cloudflare Workers 技术使用。
2. 解析获取的数字周边版权均属于 **Bilibili 及原作者** 所有。请勿将下载的素材用于任何商业用途或二次倒卖，否则后果自负（律师函警告 ✉️）。
3. 适度下载，频繁的大批量请求可能会导致你的 IP 或账号触发 B 站风控体系。

------

## 🙏 致谢

[哔哩哔哩](https://www.bilibili.com/)

[Cloudflare](https://www.cloudflare.com/)