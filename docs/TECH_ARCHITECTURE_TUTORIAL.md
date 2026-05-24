# 自建后端技术架构教程

这份教程解释“自建后端”到底怎么做。目标不是让你一次学完后端，而是让你知道每一块为什么存在、什么时候做、怎么验收。

## 1. 总体原则

首发中国区，未来国际化。因此采用区域隔离路线：

- 中国区：`api-cn.example.com`
- 海外区：未来部署 `api-global.example.com`
- 两边共用一套后端代码和数据库结构
- 用户数据按地区隔离，不默认跨境同步

首版推荐：

- iOS 客户端：SwiftUI
- 后端 API：Node.js + TypeScript + Fastify
- ORM：Prisma
- 数据库：Postgres
- 文件存储：对象存储，但餐食照片默认不长期保存
- AI：后端模型网关，可切换不同模型供应商
- 部署：中国大陆云服务器，准备 App 备案/ICP 路线

## 2. 为什么 App 不能直接调 AI

不要让 iOS App 直接调用大模型 API，原因有四个：

1. API Key 会泄露。
2. 无法统一控制免费/VIP 次数。
3. 无法记录识别质量和错误。
4. 无法替换模型供应商。

正确流程：

```text
iOS App -> 自建后端 -> AI 模型 / 食物库 -> 自建后端 -> iOS App
```

## 3. 系统模块

### 3.1 iOS App

负责：

- SwiftUI 页面
- 拍照、相册、相机权限
- StoreKit 2 订阅
- HealthKit 权限和同步
- 本地缓存
- 游客模式本地数据
- 与后端 API 同步

### 3.2 API 服务

负责：

- 登录和用户身份
- 计划生成
- 饮食记录
- 运动记录
- 体重记录
- 趋势数据
- 代谢校准
- AI 识别入口
- 订阅权益校验
- 账号删除

### 3.3 数据库

保存结构化长期数据：

- 用户
- 计划
- 餐食
- 食物项
- 运动
- 体重
- 星星/达标日
- 订阅权益
- 校准建议

不长期保存餐食照片。

### 3.4 AI 模型网关

提供统一接口：

- 图片识别餐食
- 自然语言解析餐食
- 生成分析报告

网关输出统一 JSON，客户端不关心底层是哪家模型。

## 4. 推荐目录结构

```text
apps/
  ios/                 # 正式 SwiftUI 工程
  api/                 # Node.js 后端
  demo/                # Web 交互原型，可选
packages/
  domain/              # 公式、类型、测试样例
  nutrition-data/      # 食物库种子数据
docs/
  PRD.md
  TECH_ARCHITECTURE_TUTORIAL.md
  MVP_ROADMAP.md
```

当前仓库先用根目录 Vite demo 快速验证界面和公式。正式进入工程化后，可以迁移到上面的 monorepo 结构。

## 5. 数据库核心表

### users

```text
id
region
apple_user_id
email
birth_year
sex
created_at
deleted_at
```

### plans

```text
id
user_id
current_weight_kg
target_weight_kg
target_date
weekly_loss_kg
height_cm
age
sex
activity_level
bmr_kcal
tdee_kcal
daily_deficit_target_kcal
recommended_intake_kcal
protein_min_g
protein_max_g
carb_min_g
carb_max_g
fat_min_g
fat_max_g
active_from
active_to
created_at
```

### meal_entries

```text
id
user_id
date
meal_slot       # breakfast/lunch/dinner/other/drink
status          # recorded/skipped/fasting
source          # photo/text/manual/history
total_kcal
carb_g
protein_g
fat_g
confirmed_at
created_at
```

### meal_items

```text
id
meal_entry_id
food_name
quantity_g
kcal
carb_g
protein_g
fat_g
confidence
is_ai_estimated
```

### exercise_entries

```text
id
user_id
date
exercise_type
duration_min
met
raw_kcal
source          # manual/met/healthkit
confirmed_kcal
created_at
```

### weight_entries

```text
id
user_id
date
weight_kg
weighing_context # morning_empty/after_meal/evening/other
source           # manual/healthkit
created_at
```

### daily_summaries

```text
id
user_id
date
intake_kcal
exercise_kcal
actual_deficit_kcal
target_deficit_kcal
recorded_meal_slots
is_record_complete
star_awarded
created_at
updated_at
```

### subscriptions

```text
id
user_id
apple_original_transaction_id
product_id
status
expires_at
photo_limit_per_day
created_at
updated_at
```

### calibration_suggestions

```text
id
user_id
period_start
period_end
estimated_tdee_delta_kcal
suggested_tdee_kcal
suggested_intake_kcal
reason
confidence
status          # pending/accepted/dismissed
created_at
```

## 6. API 设计

### 6.1 认证

