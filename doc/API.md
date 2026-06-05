# 直播竞拍用户端 REST API

本文档是修正后的用户端 REST API 规范，严格对应 `doc/openapi/rest-api.openapi.json`。WebSocket 连接和实时消息不在本文档范围内，后续单独评审。

## 设计约定

- 基础路径：`/api/v1`。`/ping` 与 `/metrics` 为公共运维接口。
- 金额单位：所有金额字段均为人民币分，类型为整数。
- 时间字段：业务响应优先使用毫秒时间戳字段，例如 `endTsMs`、`serverTsMs`；展示型记录可附带 ISO 8601 字符串，例如 `createdAt`。
- ID 字段：JSON 中统一使用字符串，避免 JavaScript 丢失 uint64 精度。
- 响应包装：除图片二进制接口外，JSON 响应统一为 `{ code, message, data, trace_id }`。
- 鉴权：需要登录的接口使用 `Authorization: Bearer <accessToken>`。
- 幂等：报名冻结保证金与支付订单必须提交 `Idempotency-Key`。
- 分页：列表接口使用 `limit`、`offset` 请求参数，响应包含 `items`、`total`、`limit`、`offset`。

## 通用响应

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "trace_id": "req_01HY..."
}
```

### 错误响应

```json
{
  "code": 40001,
  "message": "参数不合法",
  "data": null,
  "trace_id": "req_01HY..."
}
```

常见 HTTP 状态码：

| 状态码 | 含义 |
| --- | --- |
| 400 | 请求参数错误，包含缺少幂等键 |
| 401 | 未登录或访问令牌无效 |
| 403 | 无权限或账号停用 |
| 404 | 资源不存在 |
| 409 | 状态冲突或幂等请求内容冲突 |
| 429 | 请求过于频繁 |
| 500 | 服务端内部错误 |

## 接口清单

| 方法 | 路径 | 鉴权 | 幂等 | 说明 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | 否 | 否 | 用户、商家、管理员登录 |
| POST | `/api/v1/auth/refresh` | 否 | 否 | 刷新访问令牌 |
| GET | `/api/v1/auth/me` | 是 | 否 | 获取当前用户 |
| POST | `/api/v1/auth/logout` | 是 | 否 | 退出登录并注销刷新令牌 |
| GET | `/api/v1/images` | 否 | 否 | 读取商品图片 |
| GET | `/ping` | 否 | 否 | 服务心跳 |
| GET | `/metrics` | 否 | 否 | 基础指标 |
| GET | `/api/v1/live-rooms` | 是 | 否 | 查询直播间列表 |
| GET | `/api/v1/live-rooms/{id}` | 是 | 否 | 获取直播间详情 |
| GET | `/api/v1/live-rooms/{id}/lots` | 是 | 否 | 查询直播间拍品列表 |
| GET | `/api/v1/live-rooms/{id}/stats` | 是 | 否 | 查询直播间实时统计 |
| GET | `/api/v1/auctions/{id}/state` | 是 | 否 | 查询拍品实时状态快照 |
| POST | `/api/v1/auctions/{id}/enroll` | 是 | 是 | 买家报名并冻结保证金 |
| GET | `/api/v1/orders/mine` | 是 | 否 | 查询当前用户订单 |
| GET | `/api/v1/orders/{id}` | 是 | 否 | 获取订单详情 |
| POST | `/api/v1/orders/{id}/pay` | 是 | 是 | 支付订单 |

## 认证接口

### POST `/api/v1/auth/login`

用户、商家、管理员登录。登录成功后返回访问令牌、刷新令牌和安全用户信息。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `X-Request-Id` | 否 | 请求追踪 ID，未传由服务端生成 |

请求体：`LoginRequest`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `account` | string | 是 | 登录账号 |
| `password` | string | 是 | 登录密码 |
| `role` | string | 是 | `buyer`、`merchant`、`admin` |

成功响应：`LoginResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token",
    "expiresIn": 43200,
    "user": {
      "id": "u_1001",
      "nickname": "竞拍用户",
      "role": "buyer",
      "status": "ACTIVE"
    }
  },
  "trace_id": "req_login"
}
```

### POST `/api/v1/auth/refresh`

使用刷新令牌换取新的访问令牌。

请求体：`RefreshRequest`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `refreshToken` | string | 是 | 刷新令牌 |

成功响应：`RefreshResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "accessToken": "new_jwt_access_token",
    "expiresIn": 43200
  },
  "trace_id": "req_refresh"
}
```

### GET `/api/v1/auth/me`

获取当前访问令牌对应的用户信息。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <accessToken>` |
| `X-Request-Id` | 否 | 请求追踪 ID |

