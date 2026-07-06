# 🎁 B站数字周边提取工具 

> 看到 B 站里炫酷的动态头像、精致的表情包和空间背景，却只能在 APP 里看着流口水？想保存下来当壁纸？
>
> **别慌，这个项目就是为了打破这些枷锁而生的！** 🚀

这是一个 B 站数字周边解析与下载工具，同时提供可直接打开的**本地手动版、本地自动版**，以及带安全代理与自动解析能力的 **Cloudflare Workers 云端版**。不想部署可以直接使用本地 HTML，想要更稳定、私有的体验也可以部署自己的 Worker。

> [!CAUTION]
>
> 本工具仅供个人学习、研究前端跨域及 Cloudflare Workers 技术使用。使用者行为与本作者无关！解析获取的数字周边版权均属于 **Bilibili 及原作者** 所有。请勿将下载的素材用于任何商业用途或二次倒卖，否则后果自负！

> [!TIP]
>
> 如果不想部署，可直接下载[手动版本.html](./本地部署/手动版本.html)或[自动版本.html](./本地部署/自动版本.html)到本地使用：
>
> - **手动版本**：需要在新窗口获取 JSON，并粘贴到“获取数字周边信息”和“获取媒体数据”输入框。步骤稍多，但不依赖公共跨域代理。
> - **自动版本**：粘贴链接后即可一键解析，使用 AllOrigins 公共代理获取数据；公共服务偶尔可能波动，失败时可改用手动版本。
> - **云端版本**：部署 [worker.js](./云端部署/worker.js) 后使用，支持自动解析、安全代理和自动失败后的手动兜底。

## ✨ 核心亮点 

- **🪄 一键智能解析**：只需粘贴 B 站 APP 里的分享链接，自动拉取所有高清卡面、视频素材、动态头像和表情包。
- **🌈 动态镭射预览**：识别镭射款数字周边，根据控制图模拟动态光效，支持鼠标、触摸交互及保存当前画面。
- **⌨️ 快捷单项下载**：鼠标停在图片、视频或镭射卡片上时，按下 `S` 即可单独下载，不必每次都打包全部资源。
- **🧩 多周边与手动兜底**：活动包含多个数字周边时可自行选择；云端自动解析失败后，也能继续通过页面内的手动流程完成提取。
- **🛡️ 防盗链代理**：云端版提供受保护的同源资源代理；当前用于在镭射卡面或控制图直连失败时自动兜底，并限制可代理的目标域名。
- **👮 代理防滥用 (JWT)**：后端根据解析结果生成允许访问的素材域名列表，并签发 JWT (JSON Web Token) 会话 Cookie；没有合法 Token 时无法调用素材代理。
- **🔒 私有化部署 (Basic Auth)**：支持配置全局账号密码，把工具私有化，杜绝野生网友白嫖你的流量。
- **📦 强迫症福音的打包下载**：一键将视频、图片及镭射控制图打包成 `.zip`，自带**智能去重命名**算法，不用担心同名素材相互覆盖！
- **⚡ 纯粹的 Serverless**：不需要购买或维护 VPS，可直接运行在 Cloudflare Workers 的免费额度内（具体配额以 Cloudflare 官方规则为准）。

------

## 🚀 极速部署指南

只需要 3 分钟，你就能拥有它！

### 第一步：创建 Worker

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Workers & Pages**。
2. 点击 **Create application**，按控制台提示创建一个 Worker（可以从 Hello World 或任意基础模板开始），例如命名为 `bili-extractor`。
3. 完成首次部署后进入该 Worker，点击 **Edit code**。
4. 将本项目中的 [云端部署/worker.js](./云端部署/worker.js) **全选复制粘贴**到编辑器中，然后保存并部署。

### 第二步：配置环境变量

为了接口安全和私密性，**强烈建议**在控制台配置以下变量（不用改代码）。这些内容包含密钥或密码，请选择 **Secret** 类型，不要保存成可见的纯文本变量：

进入 Worker 详情页 → **Settings** → **Variables and Secrets** → **Add**：

