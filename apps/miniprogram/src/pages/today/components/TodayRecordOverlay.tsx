import { useEffect, useState } from 'react'
import { Button, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  aiPhotoEstimate,
  aiTextEstimate,
  createExercise,
  createMeal,
  createWeight,
  type CreateMealBody,
  type MealItemInput,
} from '../../../api/client'
import { localDateString, type MealSlot } from '../../../utils/recordIntent'
import {
  describePhotoPickerError,
  detectPhotoMimeType,
  isPhotoPickerCancel,
  isPhotoPickerError,
  pickSinglePhoto,
  photoPickerErrorMessage,
  type PhotoSource,
} from '../../../utils/photoPicker'
import { useTodayData } from '../../../store/todayDataStore'
import './TodayRecordOverlay.scss'

export type TodayRecordAction =
  | { type: 'meal'; slot: MealSlot }
  | { type: 'mealPicker' }
  | { type: 'exercise' }
  | { type: 'weight' }
  | { type: 'photo' }

interface TodayRecordOverlayProps {
  action: TodayRecordAction | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

interface MealRow {
  id: string
  foodName: string
  quantityG: string
  kcal: string
  carbG: string
  proteinG: string
  fatG: string
}

interface ExerciseRow {
  id: string
  exerciseType: string
  durationMin: string
  confirmedKcal: string
  kcalManuallyEdited: boolean
}

type SheetView = 'meal' | 'exercise' | 'weight' | 'photo' | 'slot'
type PhotoPhase = 'idle' | 'opening-camera' | 'opening-album' | 'recognizing'

const MEAL_SLOTS: Array<{ key: MealSlot; label: string; note: string }> = [
  { key: 'breakfast', label: '早餐', note: '一天的第一餐' },
  { key: 'lunch', label: '午餐', note: '午间正餐' },
  { key: 'dinner', label: '晚餐', note: '晚间正餐' },
  { key: 'other', label: '其它', note: '加餐或零食' },
  { key: 'drink', label: '饮品', note: '含热量或无热量饮品' },
]

const EXERCISE_TYPES: Array<{ type: string; met: number }> = [
  { type: '快走', met: 4.3 },
  { type: '慢跑', met: 7 },
  { type: '游泳', met: 6 },
  { type: '骑行', met: 6.8 },
  { type: '跳绳', met: 11.8 },
  { type: '瑜伽', met: 2.5 },
  { type: '力量训练', met: 5 },
  { type: 'HIIT', met: 8 },
  { type: '舞蹈', met: 5 },
  { type: '椭圆机', met: 5 },
  { type: '爬楼梯', met: 8.8 },
  { type: '其它', met: 4 },
]

const FOOD_NUTRITION_PER_100G: Record<string, Omit<MealItemInput, 'foodName' | 'quantityG'>> = {
  米饭: { kcal: 116, carbG: 25.9, proteinG: 2.6, fatG: 0.3 },
  燕麦: { kcal: 379, carbG: 67.7, proteinG: 13.2, fatG: 6.5 },
  鸡胸肉: { kcal: 133, carbG: 0, proteinG: 24.6, fatG: 3.3 },
  鸡蛋: { kcal: 144, carbG: 2.8, proteinG: 13.3, fatG: 8.8 },
  牛奶: { kcal: 54, carbG: 3.4, proteinG: 3, fatG: 3.2 },
  西兰花: { kcal: 36, carbG: 4.3, proteinG: 4.1, fatG: 0.6 },
  豆腐: { kcal: 84, carbG: 3.4, proteinG: 6.6, fatG: 5.3 },
  紫薯: { kcal: 106, carbG: 25.2, proteinG: 1.6, fatG: 0.2 },
  苹果: { kcal: 53, carbG: 13.7, proteinG: 0.4, fatG: 0.2 },
  酸奶: { kcal: 72, carbG: 9.3, proteinG: 2.5, fatG: 2.7 },
}

const MAX_PHOTO_BYTES = 1024 * 1024
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function emptyMealRow(): MealRow {
  return { id: makeId('meal-row'), foodName: '', quantityG: '', kcal: '', carbG: '', proteinG: '', fatG: '' }
}

function mealItemToRow(item: MealItemInput): MealRow {
  return {
    id: makeId('meal-row'),
    foodName: item.foodName,
    quantityG: item.quantityG > 0 ? String(item.quantityG) : '',
    kcal: String(item.kcal ?? ''),
    carbG: String(item.carbG ?? 0),
    proteinG: String(item.proteinG ?? 0),
    fatG: String(item.fatG ?? 0),
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function estimateExerciseKcal(exerciseType: string, weightKg: number, durationMin: number): number {
  const exercise = EXERCISE_TYPES.find((item) => item.type === exerciseType) ?? EXERCISE_TYPES[0]
  if (!(weightKg > 0) || !(durationMin > 0)) return 0
  return Math.round((exercise.met * 3.5 * weightKg * durationMin) / 200)
}

function newExerciseRow(weightKg: number): ExerciseRow {
  return {
    id: makeId('exercise-row'),
    exerciseType: '快走',
    durationMin: '30',
    confirmedKcal: String(estimateExerciseKcal('快走', weightKg, 30)),
    kcalManuallyEdited: false,
  }
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor(value.length * 3 / 4) - padding
}

function readFileAsBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (result) => resolve(result.data as string),
      fail: reject,
    })
  })
}

function isCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return isPhotoPickerCancel(error) || /cancel|取消/i.test(message)
}

export default function TodayRecordOverlay({ action, onClose, onSaved }: TodayRecordOverlayProps) {
  const today = useTodayData()
  const [view, setView] = useState<SheetView>('meal')
  const [mealSlot, setMealSlot] = useState<MealSlot>('breakfast')
  const [mealRows, setMealRows] = useState<MealRow[]>([emptyMealRow()])
  const [mealText, setMealText] = useState('')
  const [exerciseRows, setExerciseRows] = useState<ExerciseRow[]>([])
  const [weightValue, setWeightValue] = useState('')
  const [weighingContext, setWeighingContext] = useState<'morning' | 'evening'>('morning')
  const [photoRows, setPhotoRows] = useState<MealRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [photoPhase, setPhotoPhase] = useState<PhotoPhase>('idle')

  const currentWeight = today.currentWeight > 0 ? today.currentWeight : 70

  useEffect(() => {
    if (!action) {
      return
    }
    void Taro.hideTabBar({ animation: false }).catch(() => {})
    setError('')
    setBusy(false)
    setPhotoPhase('idle')
    if (action.type === 'meal') {
      setView('meal')
      setMealSlot(action.slot)
      setMealRows([emptyMealRow()])
      setMealText('')
    } else if (action.type === 'mealPicker') {
      setPhotoRows([])
      setView('slot')
    } else if (action.type === 'exercise') {
      setView('exercise')
      setExerciseRows([newExerciseRow(currentWeight)])
    } else if (action.type === 'weight') {
      setView('weight')
      setWeightValue(today.currentWeight > 0 ? today.currentWeight.toFixed(1) : '')
      setWeighingContext('morning')
    } else {
      setPhotoRows([])
      setView('photo')
    }
  }, [action])

  useEffect(() => () => {
    void Taro.showTabBar({ animation: false }).catch(() => {})
  }, [])

  const close = () => {
    if (busy) return
    void Taro.showTabBar({ animation: false }).catch(() => {})
    onClose()
  }

  const finishSave = async (message: string) => {
    Taro.showToast({ title: message, icon: 'success' })
    void Taro.showTabBar({ animation: false }).catch(() => {})
    onClose()
    await onSaved()
  }

  const appendRecognizedRows = (rows: MealRow[]) => {
    setMealRows((previous) => {
      const hasOnlyEmpty = previous.length === 1 && !previous[0].foodName && !previous[0].kcal
      return hasOnlyEmpty ? rows : [...previous, ...rows]
    })
  }

  async function recognizePhoto(source: PhotoSource, chooseSlotAfter: boolean) {
    if (busy) return
    setError('')
    try {
      if (!Taro.getStorageSync('aiPhotoPrivacyConsent')) {
        const consent = await Taro.showModal({
          title: '照片识别说明',
          content: '照片会发送给小米 MiMo API 完成本次食物识别，本服务不保存原图。识别结果会先交给你确认，再写入饮食记录。',
          confirmText: '同意并继续',
          cancelText: '暂不使用',
        })
        if (!consent.confirm) {
          if (chooseSlotAfter) close()
          return
        }
        Taro.setStorageSync('aiPhotoPrivacyConsent', true)
      }

      setBusy(true)
      setPhotoPhase(source === 'camera' ? 'opening-camera' : 'opening-album')
      setView('photo')
      const chosenPhoto = await pickSinglePhoto(source)
      const originalPath = chosenPhoto.tempFilePath
      if (!originalPath) throw new Error('image_missing')
      setPhotoPhase('recognizing')
      setView('photo')

      let imagePath = originalPath
      let base64 = await readFileAsBase64(originalPath)
      if (base64ByteLength(base64) > MAX_PHOTO_BYTES) {
        for (const quality of [80, 60, 40, 25]) {
          const compressed = await Taro.compressImage({ src: originalPath, quality })
          imagePath = compressed.tempFilePath
          base64 = await readFileAsBase64(imagePath)
          if (base64ByteLength(base64) <= MAX_PHOTO_BYTES) break
        }
      }
      if (base64ByteLength(base64) > MAX_PHOTO_BYTES) throw new Error('image_too_large')

      const mimeType = detectPhotoMimeType(base64)
      if (!mimeType || !PHOTO_MIME_TYPES.has(mimeType)) throw new Error('image_type_unsupported')
      const requestId = makeId('today-photo')
      const runEstimate = (usePoint: boolean) => aiPhotoEstimate(base64, {
        mimeType,
        imageSizeBytes: base64ByteLength(base64),
        usePoint,
        clientRequestId: requestId,
      })
      let result = await runEstimate(false)
      if (!result.ok && /quota|point|limit|积分|次数/i.test(result.error)) {
        const pointResult = await Taro.showModal({
          title: '使用 1 积分继续？',
          content: `今日免费次数已用完，当前有 ${today.entitlement?.pointBalance ?? 0} 积分。`,
          confirmText: '使用积分',
          cancelText: '取消',
        })
        if (!pointResult.confirm) {
          if (chooseSlotAfter) close()
          return
        }
        result = await runEstimate(true)
      }
      if (!result.ok) {
        throw new Error(/not_configured/i.test(result.error) ? 'ai_not_configured' : result.error)
      }
      const items = result.data.items?.length ? result.data.items : result.data.estimate ? [{
        foodName: result.data.estimate.foodName,
        quantityG: 0,
        kcal: result.data.estimate.kcal,
        carbG: result.data.estimate.carbG,
        proteinG: result.data.estimate.proteinG,
        fatG: result.data.estimate.fatG,
      }] : []
      const rows = items.map(mealItemToRow)
      if (!rows.length) throw new Error('empty_ai_result')
      if (chooseSlotAfter) {
        setPhotoRows(rows)
        setView('slot')
      } else {
        appendRecognizedRows(rows)
        setView('meal')
        Taro.showToast({ title: '已加入识别结果', icon: 'success' })
      }
    } catch (photoError) {
      if (isCancelError(photoError)) {
        if (chooseSlotAfter) close()
        else setView('meal')
        return
      }
      const message = photoPickerErrorMessage(photoError)
      const friendly = /not_configured/.test(message)
        ? 'AI 服务还未配置 API key，请先手动记录'
        : /too_large/.test(message)
          ? '图片仍大于 1MB，请裁剪后重试'
          : /image_missing/.test(message)
            ? '没有取得照片，请重新选择'
            : isPhotoPickerError(photoError)
              ? describePhotoPickerError(photoError, source)
              : '照片识别失败，请重试或改用文字解析'
      console.error('[TodayPhoto] photo recognition failed:', message)
      setError(friendly)
      setPhotoPhase('idle')
      setView(chooseSlotAfter ? 'photo' : 'meal')
    } finally {
      setBusy(false)
    }
  }

  const chooseRecognizedMealSlot = (slot: MealSlot) => {
    setMealSlot(slot)
    setMealRows(photoRows.length ? photoRows : [emptyMealRow()])
    setMealText('')
    setError('')
    setView('meal')
  }

  const updateMealRow = (index: number, field: keyof MealRow, value: string) => {
    if (busy) return
    setError('')
    setMealRows((previous) => previous.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const next = { ...row, [field]: value }
      if (field === 'foodName' || field === 'quantityG') {
        const nutrition = FOOD_NUTRITION_PER_100G[next.foodName.trim()]
        const grams = Number(next.quantityG)
        if (nutrition && grams > 0) {
          const ratio = grams / 100
          next.kcal = String(Math.round(nutrition.kcal * ratio))
          next.carbG = String(Math.round(nutrition.carbG * ratio * 10) / 10)
          next.proteinG = String(Math.round(nutrition.proteinG * ratio * 10) / 10)
          next.fatG = String(Math.round(nutrition.fatG * ratio * 10) / 10)
        }
      }
      return next
    }))
  }

  const parseMealText = async () => {
    const description = mealText.trim()
    if (!description || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await aiTextEstimate(description, makeId('today-text'))
      if (!result.ok) throw new Error(result.error)
      const items = result.data.items?.length ? result.data.items : result.data.estimate ? [{
        foodName: result.data.estimate.foodName,
        quantityG: 0,
        kcal: result.data.estimate.kcal,
        carbG: result.data.estimate.carbG,
        proteinG: result.data.estimate.proteinG,
        fatG: result.data.estimate.fatG,
      }] : []
      const rows = items.map(mealItemToRow)
      if (!rows.length) throw new Error('empty_ai_result')
      appendRecognizedRows(rows)
      setMealText('')
      Taro.showToast({ title: '已拆分到食物列表', icon: 'success' })
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError)
      setError(/not_configured/i.test(message) ? 'AI 服务还未配置 API key，请先手动记录' : '没有解析成功，请换种说法再试')
    } finally {
      setBusy(false)
    }
  }

  const saveMeal = async () => {
    if (busy) return
    const populatedRows = mealRows.filter((row) => row.foodName.trim() || row.quantityG || row.kcal)
    if (!populatedRows.length) {
      setError('请至少填写一种食物')
      return
    }
    for (const row of populatedRows) {
      if (!row.foodName.trim()) { setError('每一行都需要填写食物名称'); return }
      if (!(Number(row.quantityG) > 0)) { setError(`请填写“${row.foodName}”的克数`); return }
      if (!Number.isFinite(Number(row.kcal)) || Number(row.kcal) < 0) { setError(`请填写“${row.foodName}”的热量`); return }
    }
    const existing = today.meals.find((meal) => meal.id === (mealSlot === 'other' ? 'snack' : mealSlot))
    if (existing?.status && existing.status !== 'unrecorded') {
      const confirmation = await Taro.showModal({
        title: `${MEAL_SLOTS.find((slot) => slot.key === mealSlot)?.label}已有记录`,
        content: '继续保存会作为本餐的补充，并计入今日总摄入。',
        confirmText: '继续添加',
        cancelText: '返回检查',
      })
      if (!confirmation.confirm) return
    }
    const items: MealItemInput[] = populatedRows.map((row) => ({
      foodName: row.foodName.trim(),
      quantityG: Number(row.quantityG),
      kcal: Number(row.kcal),
      carbG: Number(row.carbG) || 0,
      proteinG: Number(row.proteinG) || 0,
      fatG: Number(row.fatG) || 0,
    }))
    setBusy(true)
    setError('')
    try {
      const result = await createMeal({
        date: localDateString(),
        mealSlot: mealSlot as CreateMealBody['mealSlot'],
        status: 'recorded',
        items,
      })
      if (!result.ok) throw new Error(result.error)
      await finishSave('饮食已记录')
    } catch {
      setError('饮食没有保存成功，已填写内容会保留')
    } finally {
      setBusy(false)
    }
  }

  const updateExerciseRow = (index: number, field: 'durationMin' | 'confirmedKcal', value: string) => {
    setError('')
    setExerciseRows((previous) => previous.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const next = { ...row, [field]: value }
      if (field === 'confirmedKcal') next.kcalManuallyEdited = true
      if (field === 'durationMin' && !next.kcalManuallyEdited) {
        next.confirmedKcal = String(estimateExerciseKcal(next.exerciseType, currentWeight, Number(value)))
      }
      return next
    }))
  }

  const updateExerciseType = (index: number, exerciseType: string) => {
    setError('')
    setExerciseRows((previous) => previous.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      return {
        ...row,
        exerciseType,
        confirmedKcal: row.kcalManuallyEdited
          ? row.confirmedKcal
          : String(estimateExerciseKcal(exerciseType, currentWeight, Number(row.durationMin))),
      }
    }))
  }

  const saveExercise = async () => {
    if (busy || !exerciseRows.length) return
    if (exerciseRows.some((row) => !(Number(row.durationMin) > 0) || Number(row.durationMin) > 1440)) {
      setError('每项运动时长需在 1-1440 分钟之间')
      return
    }
    if (exerciseRows.some((row) => !Number.isFinite(Number(row.confirmedKcal)) || Number(row.confirmedKcal) < 0)) {
      setError('请检查每项运动的热量')
      return
    }
    setBusy(true)
    setError('')
    try {
      for (const row of exerciseRows) {
        const result = await createExercise({
          date: localDateString(),
          exerciseType: row.exerciseType,
          durationMin: Number(row.durationMin),
          weightKg: currentWeight,
          confirmedKcal: Number(row.confirmedKcal),
        })
        if (!result.ok) throw new Error(result.error)
      }
      await finishSave('运动已记录')
    } catch {
      setError('运动没有全部保存成功，请检查今日明细后重试')
    } finally {
      setBusy(false)
    }
  }

  const saveWeight = async () => {
    const weight = Number(weightValue)
    if (!(weight >= 20 && weight <= 250)) {
      setError('体重需在 20-250 kg 之间')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await createWeight({ date: localDateString(), weightKg: weight, weighingContext })
      if (!result.ok) throw new Error(result.error)
      await finishSave('体重已记录')
    } catch {
      setError('体重没有保存成功，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  if (!action) return null

  const slotLabel = MEAL_SLOTS.find((slot) => slot.key === mealSlot)?.label ?? '餐食'
  const isOpeningPhoto = photoPhase === 'opening-camera' || photoPhase === 'opening-album'
  const photoTitle = photoPhase === 'opening-camera'
    ? '正在打开相机'
    : photoPhase === 'opening-album'
      ? '正在打开相册'
      : photoPhase === 'recognizing'
        ? '正在识别食物和份量'
        : error
          ? '没有完成识别'
          : '选择照片来源'
  const photoDescription = isOpeningPhoto
    ? '请在微信弹出的系统页面中完成选择'
    : photoPhase === 'recognizing'
      ? '通常需要几秒，照片不会保存在本服务中'
      : error || '拍摄当前餐食，或从相册选择已有照片'

  return (
    <View className='today-record-layer' catchMove>
      <View className='today-record-backdrop' onClick={close} />
      <View className='today-record-sheet'>
        <View className='today-record-header'>
          <View>
            <Text className='today-record-kicker'>今天</Text>
            <Text className='today-record-title'>
              {view === 'meal' ? `记录${slotLabel}` : view === 'exercise' ? '记录运动' : view === 'weight' ? '体重打卡' : view === 'slot' ? '记录到哪一餐？' : isOpeningPhoto ? '选择照片' : busy ? 'AI 正在识别' : 'AI 拍照识别'}
            </Text>
          </View>
          <View className={`today-record-close ${busy ? 'today-record-control--disabled' : ''}`} onClick={close}>
            <Text>×</Text>
          </View>
        </View>

        {view === 'photo' ? (
          <View className='today-photo-state'>
            <View className={`today-photo-pulse ${busy ? 'today-photo-pulse--active' : ''}`}>
              <View className='today-photo-lens' />
            </View>
            <Text className='today-photo-title'>{photoTitle}</Text>
            <Text className='today-photo-desc'>{photoDescription}</Text>
            {!busy && (
              <View className='today-photo-actions'>
                <Button className='today-photo-source today-photo-source--camera' onClick={() => void recognizePhoto('camera', true)}>
                  <View className='today-photo-source-icon'><View className='today-photo-source-lens' /></View>
                  <Text className='today-photo-source-title'>拍照</Text>
                  <Text className='today-photo-source-note'>打开后置相机</Text>
                </Button>
                <Button className='today-photo-source today-photo-source--album' onClick={() => void recognizePhoto('album', true)}>
                  <View className='today-photo-source-icon today-photo-source-icon--album'><Text>▧</Text></View>
                  <Text className='today-photo-source-title'>相册</Text>
                  <Text className='today-photo-source-note'>选择已有照片</Text>
                </Button>
              </View>
            )}
          </View>
        ) : view === 'slot' ? (
          <View className='today-slot-body'>
            <Text className='today-slot-summary'>
              {photoRows.length > 0
                ? `已识别 ${photoRows.length} 种食物，选择后还可以修改名称、克数和热量。`
                : '先选择要记录的餐段，之后可以填写食物、克数和热量。'}
            </Text>
            <View className='today-slot-grid'>
              {MEAL_SLOTS.map((slot) => (
                <View key={slot.key} className='today-slot-option' onClick={() => chooseRecognizedMealSlot(slot.key)}>
                  <Text className='today-slot-mark'>{slot.label.slice(0, 1)}</Text>
                  <View className='today-slot-copy'>
                    <Text className='today-slot-label'>{slot.label}</Text>
                    <Text className='today-slot-note'>{slot.note}</Text>
                  </View>
                  <Text className='today-slot-arrow'>›</Text>
                </View>
              ))}
            </View>
          </View>
        ) : view === 'meal' ? (
          <>
            <ScrollView className='today-record-scroll today-record-scroll--meal' scrollY>
              <View className='today-record-scroll-inner'>
                <View className='today-meal-table-header'>
                  <Text className='today-meal-col-food'>食物</Text>
                  <Text className='today-meal-col-grams'>克数</Text>
                  <Text className='today-meal-col-kcal'>预估热量</Text>
                  <Text className='today-meal-col-delete' />
                </View>
                {mealRows.map((row, index) => (
                  <View className='today-meal-row' key={row.id}>
                    <Input className='today-record-input today-meal-col-food' value={row.foodName} disabled={busy} placeholder='食物' onInput={(event) => updateMealRow(index, 'foodName', event.detail.value)} />
                    <Input className='today-record-input today-record-input--number today-meal-col-grams' type='digit' value={row.quantityG} disabled={busy} placeholder='g' onInput={(event) => updateMealRow(index, 'quantityG', event.detail.value)} />
                    <Input className='today-record-input today-record-input--number today-meal-col-kcal' type='digit' value={row.kcal} disabled={busy} placeholder='kcal' onInput={(event) => updateMealRow(index, 'kcal', event.detail.value)} />
                    <View className='today-meal-col-delete today-meal-delete' onClick={() => !busy && setMealRows((rows) => rows.length === 1 ? [emptyMealRow()] : rows.filter((_, rowIndex) => rowIndex !== index))}><Text>×</Text></View>
                  </View>
                ))}
                <View className='today-meal-add' onClick={() => !busy && setMealRows((rows) => [...rows, emptyMealRow()])}><Text>＋ 添加食物</Text></View>

                <View className='today-ai-box'>
                  <Text className='today-ai-label'>快速描述</Text>
                  <Textarea className='today-ai-textarea' value={mealText} disabled={busy} maxlength={500} placeholder='例如：一碗米饭、番茄炒蛋和一杯豆浆' onInput={(event) => setMealText(event.detail.value)} />
                  <View className='today-ai-actions'>
                    <View className={`today-ai-action ${busy ? 'today-record-control--disabled' : ''}`} onClick={() => void parseMealText()}><Text>AI 解析</Text></View>
                    <View className={`today-ai-action today-ai-action--photo ${busy ? 'today-record-control--disabled' : ''}`} onClick={() => void recognizePhoto('camera', false)}><Text>拍照</Text></View>
                    <View className={`today-ai-action today-ai-action--album ${busy ? 'today-record-control--disabled' : ''}`} onClick={() => void recognizePhoto('album', false)}><Text>相册</Text></View>
                  </View>
                </View>
              </View>
            </ScrollView>
            <View className='today-record-footer'>
              {error ? <Text className='today-record-error'>{error}</Text> : null}
              <Button className={`today-record-primary ${busy ? 'today-record-control--disabled' : ''}`} disabled={busy} onClick={saveMeal}>{busy ? '处理中…' : '确认记录'}</Button>
            </View>
          </>
        ) : view === 'exercise' ? (
          <>
            <ScrollView className='today-record-scroll' scrollY>
              <View className='today-record-scroll-inner'>
                <View className='today-exercise-table-header'>
                  <Text className='today-exercise-col-type'>运动</Text>
                  <Text className='today-exercise-col-number'>分钟</Text>
                  <Text className='today-exercise-col-number'>热量</Text>
                  <Text className='today-exercise-col-delete' />
                </View>
                {exerciseRows.map((row, index) => (
                  <View className='today-exercise-row-input' key={row.id}>
                    <View className='today-exercise-col-type'>
                      <Picker mode='selector' range={EXERCISE_TYPES.map((item) => item.type)} value={Math.max(0, EXERCISE_TYPES.findIndex((item) => item.type === row.exerciseType))} disabled={busy} onChange={(event) => updateExerciseType(index, EXERCISE_TYPES[Number(event.detail.value)]?.type ?? row.exerciseType)}>
                        <View className='today-record-picker'><Text>{row.exerciseType}</Text><Text>⌄</Text></View>
                      </Picker>
                    </View>
                    <Input className='today-record-input today-record-input--number today-exercise-col-number' type='digit' value={row.durationMin} disabled={busy} onInput={(event) => updateExerciseRow(index, 'durationMin', event.detail.value)} />
                    <Input className='today-record-input today-record-input--number today-exercise-col-number' type='digit' value={row.confirmedKcal} disabled={busy} onInput={(event) => updateExerciseRow(index, 'confirmedKcal', event.detail.value)} />
                    <View className='today-exercise-col-delete today-meal-delete' onClick={() => !busy && setExerciseRows((rows) => rows.length === 1 ? rows : rows.filter((_, rowIndex) => rowIndex !== index))}><Text>×</Text></View>
                  </View>
                ))}
                <View className='today-meal-add' onClick={() => !busy && setExerciseRows((rows) => [...rows, newExerciseRow(currentWeight)])}><Text>＋ 添加运动</Text></View>
                <Text className='today-record-hint'>热量按当前体重和运动类型自动估算，也可以手动调整。</Text>
              </View>
            </ScrollView>
            <View className='today-record-footer'>
              {error ? <Text className='today-record-error'>{error}</Text> : null}
              <Button className={`today-record-primary ${busy ? 'today-record-control--disabled' : ''}`} disabled={busy} onClick={saveExercise}>{busy ? '保存中…' : '确认记录'}</Button>
            </View>
          </>
        ) : (
          <>
            <View className='today-weight-body'>
              <Text className='today-weight-label'>称重时间</Text>
              <View className='today-weight-contexts'>
                <View className={`today-weight-context ${weighingContext === 'morning' ? 'today-weight-context--active' : ''}`} onClick={() => !busy && setWeighingContext('morning')}><Text>早（空腹）</Text></View>
                <View className={`today-weight-context ${weighingContext === 'evening' ? 'today-weight-context--active' : ''}`} onClick={() => !busy && setWeighingContext('evening')}><Text>晚（饭后）</Text></View>
              </View>
              <Text className='today-weight-label'>体重</Text>
              <View className='today-weight-input-row'>
                <Input className='today-weight-input' type='digit' value={weightValue} disabled={busy} placeholder='请输入' onInput={(event) => { setWeightValue(event.detail.value); setError('') }} />
                <Text>kg</Text>
              </View>
              <Text className='today-record-hint'>长期趋势建议尽量比较相同称重时段的数据。</Text>
            </View>
            <View className='today-record-footer'>
              {error ? <Text className='today-record-error'>{error}</Text> : null}
              <Button className={`today-record-primary ${busy ? 'today-record-control--disabled' : ''}`} disabled={busy} onClick={saveWeight}>{busy ? '保存中…' : '确认记录'}</Button>
            </View>
          </>
        )}
      </View>
    </View>
  )
}
