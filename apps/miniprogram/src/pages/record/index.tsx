import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { generateMockCalendar } from '../../store/mockData'
import type { CalendarDayData } from '../../store/mockData'
import './index.scss'

const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐', emoji: '🌅' },
  { key: 'lunch', label: '午餐', emoji: '☀️' },
  { key: 'dinner', label: '晚餐', emoji: '🌙' },
  { key: 'other', label: '其它', emoji: '🍪' },
  { key: 'drink', label: '饮品', emoji: '🥤' },
]

const EXERCISE_TYPES = ['快走', '慢跑', '游泳', '骑行', '跳绳', '瑜伽', '力量训练', 'HIIT', '舞蹈', '其它']

function weekdayShort(dateStr: string) {
  const d = new Date(dateStr)
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

function fmtDay(dateStr: string) {
  const parts = dateStr.split('-')
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`
}

export default function RecordPage() {
  const [calendarData] = useState<CalendarDayData[]>(() => generateMockCalendar())
  const [selectedIdx, setSelectedIdx] = useState(13) // today
  const selected = calendarData[selectedIdx]

  const handleRecordMeal = (slot: string) => {
    console.log(`record meal: ${slot}`)
    Taro.showToast({ title: `记录${slot}`, icon: 'none' })
  }

  const handleRecordExercise = () => {
    console.log('record exercise')
    Taro.showToast({ title: '记录运动', icon: 'none' })
  }

  const handleRecordWeight = () => {
    console.log('record weight')
    Taro.showToast({ title: '记录体重', icon: 'none' })
  }

  return (
    <View className='record-page'>
      <ScrollView className='record-scroll' scrollY enhanced showScrollbar={false}>
        {/* Calendar strip */}
        <View className='record-calendar'>
          <ScrollView className='record-calendar-scroll' scrollX enhanced showScrollbar={false}>
            <View className='record-calendar-row'>
              {calendarData.map((day, idx) => (
                <View
                  key={day.date}
                  className={`record-day ${idx === selectedIdx ? 'record-day--active' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <Text className='record-day-week'>{weekdayShort(day.date)}</Text>
                  <Text className='record-day-date'>{fmtDay(day.date)}</Text>
                  {day.star && <Text className='record-day-star'>⭐</Text>}
                  {day.achieved && !day.star && <View className='record-day-dot' />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {selected && (
          <>
            {/* Day Summary */}
            <View className='record-summary'>
              <View className='record-summary-item'>
                <Text className='record-summary-value'>{selected.intake}</Text>
                <Text className='record-summary-label'>摄入 kcal</Text>
              </View>
              <View className='record-summary-item'>
                <Text className='record-summary-value'>{selected.exercise}</Text>
                <Text className='record-summary-label'>运动 kcal</Text>
              </View>
              <View className='record-summary-item'>
                <Text className='record-summary-value' style={{ color: selected.achieved ? '#4CAF50' : '#FF9800' }}>
                  {selected.deficit}
                </Text>
                <Text className='record-summary-label'>缺口 kcal</Text>
              </View>
              {selected.weight && (
                <View className='record-summary-item'>
                  <Text className='record-summary-value'>{selected.weight.toFixed(1)}</Text>
                  <Text className='record-summary-label'>体重 kg</Text>
                </View>
              )}
            </View>

            {/* Meal record buttons */}
            <View className='record-section'>
              <Text className='record-section-title'>📝 餐饮记录</Text>
              <View className='record-meal-grid'>
                {MEAL_SLOTS.map((slot) => (
                  <View key={slot.key} className='record-meal-btn' onClick={() => handleRecordMeal(slot.label)}>
                    <Text className='record-meal-emoji'>{slot.emoji}</Text>
                    <Text className='record-meal-label'>{slot.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Exercise record */}
            <View className='record-section'>
              <Text className='record-section-title'>🏃 运动记录</Text>
              <View className='record-exercise-grid'>
                {EXERCISE_TYPES.slice(0, 5).map((type) => (
                  <View key={type} className='record-exercise-btn' onClick={handleRecordExercise}>
                    <Text className='record-exercise-label'>{type}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Weight record */}
            <View className='record-section'>
              <Text className='record-section-title'>⚖️ 体重打卡</Text>
              <View className='record-weight-card' onClick={handleRecordWeight}>
                <Text className='record-weight-value'>{selected.weight?.toFixed(1) ?? '--'} kg</Text>
                <View className='record-weight-btn'>
                  <Text className='record-weight-btn-text'>记录体重</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View className='record-bottom-spacer' />
      </ScrollView>
    </View>
  )
}