| **变量名**   | **类型** | **示例值**         | **作用说明** |
| ------------ | -------- | ------------------ | ------------ |
| `JWT_SECRET` | Secret   | 一段足够长的随机值 | **强烈建议配置**。用于签发代理访问令牌；代码内默认值仅用于避免首次运行报错，不适合公开部署。 |
| `BASIC_USER` | Secret   | `admin`            | **选填**。访问网页的账号；必须与 `BASIC_PASS` 同时配置。 |
| `BASIC_PASS` | Secret   | 一段高强度密码     | **选填**。访问网页的密码；必须与 `BASIC_USER` 同时配置。 |

> 修改变量后请点击 **Deploy** 使其生效。公开部署时请务必替换默认 `JWT_SECRET`，也不要直接使用表格中的示例密码。

### 第三步：绑定自定义域名（可选）

如果 Cloudflare 自带的 `workers.dev` 域名在你的网络环境中访问不稳定，或者你想使用更容易记住的地址：

在 Worker 详情页进入 **Settings → Domains & Routes → Add → Custom Domain**，绑定一个由 Cloudflare 管理的域名，例如 `bili.yourdomain.com`。

------

## 🎮 怎么玩？

1. 打开 B 站移动端 APP，进入 **我的 → 个性装扮 → 搜索你想找的装扮**。
2. 点击右上角的 **分享**并复制内容。本地版本建议使用其中的 URL；云端版本也支持形如 `2026DLCSHARE$...` 的完整分享文本。
3. 打开你部署好的工具网页，如果有提示框就输入你设置的账号密码。
4. 把链接往输入框里一扔，点击 **“一键智能解析”**。
5. 如果检测到多个数字周边，选择你想提取的一个；若自动解析失败，按照页面出现的手动步骤继续即可。
6. 欣赏满屏的高清素材：点击 **“打包下载全部”**生成 ZIP，或者将鼠标停在某个素材上按 `S` 单独下载。☕

### 动态镭射说明

- 当数字周边包含镭射控制图时，页面会自动显示实验性的动态镭射预览。
- 在卡面上移动鼠标或手指可以改变光效方向；移动端还可点击“开启晃动”并授权方向传感器，通过倾斜手机控制光效，再次点击可重新校准。
- 打包下载时，原始卡面与镭射控制图都会保留，控制图位于 ZIP 内的 `镭射效果控制图` 文件夹。
- **镭射预览仅供参考，模拟效果可能与 B 站 APP 中的实际效果存在差异。**

------

## 🛠️ 技术栈

- **前端**：原生 HTML + CSS Grid + 原生 Fetch API
- **第三方库**：[JSZip](https://stuk.github.io/jszip/)（打包压缩）+ [FileSaver.js](https://github.com/eligrey/FileSaver.js)（触发下载）
- **后端**：Cloudflare Workers (V8 引擎) + Web Crypto API (手搓 JWT)

------

## ✨ 一些数字周边链接 

我找到了一些还不错的数字周边链接，拿出来分享一下！

<details>
<summary>展开查看示例链接</summary>

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104671&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=weixin

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=103031&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=101221&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=100858&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102605&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=103874&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102546&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=279&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102794&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=293&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104783&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104572&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=148&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=113&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104459&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=105435&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=106098&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=102857&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

https://www.bilibili.com/h5/mall/digital-card/home?-Abrowser=live&act_id=104978&f_source=plat&from=share&hybrid_set_header=2&page_type=0&share_medium=android&share_source=qq

</details>

------

## ⚠️ 免责声明 

1. 本工具仅供个人学习、研究前端跨域及 Cloudflare Workers 技术使用。
2. 解析获取的数字周边版权均属于 **Bilibili 及原作者** 所有。请勿将下载的素材用于任何商业用途或二次倒卖，否则后果自负（律师函警告 ✉️）。
3. 适度下载，频繁的大批量请求可能会导致你的 IP 或账号触发 B 站风控体系。

------

## 🙏 致谢

[哔哩哔哩](https://www.bilibili.com/)

[Cloudflare](https://www.cloudflare.com/)
