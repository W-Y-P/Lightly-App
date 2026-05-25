import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './MealQuickCards.scss'

export default function MealQuickCards() {
  const { meals } = useTodayData()

  const handleMeal = (meal: { id: string; name: string }) => {
    console.log(`meal: ${meal.id}`)
    Taro.showToast({ title: `${meal.name}记录`, icon: 'none' })
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