```text
POST /auth/apple
POST /auth/logout
DELETE /account
```

`DELETE /account` 必须存在，因为支持账号创建的 App 需要在 App 内提供账号删除入口。

### 6.2 计划

```text
POST /plans
GET /plans/current
PATCH /plans/current/goal
PATCH /plans/current/macros
POST /plans/current/accept-calibration
```

### 6.3 饮食

```text
POST /meals
GET /meals?date=2026-05-24
PATCH /meals/:id
DELETE /meals/:id
POST /meals/:id/items
PATCH /meal-items/:id
```

### 6.4 AI 识别

```text
POST /ai/meal-photo-estimate
POST /ai/meal-text-estimate
POST /ai/analysis-report
```

图片识别返回示例：

```json
{
  "recommendedKcal": 620,
  "carbG": 72,
  "proteinG": 35,
  "fatG": 18,
  "items": [
    {
      "foodName": "米饭",
      "quantityG": 180,
      "kcal": 210,
      "carbG": 46,
      "proteinG": 4,
      "fatG": 1,
      "confidence": 0.72,
      "isAiEstimated": false
    }
  ],
  "notes": ["酱料和烹饪油可能导致误差"]
}
```

### 6.5 运动

```text
POST /exercises
GET /exercises?date=2026-05-24
PATCH /exercises/:id
DELETE /exercises/:id
```

### 6.6 体重和趋势

```text
POST /weights
GET /weights?from=2026-05-01&to=2026-05-24
GET /trends/weight
GET /trends/deficit
GET /trends/macros
GET /trends/stars
```

## 7. 计划计算模块

建议把公式放进独立 domain 包，后端和客户端都按同一份测试样例验证。

核心函数：

```text
calculateBmr(input)
calculateTdee(bmr, activityLevel)
calculateDailyDeficit(goal)
calculateRecommendedIntake(tdee, plannedExercise, returnRatio, deficit)
calculateActualDeficit(tdee, exerciseKcal, intakeKcal)
calculateStarStatus(day)
calculateMacroTargets(plan)
calculateCalibrationSuggestion(records)
```

这样未来做 Android 时，可以用同样的测试样例在 Kotlin 里重写，保证结果一致。

## 8. AI 和食物库

首版不要让 AI 直接“凭感觉报热量”。更稳的做法：

1. AI 输出结构化食物候选。
2. 后端查食物库。
3. 后端按克重计算热量和碳蛋脂。
4. 找不到时才让 AI fallback。
5. 所有 AI fallback 结果标记为估算。

食物库字段：

```text
id
locale
name
aliases
category
kcal_per_100g
carb_per_100g
protein_per_100g
fat_per_100g
serving_examples
source
confidence
```

饮品模板需要支持变量：

- 容量
- 糖度
- 奶盖
- 珍珠/椰果/布丁
- 酒精度

## 9. 订阅权益

StoreKit 2 在 iOS 侧处理购买，后端负责保存和校验权益。

免费：

- 每天 2 次拍照识别

VIP：

- 每天 10 次拍照识别
- 详细分析推荐报告

后端每次调用图片识别前检查当天额度。

## 10. 隐私和合规

底线：

- 不卖健康数据
- 不把健康数据用于广告或营销画像
- 不长期保存餐食照片
- 提供删除账号及相关数据入口
- 明确写隐私政策和用户协议
- 对未成年人数据、体重、健康数据按敏感数据处理

中国区还要准备：

- App 备案/ICP 路线
- 域名备案
- 隐私政策页面
- 用户协议页面
- 第三方 SDK 清单
- 数据处理说明

## 11. 部署教程路线

第一阶段本地开发：

```bash
mkdir apps/api
cd apps/api
npm init -y
npm install fastify @fastify/cors @fastify/jwt prisma @prisma/client zod
npm install -D typescript tsx vitest
npx prisma init
```

第二阶段本地 Postgres：

```bash
docker compose up -d postgres
npx prisma migrate dev
npm run dev
```

第三阶段中国区测试环境：

- 购买云服务器
- 购买域名并备案
- 部署 Postgres 或使用云数据库
- 部署 API 服务
- 配置 HTTPS
- 配置对象存储
- 配置日志和备份

第四阶段正式环境：

- 独立正式数据库
- 独立生产 AI Key
- 完整备份策略
- 监控告警
- 账号删除流程验收
- App Store 隐私营养标签填写

## 12. 验收标准

后端 MVP 可验收时应做到：

- 用户可以登录并同步数据
- 用户可以生成计划
- 用户可以保存餐食、运动和体重
- 用户可以获取今日摘要和趋势图数据
- 图片识别额度能正确限制
- 删除账号能删除关联数据
- 代谢校准能生成可解释建议
- 所有核心公式有单元测试
