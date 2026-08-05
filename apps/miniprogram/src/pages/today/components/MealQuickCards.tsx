import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import type { MealSlot } from '../../../utils/recordIntent'
import './MealQuickCards.scss'

interface MealQuickCardsProps {
  onSelect: (slot: MealSlot) => void
}

export default function MealQuickCards({ onSelect }: MealQuickCardsProps) {
  const { meals } = useTodayData()

  /** meal id → record slot mapping; 'snack' maps to 'other' per spec */
  const SLOT_MAP: Record<string, MealSlot> = {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    snack: 'other',
    drink: 'drink',
  }

  const handleMeal = (meal: { id: string; name: string }) => {
    const slot = SLOT_MAP[meal.id] ?? 'other'
    onSelect(slot)
  }

  return (
    <View className='meal-cards'>
      <View className='meal-cards-row'>
        {meals.map((meal) => {
          const status = meal.status ?? (meal.recorded ? 'recorded' : 'unrecorded')
          const statusText = status === 'skipped'
            ? '已跳过'
            : status === 'fasting'
              ? '轻断食'
              : status === 'recorded'
                ? meal.calories > 0 ? `${meal.calories} kcal` : '已记录'
                : '未记录'

          return (
            <View
              key={meal.id}
              className={`meal-card meal-card--${status}`}
              onClick={() => handleMeal(meal)}
            >
              <View className='meal-card-mark'>
                <Text className='meal-card-mark-text'>{meal.name.slice(0, 1)}</Text>
              </View>
              <Text className='meal-card-name'>{meal.name}</Text>
              <Text className='meal-card-kcal'>{statusText}</Text>
              <View className={`meal-card-status meal-card-status--${status}`} />
            </View>
          )
        })}
      </View>
    </View>
  )
}
