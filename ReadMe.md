# 实时竞拍大师用户端 H5

移动端 H5 用户端，面向直播间观众和竞拍者。当前主入口是直播推荐流，用户从直播预览进入直播间，在直播间内查看竞拍清单、拍品详情、评论互动、报名、快速出价和模拟支付。

## 项目定位

- 用户端以移动端触控交互为核心，兼容必要的 PC 开发验收操作。
- 当前默认使用本地 Demo 数据，可独立演示完整竞拍链路。
- 项目处于开发阶段。接口或功能变更时不保留旧字段、旧接口或旧行为兼容层，优先保持实现简洁。
- UI 文案必须集中维护在 `src/i18n/messages.ts`，默认简体中文，同时维护 English。

## 技术栈

- React 18 + TypeScript + Vite
- Ant Design Mobile
- Zustand
- TanStack Query
- React Router
- lucide-react
- 原生 WebSocket 抽象
- Vitest + Testing Library + Playwright

## 路由与代码结构

- `src/App.tsx` 只负责挂载 `BrowserRouter` 和应用路由入口。
- `src/router/AppRouter.tsx` 负责 React Router 路由表、登录守卫、URL 参数读取和页面级导航编排。
- `src/layout/MainTabShell.tsx` 负责 `首页 / 发现 / 我的` 主标签页和底部导航复用。
- 未登录访问业务深链时会跳转 `/login`，登录后回到原始目标路径；已登录访问 `/login` 会跳回目标页或默认首页。
- 直播间进入来源通过 React Router location state 和 `from / focusRoomId` 查询参数共同承载，刷新后仍能回到稳定兜底页面。

## 运行指南

先安装依赖：

```bash
npm install
```

常用脚本：

```bash
npm run dev
npm run build
npm run test
npm run test:run
npm run lint
```

### 方式一：前端 Demo 独立运行

适用于 UI 开发、功能演示和不依赖后端的回归验证。该模式使用本地 Demo REST 数据与前端内置 Mock WebSocket，不需要启动后端服务，也不需要配置环境变量。

```bash
npm run dev
```

访问 Vite 输出的本地地址，例如 `http://127.0.0.1:5173/`。登录页发布版不会预填测试账号；开发演示时可手动输入 `buyer001 / Passw0rd!`。

前端 Demo 模式的默认行为：

- `VITE_API_MODE` 未设置时使用本地 Demo API。
- `VITE_REALTIME_MODE` 未设置时使用前端 Mock realtime client。
- 关注、直播间/拍品足迹、评论草稿和本地点赞保存在浏览器本地存储中。
- 支付、确认收货、出价、排行榜和竞拍状态均可在前端 Demo 数据中闭环演示。
- Mock realtime client 会在当前用户首次出价领先后，自动模拟一次其他买家加价，并按现有 `bid.accepted -> ranking.updated` 事件顺序推送，用于验证实时排行榜位次变更动画；该行为不新增或修改正式 WebSocket 协议。

### 方式二：连接真实后端联调

适用于对接真实 REST 与 WebSocket。开发期推荐使用 Vite dev server 同源反代：浏览器只访问前端同源的 `/api` 与 `/ws`，由 Vite 转发到真实后端，避免 CORS 预检和 WebSocket 跨域问题。

PowerShell：

```powershell
$env:VITE_API_MODE='remote'
$env:VITE_API_BASE_URL=''
$env:VITE_REALTIME_MODE='websocket'
$env:VITE_WS_URL=''
$env:VITE_DEV_PROXY_TARGET='http://47.97.82.143:8888'
npm run dev -- --host 127.0.0.1 --port 5176
```

Bash / Linux：

```bash
VITE_API_MODE=remote \
VITE_API_BASE_URL= \
VITE_REALTIME_MODE=websocket \
VITE_WS_URL= \
VITE_DEV_PROXY_TARGET=http://47.97.82.143:8888 \
npm run dev -- --host 127.0.0.1 --port 5176
```

配置含义：

- `VITE_API_MODE=remote`：REST 请求使用远程 API 客户端。
- `VITE_API_BASE_URL=`：留空表示 REST 走当前站点同源 `/api`。
- `VITE_REALTIME_MODE=websocket`：实时通信使用真实 WebSocket 客户端。
- `VITE_WS_URL=`：留空表示 WebSocket 走当前站点同源 `/ws`。
- `VITE_DEV_PROXY_TARGET=http://47.97.82.143:8888`：Vite 将 `/api` 与 `/ws` 转发到该后端。

