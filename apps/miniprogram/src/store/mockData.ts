/** mock 数据 - 与 mobile 端保持一致 */

export interface MealRecord {
  id: string
  name: string
  emoji: string
  calories: number
  recorded: boolean
  time?: string
  items?: string[]
}

export interface NutrientProgress {
  name: string
  current: number
  target: number
  unit: string
  color: string
}

export interface TimelineItem {
  id: string
  time: string
  meal: string
  emoji: string
  calories: number
  items: string[]
}

export const mockTodayData = {
  date: '5月26日 星期一',

  // Calorie balance
  remainingCalories: 632,
  suggestedRange: { min: 1200, max: 1600 },
  consumed: 868,
  baseExpenditure: 1268,
  exerciseCalories: 210,
  targetGap: -190,
  targetIntake: 1400,

  // Meals
  meals: [
    { id: 'breakfast', name: '早餐', emoji: '🌅', calories: 286, recorded: true, time: '07:30' },
    { id: 'lunch', name: '午餐', emoji: '☀️', calories: 412, recorded: true, time: '12:30' },
    { id: 'dinner', name: '晚餐', emoji: '🌙', calories: 170, recorded: true, time: '19:00' },
    { id: 'snack', name: '其它', emoji: '🍪', calories: 0, recorded: false },
    { id: 'drink', name: '饮品', emoji: '🥤', calories: 0, recorded: true },
  ] as MealRecord[],

  // Exercise
  exerciseCaloriesTotal: 210,
  exerciseDuration: 35,
  exerciseType: '快走',

  // Star reward
  consecutiveDays: 6,
  totalStars: 42,

  // Weight trend
  currentWeight: 72.6,
  weightUnit: 'kg',
  weightTrend: [
    { date: '05/20', weight: 73.2 },
    { date: '05/21', weight: 73.0 },
    { date: '05/22', weight: 72.9 },
    { date: '05/23', weight: 72.8 },
    { date: '05/24', weight: 72.7 },
    { date: '05/25', weight: 72.6 },
    { date: '05/26', weight: 72.6 },
  ],

  // Nutrients
  nutrients: [
    { name: '碳水化合物', current: 110, target: 180, unit: 'g', color: '#4CAF50' },
    { name: '蛋白质', current: 58, target: 80, unit: 'g', color: '#2196F3' },
    { name: '脂肪', current: 32, target: 50, unit: 'g', color: '#FF9800' },
  ] as NutrientProgress[],

  // Timeline
  timeline: [
    { id: '1', time: '07:30', meal: '早餐', emoji: '🌅', calories: 286, items: ['燕麦粥', '鸡蛋', '牛奶'] },
    { id: '2', time: '12:30', meal: '午餐', emoji: '☀️', calories: 412, items: ['米饭', '鸡胸肉', '西兰花'] },
    { id: '3', time: '15:30', meal: '饮品', emoji: '🥤', calories: 0, items: ['柠檬水'] },
    { id: '4', time: '19:00', meal: '晚餐', emoji: '🌙', calories: 170, items: ['紫薯', '清炒时蔬', '豆腐'] },
  ] as TimelineItem[],

  tip: '今日摄入略低于建议范围，注意适当加餐，保证能量，照顾好自己哦～',

  advice: '今日能量摄入低于建议，运动消耗达标，继续保持！建议晚餐适当补充优质蛋白与蔬菜，帮助身体更好恢复。',
}

// ── Record page mock ──
export interface CalendarDayData {
  date: string
  intake: number
  exercise: number
  deficit: number
  achieved: boolean
  star: boolean
  weight: number | null
}

export function generateMockCalendar(): CalendarDayData[] {
  const result: CalendarDayData[] = []
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const intake = 1000 + Math.round(Math.random() * 600)
    const exercise = Math.round(Math.random() * 300)
    const deficit = 1500 - intake + exercise
    const achieved = deficit >= 400 && deficit <= 700
    result.push({
      date: dateStr,
      intake,
      exercise,
      deficit,
      achieved,
      star: achieved && Math.random() > 0.3,
      weight: 73.5 - i * 0.08 + (Math.random() - 0.5) * 0.3,
    })
  }
  return result
}
