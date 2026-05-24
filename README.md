# Fat Loss App

减脂期间使用的每日决策助手：生成计划、记录饮食和运动、追踪热量缺口、根据体重变化校准代谢。

## 当前交付

- [产品需求文档](./docs/PRD.md)
- [自建后端技术架构教程](./docs/TECH_ARCHITECTURE_TUTORIAL.md)
- [MVP 开发路线图](./docs/MVP_ROADMAP.md)
- 一个可在 Mac 本机运行的 React/Vite 交互 demo

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

## 说明

正式 App 推荐使用原生 iOS SwiftUI 开发；这里的 Web demo 用于快速确认信息架构、计算逻辑和交互方向，不代表最终客户端技术栈。
