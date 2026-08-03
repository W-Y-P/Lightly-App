# 微信云部署说明（小程序 Cloud-first）

本说明用于将 `apps/miniprogram` 的核心数据层从本地 HTTP 切换为微信云优先，并保留 DevTools 未配置云时的本地回退能力。

## 1. 准备云环境

1. 打开微信开发者工具 -> 你的小程序项目。
2. 进入「云开发」，创建一个云环境（例如 `lightly-dev`）。
3. 记录云环境 ID（例如 `lightly-dev-xxx`）。
4. 如果你要固定环境：
   - 把 `cloudEnvId` 设置为你的环境 ID。
5. 如果你希望小程序自动跟随当前项目已选环境：
   - `apps/miniprogram/src/config/cloud.ts` 中 `cloudEnvId` 保持为空字符串 `''`。
   - 将 `useDynamicCloudEnv` 设置为 `true`。

当前完整项目已经固定到开发环境 `cloud1-d0gkjbgmncb3b9f04`。复制到新项目时，必须替换为新环境 ID，或改用动态环境模式。

如果你仍想在本地用旧的 HTTP API 调试，可以把 `useHttpFallback` 设置为 `true`，并启动 `http://127.0.0.1:8797` 对应的 API 服务。默认关闭，避免开发者工具控制台出现本地服务未启动的网络错误。

## 2. project.config.json

当前项目已配置：

- `miniprogramRoot`: `dist/`
- `cloudfunctionRoot`: `cloudfunctions/`

你不需要手动再加目录结构，只要在开发者工具中打开这个项目根目录即可。

## 3. 上传并部署云函数

云函数位于：

- `apps/miniprogram/cloudfunctions/lightlyApi`

`apps/miniprogram/cloudbaserc.json` 已把 `lightlyApi` 云函数运行时设置为 Node.js 20.19、超时时间设置为 60 秒。上游 AI 请求会在 24 秒主动中止，留出额度回滚和错误响应时间；最终以云端函数详情显示的配置为准。

部署步骤：

1. 在微信开发者工具中打开项目。
2. 切到「云函数」面板。
3. 右键 `lightlyApi` -> **上传并部署：云端安装依赖**。
4. 等待部署成功。

如果右键上传后小程序仍提示 `FunctionName parameter could not be found`，说明云函数没有真正创建到当前环境。可用开发者工具 CLI 兜底部署：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-d0gkjbgmncb3b9f04 \
  --names lightlyApi \
  --remote-npm-install \
  --project /Users/wzl/WeChatProjects/miniprogram-1 \
  --lang zh
```

CLI 需要先在微信开发者工具「设置 -> 安全设置」中开启服务端口；这是本机开发工具能力，只用于部署和自动化调试，生产小程序不依赖它。

如果云函数已创建，但开发者工具 CLI 的 `info` 仍显示 `timeout` 为 `3`，说明右键上传/开发者工具 CLI 没有同步函数配置。使用 CloudBase CLI 在 `apps/miniprogram` 目录执行：

```bash
npx -y -p @cloudbase/cli@latest tcb login
npx -y -p @cloudbase/cli@latest tcb fn deploy lightlyApi \
  -e cloud1-d0gkjbgmncb3b9f04 \
  --dir cloudfunctions/lightlyApi \
  --runtime Nodejs20.19 \
  --force
```

部署后用下面命令确认云端配置：

```bash
npx -y -p @cloudbase/cli@latest tcb fn detail lightlyApi -e cloud1-d0gkjbgmncb3b9f04
```

若不使用 CloudBase CLI，也可以在云开发控制台中打开 `lightlyApi`，把函数运行时改为 Node.js 20.19，并把超时时间改为 60 秒。

## 4. 配置大模型环境变量

云函数通过 OpenAI Responses API 进行文字和图片识别。密钥必须只放在微信云函数环境变量中，不要写入源码、`project.config.json`、构建产物或聊天记录。

在 `lightlyApi` 云函数配置中添加：

- `OPENAI_API_KEY`: OpenAI API key，必填，只配置在云函数环境变量中
- `OPENAI_MODEL`: 可选，默认 `gpt-5.6-sol`
- `OPENAI_BASE_URL`: 可选，默认 `https://api.openai.com/v1`；生产环境只接受 HTTPS

