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

## 快速启动

```bash
npm install
npm run dev
```

常用脚本：

```bash
npm run dev
npm run build
npm run test
npm run test:run
npm run lint
```

## 环境配置

默认 API 模式使用本地 Demo 数据。联调真实 REST 服务时配置 `remote`；`VITE_API_BASE_URL` 留空表示走当前站点同源 `/api` 反代：

```env
VITE_API_MODE=remote
VITE_API_BASE_URL=
```

实时通信默认使用前端内置 mock client。接入真实 WebSocket 时配置 `websocket`；`VITE_WS_URL` 留空表示走当前站点同源 `/ws` 反代：

```env
VITE_REALTIME_MODE=websocket
VITE_WS_URL=
```

连接当前真实后端 `127.0.0.1:8888` 时，开发期推荐使用 Vite 反代，浏览器只访问前端同源的 `/api` 与 `/ws`，由 dev server 转发到后端，避免触发跨域预检问题。

PowerShell 本地反代联调：

```powershell
$env:VITE_API_MODE='remote'
$env:VITE_API_BASE_URL=''
$env:VITE_REALTIME_MODE='websocket'
$env:VITE_WS_URL=''
$env:VITE_DEV_PROXY_TARGET='http://127.0.0.1:8888'
npm run dev -- --host 127.0.0.1 --port 5176
```

生产部署也应通过站点网关或 Nginx 将 `/api` 与 `/ws` 反代到真实后端。前端构建时保持同源路径：

```powershell
$env:VITE_API_MODE='remote'
$env:VITE_API_BASE_URL=''
$env:VITE_REALTIME_MODE='websocket'
$env:VITE_WS_URL=''
npm run build
```

Bash / Linux 部署构建：

```bash
VITE_API_MODE=remote \
VITE_API_BASE_URL= \
VITE_REALTIME_MODE=websocket \
VITE_WS_URL= \
npm run build
```

