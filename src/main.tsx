import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Apple,
  BarChart3,
  Bike,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudSun,
  CupSoda,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Home,
  Info,
  Leaf,
  LineChart,
  ListChecks,
  Moon,
  Plus,
  Salad,
  Settings,
  Sparkles,
  Star,
  SunMedium,
  Target,
  Trophy,
  Utensils,
  Weight,
} from "lucide-react";
import "./styles.css";

type Tab = "today" | "records" | "trends" | "plan" | "me";
type MealSlot = "早餐" | "午餐" | "晚餐" | "其它" | "饮品";
type MealStatus = "recorded" | "skipped" | "empty";
type ExerciseIcon = "walk" | "bike" | "strength";
type TrendRange = 15 | 30 | 90;

type Meal = {
  slot: MealSlot;
  title: string;
  status: MealStatus;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  source: "photo" | "text" | "manual" | "fasting";
};

type Exercise = {
  name: string;
  minutes: number;
  calories: number;
  icon: ExerciseIcon;
};

type ExerciseTemplate = {
  name: string;
  met: number;
  icon: ExerciseIcon;
};

type WeightPoint = {
  date: string;
  day: string;
  weight: number;
  context: "早起空腹" | "晚上" | "饭后";
};

type DayMealSummary = {
  slot: MealSlot;
  title: string;
  calories: number;
  status: MealStatus;
};

type DayExerciseSummary = {
  name: string;
  minutes: number;
  calories: number;
};

type DailyRecord = {
  date: string;
  dayLabel: string;
  dayNumber: number;
  weekday: string;
  intake: number;
  exercise: number;
  deficit: number;
  targetDeficit: number;
  recordedSlots: number;
  star: boolean;
  weight?: number;
  meals: DayMealSummary[];
  exercises: DayExerciseSummary[];
};

const mealSlots: MealSlot[] = ["早餐", "午餐", "晚餐", "其它", "饮品"];
const todayKey = "2026-05-24";
const todayDate = new Date(`${todayKey}T00:00:00`);

const exerciseTemplates: ExerciseTemplate[] = [
  { name: "快走", met: 4.3, icon: "walk" },
  { name: "跑步", met: 8.3, icon: "walk" },
  { name: "骑行", met: 6.8, icon: "bike" },
  { name: "力量训练", met: 5.0, icon: "strength" },
  { name: "HIIT", met: 8.0, icon: "strength" },
  { name: "跳绳", met: 11.0, icon: "strength" },
  { name: "游泳", met: 7.0, icon: "strength" },
  { name: "瑜伽", met: 3.0, icon: "strength" },
];

const initialMeals: Meal[] = [
  {
    slot: "早餐",
    title: "鸡蛋、无糖拿铁、全麦吐司",
    status: "recorded",
    calories: 390,
    carbs: 38,
    protein: 24,
    fat: 15,
    source: "text",
  },
  {
    slot: "午餐",
    title: "米饭、番茄炒蛋、牛肉青菜",
    status: "recorded",
    calories: 680,
    carbs: 82,
    protein: 42,
    fat: 21,
    source: "photo",
  },
  {
    slot: "晚餐",
    title: "待记录",
    status: "empty",
    calories: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
    source: "manual",
  },
  {
    slot: "其它",
    title: "轻断食",
    status: "skipped",
    calories: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
    source: "fasting",
  },
  {
    slot: "饮品",
    title: "美式咖啡",
    status: "recorded",
    calories: 12,
    carbs: 2,
    protein: 1,
    fat: 0,
    source: "manual",
  },
];

const initialExercises: Exercise[] = [
  { name: "快走", minutes: 45, calories: 210, icon: "walk" },
  { name: "力量训练", minutes: 35, calories: 165, icon: "strength" },
];

const weights: WeightPoint[] = [
  { date: "2026-05-10", day: "05/10", weight: 78.6, context: "早起空腹" },
  { date: "2026-05-12", day: "05/12", weight: 78.2, context: "早起空腹" },
  { date: "2026-05-14", day: "05/14", weight: 78.4, context: "晚上" },
  { date: "2026-05-16", day: "05/16", weight: 77.9, context: "早起空腹" },
  { date: "2026-05-18", day: "05/18", weight: 77.7, context: "早起空腹" },
  { date: "2026-05-21", day: "05/21", weight: 77.5, context: "早起空腹" },
  { date: "2026-05-24", day: "05/24", weight: 77.2, context: "早起空腹" },
];

