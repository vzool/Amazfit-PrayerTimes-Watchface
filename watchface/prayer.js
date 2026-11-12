// حساب مواقيت الصلاة محلياً (بدون إنترنت) - طريقة أم القرى
const r = Math.PI / 180
const sin = a => Math.sin(a * r), cos = a => Math.cos(a * r), tan = a => Math.tan(a * r)
const acos = x => Math.acos(Math.max(-1, Math.min(1, x))) / r
const fix = (a, b) => a - b * Math.floor(a / b)

export function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
}

// يرجع [الفجر, الشروق, الظهر, العصر, المغرب, العشاء] بالدقائق منذ منتصف الليل
export function getPrayerTimes(y, m, d, o = {}) {
  const { lat = 24.7136, lon = 46.6753, tz = 3, fajrAngle = 18.5, ishaMin = 90, adj = [0, 0, 0, 0, 0, 0] } = o
  const D = jdn(y, m, d) - 2451545
  const g = fix(357.529 + 0.98560028 * D, 360)
  const q = fix(280.459 + 0.98564736 * D, 360)
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360)
  const e = 23.439 - 0.00000036 * D
  const RA = fix(Math.atan2(cos(e) * sin(L), cos(L)) / r, 360) / 15
  const decl = Math.asin(sin(e) * sin(L)) / r
  let eqt = q / 15 - RA
  if (eqt > 12) eqt -= 24
  if (eqt < -12) eqt += 24
  const noon = 12 + tz - lon / 15 - eqt
  const T = a => acos((-sin(a) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15
  const A = Math.atan(1 / (1 + tan(Math.abs(lat - decl)))) / r // العصر: ظل مثل الشيء (الجمهور)
  const tAsr = acos((sin(A) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15
  const maghrib = noon + T(0.833)
  const h = [noon - T(fajrAngle), noon - T(0.833), noon, noon + tAsr, maghrib, maghrib + ishaMin / 60]
  return h.map((v, i) => Math.round(v * 60) + adj[i])
}
