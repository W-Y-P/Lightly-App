export interface MealRecord {
  id: string;
  name: string;
  emoji: string;
  calories: number;
  recorded: boolean;
  time?: string;
  items?: string[];
}

export interface NutrientProgress {
  name: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}

export interface TimelineItem {
  id: string;
  time: string;
  meal: string;
  emoji: string;
  calories: number;
  items: string[];
}

export const mockTodayData = {
  // Header
  date: '5月18日 星期日',

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

  // Weight trend (5/12 - 5/18)
  currentWeight: 72.6,
  weightUnit: 'kg',
  weightTrend: [
    { date: '05/12', weight: 73.5 },
    { date: '05/13', weight: 73.3 },
    { date: '05/14', weight: 73.1 },
    { date: '05/15', weight: 73.0 },
    { date: '05/16', weight: 72.8 },
    { date: '05/17', weight: 72.7 },
    { date: '05/18', weight: 72.6 },
  ],

  // Nutrients
  nutrients: [
    { name: '碳水化合物', current: 110, target: 180, unit: 'g', color: '#4CAF50' },
    { name: '蛋白质', current: 58, target: 80, unit: 'g', color: '#2196F3' },
    { name: '脂肪', current: 32, target: 50, unit: 'g', color: '#FF9800' },
  ] as NutrientProgress[],

  // Timeline (07:30, 12:30, 15:30, 19:00)
  timeline: [
    {
      id: '1',
      time: '07:30',
      meal: '早餐',
      emoji: '🌅',
      calories: 286,
      items: ['燕麦粥', '鸡蛋', '牛奶'],
    },
    {
      id: '2',
      time: '12:30',
      meal: '午餐',
      emoji: '☀️',
      calories: 412,
      items: ['米饭', '鸡胸肉', '西兰花'],
    },
    {
      id: '3',
      time: '15:30',
      meal: '饮品',
      emoji: '🥤',
      calories: 0,
      items: ['柠檬水'],
    },
    {
      id: '4',
      time: '19:00',
      meal: '晚餐',
      emoji: '🌙',
      calories: 170,
      items: ['紫薯', '清炒时蔬', '豆腐'],
    },
  ] as TimelineItem[],

  // Tips (warm, encouraging, avoid anxiety)
  tip: '今日摄入略低于建议范围，注意适当加餐，保证能量，照顾好自己哦～',

  // Daily advice
  advice:
    '今日能量摄入低于建议，运动消耗达标，继续保持！建议晚餐适当补充优质蛋白与蔬菜，帮助身体更好恢复。',
};
