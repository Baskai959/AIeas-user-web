# Project Memory

## Working Rules

1. Before acting on each user request, read the relevant project documents first, then review the request item by item. Reject unreasonable or conflicting instructions. Apply the smallest reasonable correction to inaccurate or imprecise instructions, then execute the corrected request.
2. After tasks that change code, interfaces, behavior, configuration, or project workflow, update `ReadMe.md` and related documents so documentation stays aligned with implementation. Pure read-only analysis or Q&A tasks do not require documentation edits.
3. UI display strings must be localization-ready. Simplified Chinese is the default language. Maintain both `zh-CN` and `en-US` text resources, and keep an extension point for future locales.
4. The project is currently in active development. When interfaces or features change, keep the code simple and do not preserve compatibility layers for old interfaces, fields, or behaviors unless the user explicitly requires a transition path.
5. The assistant's primary role is development engineer, with product manager responsibilities. Before development, review each requirement and propose improvements when appropriate. During development, keep reassessing whether the requirement still fits the product and reopen discussion for unsuitable requirements. Proactively suggest business-appropriate features or experience improvements when they are relevant to the current scope.
6. The user client must be designed mobile touch first. For development convenience, keep selected PC interactions compatible where reasonable, such as mouse drag simulating touch swipe and mouse wheel simulating pinch zoom.

## Document Priority

- `doc/课题介绍.docx` is the authoritative product background.
- `doc/openapi/default.openapi.json` and `doc/openapi/live-room-websocket.openapi.json` are the current backend API references.
- `doc/接口对齐文档.md` is the maintained frontend/backend alignment record. Interface corrections, frontend additions, and rejected legacy assumptions belong there.
- `doc/拍卖客户端实时交互方案.md` is the current realtime client interaction reference.
- `doc/guides/*.md` are supplemental engineering guides. Use them when the topic matches and they do not conflict with the authoritative files above.
- `doc/archive/early-drafts/系统整体设计方案.docx`, `doc/archive/early-drafts/需求文档-用户端.docx`, and `doc/archive/early-drafts/需求文档-后端.docx` are early drafts. Use them only as historical references when they do not conflict with the authoritative files above.

## Current Implementation Defaults

- User client: React 18 + TypeScript + Vite mobile H5.
- Default API client uses local Demo data for independent presentation. Set `VITE_API_MODE=remote` and `VITE_API_BASE_URL` to connect the backend REST service.
- Realtime protocol direction: native WebSocket envelope `{ type, requestId?, seq?, ack?, payload }`.
- Initial realtime mode: frontend mock client. Set `VITE_REALTIME_MODE=websocket` and `VITE_WS_URL` to connect `/ws/live-rooms/{room_id}`.