成功响应：`UserResponse`，`data` 为 `SafeUser`。

### POST `/api/v1/auth/logout`

退出登录并注销刷新令牌。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <accessToken>` |

请求体：`LogoutRequest`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `refreshToken` | string | 是 | 需要注销的刷新令牌 |

成功响应：`LogoutResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "loggedOut": true
  },
  "trace_id": "req_logout"
}
```

## 公共基础接口

### GET `/api/v1/images`

读取商品图片。该接口返回图片二进制流，不使用 JSON 响应包装。原始文档中的 `/api/v1/images/{key}` 无法稳定表达包含子路径的对象 key，修正为 query 参数。

查询参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 是 | 对象存储 key，不允许为空或包含 `..` |

成功响应：图片二进制流，`Content-Type` 为实际图片类型或 `application/octet-stream`。

### GET `/ping`

服务心跳。

成功响应：`PingResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "message": "pong"
  },
  "trace_id": "req_ping"
}
```

### GET `/metrics`

基础指标。该接口仅用于开发和验收环境的轻量状态观察，不承载完整监控系统职责。

成功响应：`MetricsResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok",
    "roomsOnline": 2,
    "activeAuctions": 1
  },
  "trace_id": "req_metrics"
}
```

## 直播间接口

### GET `/api/v1/live-rooms`

查询直播间列表。用户端默认查询正在开播直播间，`status` 不传时服务端按 `LIVE` 处理。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <accessToken>` |

查询参数：

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `status` | string | 否 | `LIVE` | `LIVE`、`UPCOMING`、`ENDED` |
| `merchantId` | string | 否 | 无 | 商家 ID |
| `limit` | integer | 否 | 20 | 每页数量，范围 1 到 100 |
| `offset` | integer | 否 | 0 | 偏移量 |

成功响应：`LiveRoomPageResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "1001",
        "title": "珠宝严选直播间",
        "merchantId": "m_1001",
        "merchantName": "珠宝严选",
        "status": "LIVE",
        "coverUrl": "/api/v1/images?key=rooms/1001.jpg",
        "videoUrl": "/media/live-room-demo.mp4",
        "onlineCount": 328,
        "watcherCount": 1208,
        "activeAuctionId": "2001",
        "liveSessionId": "5001",
        "startedAt": "2026-05-26T11:30:00Z"
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  },
  "trace_id": "req_rooms"
}
```

### GET `/api/v1/live-rooms/{id}`

获取直播间详情。

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 直播间 ID |

成功响应：`LiveRoomResponse`，`data` 为 `LiveRoom`。

### GET `/api/v1/live-rooms/{id}/lots`

查询直播间挂载拍品列表。该接口返回面向用户端展示的拍品模型，不直接暴露后端内部拍卖表结构。

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 直播间 ID |

查询参数：

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `limit` | integer | 否 | 50 | 每页数量，范围 1 到 100 |
| `offset` | integer | 否 | 0 | 偏移量 |

成功响应：`LiveRoomLotPageResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "lot_3001",
        "auctionId": "2001",
        "roomId": "1001",
        "title": "18K 金钻石项链",
        "subtitle": "GIA 证书",
        "description": "主石 0.8ct，18K 金镶嵌",
        "imageUrl": "/api/v1/images?key=lots/3001.jpg",
        "status": "RUNNING",
        "startPrice": 120000,
        "currentPrice": 150100,
        "finalPrice": null,
        "leaderBidderId": "u_1001",
        "startTsMs": 1779807600000,
        "endTsMs": 1779811200000,
        "ruleSnapshot": {
          "startPrice": 120000,
          "minIncrement": 100,
          "ceilingPrice": 300000,
          "antiSnipeSec": 30,
          "extendSec": 30
        },
        "depositAmount": 10000,
        "participantCount": 18,
        "bidCount": 36,
        "sortOrder": 1
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  },
  "trace_id": "req_lots"
}
```

价格语义：

| 状态 | 展示价格字段 |
| --- | --- |
| 无出价 | `startPrice` |
| 竞拍中 | `currentPrice` |
| `HAMMER_PENDING`、`CLOSED_WON`、`SETTLED` | `finalPrice`，为空时使用 `currentPrice` |
| `CLOSED_FAILED` | 展示流拍，不展示成交价 |

