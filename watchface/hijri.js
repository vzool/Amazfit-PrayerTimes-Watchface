import { jdn } from './prayer'

export const HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة']

const islToJdn = (y, m, d) => d + Math.ceil(29.5 * (m - 1)) + 354 * (y - 1) + Math.floor((3 + 11 * y) / 30) + 1948439

// التقويم الجدولي + تعديل يوم (adjust) لمطابقة أم القرى. اضبطه 0 أو 1 أو -1 حسب الحاجة
export function toHijri(y, m, d, adjust = 1) {
  const J = jdn(y, m, d) + adjust
  const yr = Math.floor((30 * (J - 1948440) + 10646) / 10631)
  const month = Math.min(12, Math.ceil((J - (29 + islToJdn(yr, 1, 1))) / 29.5) + 1)
  const day = J - islToJdn(yr, month, 1) + 1
  return { year: yr, month, day }
}