不推荐在开发期直接把 `VITE_API_BASE_URL` 指向 `http://47.97.82.143:8888`，除非后端已经正确允许当前前端域名的 CORS 预检、正式请求和 WebSocket 升级。

### 方式三：正式部署

正式部署推荐保持前端同源访问后端能力：前端构建产物由站点服务器托管，站点网关或 Nginx 将 `/api` 与 `/ws` 反代到真实后端。这样前端构建时不需要固化公网后端地址，浏览器也不会遇到跨域问题。

PowerShell 构建：

```powershell
$env:VITE_API_MODE='remote'
$env:VITE_API_BASE_URL=''
$env:VITE_REALTIME_MODE='websocket'
$env:VITE_WS_URL=''
npm run build
```

Bash / Linux 构建：

```bash
VITE_API_MODE=remote \
VITE_API_BASE_URL= \
VITE_REALTIME_MODE=websocket \
VITE_WS_URL= \
npm run build
```

构建完成后，将 `dist/` 目录部署到静态站点根目录。Nginx 示例：

```nginx
server {
  listen 80;
  server_name your-domain.example;

  root /var/www/aieas-user-web/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://47.97.82.143:8888/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws/ {
    proxy_pass http://47.97.82.143:8888/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
  }
}
```

正式部署检查点：

- `dist/index.html` 必须由 SPA fallback 处理，刷新 `/login`、`/live/:roomId`、`/orders?tab=...` 等深链时应返回前端入口。
- `/api/` 反代到后端 REST 的 `/api/`。
- `/ws/` 必须开启 `Upgrade` 与 `Connection: upgrade`，用于直播间 WebSocket。
- 构建时 `VITE_API_BASE_URL` 与 `VITE_WS_URL` 保持为空，表示运行时使用当前站点同源地址。
- 如需前端直连后端而不使用反代，后端必须允许正式前端域名的 CORS 预检、正式请求和 WebSocket 连接。

## 环境变量速查

| 变量 | Demo 独立运行 | 真实后端联调/正式部署 |
| --- | --- | --- |
| `VITE_API_MODE` | 留空或不设置 | `remote` |
| `VITE_API_BASE_URL` | 留空或不设置 | 推荐留空，走同源 `/api` |
| `VITE_REALTIME_MODE` | 留空或不设置 | `websocket` |
| `VITE_WS_URL` | 留空或不设置 | 推荐留空，走同源 `/ws` |
| `VITE_DEV_PROXY_TARGET` | 不设置 | 仅开发期设置，例如 `http://47.97.82.143:8888` |
| `VITE_TTS_WS_URL` | 可选 | 可选，数字人 TTS 音频流地址 |

真实 WebSocket 连接地址：

```text
{VITE_WS_URL}/ws/live-rooms/{roomId}?lastSeq={lastSeq}
```

当 `VITE_WS_URL` 留空时，前端会自动使用当前页面同源的 `ws://{host}` 或 `wss://{host}`。

真实 WebSocket 客户端会按 `live-room:{roomId}:lastSeq` 将最新 `seq` 写入 `localStorage`。断线后使用 500ms 起步、最大 10s 的指数退避加 jitter 自动重连，重连时继续携带 `lastSeq`；重复或乱序的 `seq <= lastSeq` 消息会在客户端丢弃。收到 `gateway.draining` 时，客户端会按 `payload.retryAfterMs` 作为最小等待时间主动关闭并重连；收到 `room.snapshot_required` 时，页面通过 REST 状态接口兜底刷新。

数字人 TTS 音频流可通过直播间返回的 `digitalHuman.ttsWsUrl` 配置；若接口未返回，可在前端环境中配置：

```env
VITE_TTS_WS_URL=ws://127.0.0.1:8876/tts
```