Nginx 反代示例：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8888/api/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /ws/ {
  proxy_pass http://127.0.0.1:8888/ws/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 3600s;
}
```

注意：Vite 会在构建时固化 `VITE_*` 环境变量。若选择前端直连后端而不使用反代，后端仍需要允许前端域名的 CORS 预检与正式请求。

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

直播间视频源由 `LiveRoom.videoSource` 决定。`recorded` 使用 `videoUrl`，`digitalHuman` 使用 `digitalHuman.idleVideoUrl` 与 `digitalHuman.speakingVideoUrl`。用户端不提供手动切换实景/数字人视频源的入口。从首页直播预览进入正式直播间时，若直播间与视频源一致，正式直播间会承接预览视频的当前播放进度；同一预览快照只会应用一次，后续 `loadedmetadata` / `canplay` 事件只负责继续播放，避免反复 seek 导致画面看似暂停。直播间顶部提供统一声音开关：实景视频开启后解除静音并恢复音量；数字人视频层仍保持静音，开启声音时通过 `digitalHuman.ttsWsUrl` 或 `VITE_TTS_WS_URL` 连接 TTS WebSocket 音频流。

## 功能范围

- `/login`：短视频 App 风格移动端买家登录页，发布版界面默认不展示测试账号或解释性文案；登录成功后持久化用户会话并回到原目标页面，注册和忘记密码仅作为预留入口展示暂未开放提示。
- `/`：首页直播推荐流，支持触屏上下滑、首尾循环、PC 鼠标拖拽和滚轮切换。
- `/discover`：拍品列表，支持排序、状态和类别筛选，筛选条件同步到 URL 查询参数；列表右侧按钮复用竞拍清单的状态派生规则展示 `已结束 / 截拍中 / 去出价 / 去支付 / 查看订单 / 去看看`。
- `/product/:lotId`：商品详情承接页。发现、搜索、分类、商家、订单等列表点击拍品均先进入该页；竞拍中拍品可由详情页进入直播间并自动打开对应拍品详情弹层。
- `/live/:roomId`：全屏直播间，包含视频画面、统一声音开关、评论、前端演示点赞、关注、观众数、竞拍清单、当前竞拍拍品小窗、拍品详情、报名、快速出价和竞价氛围弹窗提醒；最后 10 秒倒计时复用该提醒层低优先级展示。
- `/me`：个人中心，包含头像、昵称、关注、足迹、我的订单入口和设置入口。
- `/settings`：个人设置，支持昵称、语言设置和退出登录；退出时可选择保留或清除本机浏览数据。
- `/orders?tab=...`：竞拍/订单记录，支持 `all / pendingBid / pendingPay / pendingShipment / pendingReceipt / completed`；待支付记录进入支付页时会携带订单页返回路径，支付成功后根据返回的订单状态回到对应页签并高亮该订单；待收货记录可在确认弹层中完成 `确认收货`，成功后进入 `已完成`。
- `/following`：已关注直播间列表，纯前端本地持久化。
- `/footprints`：直播间浏览足迹，纯前端本地持久化，最多保留 100 条，按 10 条渐进加载。
- `/result/:auctionId`：成交结果。
- `/pay/:orderId`：模拟支付，包含待支付、支付中、支付成功、支付失败四种内联 SVG 动画状态；当 URL 携带 `returnTo=/orders?...` 时，支付成功后会按 `Order.fulfillmentStatus` 派生目标订单页签。
- `/history`：历史订单和最近直播间。

直播间内当前支持：

- REST 配置的实景模拟视频或数字人视频源。
- 评论展示、长文本自动换行、底部输入态、发送、隐藏、草稿暂存和系统消息。
- 关注/已关注切换。
- 顶部栏使用左侧返回按钮、压缩商家关注胶囊和房间观众数；最右侧不提供设置入口。房间观众数保留观众图标，但不显示额外头像堆叠。
- 竞拍清单底部抽屉：高度为屏幕高度 70%，内部可滚动；本地 Demo 直播间默认提供 10 件拍品，当前竞拍中的拍品自动置顶并保留原始序号，序号以 0.5 alpha 深色角标显示在更大的拍品缩略图左上角，拍品名称下方仅展示可选商品简介。列表右侧按钮按状态派生：未成交或非本人已成交显示禁用 `已结束`，截拍中显示禁用 `截拍中`，竞拍中且已缴保证金显示红色 `去出价`，本人已成交且未支付显示红色 `去支付`，本人已成交且已支付显示白底 `查看订单`，其余显示白底 `去看看`。
- 拍品详情底部弹层：高度为屏幕高度 75%，顶部栏和底部动作栏固定，正文独立滚动；顶部标题右侧显示当前拍品状态。详情图片区支持 1-5 张拍品大图左右循环切换，图集预览区使用图片宽度优先对齐展示区宽度、图片自身纵向中心对齐展示区中心并裁剪上下溢出的展示策略；支持移动端触屏和 PC 鼠标左右跟手拖动，释放时超过展示区宽度 50% 完成切换，否则回弹；首尾使用克隆项保证第 5 张到第 1 张、第 1 张到最后一张都按滑动方向无缝连续，克隆页归位后延迟两帧恢复 transition，避免出现第二段跳回动画。点击图片进入覆盖整个视口的全屏看图模式后仍可循环切换，并支持移动端两指缩放、拖拽移动、PC 滚轮缩放和更小、更透明的“还原”按钮。本地 Demo 中部分拍品提供 5 张本地图集大图，用于验证多图轮播和全屏看图。详情页排行榜与直播间实时排行榜使用同一份实时数据，收起显示前三名，展开最多显示前 8 名，展开和收起均使用高度过渡。
- 报名并冻结保证金。
- 当前竞拍拍品小窗：未缴保证金显示 `去看看`，已缴保证金显示 `快速出价`。
- 快速出价弹层：支持最多三档加价、封顶价限制、最小出价间隔、后端成功/失败反馈、竞拍结束 5 秒派生倒计时和关闭动画。
- 全局竞拍氛围提醒层：基于现有实时事件派生 `领先 / 被超越 / 竞拍延时 / 竞拍结束 / 竞拍成功` 弹窗动画，并承载最后 10 秒倒计时提醒。倒计时提醒优先级低于其他竞拍提醒；当其他竞拍提醒正在显示时，倒计时不会同时出现。提醒层固定覆盖在直播间所有 UI 上方，包含快速出价、拍品详情和竞拍清单，但设置为不接收触控事件，不影响出价、关闭弹层或评论操作；系统评论和快速出价反馈仍保留，弹窗仅承担即时氛围反馈。
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

关注、足迹、演示点赞和评论草稿不在后端 REST 依赖中定义。当前 `/following`、`/footprints`、直播间关注按钮、完整直播间足迹记录、按房间本地点赞数和未发送评论草稿均由前端 `aieas-user-live-activity` 本地持久化实现，不调用 REST 或 WebSocket；后续若需要跨设备同步，应重新设计接口，不沿用旧草案路径。设置页退出登录时始终清除当前会话；若选择清除浏览数据，会同步清空上述 `aieas-user-live-activity` 数据。语言偏好和昵称/头像本地资料不属于浏览数据清理范围。

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

直播间视觉氛围提醒不新增协议字段：`bid.accepted` 用于派生当前用户 `领先` 或 `被超越`，`timer.extended` 派生 `竞拍延时`，`auction.closed` 派生 `竞拍结束` 或当前用户中标时的 `竞拍成功`。当前用户中标时，新的全局提醒会替代旧的独立中标庆祝，避免重复播放动画。最后 10 秒倒计时同样只基于现有 `endTsMs`、`timer.extended` 和 `auction.closed` 派生，并作为全局提醒层的低优先级提醒展示，不新增 WebSocket 字段。

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

### 2026-06-08 发布版登录页视觉收口

- `/login` 保留深色沉浸背景、品牌视觉居中和底部登录面板的短视频 App 风格，但删除解释性文案、演示提示和测试账号预填，发布版界面只展示品牌、账号密码、登录按钮和账号辅助入口。
- 登录请求体、登录守卫和深链回跳逻辑保持不变；`注册账号` 与 `忘记密码` 仍为预留入口，当前不新增路由或后端接口，点击后仅显示本地化“功能暂未开放”提示。

### 2026-06-07 支付后订单状态闭环与 Demo 状态持久化

- 本地 `DemoApiClient` 会在当前 SPA 会话内保存 `payOrder` 和 `confirmReceipt` 后的订单状态，并同步 `getOrder`、`listMyOrders` 与 `listMyAuctionRecords`，保证“出价中标 -> 支付 -> 订单分组 -> 确认收货”演示链路不被旧 Demo 数据覆盖。
- 从 `/orders?tab=...` 进入 `/pay/:orderId` 时会携带 `returnTo`。支付成功后前端根据返回的 `Order` 派生目标页签并跳转到 `/orders?tab=...&orderId=...` 高亮订单；已支付且 `fulfillmentStatus=UNSHIPPED` 的订单进入 `待发货`，不会被误判为 `待收货`。本轮不修改 REST 或 WebSocket 协议。

### 2026-06-07 倒计时提醒并入竞拍提醒层

- `/live/:roomId` 不再渲染独立全屏倒计时层。当前竞拍商品进入最后 10 秒时，倒计时复用 `LiveAuctionAlertLayer` 展示为低优先级提醒；有 `领先 / 被超越 / 竞拍延时 / 竞拍结束 / 竞拍成功` 等更高优先级提醒时，倒计时不会同屏出现。
- 当前竞拍拍品小窗和快速出价弹层仍保留临近结束倒计时样式；收到 `auction.closed` 后倒计时提醒立即退出，并交由竞拍结束/成功提醒展示。