const sampleRecords: DailyRecord[] = [
  {
    date: "2026-05-10",
    dayLabel: "05/10",
    dayNumber: 10,
    weekday: "日",
    intake: 1710,
    exercise: 320,
    deficit: 610,
    targetDeficit: 550,
    recordedSlots: 4,
    star: true,
    weight: 78.6,
    meals: [
      { slot: "早餐", title: "豆浆、鸡蛋、包子", calories: 420, status: "recorded" },
      { slot: "午餐", title: "鸡腿饭半份米饭", calories: 760, status: "recorded" },
      { slot: "饮品", title: "无糖茶", calories: 0, status: "recorded" },
    ],
    exercises: [{ name: "快走", minutes: 50, calories: 240 }],
  },
  {
    date: "2026-05-11",
    dayLabel: "05/11",
    dayNumber: 11,
    weekday: "一",
    intake: 2050,
    exercise: 120,
    deficit: 340,
    targetDeficit: 550,
    recordedSlots: 3,
    star: false,
    meals: [
      { slot: "午餐", title: "牛肉面", calories: 820, status: "recorded" },
      { slot: "晚餐", title: "外卖轻食", calories: 620, status: "recorded" },
      { slot: "饮品", title: "拿铁", calories: 180, status: "recorded" },
    ],
    exercises: [{ name: "通勤步行", minutes: 28, calories: 120 }],
  },
  {
    date: "2026-05-12",
    dayLabel: "05/12",
    dayNumber: 12,
    weekday: "二",
    intake: 1820,
    exercise: 260,
    deficit: 560,
    targetDeficit: 550,
    recordedSlots: 4,
    star: true,
    weight: 78.2,
    meals: [
      { slot: "早餐", title: "酸奶、香蕉", calories: 310, status: "recorded" },
      { slot: "午餐", title: "番茄鸡蛋饭", calories: 690, status: "recorded" },
      { slot: "晚餐", title: "鱼虾、青菜", calories: 570, status: "recorded" },
    ],
    exercises: [{ name: "骑行", minutes: 35, calories: 260 }],
  },
  {
    date: "2026-05-13",
    dayLabel: "05/13",
    dayNumber: 13,
    weekday: "三",
    intake: 1650,
    exercise: 180,
    deficit: 690,
    targetDeficit: 550,
    recordedSlots: 4,
    star: true,
    meals: [
      { slot: "早餐", title: "轻断食", calories: 0, status: "skipped" },
      { slot: "午餐", title: "鸡胸沙拉", calories: 520, status: "recorded" },
      { slot: "晚餐", title: "杂粮饭、牛肉", calories: 760, status: "recorded" },
    ],
    exercises: [{ name: "力量训练", minutes: 40, calories: 180 }],
  },
  {
    date: "2026-05-14",
    dayLabel: "05/14",
    dayNumber: 14,
    weekday: "四",
    intake: 2240,
    exercise: 90,
    deficit: 180,
    targetDeficit: 550,
    recordedSlots: 2,
    star: false,
    weight: 78.4,
    meals: [
      { slot: "午餐", title: "麻辣烫", calories: 980, status: "recorded" },
      { slot: "饮品", title: "奶茶少糖", calories: 360, status: "recorded" },
    ],
    exercises: [{ name: "散步", minutes: 20, calories: 90 }],
  },
  {
    date: "2026-05-15",
    dayLabel: "05/15",
    dayNumber: 15,
    weekday: "五",
    intake: 1880,
    exercise: 310,
    deficit: 580,
    targetDeficit: 550,
    recordedSlots: 4,
    star: true,
    meals: [
      { slot: "早餐", title: "鸡蛋、咖啡", calories: 260, status: "recorded" },
      { slot: "午餐", title: "烤鱼、米饭", calories: 860, status: "recorded" },
      { slot: "晚餐", title: "豆腐、青菜", calories: 520, status: "recorded" },
    ],
    exercises: [{ name: "快走", minutes: 60, calories: 310 }],
  },
];