如果没有配置 `OPENAI_API_KEY`，云函数会明确返回 `ai_not_configured`，不会生成虚假估算，也不会消耗免费次数或积分。拍照识别不会保存原图，只在本次云函数调用内发送给 OpenAI 处理；成功识别会消耗当次额度，用户确认后才保存结构化餐食数据。

## 5. 创建云数据库集合

在「云开发」->「数据库」中创建以下集合：

- `users`
- `plans`
- `dailyPlanSnapshots`
- `meals`
- `exercises`
- `weights`
- `pointsLedger`
- `photoUsage`
- `aiTextUsage`
- `feedback`

默认 MVP 阶段建议：

- 先把集合权限设置为 **仅创建者可读写**（开发阶段足够）。
- 后续再按生产规则收紧。

## 6. 建议索引

MVP 可先不建索引，直接验证流程。若后续数据增长，可加：

- `meals`: `{ openid: 1, date: 1 }`
- `exercises`: `{ openid: 1, date: 1 }`
- `weights`: `{ openid: 1, date: 1 }`
- `plans`: `{ openid: 1, createdAt: -1 }`
- `dailyPlanSnapshots`: `{ openid: 1, date: 1 }`

## 7. 初始化逻辑

前端初始化链路：

- 云配置启用后，`app.ts` 启动时执行 `wx.cloud.init(...)`
- 云配置启用后，默认优先走微信云函数 `lightlyApi`
- 若云未启用或不可用，页面展示明确的空态/错误态，不展示可能过期的 mock 数据
- 若云函数调用失败，且 `useHttpFallback` 开启，前端再 fallback 到原有 HTTP 路径
- 页面不会因为未配置云而白屏

## 8. 验证顺序

### 8.1 本地 typecheck

```bash
npm exec --workspace apps/miniprogram tsc -- --noEmit
```

### 8.2 weapp build

```bash
cd apps/miniprogram
/Users/wzl/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node ../../node_modules/.bin/taro build --type weapp
```

### 8.3 开发者工具验证

1. 打开微信开发者工具。
2. 确认已开启云开发。
3. 进入「今日」页，检查是否拿到 daily summary。
4. 新增一餐后刷新，检查 `meals` 集合是否落库。
5. 检查 `pointsLedger` 是否在至少 2 个餐段有记录/轻断食后，并达到目标缺口 80% 时写入 `daily_star`。

## 9. 数据流（当前 MVP）

1. 页面调用 `client.ts` API。
2. 云配置启用时，`client.ts` 优先调用 `wx.cloud.callFunction('lightlyApi', { action, payload })`。
3. 云函数按 `action` 路由到对应处理函数。
4. 云函数读写云数据库，返回统一 `{ code, data, message }`。
5. 前端映射成原有 `{ ok, data } | { ok, error }` 结构。
6. 若云函数失败且 `useHttpFallback` 开启，前端再 fallback HTTP；否则页面使用 mock 兜底。

## 10. 当前已覆盖 action

- `authWechat`
- `authGuest`
- `getEntitlement`
- `createPlan`
- `getCurrentPlan`
- `updatePlanGoal`
- `updatePlanMacros`
- `getDailySummary`
- `createMeal`
- `updateMeal`
- `deleteMeal`
- `getMeals`
- `createExercise`
- `updateExercise`
- `deleteExercise`
- `getExercises`
- `createWeight`
- `updateWeight`
- `deleteWeight`
- `getWeights`
- `getWeightTrend`
- `getDeficitTrend`
- `aiTextEstimate`
- `aiPhotoEstimate`
- `createFeedback`
- `deleteAccount`

## 11. 你需要在微信云后台手动完成的配置

- 创建云环境
- 开通云开发
- 创建上述 10 个集合
- 上传部署 `lightlyApi` 云函数
- 在云函数环境变量中配置 `OPENAI_API_KEY`，可按需覆盖 `OPENAI_MODEL`
- 若使用固定环境，填写 `cloudEnvId`
- 若使用当前动态环境，设置 `useDynamicCloudEnv = true`

## 12. 说明

本次改造范围覆盖数据层、云部署配置，以及记录/趋势/计划页的数据接入。  
现有 H5 构建路径保留，云调用仅在 `weapp`、云配置启用且 `wx.cloud` 可用时生效。
