import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { createTimer, stopTimer } from '@zos/timer'
import { LocalStorage } from '@zos/storage'
import { Time, HeartRate, Battery, Step, Calorie, Distance, Stand, Pai, Weather } from '@zos/sensor'
import { getPrayerTimes } from './prayer'
import { toHijri, HIJRI_MONTHS } from './hijri'
import { CITIES } from './cities'

// ===== إعدادات ثابتة =====
const CFG = {
  PAGE_SECONDS: 4,                       // مدة بقاء كل صفحة بالثواني
  HIJRI_ADJUST: 1,                       // تعديل التاريخ الهجري (-1 / 0 / 1)
  TZ: 3,                                 // فرق التوقيت عن UTC (السعودية +3)
  ADJ: [-1, 0, 0, 0, 0, 0],              // تعديل دقائق: فجر، شروق، ظهر، عصر، مغرب، عشاء
  CUSTOM: { lat: 24.7136, lon: 46.6753 } // إحداثيات "موقع مخصص" - عدّلها هنا
}

const NAMES = {
  ar: ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'],
  en: ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
}
const HIJRI_EN = ['Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah']

// ===== الحالة المحفوظة =====
const store = new LocalStorage()
let st = { lang: 'ar', city: 0 }
try { const s = JSON.parse(store.getItem('cfg')); if (s && CITIES[s.city]) st = s } catch (e) {}
const save = () => { try { store.setItem('cfg', JSON.stringify(st)) } catch (e) {} }

const { width: W, height: H } = getDeviceInfo()
const sx = v => Math.round((v * W) / 390)
const sy = v => Math.round((v * H) / 450)
const C = { fg: 0xffffff, dim: 0x8a8a93, green: 0x31d158, blue: 0x0a84ff, orange: 0xffb020, lav: 0xd9cdf2 }
const pad = n => (n < 10 ? '0' : '') + n
const fmt = m => { m = ((m % 1440) + 1440) % 1440; return Math.floor(m / 60) + ':' + pad(m % 60) }
const isAr = () => st.lang === 'ar'
const LEFT = hmUI.align.LEFT, RIGHT = hmUI.align.RIGHT

const pages = [[], [], []]   // 0: بيانات، 1: مواقيت، 2: إعدادات
const labels = []            // نصوص ثنائية اللغة [عربي, إنجليزي]
function T(p, x, y, w, h, size, color, text, align) {
  const wd = hmUI.createWidget(hmUI.widget.TEXT, {
    x: sx(x), y: sy(y), w: sx(w), h: sy(h), text_size: Math.round((size * W) / 390), color,
    text: Array.isArray(text) ? text[1] : text,
    align_h: align === undefined ? hmUI.align.CENTER_H : align, align_v: hmUI.align.CENTER_V,
  })
  if (Array.isArray(text)) labels.push({ wd, text })
  pages[p].push(wd)
  return wd
}
function R(p, x, y, w, h, color, radius) {
  const wd = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: sx(x), y: sy(y), w: sx(w), h: sy(h), radius: sx(radius), color })
  pages[p].push(wd)
  return wd
}
function B(p, x, y, w, h, color, size, text, fn) {
  const wd = hmUI.createWidget(hmUI.widget.BUTTON, {
    x: sx(x), y: sy(y), w: sx(w), h: sy(h), radius: sx(18), normal_color: color, press_color: 0x444444,
    text, text_size: Math.round((size * W) / 390), color: 0xffffff, click_func: fn,
  })
  pages[p].push(wd)
  return wd
}

let timer = null, ticks = 0, cacheKey = '', today = null, tomorrow = null, settingsOpen = false
let ui = {}, rowRects = [], rowTimes = [], rowNames = []
const safe = (fn, d) => { try { const v = fn(); return v === undefined || v === null ? d : v } catch (e) { return d } }

function showPage(p) {
  pages.forEach((arr, i) => arr.forEach(w => w.setProperty(hmUI.prop.VISIBLE, i === p)))
  if (ui.tap) ui.tap.setProperty(hmUI.prop.VISIBLE, p !== 2)
}

function applyLang() {
  const k = isAr() ? 0 : 1
  labels.forEach(l => l.wd.setProperty(hmUI.prop.TEXT, l.text[k]))
  for (let i = 0; i < 6; i++) rowNames[i].setProperty(hmUI.prop.TEXT, NAMES[st.lang][i])
  ui.langBtn.setProperty(hmUI.prop.TEXT, isAr() ? 'اللغة: العربية' : 'Language: English')
  ui.cityBtn.setProperty(hmUI.prop.TEXT, (isAr() ? 'المدينة: ' : 'City: ') + CITIES[st.city][st.lang])
  ui.coords.setProperty(hmUI.prop.TEXT, CITIES[st.city].lat.toFixed(4) + ', ' + CITIES[st.city].lon.toFixed(4))
  ui.done.setProperty(hmUI.prop.TEXT, isAr() ? 'تم' : 'Done')
  ui.title.setProperty(hmUI.prop.TEXT, isAr() ? 'الإعدادات' : 'Settings')
}