直播间视频源由 `LiveRoom.videoSource` 决定。`recorded` 使用 `videoUrl`，`digitalHuman` 使用 `digitalHuman.idleVideoUrl` 与 `digitalHuman.speakingVideoUrl`。用户端不提供手动切换实景/数字人视频源的入口。首页直播预览、直播间实景视频和数字人双视频层都按移动端页面内播放处理，统一设置 `playsinline`、`webkit-playsinline`、`x5-playsinline`、`x5-video-player-type="h5"`、禁用画中画和远程播放，避免手机浏览器把 mp4 识别为独立播放器窗口而遮挡直播间 UI。首页直播预览和正式直播间按 `roomId + sourceUrl` 在会话内持续记录视频播放进度；从首页直播预览进入正式直播间、或从正式直播间返回首页预览时，若直播间与视频源一致，目标视频会承接当前播放进度并继续播放。同一进度快照只会应用一次，后续 `loadedmetadata` / `canplay` 事件只负责继续播放，避免反复 seek 导致画面看似暂停。直播间顶部提供统一声音开关，开关状态以 `aieas-user-live-sound-enabled` 暂存在浏览器本地，所有直播间共用同一个声音偏好：实景视频开启后解除静音并恢复音量；首页 recorded 直播预览也读取同一偏好，声音开启时当前可见预览会尝试有声播放；数字人视频层仍保持静音，开启声音时通过 `digitalHuman.ttsWsUrl` 或 `VITE_TTS_WS_URL` 连接 TTS WebSocket 音频流。

## 功能范围

- `/login`：短视频 App 风格移动端买家登录页，发布版界面默认不展示测试账号或解释性文案；登录成功后持久化用户会话并回到原目标页面，注册和忘记密码仅作为预留入口展示暂未开放提示。
- `/`：首页直播推荐流，支持触屏上下滑、首尾循环、PC 鼠标拖拽和滚轮切换。
- `/discover`：拍品列表，支持排序、状态和类别筛选，筛选条件同步到 URL 查询参数；拍品列表自带方向感知置顶工具栏，向列表深处浏览时可收起标题和筛选区，向下滑动/下拉列表时可在当前位置呼出；拍品卡片使用固定高度，左侧拍品缩略图为 1:1 正方形并以居中 `cover` 裁剪展示，拍品状态以黑色半透明徽标嵌入缩略图中下部；列表不展示开拍时间和右侧动作按钮，点击卡片主体进入商品详情，蓝色 `商家>` 是唯一独立入口。
- `/product/:lotId`：商品详情承接页。发现、搜索、分类、商家、订单等列表点击拍品均先进入该页；竞拍中拍品可由详情页进入直播间并自动打开对应拍品详情弹层。
- `/live/:roomId`：全屏直播间，包含视频画面、统一声音开关、评论、前端演示点赞、关注、观众数、竞拍清单、当前竞拍拍品小窗、拍品详情、报名、快速出价和竞价氛围弹窗提醒；直播间根容器优先使用 `100dvh` 跟随移动端动态视口高度，短屏/窄屏下会自动压缩右侧排行榜、当前竞拍拍品小窗和评论区宽度，避免主流移动设备分辨率下发生元素互相遮挡；最后 30 秒启用两侧倒计时光带，最后 10 秒倒计时复用全局提醒层低优先级展示。
- `/me`：个人中心，包含头像、昵称、关注、足迹、我的订单入口和设置入口；设置入口固定在用户名卡片右上角。
- `/settings`：个人设置，支持昵称、语言设置和退出登录；退出时可选择保留或清除本机浏览数据。
- `/orders?tab=...`：竞拍/订单记录，支持 `all / pendingBid / pendingPay / pendingShipment / pendingReceipt / completed`；页面在页签下方直接展示记录列表，不再额外显示二级 compact heading，页签固定显示，仅下方记录列表响应纵向滑动；订单列表按内容高度排列，少量记录时卡片不会被拉伸填满剩余屏幕；待支付记录进入支付页时会携带订单页返回路径，支付成功后根据返回的订单状态回到对应页签并高亮该订单；待收货记录可在确认弹层中完成 `确认收货`，成功后进入 `已完成`。
- `/following`：已关注直播间列表，纯前端本地持久化。
- `/footprints`：浏览足迹，纯前端本地持久化，分为 `直播间 / 拍品` 两个独立页签；两类足迹各自最多保留 100 条，按 10 条渐进加载。
- `/result/:auctionId`：成交结果。
- `/pay/:orderId`：模拟支付，包含待支付、支付中、支付成功、支付失败四种内联 SVG 动画状态；当 URL 携带 `returnTo=/orders?...` 时，支付成功后会按 `Order.fulfillmentStatus` 派生目标订单页签。
- `/history`：历史订单和最近直播间。

直播间内当前支持：

