import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { createTimer, stopTimer } from '@zos/timer'
import { LocalStorage } from '@zos/storage'
import * as SENSOR from '@zos/sensor'
import { Time, HeartRate, Battery, Step, Calorie, Distance, Stand, Pai, Weather, BloodOxygen, Sleep } from '@zos/sensor'
import { getPrayerTimes, jdn } from './prayer'
import { toHijri } from './hijri'
import { REGIONS } from './regions'
import { lang } from './lang/index'
import { BUILD_VERSION, BUILD_COMMIT, BUILD_TIME } from './build_info'

// ===== إعدادات ثابتة =====
const CFG = {
  TI_TEST: false,                        // اختبار الصور: true يعرض أرقاماً ثابتة (57 و48) بدل بيانات النظام
  HIJRI_ADJUST: 1,                       // تعديل التاريخ الهجري (-1 / 0 / 1)
  TZ: 3,                                 // فرق التوقيت عن UTC (السعودية +3)
  ADJ: [-1, 0, 0, 0, 0, 0],              // تعديل دقائق: فجر، شروق، ظهر، عصر، مغرب، عشاء
}

// ===== الحالة المحفوظة =====
const store = new LocalStorage()
// الفاصل بين الأذان والإقامة بالدقائق (0-45) لكل صلاة على حدة: الفجر، الظهر، العصر، المغرب، العشاء
const IQ_DEFAULT = [25, 20, 20, 10, 20]
let st = { lang: 'ar', reg: 0, city: 0, page: 0, lat: 24.7136, lon: 46.6753, rev: false, iq: IQ_DEFAULT.slice() }
try {
  const s = JSON.parse(store.getItem('cfg'))
  if (s) {
    if (s.lang && lang[s.lang]) st.lang = s.lang
    if (s.reg !== undefined && s.reg >= 0 && s.reg <= REGIONS.length) st.reg = s.reg
    if (s.city !== undefined) st.city = s.city
    if (s.page !== undefined) st.page = s.page
    if (s.rev !== undefined) st.rev = !!s.rev
    if (Array.isArray(s.iq) && s.iq.length === 5) st.iq = s.iq.map((v, i) => (Number.isFinite(v) ? Math.max(0, Math.min(45, Math.round(v))) : IQ_DEFAULT[i]))
    if (s.lat !== undefined) st.lat = s.lat
    if (s.lon !== undefined) st.lon = s.lon
  }
} catch (e) {}
const save = () => { try { store.setItem('cfg', JSON.stringify(st)) } catch (e) {} }

const { width: W, height: H } = getDeviceInfo()
const sx = v => Math.round((v * W) / 390)
const sy = v => Math.round((v * H) / 450)
const C = { fg: 0xffffff, dim: 0x8a8a93, green: 0x31d158, blue: 0x0a84ff, orange: 0xffb020, lav: 0xd9cdf2 }
// ألوان حالة ما بعد الأذان (أخضر / أصفر / برتقالي / أحمر)
const IQC = { g: 0x31d158, y: 0xffd60a, o: 0xff8a1f, r: 0xff453a }
const IQ_OF = { 0: 0, 2: 1, 3: 2, 4: 3, 5: 4 }   // فهرس الصلاة في مصفوفة المواقيت -> فهرس الفاصل
const pad = n => (n < 10 ? '0' : '') + n
const fmt = m => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60) }
// ===== اللغة: كل النصوص في lang/ (ملف لكل لغة)، واتجاه الكتابة rtl داخل كل لغة =====
const L = () => lang[st.lang] || lang.en
const tr = k => { const v = L()[k]; return v !== undefined ? v : lang.en[k] }   // أي مفتاح ناقص يرجع للإنجليزية
const isRTL = () => L().rtl === true
const nm = o => o[st.lang] || o.en || o.ar          // اسم مترجم داخل regions.js (مع رجوع للإنجليزية)
const LANGS = Object.keys(lang)                     // ترتيب التبديل بزر اللغة
// أسهم الإعدادات: الواجهة عربية (RTL) فيعكس النظام رمزي < و> عند العرض، لذلك الرمز المكتوب عكس ما يظهر.
// الوضع العادي: الزر الأيسر يظهر "<" ويذهب للتالي، والأيمن يظهر ">" ويذهب للسابق. الوضع المعكوس: العكس (خيار في الإعدادات).
const arrowL = () => (st.rev ? '<' : '>')
const arrowR = () => (st.rev ? '>' : '<')
// اتجاه الزر الأيسر: لغة RTL = للأمام (+1)، لغة LTR = للخلف (-1)، والخيار "معكوس" يقلب النتيجة
const stepL = () => (isRTL() ? 1 : -1) * (st.rev ? -1 : 1)
const LEFT = hmUI.align.LEFT, RIGHT = hmUI.align.RIGHT

const pages = [[], [], [], []]   // 0: بيانات، 1: مواقيت، 2: إعدادات، 3: ضبط الإقامة
const labels = []            // نصوص مرتبطة بمفتاح لغة: { wd, k }
function T(p, x, y, w, h, size, color, text, align) {
  const key = text && typeof text === 'object' ? text.k : null   // text = { k: 'مفتاح' } يُترجم تلقائياً
  const wd = hmUI.createWidget(hmUI.widget.TEXT, {
    x: sx(x), y: sy(y), w: sx(w), h: sy(h), text_size: Math.round((size * W) / 390), color,
    text: key ? tr(key) : text,
    align_h: align === undefined ? hmUI.align.CENTER_H : align, align_v: hmUI.align.CENTER_V,
  })
  if (key) labels.push({ wd, k: key })
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
    x: sx(x), y: sy(y), w: sx(w), h: sy(h), radius: sx(14), normal_color: color, press_color: 0x444444,
    text, text_size: Math.round((size * W) / 390), color: 0xffffff, click_func: fn,
  })
  pages[p].push(wd)
  return wd
}

