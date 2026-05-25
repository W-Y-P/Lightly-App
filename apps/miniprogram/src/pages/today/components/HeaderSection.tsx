import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './HeaderSection.scss'

export default function HeaderSection() {
  const { date } = useTodayData()

  const handleCalendar = () => {
    console.log('open calendar')
    Taro.showToast({ title: '打卡日历', icon: 'none' })
  }

  return (
    <View className='header-section'>
      <View className='header-left'>
        <Text className='header-title'>今日</Text>
        <View className='header-date-row'>
          <Text className='header-date'>{date}</Text>
          <Text className='header-chevron'>▾</Text>
        </View>
      </View>
      <View className='header-calendar-btn' onClick={handleCalendar}>
        <Text className='header-calendar-icon'>📅</Text>
        <Text className='header-calendar-text'>打卡日历</Text>
      </View>
    </View>
  )
}
