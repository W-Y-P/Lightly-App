import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import { openRecord } from '../../../utils/recordIntent'
import './HeaderSection.scss'

export default function HeaderSection() {
  const { date } = useTodayData()

  const handleCalendar = () => {
    openRecord({ type: 'calendar' })
  }

  return (
    <View className='header-section'>
      <View className='header-left'>
        <Text className='header-title'>今日</Text>
        <View className='header-date-row' onClick={handleCalendar}>
          <Text className='header-date'>{date}</Text>
          <Text className='header-chevron'>▾</Text>
        </View>
      </View>
      <View className='header-calendar-btn' onClick={handleCalendar}>
        <View className='header-calendar-icon'>
          <View className='header-calendar-line' />
        </View>
        <Text className='header-calendar-text'>打卡日历</Text>
      </View>
    </View>
  )
}