// عناصر يعكسها اتجاه اللغة. التصميم الأصلي لـ RTL؛ في LTR: 'mirror' = انعكاس أفقي (الاسم/الوقت)،
// 'shift' = إزاحة مجموعة كاملة (أزرار الإقامة) بنفس ترتيبها الداخلي.
const dirItems = []
// الأزرار (BUTTON) لا تتجاوب مع تغيير الموضع، لذلك لكل زر نسختان (RTL وLTR) تُظهر إحداهما حسب اتجاه اللغة
const dirBtns = []
const reg = (wd, x, w, align, mode, dx) => { dirItems.push({ wd, x, w, align, mode, dx: dx || 0 }); return wd }
function applyDir() {
  const rtl = isRTL()
  for (const d of dirItems) {
    let x = d.x, al = d.align
    if (!rtl) {
      if (d.mode === 'shift') x = d.x + d.dx
      else { x = 390 - d.x - d.w; al = al === LEFT ? RIGHT : al === RIGHT ? LEFT : al }
    }
    const o = { x: sx(x), w: sx(d.w) }
    if (al !== undefined) o.align_h = al
    d.wd.setProperty(hmUI.prop.MORE, o)
  }
}

// عنصر يعرض بيانات النظام مباشرة (HRV, BIO_CHARGE...) بصور أرقام. يرجع null إذا لم يدعم الجهاز النوع
function TI(p, x, y, w, h, type, prefix, align, staticText, register) {
  if (type === undefined && staticText === undefined) return null
  try {
    const wd = hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: sx(x), y: sy(y), w: sx(w), h: sy(h), ...(staticText === undefined ? { type } : {}),
      font_array: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => prefix + i + '.png'),
      invalid_image: prefix + 'dash.png', h_space: 0,
      ...(staticText !== undefined ? { text: staticText } : {}),
      align_h: align === undefined ? hmUI.align.CENTER_H : align, align_v: hmUI.align.CENTER_V,
      show_level: hmUI.show_level.ONLY_NORMAL,
    })
    if (wd && register !== false) pages[p].push(wd)
    console.log('TI ok type=' + type + ' prefix=' + prefix)
    return wd
  } catch (e) { console.log('TI err ' + e); return null }
}
const DT = (() => { try { return hmUI.data_type || {} } catch (e) { return {} } })()

let timer = null, ticks = 0, cacheKey = '', today = null, tomorrow = null, yesterday = null, settingsOpen = false
let currentPage = st.page !== undefined ? st.page : 0
let ui = {}, rowRects = [], rowTimes = [], rowNames = [], rowEl = [], rowElBg = [], iqNames = [], iqVals = []
const rowPill = []   // لكل صلاة: كبسولة واحدة تجمع المؤقت الأبيض ووقت التسجيل { bg, inn, tx }
const CH_HINT = 0x6e6e73   // لون إطار الكبسولة قبل التسجيل
const rowTap = {}    // طبقات لمس صفوف الصلوات
// بداية الشبكتين أفقياً (عرض كل شبكة 75). الساعة تشغل ~114..276 في أعرض حالاتها، فالفاصل ~4 وحدات من كل جهة
const DOT_X = { l: 35, r: 280 }
const dots = []      // نقاط خريطة السجل

// ===== سجل أداء الصلوات =====
// log.d[رقم اليوم] = [فجر, ظهر, عصر, مغرب, عشاء]؛ كل قيمة = مستوى*1000 + دقائق بعد الأذان (0 = غير مسجّلة).
// الدقائق المحفوظة (rv % 1000) ثابتة لا تتغير، بينما يُحسب المستوى واللون ديناميكياً من st.iq الحالية.
let log = { s: 0, d: {} }   // s = أول يوم بدأ فيه التسجيل
try { const l = JSON.parse(store.getItem('log')); if (l && l.d) log = l } catch (e) {}
const logSave = () => { try { store.setItem('log', JSON.stringify(log)) } catch (e) {} }
let logVer = 0, dotsSig = '', armRow = -1, armLeft = 0, peekRow = -1, peekLeft = 0   // peek = عرض وقت التسجيل مؤقتاً
let cs = { cur: -1, elapsed: 0, lvl: 0, todayKey: 0, nowSec: 0, rk: () => 0 }   // حالة الصلاة الحالية (تُحدَّث كل ثانية)
const PRI = [0, 2, 3, 4, 5]              // فهارس الصلوات في مصفوفة المواقيت (بدون الشروق)
const PNEXT = { 0: 1, 2: 3, 3: 4, 4: 5 } // الوقت الذي تنتهي عنده نافذة كل صلاة
const LVC = [0, IQC.g, IQC.y, IQC.o, IQC.r]
const calcLv = (mins, iv) => (iv > 0 ? (mins <= iv ? 1 : mins <= 2 * iv ? 2 : mins <= 3 * iv ? 3 : 4) : 1)
const DOTC = { none: 0x1c1c1e, missed: 0x4a4a4f, pending: 0xa0a0a8 }   // لا بيانات/مستقبل، مضت بلا تسجيل، نافذتها مفتوحة

