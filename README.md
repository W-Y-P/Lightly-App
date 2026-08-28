# Fat Loss App

减脂期间使用的每日决策助手：生成计划、记录饮食和运动、追踪热量缺口、根据体重变化校准代谢。

产品以微信小程序为首发渠道，后端 API 和领域模型设计为多端复用。未来可扩展至 iOS / Android 原生应用。

## 当前交付

- [产品需求文档](./docs/PRD.md)
- [自建后端技术架构教程](./docs/TECH_ARCHITECTURE_TUTORIAL.md)
- [MVP 开发路线图](./docs/MVP_ROADMAP.md)
- [微信小程序上线清单](./docs/MINIPROGRAM_LAUNCH_CHECKLIST.md)
- 一个可在 Mac 本机运行的 React/Vite 交互 demo（用于验证信息架构和计算逻辑）

## 运行 demo

```bash
npm install
npm run dev
```

然后打开终端显示的本地地址，通常是 `http://localhost:5173`。

## 运行后端 API

```bash
npm run dev:api
```

默认地址是 `http://127.0.0.1:8797`。例如：

```bash
curl http://127.0.0.1:8797/health
```

## 首发规则

| 功能 | 免费用户 |
|------|----------|
| 每日拍照识别 | 5 次 |
| 达标奖励 | 1 积分（1 积分 = 1 次额外识别） |
| 文字录入 / 手动记录 | 不限 |

不设 VIP 或订阅。所有用户享有相同功能权限。

## 项目结构

```text
apps/
  api/              # Node.js + Fastify 后端
  miniprogram/      # 微信小程序客户端（开发中）
  mobile/           # Expo 原型（用于验证 UI，后续迁移至小程序）
packages/
  domain/           # 核心公式和类型（未来多端复用）
docs/               # 产品文档、技术教程、上线清单
```

## 未来路线

- iOS / Android 原生应用：复用后端 API 和领域模型，共享视觉规范
- Apple HealthKit / Google Fit 集成
- 完整国际化

## 说明

Web demo 用于快速确认信息架构、计算逻辑和交互方向，不代表最终客户端技术栈。正式客户端以微信小程序为主。