function calculateBmr(sex: "male" | "female", weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

function movingAverage(points: WeightPoint[], windowSize = 3) {
  return points.map((point, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = points.slice(start, index + 1);
    const total = slice.reduce((sum, item) => sum + item.weight, 0);
    return { ...point, weight: Number((total / slice.length).toFixed(2)) };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateSeries(days: number) {
  return Array.from({ length: days }, (_, index) => addDays(todayDate, index - days + 1)).map((date) => ({
    date: formatDateKey(date),
    label: formatDayLabel(date),
    dayNumber: date.getDate(),
    weekday: "日一二三四五六"[date.getDay()],
  }));
}

function achievementRate(deficit: number, targetDeficit: number) {
  return Math.round((deficit / targetDeficit) * 100);
}

function buildTodayRecord(
  meals: Meal[],
  exercises: Exercise[],
  totals: ReturnType<typeof getTotalsType>,
  plan: ReturnType<typeof getPlanType>,
): DailyRecord {
  return {
    date: todayKey,
    dayLabel: "05/24",
    dayNumber: 24,
    weekday: "日",
    intake: totals.intake,
    exercise: totals.exercise,
    deficit: totals.actualDeficit,
    targetDeficit: plan.targetDeficit,
    recordedSlots: totals.recordedSlots,
    star: totals.starEarned,
    weight: 77.2,
    meals: meals.map((meal) => ({
      slot: meal.slot,
      title: meal.title,
      calories: meal.calories,
      status: meal.status,
    })),
    exercises: exercises.map((exercise) => ({
      name: exercise.name,
      minutes: exercise.minutes,
      calories: exercise.calories,
    })),
  };
}

function buildRecordCalendar(
  meals: Meal[],
  exercises: Exercise[],
  totals: ReturnType<typeof getTotalsType>,
  plan: ReturnType<typeof getPlanType>,
) {
  const seededRecords = new Map(sampleRecords.map((record) => [record.date, record]));
  seededRecords.set(todayKey, buildTodayRecord(meals, exercises, totals, plan));

  return getDateSeries(15).map((dateInfo, index) => {
    const existing = seededRecords.get(dateInfo.date);
    if (existing) return existing;

    const intake = [1760, 1910, 1680, 2140, 1860, 1720, 2020, 1810, 1950][index % 9];
    const exercise = [180, 260, 80, 330, 210, 160, 280, 120, 240][index % 9];
    const deficit = Math.max(120, plan.tdee + exercise - intake);
    return {
      date: dateInfo.date,
      dayLabel: dateInfo.label,
      dayNumber: dateInfo.dayNumber,
      weekday: dateInfo.weekday,
      intake,
      exercise,
      deficit,
      targetDeficit: plan.targetDeficit,
      recordedSlots: index % 4 === 0 ? 2 : 4,
      star: deficit >= plan.targetDeficit * 0.8,
      weight: weights.find((item) => item.date === dateInfo.date)?.weight,
      meals: [
        { slot: "早餐", title: index % 3 === 0 ? "轻断食" : "鸡蛋、咖啡", calories: index % 3 === 0 ? 0 : 280, status: index % 3 === 0 ? "skipped" : "recorded" },
        { slot: "午餐", title: "用户记录餐食", calories: Math.round(intake * 0.45), status: "recorded" },
        { slot: "晚餐", title: "用户记录餐食", calories: Math.round(intake * 0.4), status: "recorded" },
      ] as DayMealSummary[],
      exercises: [{ name: index % 2 === 0 ? "快走" : "力量训练", minutes: index % 2 === 0 ? 40 : 35, calories: exercise }],
    };
  });
}

function buildDeficitSeries(rangeDays: TrendRange, latestDeficit: number, plan: ReturnType<typeof getPlanType>) {
  return Array.from({ length: rangeDays }, (_, index) => {
    if (index === rangeDays - 1) return latestDeficit;
    const wave = Math.sin(index * 0.85) * 120;
    const weekendLift = index % 7 === 5 || index % 7 === 6 ? -180 : 60;
    return Math.max(80, Math.round(plan.targetDeficit + wave + weekendLift));
  });
}

function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [isVip, setIsVip] = useState(false);
  const [photoUsed, setPhotoUsed] = useState(1);
  const [returnRatio, setReturnRatio] = useState(70);
  const [currentWeight, setCurrentWeight] = useState(77.2);
  const [targetWeight, setTargetWeight] = useState(70);
  const [weeklyLoss, setWeeklyLoss] = useState(0.5);
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const [newCalories, setNewCalories] = useState(520);
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>("晚餐");
  const [selectedExercise, setSelectedExercise] = useState(exerciseTemplates[0].name);
  const [exerciseMinutes, setExerciseMinutes] = useState(30);

  const plan = useMemo(() => {
    const bmr = calculateBmr("male", currentWeight, 175, 31);
    const tdee = Math.round(bmr * 1.45);
    const targetDeficit = Math.round((weeklyLoss * 7700) / 7);
    const plannedExercise = 220;
    const recommendedIntake = Math.round(tdee + plannedExercise * (returnRatio / 100) - targetDeficit);
    return { bmr, tdee, targetDeficit, plannedExercise, recommendedIntake };
  }, [currentWeight, returnRatio, weeklyLoss]);

  const totals = useMemo(() => {
    const intake = meals.reduce((sum, meal) => sum + meal.calories, 0);
    const carbs = meals.reduce((sum, meal) => sum + meal.carbs, 0);
    const protein = meals.reduce((sum, meal) => sum + meal.protein, 0);
    const fat = meals.reduce((sum, meal) => sum + meal.fat, 0);
    const exercise = exercises.reduce((sum, item) => sum + item.calories, 0);
    const effectiveExercise = Math.round(exercise * (returnRatio / 100));
    const actualDeficit = Math.round(plan.tdee + exercise - intake);
    const remaining = Math.round(plan.tdee + effectiveExercise - plan.targetDeficit - intake);
    const recordedSlots = meals.filter((meal) => meal.status !== "empty").length;
    const recordComplete = recordedSlots >= 2;
    const starEarned = recordComplete && actualDeficit >= plan.targetDeficit * 0.8;
    const rate = achievementRate(actualDeficit, plan.targetDeficit);
    return {
      intake,
      carbs,
      protein,
      fat,
      exercise,
      effectiveExercise,
      actualDeficit,
      remaining,
      recordedSlots,
      recordComplete,
      starEarned,
      achievementRate: rate,
    };
  }, [exercises, meals, plan, returnRatio]);

  const photoLimit = isVip ? 10 : 2;
  const progress = clamp((totals.actualDeficit / plan.targetDeficit) * 100, 0, 140);
  const calendarRecords = useMemo(() => buildRecordCalendar(meals, exercises, totals, plan), [exercises, meals, plan, totals]);
  const selectedExerciseTemplate = exerciseTemplates.find((item) => item.name === selectedExercise) ?? exerciseTemplates[0];
  const exerciseEstimate = Math.round(selectedExerciseTemplate.met * currentWeight * (exerciseMinutes / 60));

  function addMeal() {
    setMeals((current) =>
      current.map((meal) => {
        if (meal.slot !== selectedSlot) return meal;
        return {
          ...meal,
          title: selectedSlot === "饮品" ? "用户输入饮品" : "用户输入餐食",
          status: "recorded",
          calories: newCalories,
          carbs: Math.round((newCalories * 0.46) / 4),
          protein: Math.round((newCalories * 0.25) / 4),
          fat: Math.round((newCalories * 0.29) / 9),
          source: "manual",
        };
      }),
    );
  }

  function usePhotoEstimate() {
    if (photoUsed >= photoLimit) return;
    setPhotoUsed((value) => value + 1);
    setSelectedSlot("晚餐");
    setNewCalories(560);
  }

  function addExercise() {
    const template = exerciseTemplates.find((item) => item.name === selectedExercise) ?? exerciseTemplates[0];
    const calories = Math.round(template.met * currentWeight * (exerciseMinutes / 60));
    setExercises((current) => [
      ...current,
      { name: template.name, minutes: exerciseMinutes, calories, icon: template.icon },
    ]);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark">
            <Flame size={22} />
          </div>
          <div>
            <strong>轻缺口</strong>
            <span>工作名</span>
          </div>
        </div>
        <nav className="nav-list">
          <NavButton active={tab === "today"} icon={<Home size={19} />} label="今日" onClick={() => setTab("today")} />
          <NavButton active={tab === "records"} icon={<ListChecks size={19} />} label="记录" onClick={() => setTab("records")} />
          <NavButton active={tab === "trends"} icon={<LineChart size={19} />} label="趋势" onClick={() => setTab("trends")} />
          <NavButton active={tab === "plan"} icon={<BarChart3 size={19} />} label="计划" onClick={() => setTab("plan")} />
          <NavButton active={tab === "me"} icon={<Settings size={19} />} label="我的" onClick={() => setTab("me")} />
        </nav>
      </aside>

      <main className="main-area">
        {tab !== "today" && (
          <header className="topbar">
            <div>
              <p className="eyebrow">5月24日 周日</p>
              <h1>{tabTitle(tab)}</h1>
            </div>
            <div className="status-pill">
              <Star size={18} fill={totals.starEarned ? "#f6bd4b" : "none"} />
              <span>{totals.starEarned ? "今日已达标" : "还差一点"}</span>
            </div>
          </header>
        )}

        {tab === "today" && (
          <TodayView
            meals={meals}
            exercises={exercises}
            totals={totals}
            plan={plan}
            progress={progress}
            photoLimit={photoLimit}
            photoUsed={photoUsed}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
            newCalories={newCalories}
            setNewCalories={setNewCalories}
            addMeal={addMeal}
            usePhotoEstimate={usePhotoEstimate}
            addExercise={addExercise}
            selectedExercise={selectedExercise}
            setSelectedExercise={setSelectedExercise}
            exerciseMinutes={exerciseMinutes}
            setExerciseMinutes={setExerciseMinutes}
            exerciseEstimate={exerciseEstimate}
          />
        )}

        {tab === "records" && <RecordsView records={calendarRecords} todayRecord={calendarRecords[calendarRecords.length - 1]} />}
        {tab === "trends" && <TrendsView targetWeight={targetWeight} totals={totals} plan={plan} />}
        {tab === "plan" && (
          <PlanView
            currentWeight={currentWeight}
            targetWeight={targetWeight}
            weeklyLoss={weeklyLoss}
            plan={plan}
            setCurrentWeight={setCurrentWeight}
            setTargetWeight={setTargetWeight}
            setWeeklyLoss={setWeeklyLoss}
          />
        )}
        {tab === "me" && (
          <MeView
            isVip={isVip}
            setIsVip={setIsVip}
            photoLimit={photoLimit}
            photoUsed={photoUsed}
            returnRatio={returnRatio}
            setReturnRatio={setReturnRatio}
          />
        )}
      </main>
    </div>
  );
}

function tabTitle(tab: Tab) {
  const titles: Record<Tab, string> = {
    today: "今日面板",
    records: "记录",
    trends: "趋势",
    plan: "计划",
    me: "我的",
  };
  return titles[tab];
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "blue" | "amber" | "coral" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TodayView({
  meals,
  exercises,
  totals,
  plan,
  progress,
  photoLimit,
  photoUsed,
  selectedSlot,
  setSelectedSlot,
  newCalories,
  setNewCalories,
  addMeal,
  usePhotoEstimate,
  addExercise,
  selectedExercise,
  setSelectedExercise,
  exerciseMinutes,
  setExerciseMinutes,
  exerciseEstimate,
}: {
  meals: Meal[];
  exercises: Exercise[];
  totals: ReturnType<typeof getTotalsType>;
  plan: ReturnType<typeof getPlanType>;
  progress: number;
  photoLimit: number;
  photoUsed: number;
  selectedSlot: MealSlot;
  setSelectedSlot: (slot: MealSlot) => void;
  newCalories: number;
  setNewCalories: (value: number) => void;
  addMeal: () => void;
  usePhotoEstimate: () => void;
  addExercise: () => void;
  selectedExercise: string;
  setSelectedExercise: (name: string) => void;
  exerciseMinutes: number;
  setExerciseMinutes: (value: number) => void;
  exerciseEstimate: number;
}) {
  const calorieRingProgress = clamp((totals.remaining / Math.max(plan.recommendedIntake, 1)) * 100, 0, 100);
  const mealSummary = meals.map((meal) => ({
    ...meal,
    label: meal.status === "recorded" ? "已记录" : meal.status === "skipped" ? "少量记录" : "待记录",
  }));

  return (
    <div className="today-home">
      <div className="home-landscape" aria-hidden="true">
        <span className="hill hill-one" />
        <span className="hill hill-two" />
        <span className="sun-glow" />
        <span className="leaf-cluster" />
      </div>

      <header className="home-header">
        <div>
          <h1>今日</h1>
          <button className="date-button" type="button">
            5月24日 星期日
            <ChevronDown size={18} />
          </button>
        </div>
        <button className="checkin-button" type="button">
          <Leaf size={18} />
          打卡日历
        </button>
      </header>

      <section className="calorie-card">
        <div className="calorie-ring-large" aria-label="今日可吃余额">
          <svg viewBox="0 0 160 160" role="img">
            <circle cx="80" cy="80" r="68" className="ring-base" />
            <circle
              cx="80"
              cy="80"
              r="68"
              className="ring-progress"
              style={{ strokeDashoffset: 427 - (427 * calorieRingProgress) / 100 }}
            />
          </svg>
          <div>
            <span>
              今日可吃余额 <Info size={15} />
            </span>
            <strong>{Math.max(totals.remaining, 0)}</strong>
            <b>kcal</b>
            <small>建议范围 {Math.max(plan.recommendedIntake - 200, 0)}-{plan.recommendedIntake + 200}</small>
          </div>
        </div>
        <div className="food-scene">
          <div className="speech-bubble">做得不错，保持住哦！</div>
          <div className="glass">
            <CupSoda size={44} />
          </div>
          <div className="salad-bowl">
            <Salad size={72} />
          </div>
        </div>
        <div className="home-stat-strip">
          <HomeStat icon={<Utensils size={20} />} label="已摄入" value={totals.intake} tone="green" />
          <HomeStat icon={<Flame size={20} />} label="基础消耗" value={plan.tdee} tone="blue" />
          <HomeStat icon={<Footprints size={20} />} label="运动" value={totals.exercise} tone="cyan" />
          <HomeStat icon={<Target size={20} />} label="目标缺口" value={-plan.targetDeficit} tone="amber" />
          <HomeStat icon={<Trophy size={20} />} label="目标摄入" value={plan.recommendedIntake} tone="purple" />
        </div>
      </section>

      <section className="meal-tile-row" aria-label="餐段记录">
        {mealSummary.map((meal) => (
          <TodayMealTile key={meal.slot} meal={meal} />
        ))}
      </section>

      <section className="home-card-grid">
        <article className="home-card exercise-home-card">
          <div className="home-card-header">
            <h2>运动记录</h2>
            <button className="link-button" type="button">
              {totals.exercise} kcal
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="exercise-home-body">
            <div className="walker-badge">
              <Footprints size={52} />
            </div>
            <div>
              <p>今日运动 <strong>{exercises.reduce((sum, item) => sum + item.minutes, 0)}</strong> 分钟</p>
              <p>消耗 <strong>{totals.exercise}</strong> kcal</p>
            </div>
          </div>
          <div className={totals.starEarned ? "success-note" : "success-note pending"}>
            <CheckCircle2 size={20} />
            <div>
              <strong>{totals.starEarned ? "今日目标已达成" : "继续补足记录"}</strong>
              <span>{totals.starEarned ? "再接再厉，越来越棒！" : "至少记录两顿饭后再结算"}</span>
            </div>
          </div>
        </article>

        <article className="home-card star-home-card">
          <div className="bookmark-star">
            <Star size={22} fill="#fff" />
          </div>
          <div>
            <h2>今日之星</h2>
            <div className="big-star">
              <Star size={70} fill="#ffc83d" />
            </div>
          </div>
          <div className="star-stats">
            <p>连续达标 <strong>6</strong> 天</p>
            <p>累计 <strong>42</strong> 星</p>
          </div>
        </article>

        <article className="home-card weight-home-card">
          <div className="home-card-header">
            <h2>体重趋势</h2>
            <button className="link-button" type="button">
              77.2 kg
              <ChevronRight size={18} />
            </button>
          </div>
          <HomeWeightSparkline />
          <p className="weight-change">近7天 ↓ 0.6 kg</p>
        </article>

        <article className="warm-tip-card">
          <div>
            <strong>温馨提示</strong>
            <span>今日摄入略低于建议范围，注意适当加餐，保证能量，照顾好自己哦~</span>
          </div>
          <div className="heart-hand">♡</div>
        </article>
      </section>

      <section className="home-action-panel">
        <div className="quick-action-card">
          <PanelHeader icon={<Plus size={20} />} title="快速记录" meta={`${photoUsed}/${photoLimit} 拍照`} />
          <div className="segmented" role="group" aria-label="餐段">
            {mealSlots.map((slot) => (
              <button
                key={slot}
                className={selectedSlot === slot ? "selected" : ""}
                onClick={() => setSelectedSlot(slot)}
                type="button"
              >
                {slot}
              </button>
            ))}
          </div>
          <label className="input-row">
            <span>热量</span>
            <input
              min={0}
              max={1800}
              type="number"
              value={newCalories}
              onChange={(event) => setNewCalories(Number(event.target.value))}
            />
            <small>kcal</small>
          </label>
          <div className="button-row">
            <button className="primary-button" onClick={addMeal} type="button">
              <Plus size={18} />
              记录
            </button>
            <button className="icon-button text-button" disabled={photoUsed >= photoLimit} onClick={usePhotoEstimate} type="button">
              <Camera size={18} />
              拍照估算
            </button>
          </div>
        </div>

        <div className="quick-action-card">
          <PanelHeader icon={<Activity size={20} />} title="添加运动" meta={`${totals.exercise} kcal`} />
          <div className="exercise-form compact">
            <label className="select-row">
              <span>运动类型</span>
              <select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
                {exerciseTemplates.map((template) => (
                  <option key={template.name} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="input-row">
              <span>时长</span>
              <input
                min={1}
                max={240}
                type="number"
                value={exerciseMinutes}
                onChange={(event) => setExerciseMinutes(Number(event.target.value))}
              />
              <small>分钟</small>
            </label>
            <div className="estimate-note">
              预估 {exerciseEstimate} kcal
            </div>
          </div>
          <button className="secondary-button" onClick={addExercise} type="button">
            <Plus size={18} />
            添加运动
          </button>
        </div>
      </section>
    </div>
  );
}

function HomeStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "green" | "blue" | "cyan" | "amber" | "purple";
}) {
  return (
    <div className={`home-stat ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
      <small>kcal</small>
    </div>
  );
}

function TodayMealTile({ meal }: { meal: Meal & { label: string } }) {
  return (
    <button className="meal-tile" type="button">
      <div className={`meal-status ${meal.status === "recorded" || meal.status === "skipped" ? "done" : "waiting"}`}>
        {meal.status === "recorded" || meal.status === "skipped" ? <CheckCircle2 size={19} /> : <span />}
      </div>
      <div className={`meal-icon meal-${meal.slot}`}>
        {meal.slot === "早餐" && <CloudSun size={34} />}
        {meal.slot === "午餐" && <Salad size={34} />}
        {meal.slot === "晚餐" && <Moon size={34} />}
        {meal.slot === "其它" && <Utensils size={34} />}
        {meal.slot === "饮品" && <CupSoda size={34} />}
      </div>
      <strong>{meal.slot}</strong>
      <span>{meal.label}</span>
      <small>{meal.calories} kcal</small>
    </button>
  );
}

function HomeWeightSparkline() {
  const points = [
    { label: "5/18", value: 77.8 },
    { label: "5/19", value: 77.7 },
    { label: "5/20", value: 77.5 },
    { label: "5/21", value: 77.4 },
    { label: "5/22", value: 77.3 },
    { label: "5/23", value: 77.2 },
    { label: "5/24", value: 77.2 },
  ];
  const min = 77.0;
  const max = 78.0;
  const width = 320;
  const height = 126;
  const xFor = (index: number) => 20 + (index / (points.length - 1)) * (width - 40);
  const yFor = (value: number) => height - 34 - ((value - min) / (max - min)) * (height - 58);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point.value)}`).join(" ");

  return (
    <svg className="home-weight-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近7天体重趋势">
      <path d={`${path} L ${xFor(points.length - 1)} ${height - 28} L ${xFor(0)} ${height - 28} Z`} className="spark-area" />
      <path d={path} className="spark-line" />
      {points.map((point, index) => (
        <g key={point.label}>
          <circle cx={xFor(index)} cy={yFor(point.value)} r="4" className="spark-dot" />
          <text x={xFor(index)} y={height - 8} textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MealCard({ meal }: { meal: Meal }) {
  const statusText = meal.status === "recorded" ? `${meal.calories} kcal` : meal.status === "skipped" ? "已跳过" : "待记录";
  return (
    <article className={`meal-card ${meal.status}`}>
      <div>
        <span>{meal.slot}</span>
        <strong>{statusText}</strong>
      </div>
      <p>{meal.title}</p>
      {meal.status === "recorded" && (
        <small>
          碳 {meal.carbs}g · 蛋 {meal.protein}g · 脂 {meal.fat}g
        </small>
      )}
    </article>
  );
}

function PanelHeader({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="panel-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function RecordsView({ records, todayRecord }: { records: DailyRecord[]; todayRecord: DailyRecord }) {
  const [selectedDate, setSelectedDate] = useState(todayRecord.date);
  const selectedRecord = records.find((record) => record.date === selectedDate) ?? todayRecord;
  const leadingEmptyCells = new Date(`${records[0].date}T00:00:00`).getDay();

  return (
    <div className="stack">
      <section className="summary-band">
        <Metric label="今日摄入" value={`${todayRecord.intake} kcal`} tone="coral" />
        <Metric label="今日运动" value={`${todayRecord.exercise} kcal`} tone="green" />
        <Metric label="缺口" value={`${todayRecord.deficit} / ${todayRecord.targetDeficit} kcal`} tone="blue" />
        <Metric label="达成率" value={`${achievementRate(todayRecord.deficit, todayRecord.targetDeficit)}%`} tone="amber" />
      </section>
      <section className="panel wide">
        <PanelHeader icon={<CalendarDays size={20} />} title="日历记录" meta="最近15天" />
        <div className="calendar-weekdays" aria-hidden="true">
          {["日", "一", "二", "三", "四", "五", "六"].map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="record-calendar">
          {Array.from({ length: leadingEmptyCells }, (_, index) => (
            <div className="calendar-empty" key={`empty-${index}`} />
          ))}
          {records.map((record) => {
            const rate = achievementRate(record.deficit, record.targetDeficit);
            return (
              <button
                className={`calendar-day ${record.star ? "complete" : ""} ${record.date === selectedRecord.date ? "selected" : ""}`}
                key={record.date}
                onClick={() => setSelectedDate(record.date)}
                type="button"
              >
                <span className="calendar-date">{record.dayNumber}</span>
                <strong>{record.deficit} / {record.targetDeficit}</strong>
                <small>{rate}% · {record.intake} kcal</small>
                {record.star && <Star size={16} fill="#f6bd4b" />}
              </button>
            );
          })}
        </div>
      </section>
      <section className="panel wide">
        <PanelHeader icon={<ListChecks size={20} />} title={`${selectedRecord.dayLabel} 详情`} meta={selectedRecord.star ? "已获星" : "未达标"} />
        <div className="detail-summary">
          <Metric label="摄入" value={`${selectedRecord.intake} kcal`} tone="coral" />
          <Metric label="运动" value={`${selectedRecord.exercise} kcal`} tone="green" />
          <Metric label="缺口" value={`${selectedRecord.deficit} / ${selectedRecord.targetDeficit} kcal`} tone="blue" />
          <Metric label="达成率" value={`${achievementRate(selectedRecord.deficit, selectedRecord.targetDeficit)}%`} tone="amber" />
        </div>
        <div className="detail-columns">
          <div className="record-list">
            <h3>餐食</h3>
            {selectedRecord.meals.map((meal) => (
              <div className="record-row" key={`${selectedRecord.date}-${meal.slot}`}>
                <div>
                  <strong>{meal.slot}</strong>
                  <span>{meal.title}</span>
                </div>
                <b>{meal.status === "recorded" ? `${meal.calories} kcal` : meal.status === "skipped" ? "已跳过" : "待记录"}</b>
              </div>
            ))}
          </div>
          <div className="record-list">
            <h3>运动和体重</h3>
            {selectedRecord.exercises.map((exercise, index) => (
              <div className="record-row" key={`${selectedRecord.date}-${exercise.name}-${index}`}>
                <div>
                  <strong>{exercise.name}</strong>
                  <span>{exercise.minutes} 分钟</span>
                </div>
                <b>{exercise.calories} kcal</b>
              </div>
            ))}
            <div className="record-row">
              <div>
                <strong>体重</strong>
                <span>有记录时用于趋势和校准</span>
              </div>
              <b>{selectedRecord.weight ? `${selectedRecord.weight.toFixed(1)} kg` : "未记录"}</b>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TrendsView({
  targetWeight,
  totals,
  plan,
}: {
  targetWeight: number;
  totals: ReturnType<typeof getTotalsType>;
  plan: ReturnType<typeof getPlanType>;
}) {
  const [rangeDays, setRangeDays] = useState<TrendRange>(15);
  const deficitValues = buildDeficitSeries(rangeDays, totals.actualDeficit, plan);

  return (
    <div className="content-grid">
      <section className="panel wide">
        <div className="panel-header with-control">
          <div>
            <Weight size={20} />
            <h2>体重趋势</h2>
          </div>
          <RangeControl value={rangeDays} onChange={setRangeDays} />
        </div>
        <WeightChart targetWeight={targetWeight} rangeDays={rangeDays} />
      </section>
      <section className="panel">
        <PanelHeader icon={<Flame size={20} />} title="热量缺口" meta={`${rangeDays}天视图`} />
        <MiniBars values={deficitValues} target={plan.targetDeficit} />
      </section>
      <section className="panel">
        <PanelHeader icon={<Sparkles size={20} />} title="达标" />
        <div className="star-grid" aria-label="最近达标">
          {[true, false, true, true, true, false, totals.starEarned].map((active, index) => (
            <div className={active ? "star-cell active" : "star-cell"} key={index}>
              <Star size={24} fill={active ? "#f6bd4b" : "none"} />
              <span>{index + 1}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RangeControl({ value, onChange }: { value: TrendRange; onChange: (value: TrendRange) => void }) {
  const options: TrendRange[] = [15, 30, 90];
  return (
    <div className="range-control" aria-label="展示时间区间">
      {options.map((option) => (
        <button
          className={value === option ? "selected" : ""}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}天
        </button>
      ))}
    </div>
  );
}

function WeightChart({ targetWeight, rangeDays }: { targetWeight: number; rangeDays: TrendRange }) {
  const timeline = getDateSeries(rangeDays);
  const visibleWeights = weights.filter((point) => timeline.some((date) => date.date === point.date));
  const average = movingAverage(visibleWeights);
  const allValues = [...visibleWeights.map((item) => item.weight), ...average.map((item) => item.weight), targetWeight];
  const min = Math.min(...allValues) - 0.5;
  const max = Math.max(...allValues) + 0.5;
  const width = 760;
  const height = 280;
  const xForIndex = (index: number) => 48 + (index / Math.max(timeline.length - 1, 1)) * (width - 96);
  const xForDate = (date: string) => xForIndex(Math.max(0, timeline.findIndex((item) => item.date === date)));
  const yFor = (weight: number) => height - 42 - ((weight - min) / (max - min)) * (height - 86);
  const actualPath = visibleWeights.map((item, index) => `${index === 0 ? "M" : "L"} ${xForDate(item.date)} ${yFor(item.weight)}`).join(" ");
  const averagePath = average.map((item, index) => `${index === 0 ? "M" : "L"} ${xForDate(item.date)} ${yFor(item.weight)}`).join(" ");
  const targetY = yFor(targetWeight);
  const tickEvery = rangeDays <= 15 ? 1 : rangeDays <= 30 ? 3 : 10;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="体重趋势图">
        <line x1="48" x2={width - 48} y1={targetY} y2={targetY} className="chart-target" />
        <path d={actualPath} className="chart-actual" />
        <path d={averagePath} className="chart-average" />
        {visibleWeights.map((item) => (
          <g key={item.day}>
            <circle cx={xForDate(item.date)} cy={yFor(item.weight)} r="5" className="chart-dot" />
          </g>
        ))}
        {timeline.map((item, index) =>
          index % tickEvery === 0 || index === timeline.length - 1 ? (
            <text x={xForIndex(index)} y={height - 16} textAnchor="middle" key={item.date}>
              {item.label}
            </text>
          ) : null,
        )}
        <text x={width - 48} y={targetY - 8} textAnchor="end" className="target-label">
          目标 {targetWeight}kg
        </text>
      </svg>
      <div className="legend">
        <span><i className="dot actual" />记录体重</span>
        <span><i className="dot average" />移动平均</span>
        <span><i className="dot target" />计划线</span>
      </div>
    </div>
  );
}

function MiniBars({ values, target }: { values: number[]; target: number }) {
  const max = Math.max(...values, target);
  const tickEvery = values.length <= 15 ? 1 : values.length <= 30 ? 5 : 15;
  return (
    <div className="mini-bars">
      {values.map((value, index) => (
        <div className="bar-column" key={`${value}-${index}`}>
          <div className={value >= target * 0.8 ? "bar good" : "bar"} style={{ height: `${(value / max) * 100}%` }} />
          <span>{index % tickEvery === 0 || index === values.length - 1 ? index + 1 : ""}</span>
        </div>
      ))}
    </div>
  );
}

function PlanView({
  currentWeight,
  targetWeight,
  weeklyLoss,
  plan,
  setCurrentWeight,
  setTargetWeight,
  setWeeklyLoss,
}: {
  currentWeight: number;
  targetWeight: number;
  weeklyLoss: number;
  plan: ReturnType<typeof getPlanType>;
  setCurrentWeight: (value: number) => void;
  setTargetWeight: (value: number) => void;
  setWeeklyLoss: (value: number) => void;
}) {
  const proteinMin = Math.round(currentWeight * 1.2);
  const proteinMax = Math.round(currentWeight * 1.6);
  const carbMin = Math.round((plan.recommendedIntake * 0.35) / 4);
  const carbMax = Math.round((plan.recommendedIntake * 0.55) / 4);
  const fatMin = Math.max(Math.round((plan.recommendedIntake * 0.2) / 9), Math.round(currentWeight * 0.6));
  const fatMax = Math.round((plan.recommendedIntake * 0.3) / 9);
  return (
    <div className="content-grid">
      <section className="panel">
        <PanelHeader icon={<Weight size={20} />} title="目标" />
        <label className="slider-row">
          <span>当前体重 {currentWeight.toFixed(1)}kg</span>
          <input min="45" max="120" step="0.1" type="range" value={currentWeight} onChange={(event) => setCurrentWeight(Number(event.target.value))} />
        </label>
        <label className="slider-row">
          <span>目标体重 {targetWeight.toFixed(1)}kg</span>
          <input min="45" max="120" step="0.1" type="range" value={targetWeight} onChange={(event) => setTargetWeight(Number(event.target.value))} />
        </label>
        <label className="slider-row">
          <span>每周目标 {weeklyLoss.toFixed(1)}kg</span>
          <input min="0.1" max="1.2" step="0.1" type="range" value={weeklyLoss} onChange={(event) => setWeeklyLoss(Number(event.target.value))} />
        </label>
      </section>

      <section className="panel">
        <PanelHeader icon={<HeartPulse size={20} />} title="计算结果" />
        <div className="calculation-list">
          <Metric label="BMR" value={`${plan.bmr} kcal`} tone="blue" />
          <Metric label="基础 TDEE" value={`${plan.tdee} kcal`} tone="green" />
          <Metric label="目标缺口" value={`${plan.targetDeficit} kcal`} tone="amber" />
          <Metric label="建议摄入" value={`${plan.recommendedIntake} kcal`} tone="coral" />
        </div>
      </section>

      <section className="panel wide">
        <PanelHeader icon={<BarChart3 size={20} />} title="辅助目标" meta="不影响星星" />
        <div className="macro-grid">
          <MacroBand name="蛋白质" value={`${proteinMin}-${proteinMax}g`} pct="1.2-1.6g/kg" />
          <MacroBand name="碳水" value={`${carbMin}-${carbMax}g`} pct="35%-55% 摄入热量" />
          <MacroBand name="脂肪" value={`${fatMin}-${fatMax}g`} pct="20%-30% 摄入热量" />
        </div>
      </section>
    </div>
  );
}

function MacroBand({ name, value, pct }: { name: string; value: string; pct: string }) {
  return (
    <div className="macro-band">
      <span>{name}</span>
      <strong>{value}</strong>
      <small>{pct}</small>
    </div>
  );
}

function MeView({
  isVip,
  setIsVip,
  photoLimit,
  photoUsed,
  returnRatio,
  setReturnRatio,
}: {
  isVip: boolean;
  setIsVip: (value: boolean) => void;
  photoLimit: number;
  photoUsed: number;
  returnRatio: number;
  setReturnRatio: (value: number) => void;
}) {
  return (
    <div className="content-grid">
      <section className="panel">
        <PanelHeader icon={<Apple size={20} />} title="账号" />
        <div className="profile-line">
          <div className="avatar">游</div>
          <div>
            <strong>游客模式</strong>
            <span>登录后可同步本机记录</span>
          </div>
        </div>
        <button className="secondary-button" type="button">
          <Apple size={18} />
          Sign in with Apple
        </button>
      </section>

      <section className="panel">
        <PanelHeader icon={<Sparkles size={20} />} title="订阅" meta={isVip ? "VIP" : "免费"} />
        <div className="subscription-box">
          <strong>¥6 / 月</strong>
          <span>拍照识别 {photoLimit} 次/天，已用 {photoUsed} 次</span>
        </div>
        <button className="primary-button" onClick={() => setIsVip(!isVip)} type="button">
          <Star size={18} />
          {isVip ? "切换到免费" : "切换到 VIP"}
        </button>
      </section>

      <section className="panel">
        <PanelHeader icon={<HeartPulse size={20} />} title="Apple 健康" />
        <div className="settings-list">
          <span>体重同步</span>
          <b>未连接</b>
          <span>主动能量</span>
          <b>未连接</b>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={<Settings size={20} />} title="高级设置" />
        <label className="slider-row">
          <span>运动返还 {returnRatio}%</span>
          <input min="50" max="100" step="5" type="range" value={returnRatio} onChange={(event) => setReturnRatio(Number(event.target.value))} />
        </label>
        <button className="danger-button" type="button">删除账号及相关数据</button>
      </section>
    </div>
  );
}

function getTotalsType() {
  return {
    intake: 0,
    carbs: 0,
    protein: 0,
    fat: 0,
    exercise: 0,
    effectiveExercise: 0,
    actualDeficit: 0,
    remaining: 0,
    recordedSlots: 0,
    recordComplete: false,
    starEarned: false,
    achievementRate: 0,
  };
}

function getPlanType() {
  return {
    bmr: 0,
    tdee: 0,
    targetDeficit: 0,
    plannedExercise: 0,
    recommendedIntake: 0,
  };
}

createRoot(document.getElementById("root")!).render(<App />);