### GET `/api/v1/live-rooms/{id}/stats`

查询直播间实时统计。

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 直播间 ID |

成功响应：`LiveRoomStatsResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "roomId": "1001",
    "onlineCount": 328,
    "watcherCount": 1208,
    "bidCount": 36,
    "gmvCent": 150100
  },
  "trace_id": "req_stats"
}
```

## 拍卖接口

### GET `/api/v1/auctions/{id}/state`

查询拍品实时状态快照。客户端断线恢复、倒计时归零确认、收到实时层快照刷新指令时使用该接口修正本地状态。

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 拍卖 ID |

成功响应：`AuctionStateResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "auctionId": "2001",
    "status": "RUNNING",
    "currentPrice": 150100,
    "leaderBidderId": "u_1001",
    "bidCount": 36,
    "participantCount": 18,
    "endTsMs": 1779811200000,
    "serverTsMs": 1779810900000,
    "myEnrollment": {
      "enrolled": true,
      "depositStatus": "READY",
      "depositLedgerId": "dep_9001"
    }
  },
  "trace_id": "req_state"
}
```

### POST `/api/v1/auctions/{id}/enroll`

买家报名并冻结保证金。该操作有副作用，必须提交幂等键。重复提交相同幂等键和相同请求体时返回同一报名结果。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <accessToken>` |
| `Idempotency-Key` | 是 | 当前用户、方法、路径、请求体维度的幂等键 |

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 拍卖 ID |

请求体：`EnrollRequest`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `depositPayChannel` | string | 是 | `MOCK_PAY`、`BALANCE` |

成功响应：`EnrollResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "auctionId": "2001",
    "userId": "u_1001",
    "enrolled": true,
    "depositLedgerId": "dep_9001",
    "depositAmount": 10000,
    "depositStatus": "READY"
  },
  "trace_id": "req_enroll"
}
```

## 订单接口

### GET `/api/v1/orders/mine`

查询当前登录用户的订单。当前用户由访问令牌推导，不允许用户端传 `winnerId` 或 `sellerId` 伪造身份过滤。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <accessToken>` |

查询参数：

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `auctionId` | string | 否 | 无 | 按拍卖 ID 查询结果页订单 |
| `status` | string | 否 | 无 | `PENDING_PAY`、`PAID`、`CANCELED`、`TIMEOUT`、`REFUNDED` |
| `payStatus` | string | 否 | 无 | `UNPAID`、`PAID`、`REFUNDED` |
| `limit` | integer | 否 | 20 | 每页数量，范围 1 到 100 |
| `offset` | integer | 否 | 0 | 偏移量 |

