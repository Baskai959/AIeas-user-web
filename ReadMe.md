# 实时竞拍大师用户端 H5

移动端 H5 用户端项目，面向直播竞拍场景下的观众与竞拍用户。项目实现了从登录、直播推荐流、拍品浏览、直播间竞拍、成交结果、订单履约到个人中心的完整用户端链路，并同时保留本地 Demo 演示模式与真实后端联调模式。

## 项目概览

- 产品形态：移动端 H5 用户端，移动触控优先，兼容必要的 PC 开发验收操作。
- 业务核心：直播间浏览、拍品详情、报名与保证金、实时出价、成交结果、模拟支付、订单履约、关注与足迹。
- 运行模式：
  - 本地 Demo：独立演示完整链路，不依赖真实后端。
  - 远程联调：对接真实 REST 与 WebSocket 服务。
- 国际化：默认简体中文，内置 `zh-CN` 与 `en-US` 文案资源，保留后续扩展点。

## 核心能力

- 短视频风格登录页与登录守卫回跳
- 首页直播推荐流与直播预览
- 发现页拍品列表、筛选与详情承接
- 全屏直播间、评论区、统一声音开关、竞拍清单、拍品详情与快速出价
- 实时排行榜、倒计时提醒、竞价氛围弹层与最后 30 秒光带氛围
- 成交结果页、模拟支付、订单列表与确认收货
- “我的”页、设置页、关注列表、直播间/拍品足迹
- 本地 Demo 数据、Mock realtime client、Mock 控制桥注入验证

## 技术架构

### 前端栈

- React 18
- TypeScript
- Vite
- Ant Design Mobile
- React Router
- TanStack Query
- Zustand
- lucide-react

### 状态与数据

- 路由与页面导航：`react-router-dom`
- REST 请求与缓存：`@tanstack/react-query`
- 会话、偏好与本地用户行为：`zustand`
- 本地持久化：
  - 语言、昵称、头像等偏好
  - 关注、足迹、评论草稿、本地点赞数
  - 直播间 `lastSeq` 与媒体播放进度

### 实时交互

- 默认协议：原生 WebSocket envelope `{ type, requestId?, seq?, ack?, payload }`
- 默认模式：前端 `MockRealtimeClient`
- 真实联调：`VITE_REALTIME_MODE=websocket` + `VITE_WS_URL`
- 断线恢复：按直播间持久化 `lastSeq`，支持重连、去重、快照恢复

### 工程拆分

- `src/router/AppRouter.tsx`：路由装配、登录守卫、页面级导航衔接
- `src/pages/live-room/LiveRoomPage.tsx`：直播间主页面与实时交互
- `src/pages/account/AccountPages.tsx`：我的、设置、订单、关注、足迹
- `src/pages/pay/PayPage.tsx`：支付页
- `src/pages/result/ResultPage.tsx`：成交结果页
- `src/features/*`：按业务域抽离的复用逻辑
- `src/components/*`：通用展示与交互组件

## 目录结构

```text
.
|-- src/
|   |-- components/
|   |-- features/
|   |-- layout/
|   |-- pages/
|   |-- router/
|   |-- services/
|   |-- store/
|   |-- utils/
|-- doc/
|   |-- openapi/
|   |-- guides/
|   `-- archive/
|-- tools/
|-- h5_node_client.mjs
`-- ReadMe.md
```

## 快速开始

安装依赖：

```bash
npm install
```

启动本地开发：

```bash
npm run dev
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run build` | 生产构建 |
| `npm run lint` | 运行 ESLint |
| `npm run test` | 启动测试监听 |
| `npm run test:run` | 运行完整测试集 |
| `npm run mock:live -- serve --port 4578` | 启动 Mock 控制桥 |
| `npm run dev:mock-control` | 带 Mock 控制桥配置启动 H5 |

## 运行模式

### 1. 本地 Demo 模式

适用于 UI 开发、功能演示和无后端依赖的回归验证。

```bash
npm run dev
```

默认行为：

- `VITE_API_MODE` 未设置时使用本地 Demo API。
- `VITE_REALTIME_MODE` 未设置时使用前端 Mock realtime client。
- 关注、足迹、评论草稿和本地点赞保存在浏览器本地存储中。
- 支付、确认收货、出价、排行榜和竞拍状态均可在 Demo 数据中闭环演示。

### 2. 真实后端联调模式

推荐使用 Vite 同源反代，避免浏览器端 CORS 与 WebSocket 跨域问题。

PowerShell：

```powershell
$env:VITE_API_MODE='remote'
$env:VITE_API_BASE_URL=''
$env:VITE_REALTIME_MODE='websocket'
$env:VITE_WS_URL=''
$env:VITE_DEV_PROXY_TARGET='http://47.97.82.143:8888'
npm run dev -- --host 127.0.0.1 --port 5176
```

