import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './MealQuickCards.scss'

export default function MealQuickCards() {
  const { meals } = useTodayData()

  /** meal id → record slot mapping; 'snack' maps to 'other' per spec */
  const SLOT_MAP: Record<string, string> = {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    snack: 'other',
    drink: 'drink',
  }

  const handleMeal = (meal: { id: string; name: string }) => {
    const slot = SLOT_MAP[meal.id] ?? 'other'
    Taro.setStorageSync('pendingRecordAction', { type: 'meal', slot })
    Taro.switchTab({ url: '/pages/record/index' })
  }

  return (
    <View className='meal-cards'>
      <View className='meal-cards-row'>
        {meals.map((meal) => (
          <View
            key={meal.id}
            className={`meal-card ${meal.recorded ? 'meal-card--recorded' : ''}`}
            onClick={() => handleMeal(meal)}
          >
            <Text className='meal-card-emoji'>{meal.emoji}</Text>
            <Text className='meal-card-name'>{meal.name}</Text>
            <Text className='meal-card-kcal'>
              {meal.calories > 0 ? `${meal.calories} kcal` : '未记录'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
