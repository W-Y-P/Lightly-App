export interface ActivityLevelOption {
  value: number
  label: string
  description: string
  shortLabel: string
  recommended?: boolean
}

export const ACTIVITY_LEVELS: ActivityLevelOption[] = [
  { value: 1.2, label: '久坐为主', shortLabel: '久坐', description: '工作生活多为坐姿，日常走动很少' },
  { value: 1.3, label: '少量走动', shortLabel: '较少', description: '日常偶尔步行、站立或做家务' },
  { value: 1.45, label: '经常走动', shortLabel: '适中', description: '每天有较多步行或站立', recommended: true },
  { value: 1.6, label: '日常活跃', shortLabel: '活跃', description: '工作生活走动较多，含轻体力活动' },
  { value: 1.75, label: '体力活动多', shortLabel: '较多', description: '日常以体力劳动或持续走动为主' },
]

export function nearestActivityIndex(value: number): number {
  return ACTIVITY_LEVELS.reduce((nearest, option, index) => {
    const currentDistance = Math.abs(option.value - value)
    const nearestDistance = Math.abs(ACTIVITY_LEVELS[nearest].value - value)
    return currentDistance < nearestDistance ? index : nearest
  }, 0)
}