Bash：

```bash
VITE_API_MODE=remote \
VITE_API_BASE_URL= \
VITE_REALTIME_MODE=websocket \
VITE_WS_URL= \
VITE_DEV_PROXY_TARGET=http://47.97.82.143:8888 \
npm run dev -- --host 127.0.0.1 --port 5176
```

### 3. Mock 控制桥模式

用于在本地 Demo / mock realtime 模式下，从命令行向已打开的直播间注入实时事件，便于验证竞拍、评论、倒计时和结束态。

终端 A：

```bash
npm run mock:live -- serve --port 4578
```

终端 B：

```bash
npm run dev:mock-control
```

详细说明见 [doc/Mock控制桥使用说明.md](G:/bytedance/AIeas-user-web/doc/Mock控制桥使用说明.md)。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_MODE` | `demo` | `demo` 使用本地 Demo API，`remote` 对接真实后端 |
| `VITE_API_BASE_URL` | 空 | 留空时走当前站点同源 `/api` |
| `VITE_REALTIME_MODE` | `mock` | `mock` 使用前端 Mock realtime client，`websocket` 使用真实 WebSocket |
| `VITE_WS_URL` | 空 | 留空时走当前站点同源 `/ws` |
| `VITE_DEV_PROXY_TARGET` | 空 | Vite 开发期 `/api`、`/ws` 反代目标 |
| `VITE_MOCK_CONTROL_URL` | 空 | Mock 控制桥 WebSocket 地址 |

## 质量保障

项目当前使用以下验证链路：

- `npm run lint`
- `npm run test:run`
- `npm run build`

测试覆盖包括：

- 业务流程回归测试
- 样式与关键 CSS 规则测试
- API / bidding / realtime / store 单元测试
- H5 移植文档与移动端内联视频兼容性校验

## 关键页面

| 路由 | 说明 |
| --- | --- |
| `/login` | 登录页 |
| `/` | 首页直播推荐流 |
| `/discover` | 拍品发现页 |
| `/category/:categoryId` | 分类详情页 |
| `/merchant/:merchantId` | 商家页 |
| `/product/:lotId` | 商品详情页 |
| `/live/:roomId` | 直播间页 |
| `/result/:auctionId` | 成交结果页 |
| `/pay/:orderId` | 支付页 |
| `/me` | 个人中心 |
| `/settings` | 设置页 |
| `/orders` | 订单页 |
| `/following` | 关注列表 |
| `/footprints` | 足迹页 |

## 文档导航

### 权威文档

- [doc/课题介绍.docx](G:/bytedance/AIeas-user-web/doc/课题介绍.docx)
- [doc/openapi/default.openapi.json](G:/bytedance/AIeas-user-web/doc/openapi/default.openapi.json)
- [doc/openapi/live-room-websocket.openapi.json](G:/bytedance/AIeas-user-web/doc/openapi/live-room-websocket.openapi.json)
- [doc/拍卖客户端实时交互方案.md](G:/bytedance/AIeas-user-web/doc/拍卖客户端实时交互方案.md)
- [doc/接口对齐文档.md](G:/bytedance/AIeas-user-web/doc/接口对齐文档.md)
- [doc/用户端实现说明.md](G:/bytedance/AIeas-user-web/doc/用户端实现说明.md)

### 补充指南

- [doc/guides/H5用户端移植指南.md](G:/bytedance/AIeas-user-web/doc/guides/H5用户端移植指南.md)
- [doc/guides/WebSocket断线重连客户端实现指南.md](G:/bytedance/AIeas-user-web/doc/guides/WebSocket断线重连客户端实现指南.md)
- [doc/Mock控制桥使用说明.md](G:/bytedance/AIeas-user-web/doc/Mock控制桥使用说明.md)

### 展示材料

- [doc/user-client-ui-function-design-showcase.docx](G:/bytedance/AIeas-user-web/doc/user-client-ui-function-design-showcase.docx)
- [doc/用户端技术难点与联调对齐复盘.docx](G:/bytedance/AIeas-user-web/doc/用户端技术难点与联调对齐复盘.docx)

### 历史归档

- [doc/archive/early-drafts/系统整体设计方案.docx](G:/bytedance/AIeas-user-web/doc/archive/early-drafts/系统整体设计方案.docx)
- [doc/archive/early-drafts/需求文档-用户端.docx](G:/bytedance/AIeas-user-web/doc/archive/early-drafts/需求文档-用户端.docx)
- [doc/archive/early-drafts/需求文档-后端.docx](G:/bytedance/AIeas-user-web/doc/archive/early-drafts/需求文档-后端.docx)

## 说明

- 如文档内容与代码行为不一致，以当前实现和权威文档为准。
- 历史归档仅用于回看早期方案，不再作为实现或联调基线。