- REST 配置的实景模拟视频或数字人视频源。
- 评论展示、长文本自动换行、底部输入态、发送、隐藏、草稿暂存和系统消息。
- 关注/已关注切换。
- 顶部栏使用左侧返回按钮、压缩商家关注胶囊和房间观众数；最右侧不提供设置入口。房间观众数保留观众图标，但不显示额外头像堆叠。
- 直播间根容器按 `100vh + 100dvh` 双写动态视口高度布局；评论列表会给右侧当前竞拍拍品小窗预留宽度。`max-height: 720px` 或 `max-width: 360px` 的短屏/窄屏下，排行榜切换为更紧凑的尺寸并允许内部滚动，当前竞拍拍品小窗同步缩小，避免排行榜、小窗和底部评论区互相遮挡。
- 竞拍清单底部抽屉：高度为屏幕高度 70%，内部可滚动；本地 Demo 直播间默认提供 10 件拍品，当前竞拍中的拍品自动置顶并保留原始序号。每个商品卡片固定等高，左侧拍品缩略图为 1:1 正方形，边长与卡片高度一致，图片只做等比缩放和居中最大化裁剪，保留圆角但不叠加渐变遮罩；序号以 0.5 alpha 深色角标显示在缩略图左上角。拍品状态与开拍时间位于同一行，开拍时间显示在状态右侧且仅保留时间值；时间文本使用等宽数字保持固定视觉长度，外层边框按文本内容收缩贴合。拍品名称下方仅展示可选商品简介（`LiveRoomLot.subtitle`），不使用详情文本。列表右侧按钮按状态派生：未成交或非本人已成交显示禁用 `已结束`，截拍中显示禁用 `截拍中`，竞拍中且已缴保证金显示红色 `去出价`，本人已成交且未支付显示红色 `去支付`，本人已成交且已支付显示白底 `查看订单`，其余显示白底 `去看看`。
- 拍品详情底部弹层：高度为屏幕高度 75%，顶部栏和底部动作栏固定，正文独立滚动；顶部标题右侧显示当前拍品状态。详情图片区支持 1-5 张拍品大图左右循环切换，图集预览区使用图片宽度优先对齐展示区宽度、图片自身纵向中心对齐展示区中心并裁剪上下溢出的展示策略；支持移动端触屏和 PC 鼠标左右跟手拖动，释放时超过展示区宽度 50% 完成切换，否则回弹；首尾使用克隆项保证第 5 张到第 1 张、第 1 张到最后一张都按滑动方向无缝连续，克隆页归位后延迟两帧恢复 transition，避免出现第二段跳回动画。点击图片进入覆盖整个视口的全屏看图模式后仍可循环切换，并支持移动端两指缩放、拖拽移动、PC 滚轮缩放和更小、更透明的“还原”按钮。本地 Demo 中部分拍品提供 5 张本地图集大图，用于验证多图轮播和全屏看图。详情页排行榜与直播间实时排行榜使用同一份实时数据，收起显示前三名，展开最多显示前 8 名，展开和收起均使用高度过渡。
- 报名并冻结保证金。
- 当前竞拍拍品小窗：未缴保证金显示 `去看看`，已缴保证金显示 `快速出价`；顶部缩略图宽度与小窗等宽，使用沉浸式裁剪、圆角和顶部黑色渐隐遮罩，关闭按钮以白色图标贴近右上角并保持在遮罩范围内。
- 快速出价弹层：支持最多三档加价、封顶价限制、最小出价间隔、后端成功/失败反馈、竞拍结束 5 秒派生倒计时和关闭动画。
- 全局竞拍氛围提醒层：基于现有实时事件派生 `领先 / 被超越 / 竞拍延时 / 竞拍结束 / 竞拍成功` 弹窗动画，并承载最后 10 秒倒计时提醒。提醒动画同一时间只显示一个，新的竞拍提醒会立即中断并替换正在播放的提醒；倒计时提醒优先级低于其他竞拍提醒，当其他竞拍提醒正在显示时不会同时出现。当前拍品处于 `RUNNING / EXTENDED` 且剩余时间进入 30 秒时，页面额外渲染不接收触控的两侧倒计时光带：常态使用边缘粒子 + 光带，宽度为上一版常态的 150%，每侧持续生成 18 颗自下而上的细粒子；光带从屏幕底部按剩余时间匀速向上覆盖，归零时覆盖两侧，未出价为白色、他人领先为红色、当前用户领先为金色；收到 `bid.accepted` 时播放一次宽度为常态 2 倍的更亮脉冲，并在左右两侧脉冲光带范围内各生成 18 颗从内层向外层散射的粒子，`endTsMs` 变化时进度实时重算；倒计时归零时光带再次脉冲，停留 1 秒后向两侧淡出。全局提醒层固定覆盖在直播间 UI 上方；倒计时光带位于评论、竞拍入口和各类直播间弹层下方，不影响出价、关闭弹层或评论操作；系统评论和快速出价反馈仍保留，弹窗仅承担即时氛围反馈。
- 右侧实时排行榜：固定前 8 名槽位、底部当前用户行、排名变动动画、当前价、倒计时、观众数、延时和成交事件更新。
- 竞拍清单和拍品详情弹层打开使用 0.25s 匀速从屏幕底部外侧上滑，关闭使用 0.15s 匀速下滑回屏幕底部外侧；直播间内弹层层级统一高于实时排行榜。从竞拍清单点击行主体进入拍品详情时，详情弹层叠加在清单上方，关闭详情后清单保持显示；已缴保证金的竞拍中拍品点击清单右侧 `去出价` 时，竞拍清单以 0.15s 退出，快速出价弹层以 0.15s 在上层同步弹出。快速出价使用无遮罩 sheet layer，不渲染 `.sheet-backdrop`，让弹窗和实时排行榜可同时保留在直播画面中。
- 拍品详情底部动作按状态派生：竞拍中未缴保证金显示 `报名并支付保证金`，已缴保证金显示 `去出价`；待开拍显示禁用 `等待开拍`；已成交且当前用户中标时根据订单支付状态显示 `去支付` 或 `查看订单`；未成交和截拍中不显示底部动作。详情页排行榜的第一名出价金额使用红色强调，展开/收起按钮位于排行榜下方。