成功响应：`OrderPageResponse`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "ord_2001",
        "auctionId": "2001",
        "buyerId": "u_1001",
        "merchantId": "m_1001",
        "amount": 150100,
        "status": "PENDING_PAY",
        "payStatus": "UNPAID",
        "payDeadline": "2026-05-26T12:30:00Z",
        "lotTitle": "18K 金钻石项链",
        "lotImageUrl": "/api/v1/images?key=lots/3001.jpg",
        "createdAt": "2026-05-26T12:00:00Z",
        "paidAt": null
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  },
  "trace_id": "req_orders"
}
```

### GET `/api/v1/orders/{id}`

获取订单详情。

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 订单 ID |

成功响应：`OrderResponse`，`data` 为 `Order`。

### POST `/api/v1/orders/{id}/pay`

支付订单。当前版本用于模拟支付，真实支付渠道接入前仍应保持幂等。

请求头：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 是 | `Bearer <accessToken>` |
| `Idempotency-Key` | 是 | 当前用户、方法、路径、请求体维度的幂等键 |

路径参数：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 订单 ID |

请求体：`PayRequest`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `payChannel` | string | 是 | `MOCK_PAY`、`BALANCE` |

成功响应：`OrderResponse`，支付成功后 `status` 为 `PAID`，`payStatus` 为 `PAID`；实物履约订单应返回 `fulfillmentStatus=UNSHIPPED`，后续由商家发货和买家确认收货更新为 `SHIPPED / RECEIVED`。

## 数据模型

### `SafeUser`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 用户 ID |
| `nickname` | string | 是 | 用户昵称 |
| `role` | string | 是 | `buyer`、`merchant`、`admin` |
| `status` | string | 是 | `ACTIVE`、`DISABLED` |

### `LiveRoom`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 直播间 ID |
| `title` | string | 是 | 直播间标题 |
| `merchantId` | string | 否 | 商家 ID |
| `merchantName` | string | 是 | 商家名称 |
| `status` | string | 是 | `LIVE`、`UPCOMING`、`ENDED` |
| `videoSource` | string | 是 | `recorded` 或 `digitalHuman`，由商家配置决定，用户端不提供手动切换 |
| `coverUrl` | string | 否 | 封面地址 |
| `videoUrl` | string | 条件必填 | `videoSource=recorded` 时必填，直播视频地址 |
| `digitalHuman` | object | 条件必填 | `videoSource=digitalHuman` 时必填，包含 `idleVideoUrl`、`speakingVideoUrl`、可选 `ttsWsUrl` |
| `onlineCount` | integer | 是 | 在线人数 |
| `watcherCount` | integer | 是 | 围观人数 |
| `activeAuctionId` | string | 否 | 当前活跃拍卖 ID |
| `liveSessionId` | string | 否 | 当前直播场次 ID |
| `startedAt` | string | 否 | 开播时间 |
| `endedAt` | string | 否 | 结束时间 |

### `LiveRoomLot`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 直播间拍品行 ID |
| `auctionId` | string | 是 | 拍卖 ID |
| `roomId` | string | 是 | 直播间 ID |
| `title` | string | 是 | 商品标题 |
| `subtitle` | string | 否 | 商品副标题 |
| `description` | string | 否 | 商品描述 |
| `imageUrl` | string | 否 | 商品封面或单图兜底 |
| `imageUrls` | string[] | 否 | 商品详情图集，建议返回 1-5 张 |
| `status` | string | 是 | 拍卖状态 |
| `startPrice` | integer | 是 | 起拍价，单位分 |
| `currentPrice` | integer | 是 | 当前最高价，单位分 |
| `finalPrice` | integer 或 null | 否 | 落槌价，终态返回 |
| `leaderBidderId` | string | 否 | 当前领先买家 |
| `startTsMs` | integer | 否 | 开始时间毫秒时间戳 |
| `endTsMs` | integer | 是 | 结束时间毫秒时间戳 |
| `ruleSnapshot` | object | 否 | 规则快照 |
| `depositAmount` | integer | 否 | 保证金，单位分 |
| `participantCount` | integer | 否 | 参与人数 |
| `bidCount` | integer | 否 | 出价次数 |
| `sortOrder` | integer | 否 | 直播间排序 |

拍卖状态枚举：`UPCOMING`、`READY`、`WARMING_UP`、`RUNNING`、`EXTENDED`、`HAMMER_PENDING`、`CLOSED_WON`、`CLOSED_FAILED`、`SETTLED`、`CANCELED`。

### `AuctionState`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `auctionId` | string | 是 | 拍卖 ID |
| `status` | string | 是 | 拍卖状态 |
| `currentPrice` | integer | 是 | 当前最高价，单位分 |
| `leaderBidderId` | string | 否 | 当前领先买家 |
| `bidCount` | integer | 否 | 出价次数 |
| `participantCount` | integer | 否 | 参与人数 |
| `endTsMs` | integer | 是 | 服务端认定的结束时间 |
| `serverTsMs` | integer | 是 | 服务端当前时间 |
| `myEnrollment` | object | 是 | 当前用户报名和保证金状态 |

### `Order`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 订单 ID |
| `auctionId` | string | 是 | 拍卖 ID |
| `buyerId` | string | 是 | 买家 ID |
| `merchantId` | string | 否 | 商家 ID |
| `amount` | integer | 是 | 应付金额，单位分 |
| `status` | string | 是 | `PENDING_PAY`、`PAID`、`CANCELED`、`TIMEOUT`、`REFUNDED` |
| `payStatus` | string | 是 | `UNPAID`、`PAID`、`REFUNDED` |
| `fulfillmentStatus` | string | 否 | `UNSHIPPED`、`SHIPPED`、`RECEIVED`，用于“我的”页待发货、待收货、已完成分组 |
| `payDeadline` | string | 否 | 支付截止时间 |
| `lotTitle` | string | 否 | 拍品标题 |
| `lotImageUrl` | string | 否 | 拍品图片 |
| `createdAt` | string | 是 | 创建时间 |
| `paidAt` | string 或 null | 否 | 支付时间 |
| `shippedAt` | string 或 null | 否 | 发货时间 |
| `receivedAt` | string 或 null | 否 | 确认收货时间 |