const buzz = () => { try { const v = new SENSOR.Vibrator(); v.setMode(SENSOR.VIBRATOR_SCENE_SHORT_LIGHT); v.start() } catch (e) {} }
const pruneLog = tk => { for (const k of Object.keys(log.d)) if (+k < tk - 40) delete log.d[k] }
function markPrayer(i) {
  if (cs.cur !== i || !cs.lvl) return
  const key = cs.rk(i)
  const day = log.d[key] || (log.d[key] = [0, 0, 0, 0, 0])
  const elapsedMin = Math.min(999, Math.floor(cs.elapsed / 60))
  day[IQ_OF[i]] = cs.lvl * 1000 + elapsedMin
  pruneLog(cs.todayKey); logVer++; logSave(); buzz()
}
function undoPrayer(i) {
  const key = cs.rk(i), day = log.d[key]
  if (!day || !day[IQ_OF[i]]) return
  day[IQ_OF[i]] = 0
  if (day.every(v => !v)) delete log.d[key]
  logVer++; logSave(); buzz()
}
// لون خلية في الخريطة: ago = كم يوماً مضى، p = رقم الصلاة 0..4
function dotColor(ago, p, nowSec, todayKey) {
  const key = todayKey - ago
  if (log.s && key < log.s) return DOTC.none
  const v = (log.d[key] || [])[p] || 0
  if (v) return LVC[calcLv(v % 1000, st.iq[p])]
  const i = PRI[p]
  if (ago === 0) {
    if (today[i] * 60 > nowSec) return DOTC.none
    const end = i === 5 ? Infinity : today[PNEXT[i]] * 60
    return nowSec < end ? DOTC.pending : DOTC.missed
  }
  if (ago === 1 && i === 5 && nowSec < today[0] * 60) return DOTC.pending   // عشاء أمس قبل فجر اليوم
  return DOTC.missed
}
// الأسبوع الأول (اليوم وما قبله حتى 6 أيام) يبدأ من جهة بدء القراءة ثم يستمر الأسبوع الثاني بعده:
// RTL: اليوم في أقصى اليمين والأسبوع الثاني على اليسار. LTR: اليوم في أقصى اليسار والأسبوع الثاني على اليمين.
function refreshDots(nowSec, todayKey) {
  const rtl = isRTL()
  for (const d of dots) {
    const ago = rtl ? (d.side === 0 ? 13 - d.c : 6 - d.c) : (d.side === 0 ? d.c : 7 + d.c)
    d.wd.setProperty(hmUI.prop.COLOR, dotColor(ago, d.p, nowSec, todayKey))
  }
}
const safe = (fn, d) => { try { const v = fn(); return v === undefined || v === null ? d : v } catch (e) { return d } }

function isCustomRegion() {
  return st.reg === REGIONS.length
}

function getCurrentLocation() {
  if (isCustomRegion()) {
    return { lat: st.lat, lon: st.lon, name: tr('customShort') }
  }
  const region = REGIONS[st.reg] || REGIONS[0]
  const c = region.cities[st.city] || region.cities[0]
  return { lat: c.lat, lon: c.lon, name: nm(c) }
}

function showPage(p) {
  pages.forEach((arr, i) => arr.forEach(w => w.setProperty(hmUI.prop.VISIBLE, i === p)))
  if (ui.tap) ui.tap.setProperty(hmUI.prop.VISIBLE, p < 2)
  if (p === 3) dirBtns.forEach(d => d.wd.setProperty(hmUI.prop.VISIBLE, d.rtl === isRTL()))
  if (p !== 1) for (const k in rowTap) rowTap[k].setProperty(hmUI.prop.VISIBLE, false)

  if (p === 2) {
    const custom = isCustomRegion()
    // إظهار أزرار اختيار المدينة فقط إذا لم يكن "موقع مخصص"
    ui.cityPrev.setProperty(hmUI.prop.VISIBLE, !custom)
    ui.cityText.setProperty(hmUI.prop.VISIBLE, !custom)
    ui.cityNext.setProperty(hmUI.prop.VISIBLE, !custom)

    // إظهار أزرار تعديل الإحداثيات فقط في حالة "موقع مخصص"
    ui.latMinus.setProperty(hmUI.prop.VISIBLE, custom)
    ui.latPlus.setProperty(hmUI.prop.VISIBLE, custom)
    ui.lonMinus.setProperty(hmUI.prop.VISIBLE, custom)
    ui.lonPlus.setProperty(hmUI.prop.VISIBLE, custom)
  }
}