WatchFace({
  build() {
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: W, h: H, color: 0x000000 })

    // ---------- الصفحة 0: لوحة البيانات ----------
    ui.hr = T(0, 20, 30, 100, 50, 44, C.fg, '--', LEFT)
    T(0, 118, 30, 90, 50, 16, C.dim, ['نبض القلب', 'HEART\nRATE'], LEFT)
    ui.batL = T(0, 20, 88, 100, 50, 44, C.fg, '--', LEFT)
    T(0, 118, 88, 90, 50, 16, C.dim, ['البطارية', 'BATTERY'], LEFT)
    ui.stand = T(0, 15, 160, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 15, 192, 90, 20, 14, C.dim, ['وقوف', 'STAND'], LEFT)
    ui.dist = T(0, 110, 160, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 110, 192, 90, 20, 14, C.dim, ['كم', 'KM'], LEFT)
    ui.steps = T(0, 15, 225, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 15, 257, 90, 20, 14, C.dim, ['خطوات', 'STEPS'], LEFT)
    ui.kcal = T(0, 110, 225, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 110, 257, 90, 20, 14, C.dim, ['سعرات', 'KCAL'], LEFT)
    ui.hh = T(0, 200, 20, 180, 170, 130, C.fg, '00')
    ui.mm = T(0, 200, 185, 180, 170, 130, C.lav, '00')
    R(0, 20, 330, 200, 44, C.green, 22)
    ui.pow = T(0, 20, 330, 200, 44, 26, 0x000000, 'POWER')
    ui.temp = T(0, 235, 330, 140, 44, 34, C.fg, '--°')
    ui.pai = T(0, 20, 392, 110, 40, 30, C.fg, '--', LEFT)
    T(0, 20, 424, 110, 20, 14, C.dim, 'PAI', LEFT)
    ui.sec = T(0, 150, 392, 100, 40, 28, C.dim, '00')
    ui.hdate = T(0, 200, 392, 180, 40, 22, C.blue, '', RIGHT)

    // ---------- الصفحة 1: مواقيت الصلاة ----------
    ui.t2 = T(1, 0, 8, 390, 70, 64, C.fg, '00:00')
    ui.hij = T(1, 0, 78, 390, 38, 28, C.blue, '')
    ui.greg = T(1, 0, 112, 390, 28, 20, C.dim, '')
    ui.next = T(1, 0, 146, 390, 42, 26, C.orange, '')
    for (let i = 0; i < 6; i++) {
      const y = 194 + i * 42
      rowRects.push(R(1, 14, y, 362, 40, 0x1f3d2a, 14))
      rowNames.push(T(1, 215, y, 150, 40, 28, C.fg, NAMES[st.lang][i], RIGHT))
      rowTimes.push(T(1, 30, y, 150, 40, 30, C.fg, '--:--', LEFT))
    }

    // طبقة اللمس: تفتح صفحة الإعدادات (تُنشأ فوق الصفحتين 0 و1)
    ui.tap = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: W, h: H, color: 0x000000, alpha: 0 })
    ui.tap.addEventListener(hmUI.event.CLICK_UP, () => { settingsOpen = true; showPage(2) })

    // ---------- الصفحة 2: الإعدادات ----------
    ui.title = T(2, 0, 20, 390, 50, 34, C.fg, 'Settings')
    ui.langBtn = B(2, 30, 85, 330, 70, 0x2a2a30, 28, '', () => { st.lang = isAr() ? 'en' : 'ar'; save(); applyLang(); this.tick(true) })
    ui.cityBtn = B(2, 30, 170, 330, 70, 0x2a2a30, 28, '', () => { st.city = (st.city + 1) % CITIES.length; save(); cacheKey = ''; applyLang(); this.tick(true) })
    ui.coords = T(2, 0, 248, 390, 36, 22, C.dim, '')
    ui.done = B(2, 30, 330, 330, 70, 0x1f8a3d, 30, '', () => { settingsOpen = false; ticks = 0; showPage(0); this.tick(true) })

    ui.langBtn.setProperty(hmUI.prop.TEXT, ''); applyLang()
    showPage(0)

    this.sensors = {
      time: new Time(), hr: new HeartRate(), bat: new Battery(), step: new Step(),
      cal: new Calorie(), dist: new Distance(), stand: new Stand(), pai: new Pai(), weather: new Weather(),
    }
    this.tick()
    timer = createTimer(1000, 1000, () => this.tick())
  },

  tick(force) {
    if (settingsOpen && !force) return
    const s = this.sensors, t = s.time
    const Y = t.getFullYear(), M = t.getMonth(), D = t.getDate()
    const h = t.getHours(), mi = t.getMinutes(), se = t.getSeconds()
    if (!force) ticks++

    let page = Math.floor(ticks / CFG.PAGE_SECONDS) % 2
    if (settingsOpen) page = -1
    if (!settingsOpen) showPage(page)

    const city = CITIES[st.city]
    const key = Y + '-' + M + '-' + D + '-' + st.city
    const hj = toHijri(Y, M, D, CFG.HIJRI_ADJUST)
    if (key !== cacheKey) {
      cacheKey = key
      const o = { lat: city.lat, lon: city.lon, tz: CFG.TZ, adj: CFG.ADJ, ishaMin: hj.month === 9 ? 120 : 90 }
      today = getPrayerTimes(Y, M, D, o)
      const n = new Date(Y, M - 1, D + 1)
      tomorrow = getPrayerTimes(n.getFullYear(), n.getMonth() + 1, n.getDate(), o)
    }
    const hmonth = (isAr() ? HIJRI_MONTHS : HIJRI_EN)[hj.month - 1]
    const time = pad(h) + ':' + pad(mi)

    if (page === 0 || force) {
      ui.hh.setProperty(hmUI.prop.TEXT, pad(h))
      ui.mm.setProperty(hmUI.prop.TEXT, pad(mi))
      ui.sec.setProperty(hmUI.prop.TEXT, pad(se))
      ui.hdate.setProperty(hmUI.prop.TEXT, hj.day + ' ' + hmonth)
      if (ticks % 5 === 1 || force) {
        ui.hr.setProperty(hmUI.prop.TEXT, '' + safe(() => s.hr.getLast(), '--'))
        const b = safe(() => s.bat.getCurrent(), 0)
        ui.batL.setProperty(hmUI.prop.TEXT, b + '%')
        ui.pow.setProperty(hmUI.prop.TEXT, (isAr() ? 'الطاقة ' : 'POWER ') + b + '%')
        ui.steps.setProperty(hmUI.prop.TEXT, '' + safe(() => s.step.getCurrent(), 0))
        ui.kcal.setProperty(hmUI.prop.TEXT, '' + safe(() => s.cal.getCurrent(), 0))
        ui.dist.setProperty(hmUI.prop.TEXT, safe(() => s.dist.getCurrent() / 1000, 0).toFixed(2))
        ui.stand.setProperty(hmUI.prop.TEXT, pad(safe(() => s.stand.getCurrent(), 0)) + '/' + pad(safe(() => s.stand.getTarget(), 12)))
        ui.pai.setProperty(hmUI.prop.TEXT, '' + Math.round(safe(() => s.pai.getTotal(), 0)))
        ui.temp.setProperty(hmUI.prop.TEXT, safe(() => s.weather.getForecast().forecastData.data[0].high, '--') + '°')
      }
    }
    if (page === 1 || force) {
      const nowSec = h * 3600 + mi * 60 + se
      let idx = -1, target = 0
      for (const i of [0, 2, 3, 4, 5]) if (today[i] * 60 > nowSec) { idx = i; target = today[i] * 60; break }
      if (idx < 0) { idx = 0; target = (tomorrow[0] + 1440) * 60 }
      const left = target - nowSec
      ui.t2.setProperty(hmUI.prop.TEXT, time)
      ui.hij.setProperty(hmUI.prop.TEXT, hj.day + ' ' + hmonth + ' ' + hj.year)
      ui.greg.setProperty(hmUI.prop.TEXT, D + '/' + M + '/' + Y + '  ·  ' + city[st.lang])
      ui.next.setProperty(hmUI.prop.TEXT, NAMES[st.lang][idx] + '   -' + pad(Math.floor(left / 3600)) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(left % 60))
      for (let i = 0; i < 6; i++) {
        rowTimes[i].setProperty(hmUI.prop.TEXT, fmt(today[i]))
        rowTimes[i].setProperty(hmUI.prop.COLOR, i === idx ? C.green : C.fg)
        rowRects[i].setProperty(hmUI.prop.VISIBLE, i === idx && page === 1)
      }
    }
  },

  onDestroy() { if (timer) stopTimer(timer) },
})
