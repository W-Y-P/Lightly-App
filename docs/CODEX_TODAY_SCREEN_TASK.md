# Codex Task: TodayScreen 高保真首页

## 边界

本项目的代码开发、架构设计、审查和验收统一由 Codex 完成。

## 背景说明

项目首发渠道为微信小程序。当前 Expo / React Native 原型用于快速验证信息架构、交互逻辑和视觉风格，完成验证后将迁移至小程序客户端。视觉规范和组件结构设计为可迁移的，不绑定特定平台特有 API。

## 目标

基于参考图高保真实现 React Native / Expo 首页「今日」页面。不要复刻图片本身，不要把参考图作为背景图使用，而是用代码实现相同的信息结构、布局层级、交互逻辑和视觉风格。

页面先使用 `mockTodayData`，不接真实后端。

## 技术栈

- React Native
- Expo
- TypeScript
- NativeWind / Tailwind 风格写法
- `lucide-react-native`
- `react-native-svg`
- `expo-linear-gradient`
- `react-native-safe-area-context`

## 页面名称

`TodayScreen`

## 建议文件结构

```text
src/screens/TodayScreen.tsx
src/screens/today/mockTodayData.ts
src/screens/today/components/HeaderSection.tsx
src/screens/today/components/CalorieBalanceCard.tsx
src/screens/today/components/MetricRow.tsx
src/screens/today/components/MealQuickCards.tsx
src/screens/today/components/ExerciseCard.tsx
src/screens/today/components/StarRewardCard.tsx
src/screens/today/components/WeightTrendCard.tsx
src/screens/today/components/TipCard.tsx
src/screens/today/components/MacroSummaryCard.tsx
src/screens/today/components/MealTimelineCard.tsx
src/screens/today/components/QuickActionCards.tsx
src/screens/today/components/DailyAdviceCard.tsx
src/screens/today/components/BottomTabBar.tsx
```

## 模块顺序

1. 页面头部
2. 今日可吃余额主卡
3. 核心指标区
4. 餐段快捷记录
5. 运动记录模块
6. 今日之星 / 达标激励模块
7. 体重趋势模块
8. 温馨提示模块
9. 三大营养素概览模块
10. 今日饮食明细 / 时间线模块
11. 体重打卡快捷入口
12. AI 拍照识别 / 快速记录入口
13. 今日总结与建议模块
14. 固定底部导航栏

## Mock 数据

所有数字、文案和列表统一从 `mockTodayData` 读取。

必须包含：

- 今日可吃余额：`632 kcal`
- 建议范围：`1200-1600`
- 已摄入：`868 kcal`
- 基础消耗：`1268 kcal`
- 运动：`210 kcal`
- 目标缺口：`-190 kcal`
- 目标摄入：`1400 kcal`
- 早餐：已记录，`286 kcal`
- 午餐：已记录，`412 kcal`
- 晚餐：已记录，`170 kcal`
- 其它：少量记录，`0 kcal`
- 饮品：已记录，`0 kcal`
- 体重趋势当前体重：`72.6 kg`
- 连续达标：`6 天`
- 累计：`42 星`
- 今日免费拍照识别剩余：`0 次`（已使用 1 次）
- 当前积分余额：`8 积分`
- 三大营养素：
  - 碳水化合物：`110 / 180 g`，`61%`
  - 蛋白质：`58 / 80 g`，`73%`
  - 脂肪：`32 / 50 g`，`64%`

## 交互要求

- 点击「打卡日历」：`console.log('open calendar')`
- 点击餐段卡片：`console.log` 对应餐段
- 点击「运动记录」：`console.log('exercise record')`
- 点击「去打卡」：`console.log('weight checkin')`
- 点击「AI拍照识别」或「去记录」：`console.log('photo recognition')`
- 所有按钮需要有可点击态
- 页面可纵向滚动
- 底部 Tab 固定
- 处理 iPhone 安全区，不被刘海或 Home Indicator 遮挡

## 视觉要求

- 温和、清爽、健康、轻量
- 不要医疗感，不要硬核健身房风格
- 主色绿色，辅色浅蓝、暖黄色、浅橙
- 背景为浅绿色到白色的柔和渐变
- 卡片白色或浅绿白，大圆角、轻阴影、充足留白
- 核心数字最大，模块标题次之，说明文字弱化
- 不使用外部图片 URL
- 插画用图标、渐变、emoji 或简单形状代替
- 中文 UI 文案必须可读，不挤压，不溢出

## 实现顺序

1. 搭好 `TodayScreen` 页面骨架：SafeArea + ScrollView + fixed BottomTabBar。
2. 创建 `mockTodayData`。
3. 实现首屏：Header、CalorieBalanceCard、MetricRow、MealQuickCards。
4. 实现中段：ExerciseCard、StarRewardCard、WeightTrendCard、TipCard。
5. 实现下拉内容：MacroSummaryCard、MealTimelineCard、QuickActionCards、DailyAdviceCard。
6. 实现交互日志和点击态。
7. 做 iPhone 15 / iPhone 16 尺寸视觉检查。
8. 清理样式，避免大量内联 style。

## 验收标准

- 首屏能看到今日可吃余额、核心指标、餐段快捷记录。
- 下拉后能看到三大营养素、饮食明细、体重打卡、AI 拍照识别、今日总结。
- 底部导航固定，今日高亮。
- 整体视觉与参考图一致：柔和绿色健康风格、圆角卡片、轻阴影、清晰数字层级。
- 不出现医疗诊断、极端减脂、焦虑化表达。
- 拍照识别入口展示每日免费次数和积分余额（mock 数据）。
- 可直接运行。

## Codex 完成后请提供

- 改动文件列表
- 运行命令
- iPhone 15 / iPhone 16 截图或录屏
- 简短说明哪些模块已完成
- 是否有未完成项或需要 Codex 审查的问题