function applyLang() {
  labels.forEach(l => l.wd.setProperty(hmUI.prop.TEXT, tr(l.k)))
  const pr = tr('prayers')
  for (let i = 0; i < 6; i++) rowNames[i].setProperty(hmUI.prop.TEXT, pr[i])
  for (let k = 0; k < 5; k++) iqNames[k].setProperty(hmUI.prop.TEXT, pr[[0, 2, 3, 4, 5][k]])

  ui.langBtn.setProperty(hmUI.prop.TEXT, tr('language'))
  ui.done.setProperty(hmUI.prop.TEXT, tr('done'))
  ui.iqBtn.setProperty(hmUI.prop.TEXT, tr('iqama'))
  ui.iqReset.setProperty(hmUI.prop.TEXT, tr('reset'))
  ui.iqBack.setProperty(hmUI.prop.TEXT, tr('back'))
  ui.arrBtn.setProperty(hmUI.prop.TEXT, tr('arrows') + (st.rev ? tr('arrowsReversed') : tr('arrowsNormal')))
  for (const [b, f] of [[ui.regL, arrowL], [ui.cityPrev, arrowL], [ui.regR, arrowR], [ui.cityNext, arrowR]]) b.setProperty(hmUI.prop.TEXT, f())
  ui.latMinus.setProperty(hmUI.prop.TEXT, tr('lat') + '-')
  ui.latPlus.setProperty(hmUI.prop.TEXT, tr('lat') + '+')
  ui.lonMinus.setProperty(hmUI.prop.TEXT, tr('lon') + '-')
  ui.lonPlus.setProperty(hmUI.prop.TEXT, tr('lon') + '+')

  const custom = isCustomRegion()
  ui.regText.setProperty(hmUI.prop.TEXT, custom ? tr('customLocation') : nm(REGIONS[st.reg]))

  const loc = getCurrentLocation()
  if (!custom) {
    const total = REGIONS[st.reg].cities.length
    ui.cityText.setProperty(hmUI.prop.TEXT, `${loc.name} (${st.city + 1}/${total})`)
  }
  ui.coords.setProperty(hmUI.prop.TEXT, `${tr('lat')}: ${loc.lat.toFixed(4)}  |  ${tr('lon')}: ${loc.lon.toFixed(4)}`)

  applyDir()
}