## 数据与接口

REST 响应统一按以下 envelope 处理：

```ts
{
  code: number
  message: string
  data: unknown
  trace_id: string
}
```

当前用户端 REST 依赖：

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/live-rooms`
- `GET /api/v1/live-rooms/{id}`
- `GET /api/v1/live-rooms/{id}/lots`
- `GET /api/v1/live-rooms/{id}/stats`
- `GET /api/v1/auctions/{id}/state`
- `POST /api/v1/auctions/{id}/enroll`
- `GET /api/v1/orders/mine`
- `GET /api/v1/orders/{id}`
- `POST /api/v1/orders/{id}/pay`
- `POST /api/v1/orders/{id}/receive`（建议后端补齐；本地 Demo 已支持）

关注、足迹、演示点赞和评论草稿不在后端 REST 依赖中定义。当前 `/following`、`/footprints`、直播间关注按钮、完整直播间足迹记录、拍品详情浏览足迹、按房间本地点赞数和未发送评论草稿均由前端 `aieas-user-live-activity` 本地持久化实现，不调用 REST 或 WebSocket；后续若需要跨设备同步，应重新设计接口，不沿用旧草案路径。设置页退出登录时始终清除当前会话；若选择清除浏览数据，会同步清空上述 `aieas-user-live-activity` 数据。语言偏好和昵称/头像本地资料不属于浏览数据清理范围。

`LiveRoom.likeCount?` 用于直播间顶部商家胶囊的基础点赞展示。所有本地 Demo 直播间默认点赞数为 0；远程接口未返回 `likeCount` 时也按 0 处理。用户点击直播间底部点赞按钮时，前端按 `roomId` 本地累加演示点赞数，并与基础点赞数相加显示；按钮首次点击后进入红色“已点赞”状态，每次点击都会播放一圈中等尺寸的红、黄、蓝三色发散粒子反馈，粒子运动速度先快后慢。该演示点赞不调用 REST 或 WebSocket。

实时消息遵循原生 WebSocket envelope：

```ts
{
  type: string
  requestId?: string
  seq?: number
  ack?: boolean
  liveSessionId?: number
  payload: Record<string, unknown>
}
```

客户端维护 `lastSeq`，重复或乱序消息不应用。真实 WS 模式下 `NativeWebSocketClient` 同时负责本地持久化游标、断线重连、`gateway.draining` 迁移重连和 `room.snapshot_required` 兜底触发。出价统一发送 `bid.place`，评论统一使用 `chat.*` 消息。

直播间视觉氛围提醒不新增协议字段：`bid.accepted` 用于派生当前用户 `领先` 或 `被超越`，并驱动最后 30 秒两侧倒计时光带的出价脉冲；`timer.extended` 派生 `竞拍延时` 并修正光带进度；`auction.closed` 派生 `竞拍结束` 或当前用户中标时的 `竞拍成功`，同时结束光带。当前用户中标时，新的全局提醒会替代旧的独立中标庆祝，避免重复播放动画。最后 10 秒倒计时同样只基于现有 `endTsMs`、`timer.extended` 和 `auction.closed` 派生，并作为全局提醒层的低优先级提醒展示，不新增 WebSocket 字段。

## 本地化

- 默认语言：`zh-CN`。
- 当前支持：`zh-CN`、`en-US`。
- 用户语言偏好本地持久化在 `aieas-user-preferences`。
- 新增展示文案必须同步补充两套语言资源。
- 数字、日期等显示格式应跟随当前 locale。

## 文档索引

权威或维护中文档：

- `doc/API.md`
- `doc/openapi/rest-api.openapi.json`
- `doc/openapi/default.openapi.json`
- `doc/openapi/live-room-websocket.openapi.json`
- `doc/接口对齐文档.md`
- `doc/拍卖客户端实时交互方案.md`
- `doc/用户端实现说明.md`
- `doc/Mock控制桥使用说明.md`
- `doc/文档索引.md`

历史参考文档：

- `doc/课题介绍.docx`
- `doc/系统整体设计方案.docx`
- `doc/需求文档-用户端.docx`
- `doc/需求文档-后端.docx`

历史参考文档若与当前实现或权威文档冲突，以当前实现、OpenAPI、接口对齐文档和实时交互方案为准。

## 更新记录

仅保留最近三次重要变更：

### 2026-06-10 “我的”页设置入口与直播间短屏适配

- “我的”页设置入口从页面头部独立按钮移入用户名卡片右上角，点击路径保持不变，避免个人中心首屏出现悬浮在卡片外的操作入口。
- 直播间根容器补齐 `100vh / 100dvh` 双写动态视口高度；评论列表改为给右侧当前竞拍拍品小窗预留固定宽度。对 `320x568`、`360x640`、`375x667` 等短屏/窄屏场景，实时排行榜自动压缩尺寸并启用内部滚动，当前竞拍拍品小窗同步缩小，避免排行榜、小窗和底部评论区互相遮挡。

### 2026-06-09 拍品缩略图、竞拍清单与倒计时氛围

- 直播间竞拍清单中，开拍时间移到拍品状态右侧且仅显示时间值，时间 badge 使用等宽数字并按文本内容收缩边框；拍品标题下方只展示 `subtitle` 商品简介，详情文本继续留在拍品详情页，状态、时间、标题、简介和价格形成更紧凑的纵向信息层级。
- 系统内拍品缩略图统一为 1:1 正方形容器，真实图片仅使用等比缩放和居中 `cover` 裁剪，不做拉伸；覆盖发现页拍品卡、直播间竞拍清单、订单记录和出价摘要等拍品媒体入口。
- 本地 Demo 中正在竞拍的直播间拍品初始剩余倒计时统一改为 1 分钟；发现页拍品列表的标题和筛选区改为可收起的置顶工具栏，向下滑动/下拉列表时可重新呼出。
- 当前竞拍拍品进入最后 30 秒时，直播间两侧显示随剩余时间上升的边缘粒子 + 光带；常态宽度为上一版 150%，每侧 18 颗粒子持续向上运动，收到出价事件时播放常态 2 倍宽度的脉冲，粒子从光带内层向脉冲外层散射且不超出脉冲范围；倒计时归零时再次脉冲，停留 1 秒后向两侧淡出，常态层级低于评论、竞拍入口和直播间弹层。

### 2026-06-08 返回键与浏览足迹拆分

- 各页面左上角返回按钮统一只显示左箭头，保留 `aria-label` 作为无障碍名称，不再显示额外 `返回` 文本。
- `/footprints` 改为 `直播间 / 拍品` 两个隔离页签。直播间足迹入口按钮右侧对齐并使用白底红字；拍品详情页浏览会记录拍品足迹，两类足迹均由前端 `aieas-user-live-activity` 本地持久化、各自最多 100 条并按 10 条渐进加载。
- “我的”页足迹统计展示直播间足迹与拍品足迹总数；从拍品足迹进入商品详情页时会把当前页签、已加载条数和滚动位置写入返回路径，返回后继续停留在 `拍品` 页签原浏览位置。
