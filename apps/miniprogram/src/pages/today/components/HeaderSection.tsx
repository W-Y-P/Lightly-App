import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import { openRecord } from '../../../utils/recordIntent'
import './HeaderSection.scss'

interface HeaderSectionProps {
  onPhoto: () => void
}

export default function HeaderSection({ onPhoto }: HeaderSectionProps) {
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
      <View className='header-calendar-btn' onClick={onPhoto}>
        <View className='header-photo-icon'>
          <View className='header-photo-lens' />
        </View>
        <Text className='header-calendar-text'>AI 拍照</Text>
      </View>
    </View>
  )
}