WatchFace({
  build() {
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: W, h: H, color: 0x000000 })

    // ---------- الصفحة 0: لوحة البيانات ----------
    ui.hr = T(0, 20, 30, 100, 50, 44, C.fg, '--', LEFT)
    T(0, 118, 30, 90, 50, 16, C.dim, { k: 'heartRate' }, LEFT)
    // Hybrid Charge: ثابت BIO_CHARGE في data_type (يعرضه النظام تلقائياً)
    ui.hyb = TI(0, 20, 88, 100, 50, DT.BIO_CHARGE, 'hb', LEFT, CFG.TI_TEST ? '57' : undefined, true) || T(0, 20, 88, 100, 50, 44, C.fg, '--', LEFT)
    T(0, 118, 88, 120, 50, 15, C.dim, { k: 'hybrid' }, LEFT)
    ui.stand = T(0, 15, 160, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 15, 192, 90, 20, 14, C.dim, { k: 'stand' }, LEFT)
    ui.dist = T(0, 110, 160, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 110, 192, 90, 20, 14, C.dim, { k: 'km' }, LEFT)
    ui.steps = T(0, 15, 225, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 15, 257, 90, 20, 14, C.dim, { k: 'steps' }, LEFT)
    ui.kcal = T(0, 110, 225, 90, 36, 28, C.fg, '--', LEFT)
    T(0, 110, 257, 90, 20, 14, C.dim, { k: 'kcal' }, LEFT)
    ui.hh = T(0, 200, 20, 180, 170, 130, C.fg, '00')
    ui.mm = T(0, 200, 185, 180, 170, 130, C.lav, '00')
    R(0, 20, 330, 200, 44, C.green, 22)
    ui.pow = T(0, 20, 330, 200, 44, 26, 0x000000, tr('power'))
    ui.temp = T(0, 235, 330, 140, 44, 34, C.fg, '--°')
    ui.hdate = T(0, 15, 290, 190, 34, 22, C.blue, '', LEFT)   // مكان W-RUN مؤقتاً
    ui.spo2 = T(0, 8, 384, 94, 36, 28, C.fg, '--')
    T(0, 8, 416, 94, 20, 14, C.dim, { k: 'spo2' })
    ui.pai = T(0, 102, 384, 94, 36, 28, C.fg, '--')
    T(0, 102, 416, 94, 20, 14, C.dim, { k: 'pai' })
    ui.hrv = TI(0, 196, 384, 94, 36, DT.HRV, 'hs', undefined, CFG.TI_TEST ? '48' : undefined, true) || T(0, 196, 392, 98, 36, 28, C.fg, '--')
    T(0, 196, 416, 94, 20, 14, C.dim, { k: 'hrv' })
    ui.slp = T(0, 290, 384, 92, 36, 28, C.fg, '--')
    T(0, 290, 416, 92, 20, 14, C.dim, { k: 'sleep' })

    // ---------- الصفحة 1: مواقيت الصلاة ----------
    ui.t2 = T(1, 0, 8, 390, 70, 64, C.fg, '00:00')
    ui.hij = T(1, 0, 78, 390, 38, 28, C.blue, '')
    ui.greg = T(1, 0, 112, 390, 28, 20, C.dim, '')
    ui.next = T(1, 0, 146, 390, 42, 26, C.orange, '')
    for (let i = 0; i < 6; i++) {
      const y = 194 + i * 42
      rowRects.push(R(1, 14, y, 362, 40, 0x1f3d2a, 14))
      rowNames.push(reg(T(1, 215, y, 150, 40, 28, C.fg, tr('prayers')[i], RIGHT), 215, 150, RIGHT, 'mirror'))
      rowTimes.push(reg(T(1, 30, y, 150, 40, 30, C.fg, '--:--', LEFT), 30, 150, LEFT, 'mirror'))
      if (i === 1) {
        // عداد الشروق المستقل: كبسولة بيضاء ونص أسود
        rowElBg[1] = R(1, 141, y + 5, 104, 30, 0xffffff, 15)
        rowEl[1] = T(1, 141, y, 104, 40, 20, 0x000000, '', hmUI.align.CENTER_H)
      } else {
        // كبسولة واحدة: مؤقت أبيض افتراضياً، وبلمسة تعرض وقت التسجيل بلونه ثم تعود. الإطار مفرغ (مستطيل خارجي + داخلي أسود)
        rowPill[i] = {
          bg: R(1, 141, y + 5, 104, 30, CH_HINT, 15),
          inn: R(1, 143, y + 7, 100, 26, 0x000000, 13),
          tx: T(1, 141, y, 104, 40, 20, C.fg, '', hmUI.align.CENTER_H),
        }
      }
    }

    // خريطة النقاط: أسبوع على كل جانب من الساعة، 7 أيام (أعمدة) × 5 صلوات (صفوف) لكل جانب
    for (let side = 0; side < 2; side++) for (let c = 0; c < 7; c++) for (let p = 0; p < 5; p++) {
      dots.push({ wd: R(1, (side === 0 ? DOT_X.l : DOT_X.r) + c * 11, 24 + p * 11, 9, 9, DOTC.none, 4), side, c, p })
    }

    // طبقة اللمس: الضغط المطول يفتح الإعدادات، النقر يبدل الصفحات
    ui.tap = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: W, h: H, color: 0x000000, alpha: 0 })
    let longPressTimer = null

    ui.tap.addEventListener(hmUI.event.CLICK_DOWN, () => {
      if (settingsOpen) return
      if (longPressTimer) { stopTimer(longPressTimer); longPressTimer = null }
      longPressTimer = createTimer(700, 0, () => {
        longPressTimer = null
        settingsOpen = true
        showPage(2)
      })
    })

    ui.tap.addEventListener(hmUI.event.CLICK_UP, () => {
      if (settingsOpen) return
      if (longPressTimer) {
        stopTimer(longPressTimer)
        longPressTimer = null
        currentPage = 1 - currentPage
        st.page = currentPage
        save()
        showPage(currentPage)
        this.tick(true)
      }
    })

    // طبقات لمس صفوف الصلوات (تُنشأ بعد طبقة الصفحة لتكون فوقها): نقرتان للتسجيل، ضغط مطول للتراجع
    const hasRec = i => !!((log.d[cs.rk(i)] || [])[IQ_OF[i]])
    const rowShort = i => {
      if (cs.cur !== i || !cs.lvl) return   // الصفوف السابقة تعرض وقت التسجيل دائماً بلا تفاعل
      if (hasRec(i)) {   // مسجَّلة: لمسة تبدّل بين المؤقت ووقت التسجيل
        if (peekRow === i && peekLeft > 0) { peekLeft = 0; peekRow = -1 } else { peekRow = i; peekLeft = 5 }
      } else if (armRow === i && armLeft > 0) {   // اللمسة الثانية: تسجيل ثم عرض الوقت بلونه مؤقتاً
        markPrayer(i); armRow = -1; armLeft = 0; peekRow = i; peekLeft = 5
      } else { armRow = i; armLeft = 3 }   // اللمسة الأولى: "تأكيد؟"
      this.tick(true)
    }
    const rowLong = i => { if (hasRec(i)) { undoPrayer(i); this.tick(true) } }
    for (const i of PRI) {
      const lay = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: sx(14), y: sy(194 + i * 42), w: sx(362), h: sy(40), color: 0x000000, alpha: 0 })
      lay.setProperty(hmUI.prop.VISIBLE, false)
      let lp = null
      lay.addEventListener(hmUI.event.CLICK_DOWN, () => { if (lp) stopTimer(lp); lp = createTimer(700, 0, () => { lp = null; rowLong(i) }) })
      lay.addEventListener(hmUI.event.CLICK_UP, () => { if (lp) { stopTimer(lp); lp = null; rowShort(i) } })
      rowTap[i] = lay
    }

    // ---------- الصفحة 2: الإعدادات ----------
    // 1. زر اللغة
    ui.langBtn = B(2, 25, 25, 340, 52, 0x2a2a30, 24, '', () => {
      st.lang = LANGS[(LANGS.indexOf(st.lang) + 1) % LANGS.length]; save(); applyLang(); this.tick(true)
    })

    // 2. شريط اختيار المنطقة / الدولة (< اسم المنطقة >)
    const totalRegs = REGIONS.length + 1 // +1 للموقع المخصص
    ui.regL = B(2, 25, 92, 60, 56, 0x2a2a30, 26, arrowL(), () => {
      st.reg = (st.reg + stepL() + totalRegs) % totalRegs; st.city = 0
      save(); cacheKey = ''; applyLang(); showPage(2); this.tick(true)
    })
    ui.regText = T(2, 90, 92, 210, 56, 24, C.blue, '')
    ui.regR = B(2, 305, 92, 60, 56, 0x2a2a30, 26, arrowR(), () => {
      st.reg = (st.reg - stepL() + totalRegs) % totalRegs; st.city = 0
      save(); cacheKey = ''; applyLang(); showPage(2); this.tick(true)
    })

    // 3. شريط اختيار المدينة (< اسم المدينة >)
    ui.cityPrev = B(2, 25, 162, 60, 56, 0x2a2a30, 26, arrowL(), () => {   // الزر الأيسر
      const len = REGIONS[st.reg].cities.length
      st.city = (st.city + stepL() + len) % len
      save(); cacheKey = ''; applyLang(); this.tick(true)
    })
    ui.cityText = T(2, 90, 162, 210, 56, 22, C.fg, '')
    ui.cityNext = B(2, 305, 162, 60, 56, 0x2a2a30, 26, arrowR(), () => {   // الزر الأيمن
      const len = REGIONS[st.reg].cities.length
      st.city = (st.city - stepL() + len) % len
      save(); cacheKey = ''; applyLang(); this.tick(true)
    })

    // 3 (بديل). أزرار تعديل الإحداثيات للموقع المخصص
    ui.latMinus = B(2, 25, 162, 78, 56, 0x3a3a40, 20, 'Lat-', () => {
      st.lat = Math.max(-90, Math.round((st.lat - 0.1) * 10000) / 10000)
      save(); cacheKey = ''; applyLang(); this.tick(true)
    })
    ui.latPlus = B(2, 110, 162, 78, 56, 0x3a3a40, 20, 'Lat+', () => {
      st.lat = Math.min(90, Math.round((st.lat + 0.1) * 10000) / 10000)
      save(); cacheKey = ''; applyLang(); this.tick(true)
    })
    ui.lonMinus = B(2, 202, 162, 78, 56, 0x3a3a40, 20, 'Lon-', () => {
      st.lon = Math.max(-180, Math.round((st.lon - 0.1) * 10000) / 10000)
      save(); cacheKey = ''; applyLang(); this.tick(true)
    })
    ui.lonPlus = B(2, 287, 162, 78, 56, 0x3a3a40, 20, 'Lon+', () => {
      st.lon = Math.min(180, Math.round((st.lon + 0.1) * 10000) / 10000)
      save(); cacheKey = ''; applyLang(); this.tick(true)
    })

    // 4. عرض الإحداثيات الحالية
    ui.coords = T(2, 0, 235, 390, 36, 20, C.dim, '')

    // 4b. عكس اتجاه الأسهم
    ui.arrBtn = B(2, 25, 275, 165, 50, 0x2a2a30, 18, '', () => {
      st.rev = !st.rev; save(); applyLang()
    })

    // 5. زر الحفظ والعودة
    ui.iqBtn = B(2, 200, 275, 165, 50, 0x2a2a30, 20, '', () => { showPage(3) })

    // ---------- الصفحة 3: ضبط الفاصل بين الأذان والإقامة ----------
    T(3, 0, 8, 390, 40, 19, C.dim, { k: 'iqTitle' })
    const adj = (k, d) => {
      st.iq[k] = Math.max(0, Math.min(45, st.iq[k] + d))
      save(); iqVals[k].setProperty(hmUI.prop.TEXT, '' + st.iq[k]); this.tick(true)
    }
    for (let k = 0; k < 5; k++) {
      const y = 56 + k * 52
      // RTL: الأزرار يساراً والاسم يميناً. LTR: الاسم يساراً والأزرار يميناً (إزاحة 86 مع بقاء ترتيب -5 -1 قيمة +1 +5)
      const dual = (x, label, d) => {
        dirBtns.push({ wd: B(3, x, y, 48, 44, 0x2a2a30, 18, label, () => adj(k, d)), rtl: true })
        dirBtns.push({ wd: B(3, x + 86, y, 48, 44, 0x2a2a30, 18, label, () => adj(k, d)), rtl: false })
      }
      dual(18, '-5', -5)
      dual(70, '-1', -1)
      const v = T(3, 122, y, 60, 44, 28, C.fg, '' + st.iq[k])
      iqVals.push(reg(v, 122, 60, hmUI.align.CENTER_H, 'shift', 86))
      dual(186, '+1', 1)
      dual(238, '+5', 5)
      iqNames.push(reg(T(3, 290, y, 85, 44, 22, C.fg, '', RIGHT), 290, 85, RIGHT, 'mirror'))
    }
    ui.iqReset = B(3, 25, 322, 165, 46, 0x5a2a2a, 20, '', () => {
      st.iq = IQ_DEFAULT.slice(); save()
      for (let k = 0; k < 5; k++) iqVals[k].setProperty(hmUI.prop.TEXT, '' + st.iq[k])
      this.tick(true)
    })
    ui.iqBack = B(3, 200, 322, 165, 46, 0x1f8a3d, 22, '', () => { showPage(2) })

    ui.done = B(2, 25, 336, 340, 62, 0x1f8a3d, 28, '', () => {
      settingsOpen = false; ticks = 0; showPage(currentPage); this.tick(true)
    })
    ui.buildInfo = T(2, 0, 404, 390, 22, 14, C.dim, `v${BUILD_VERSION}  ·  ${BUILD_COMMIT}  ·  ${BUILD_TIME}`)

    applyLang()
    showPage(currentPage)

    // تشخيص: كل ثوابت data_type بقيمها (ابحث عن اسم W-RUN)
    // (الـ Console يقطع السطر عند ~1000 حرف، لذلك تُطبع على دفعات من 10)
    try {
      const dt = hmUI.data_type, names = Object.getOwnPropertyNames(dt)
      for (let i = 0; i < names.length; i += 10) console.log('DT_ALL[' + i + ']: ' + names.slice(i, i + 10).map(n => n + '=' + dt[n]).join(' '))
    } catch (e) {}

    const mk = K => { try { return new K() } catch (e) { return null } }
    this.sensors = {
      time: new Time(), hr: mk(HeartRate), bat: mk(Battery), step: mk(Step),
      cal: mk(Calorie), dist: mk(Distance), stand: mk(Stand), pai: mk(Pai), weather: mk(Weather),
      spo2: mk(BloodOxygen), sleep: mk(Sleep),
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

    let page = settingsOpen ? -1 : currentPage
    if (!settingsOpen) showPage(page)

    const loc = getCurrentLocation()
    const key = `${Y}-${M}-${D}-${st.reg}-${st.city}-${loc.lat}-${loc.lon}`
    const hj = toHijri(Y, M, D, CFG.HIJRI_ADJUST)
    if (key !== cacheKey) {
      cacheKey = key
      const o = { lat: loc.lat, lon: loc.lon, tz: CFG.TZ, adj: CFG.ADJ, ishaMin: hj.month === 9 ? 120 : 90 }
      today = getPrayerTimes(Y, M, D, o)
      const n = new Date(Y, M - 1, D + 1)
      tomorrow = getPrayerTimes(n.getFullYear(), n.getMonth() + 1, n.getDate(), o)
      const yd = new Date(Y, M - 1, D - 1)
      yesterday = getPrayerTimes(yd.getFullYear(), yd.getMonth() + 1, yd.getDate(), o)
    }
    const hmonth = tr('hijriMonths')[hj.month - 1]
    const time = pad(h) + ':' + pad(mi)

    if (page === 0 || force) {
      ui.hh.setProperty(hmUI.prop.TEXT, pad(h))
      ui.mm.setProperty(hmUI.prop.TEXT, pad(mi))
      ui.hdate.setProperty(hmUI.prop.TEXT, hj.day + ' ' + hmonth)
      if (ticks % 5 === 1 || force) {
        ui.hr.setProperty(hmUI.prop.TEXT, '' + safe(() => s.hr.getLast(), '--'))
        const b = safe(() => s.bat.getCurrent(), 0)
        ui.pow.setProperty(hmUI.prop.TEXT, tr('power') + b + '%')
        ui.steps.setProperty(hmUI.prop.TEXT, '' + safe(() => s.step.getCurrent(), 0))
        ui.kcal.setProperty(hmUI.prop.TEXT, '' + safe(() => s.cal.getCurrent(), 0))
        ui.dist.setProperty(hmUI.prop.TEXT, safe(() => s.dist.getCurrent() / 1000, 0).toFixed(2))
        ui.stand.setProperty(hmUI.prop.TEXT, pad(safe(() => s.stand.getCurrent(), 0)) + '/' + pad(safe(() => s.stand.getTarget(), 12)))
        ui.pai.setProperty(hmUI.prop.TEXT, '' + Math.round(safe(() => s.pai.getTotal(), 0)))
        ui.spo2.setProperty(hmUI.prop.TEXT, safe(() => {
          const r = s.spo2.getCurrent()
          if (r.retCode === 2 && r.value > 0) return r.value + '%'
          const d = s.spo2.getLastDay().filter(v => v > 0)
          return d.length ? d[d.length - 1] + '%' : '--'
        }, '--'))
        ui.slp.setProperty(hmUI.prop.TEXT, safe(() => { const sc = s.sleep.getInfo().score; return sc > 0 ? '' + sc : '--' }, '--'))
        ui.temp.setProperty(hmUI.prop.TEXT, safe(() => s.weather.getForecast().forecastData.data[0].high, '--') + '°')
      }
    }
    if (page === 1 || force) {
      const nowSec = h * 3600 + mi * 60 + se
      let idx = -1, target = 0
      for (let i = 0; i < 6; i++) if (today[i] * 60 > nowSec) { idx = i; target = today[i] * 60; break }
      if (idx < 0) { idx = 0; target = (tomorrow[0] + 1440) * 60 }
      const left = target - nowSec
      ui.t2.setProperty(hmUI.prop.TEXT, time)
      ui.hij.setProperty(hmUI.prop.TEXT, pad(hj.day) + ' ' + hmonth + ' ' + hj.year)
      ui.greg.setProperty(hmUI.prop.TEXT, tr('weekdays')[new Date(Y, M - 1, D).getDay()] + '  ·  ' + D + '/' + M + '/' + Y + '  ·  ' + loc.name)
      ui.next.setProperty(hmUI.prop.TEXT, tr('prayers')[idx] + '   -' + pad(Math.floor(left / 3600)) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(left % 60))
      // الصلاة الحالية (بين الأذان وما بعده): آخر صلاة دخل وقتها. الفجر ينتهي بالشروق، والعشاء بعد منتصف الليل تُحسب من أمس.
      let cur = -1, elapsed = 0
      for (const i of [0, 2, 3, 4, 5]) if (today[i] * 60 <= nowSec) cur = i
      if (cur === -1) { cur = 5; elapsed = nowSec + 86400 - yesterday[5] * 60 }
      else { elapsed = nowSec - today[cur] * 60; if (cur === 0 && nowSec >= today[1] * 60) cur = -1 }
      const iv = cur >= 0 ? st.iq[IQ_OF[cur]] : 0   // 0 = الميزة معطلة لهذه الصلاة
      let col = C.fg
      if (iv > 0) { const m = elapsed / 60; col = m <= iv ? IQC.g : m <= 2 * iv ? IQC.y : m <= 3 * iv ? IQC.o : IQC.r }
      const fe = x => (x >= 3600 ? pad(Math.floor(x / 3600)) + ':' + pad(Math.floor((x % 3600) / 60)) + ':' + pad(x % 60) : pad(Math.floor(x / 60)) + ':' + pad(x % 60))
      // عداد الشروق المستقل: من الشروق حتى أذان الظهر (خلفية بيضاء ونص أسود)
      const sunUp = nowSec >= today[1] * 60 && nowSec < today[2] * 60
      const sunEl = nowSec - today[1] * 60
      // ----- سجل الأداء وحالة الكبسولات -----
      const todayKey = jdn(Y, M, D)
      if (!log.s) { log.s = todayKey; logSave() }
      const rk = i => (i === 5 && nowSec < today[0] * 60 ? todayKey - 1 : todayKey)   // عشاء ما بعد منتصف الليل يتبع أمس
      const lvl = iv > 0 ? calcLv(elapsed / 60, iv) : 0
      cs = { cur, elapsed, lvl, todayKey, nowSec, rk }
      if (!force && armLeft > 0 && --armLeft === 0) armRow = -1   // انتهت مهلة التأكيد
      if (!force && peekLeft > 0 && --peekLeft === 0) peekRow = -1   // عودة تلقائية إلى المؤقت
      for (let i = 0; i < 6; i++) {
        const slot = IQ_OF[i]
        const key = slot !== undefined ? rk(i) : 0
        const rv = slot !== undefined ? (log.d[key] || [])[slot] || 0 : 0
        const isCur = i === cur && iv > 0
        const armed = isCur && !rv && armRow === i && armLeft > 0
        rowTimes[i].setProperty(hmUI.prop.TEXT, fmt(today[i]))
        rowTimes[i].setProperty(hmUI.prop.COLOR, C.fg)
        rowRects[i].setProperty(hmUI.prop.VISIBLE, i === idx && page === 1)
        if (i === 1) {   // الشروق: عداد مستقل من الشروق حتى الظهر
          if (sunUp) rowEl[1].setProperty(hmUI.prop.TEXT, !st.rev ? fe(sunEl) + '+' : '+' + fe(sunEl))
          else rowEl[1].setProperty(hmUI.prop.TEXT, '')
          rowElBg[1].setProperty(hmUI.prop.VISIBLE, sunUp && page === 1)
          continue
        }
        // كبسولة واحدة: مؤقت أبيض / وقت التسجيل بلونه / "تأكيد؟"
        const timerTx = !st.rev ? fe(elapsed) + '+' : '+' + fe(elapsed)
        const mins = rv % 1000
        const curIv = slot !== undefined ? st.iq[slot] : 0
        const dynLv = rv ? calcLv(mins, curIv) : 0
        const recTx = rv ? fmt((key === todayKey ? today[i] : yesterday[i]) + mins) : ''
        // لون العدّاد الحي يتدرج مع الوقت (col): أخضر ثم أصفر ثم برتقالي ثم أحمر.
        // ممتلئة بنص أسود = لم تُسجَّل بعد، مفرغة = مسجَّلة أو عرض وقت التسجيل.
        let on = false, hollow = true, oc = col, tc = col, tx = ''
        if (rv && !isCur) { on = true; hollow = false; oc = LVC[dynLv]; tc = 0x000000; tx = recTx }   // صلاة سابقة: خلفية بلون التسجيل ونص أسود
        else if (rv) {                                                             // مسجَّلة ونافذتها مفتوحة
          on = true
          if (peekRow === i && peekLeft > 0) { hollow = false; oc = LVC[dynLv]; tc = 0x000000; tx = recTx }   // لمسة: وقت التسجيل بالنمط نفسه
          else { oc = LVC[dynLv]; tc = col; tx = timerTx }                         // الحدود بلون التسجيل، والعدّاد بلون وقته الحالي
        } else if (isCur) {                                                        // غير مسجَّلة
          on = true
          hollow = false; tc = 0x000000                                            // ممتلئة بلون الوقت الحالي ونص أسود
          tx = armed ? tr('confirm') : timerTx                                      // وعند اللمسة الأولى يتبدل النص إلى "تأكيد؟" بنفس اللون
        }
        const pl = rowPill[i]
        pl.tx.setProperty(hmUI.prop.TEXT, on ? tx : '')
        pl.tx.setProperty(hmUI.prop.COLOR, tc)
        if (on) pl.bg.setProperty(hmUI.prop.COLOR, oc)
        pl.bg.setProperty(hmUI.prop.VISIBLE, on && page === 1)
        pl.inn.setProperty(hmUI.prop.VISIBLE, on && hollow && page === 1)
        if (rowTap[i]) rowTap[i].setProperty(hmUI.prop.VISIBLE, page === 1 && (!!rv || isCur))
      }
      const sig = todayKey + ':' + Math.floor(nowSec / 60) + ':' + logVer + ':' + (isRTL() ? 1 : 0)
      if (force || sig !== dotsSig) { dotsSig = sig; refreshDots(nowSec, todayKey) }
    }
  },

  onDestroy() { if (timer) stopTimer(timer) },
})