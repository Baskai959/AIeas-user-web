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

默认 API 模式使用本地 Demo 数据。联调真实 REST 服务时配置：

```env
VITE_API_MODE=remote
VITE_API_BASE_URL=http://127.0.0.1:4523/m1/8317345-8081123-default
```

实时通信默认使用前端内置 mock client。接入真实 WebSocket 时配置：

```env
VITE_REALTIME_MODE=websocket
VITE_WS_URL=ws://127.0.0.1:8080
```

真实 WebSocket 连接地址：

```text
{VITE_WS_URL}/ws/live-rooms/{roomId}?lastSeq={lastSeq}
```

直播间视频源由 `LiveRoom.videoSource` 决定。`recorded` 使用 `videoUrl`，`digitalHuman` 使用 `digitalHuman.idleVideoUrl` 与 `digitalHuman.speakingVideoUrl`。用户端不提供手动切换实景/数字人视频源的入口。

## 功能范围

- `/login`：模拟登录并持久化用户会话。
- `/`：首页直播推荐流，支持触屏上下滑、首尾循环、PC 鼠标拖拽和滚轮切换。
- `/discover`：拍品列表，支持排序、状态和类别筛选。
- `/live/:roomId`：全屏直播间，包含视频画面、评论、关注、观众数、竞拍清单、当前竞拍拍品小窗、拍品详情、报名和快速出价。
- `/me`：个人中心，包含头像、昵称、关注、足迹、我的订单入口和设置入口。
- `/settings`：个人设置，支持昵称和语言设置。
- `/orders?tab=...`：竞拍/订单记录，支持 `all / pendingBid / pendingPay / pendingShipment / pendingReceipt / completed`。
- `/following`：已关注直播间列表。
- `/footprints`：直播间浏览足迹，最多保留 100 条，按 10 条渐进加载。
- `/result/:auctionId`：成交结果。
- `/pay/:orderId`：模拟支付。
- `/history`：历史订单和最近直播间。

直播间内当前支持：

- REST 配置的实景模拟视频或数字人视频源。
- 评论展示、输入、发送、隐藏和系统消息。
- 关注/已关注切换。
- 竞拍清单底部抽屉。
- 拍品详情半屏弹层。
- 报名并冻结保证金。
- 当前竞拍拍品小窗：未缴保证金显示 `去看看`，已缴保证金显示 `快速出价`。
- 快速出价弹层：支持最多三档加价、封顶价限制、最小出价间隔、后端成功/失败反馈、竞拍结束 5 秒派生倒计时和关闭动画。
- 右侧实时排行榜：固定前 8 名槽位、底部当前用户行、排名变动动画、当前价、倒计时、观众数、延时和成交事件更新。

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

客户端维护 `lastSeq`，重复或乱序消息不应用。出价统一发送 `bid.place`，评论统一使用 `chat.*` 消息。

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

### 2026-06-02 App 路由与模块拆分重构

- 引入 `react-router-dom`，用 `BrowserRouter / Routes / Route / Navigate` 替代 `App.tsx` 内手写路由、`parseRoute`、`routePath`、`popstate` 和 `window.history.pushState` 逻辑。
- `App.tsx` 压缩为根级路由壳层；路由表迁移到 `src/router/AppRouter.tsx`，底部主导航抽离到 `src/layout/MainTabShell.tsx`。
- 增加登录守卫：未登录访问 `/orders?tab=...` 等业务深链时先进入 `/login`，登录后回到原深链；现有 `/`、`/discover`、`/me`、`/live/:roomId`、`/orders?tab=...` URL 行为保持不变。
- 测试工具新增 `renderWithRouter`，用于按初始路径验证深链、守卫和页面跳转。

### 2026-06-02 当前竞拍拍品小窗生命周期修正

- `/live/:roomId` 当前竞拍拍品小窗改为明确生命周期：无 `RUNNING / EXTENDED` 拍品不显示，有竞拍中拍品才显示。
- 收到 `auction.started` 时，前端按“同一直播间最多一个竞拍中拍品”收束旧拍品状态，并让新拍品小窗从底部 `竞拍清单` 按钮处竖直上弹；若旧结束态小窗仍在展示，则先下收旧小窗再弹出新小窗。
- 收到 `auction.closed` 时，小窗倒计时显示 `END`，按钮显示禁用的 `竞拍结束`，保留约 5 秒后竖直下收入 `竞拍清单` 按钮；右上角新增无背景、无边框的 `×` 临时隐藏按钮，同一拍品不再自动显示，新拍品开拍不受影响。
- 直播间竞拍状态初始值改为 memo 化，避免 React Query placeholder 对象每次 render 变化造成已登录直播页测试和渲染循环。

### 2026-06-02 直播间实时排行榜细节与动效

- `/live/:roomId` 右侧关注按钮下方的实时排行榜仅在当前有 `RUNNING / EXTENDED` 拍品时显示，固定前 8 名槽位；底部固定展示当前用户排名，未出价时名次和价格均为 `-`。
- 排行榜使用约 0.2 alpha 的高透明背景，不显示“当前出价前8名”说明；展开/收起按钮改为竖排文字透明描边样式，文字在上、箭头在下，展开时贴在排行榜左侧，收起时贴在屏幕右侧。
- 排行榜支持标题居中、前三名带数字金银铜牌、4 名以后纯数字、第一名价格放大、红色出价、各名次价格列居中对齐、位次变化动画；前 8 名内用户升至第一时从原位次起跳，8 名外普通用户从虚线处出现，8 名外当前用户从当前用户栏复制起跳；当前用户固定信息栏不参与下移或退出动画，动画中段再同步更新位次和价格；被挤出的第 8 名复用普通排行榜行样式，不作为放大的 ghost 渲染，保持与 1-7 名一致的下移速度，降到虚拟第 9 名位置后由虚线裁剪区隐藏；第一名再次出价且位次不变时只播放价格滚动动画。排行榜价格列加宽，避免第一名放大价格截断小数位。
- 直播间弹层改为实例状态机，允许关闭中的详情弹层和打开中的快速出价弹层短暂并存；弹层关闭动画开始前当前竞拍拍品小窗已恢复到 DOM，由遮罩自然遮挡。
