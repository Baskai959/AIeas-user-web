# Mock 控制桥使用说明

Mock 控制桥是用户端 H5 的开发测试工具，用于在本地 Demo / mock realtime 模式下，从命令行向已打开的直播间页面注入实时事件。它不属于正式后端 WebSocket 协议，不要求服务端实现，也不应在生产环境启用。

## 适用场景

- 手动验证其他用户出价后当前价、排行榜和提示是否刷新。
- 手动验证其他用户评论和系统消息是否进入评论流。
- 手动验证倒计时调整、在线人数变化和竞拍结束状态。
- 复现直播间实时事件相关 UI 问题，而不依赖真实后端推送。

## 工作方式

1. 本地启动控制桥服务，监听控制端口。
2. 使用带 mock-control mode 的 Vite 启动 H5。
3. H5 在 mock realtime 模式下读取 `VITE_MOCK_CONTROL_URL` 并连接控制桥。
4. CLI 命令向控制桥发送事件。
5. 控制桥按 `roomId` 转发给同一直播间页面。
6. 页面继续使用现有 realtime handler 处理注入事件。

控制桥只在以下条件同时满足时连接：

- 当前不是 `VITE_REALTIME_MODE=websocket`。
- 环境变量存在 `VITE_MOCK_CONTROL_URL`。
- 用户已进入完整直播间页面。

## 启动

终端 A 启动控制桥：

```bash
npm run mock:live -- serve --port 4578
```

终端 B 启动 H5：

```bash
npm run dev:mock-control
```

`dev:mock-control` 使用 `.env.mock-control`，默认配置：

```env
VITE_MOCK_CONTROL_URL=ws://127.0.0.1:4578/control
```

进入 H5 后，打开任意直播间，再执行注入命令。

## 命令

### 其他用户出价

```bash
npm run mock:live -- bid --room room_1001 --auction auc_2001 --price 188800 --nickname 用户**88
```

效果：

- 注入 `bid.accepted`。
- 注入 `ranking.updated`。
- 页面应更新当前价、排行榜和出价反馈。

### 其他用户评论

```bash
npm run mock:live -- chat --room room_1001 --nickname 用户**88 --text "这件不错"
```

效果：

- 注入 `chat.message`。
- 页面评论区应出现该用户评论。

### 系统消息

```bash
npm run mock:live -- system --room room_1001 --text "系统提示"
```

效果：

- 注入带 `system: true` 的 `chat.message`。
- 页面评论区应显示系统消息样式。

### 修改倒计时

```bash
npm run mock:live -- timer --room room_1001 --auction auc_2001 --end-in 30
```

效果：

- 注入 `timer.extended`。
- 页面应将对应拍品结束时间调整到当前时间后 30 秒。

### 修改在线人数

```bash
npm run mock:live -- online --room room_1001 --count 520
```

效果：

- 注入 `room.online`。
- 页面在线人数应更新为 520。

### 结束竞拍

```bash
npm run mock:live -- close --room room_1001 --auction auc_2001 --price 188800
```

效果：

- 注入 `auction.closed`。
- 页面应进入成交/结果流程。

## 事件映射

| CLI 命令 | 注入消息 |
| --- | --- |
| `bid` | `bid.accepted`、`ranking.updated` |
| `chat` | `chat.message` |
| `system` | `chat.message` 且 `system: true` |
| `timer` | `timer.extended` |
| `online` | `room.online` |
| `close` | `auction.closed` |

## 注意事项

- 控制桥是开发工具，不做真实鉴权、权限校验、断线恢复或服务端裁决。
- 注入事件只影响当前连接到同一 `roomId` 的浏览器页面。
- 若 H5 使用真实 WebSocket 模式，控制桥不会连接。
- 若页面没有进入直播间，CLI 命令可以发送成功，但没有页面接收。
- 端口冲突时可修改 `serve --port`，并同步修改 `.env.mock-control` 中的端口。

## 验收建议

1. 启动控制桥和 H5。
2. 登录并进入 `/live/:roomId`。
3. 执行 `bid`，确认当前价和排行榜刷新。
4. 执行 `chat` 和 `system`，确认评论区追加消息。
5. 执行 `timer`，确认倒计时变化。
6. 执行 `online`，确认在线人数变化。
7. 执行 `close`，确认竞拍结束流程可见。
