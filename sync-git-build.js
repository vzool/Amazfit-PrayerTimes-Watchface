const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const outFile = path.join(__dirname, 'watchface', 'build_info.js')
const appJsonFile = path.join(__dirname, 'app.json')

let commits = 0
try {
  const out = execSync('git rev-list --count HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  const n = parseInt(out, 10)
  if (Number.isFinite(n)) commits = n
} catch (e) {
  commits = 0
}

const baseVersion = (commits / 100).toFixed(2)
// حساب عدد الملفات المتغيرة/غير المتتبعة في Git للدلالة على نسخة قيد التطوير
let dirtyCount = 0
let changedFiles = []
try {
  const statusOut = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
  const lines = statusOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  dirtyCount = lines.length
  changedFiles = lines.map(l => l.replace(/^[A-Z?\s]+/, '').trim())
} catch (e) {
  dirtyCount = 0
  changedFiles = []
}

// التحقق مما إذا كان التغيير الوحيد (dirtyCount === 1) في app.json يقتصر على سطر "name": "...-dev..."
let isOnlyDevNameInAppJson = false
if (dirtyCount === 1 && changedFiles[0] === 'app.json' && fs.existsSync(appJsonFile)) {
  try {
    const diffOut = execSync('git diff -U0 app.json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
    const added = diffOut.split(/\r?\n/).filter(l => l.startsWith('+') && !l.startsWith('+++'))
    const removed = diffOut.split(/\r?\n/).filter(l => l.startsWith('-') && !l.startsWith('---'))
    if (
      added.length === 1 &&
      removed.length === 1 &&
      /"name"\s*:\s*"[^"]+-dev\d+"/.test(removed[0]) &&
      /"name"\s*:\s*"[^"]+"/.test(added[0]) &&
      !/-dev\d+/.test(added[0])
    ) {
      isOnlyDevNameInAppJson = true
    }
  } catch (e) {
    isOnlyDevNameInAppJson = false
  }
}

const effectiveDirtyCount = isOnlyDevNameInAppJson ? 0 : dirtyCount
const version = effectiveDirtyCount > 0 ? `${baseVersion}-dev${effectiveDirtyCount}` : baseVersion


let commitHash = 'unknown'
try {
  const h = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  if (h) commitHash = h
} catch (e) {
  commitHash = 'unknown'
}

const pad = n => String(n).padStart(2, '0')
const fmtDt = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`

// تاريخ الحفظ (آخر commit في Git)
let commitTime = ''
try {
  const iso = execSync('git log -1 --format=%cI', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  const d = iso ? new Date(iso) : new Date()
  commitTime = fmtDt(d)
} catch (e) {
  commitTime = fmtDt(new Date())
}

// تاريخ البناء: لحظة تنفيذ أمر البناء الفعلية
const buildTime = fmtDt(new Date())

// تحديث app.version في app.json ليتطابق مع عدد commits ورقم الإصدار
if (fs.existsSync(appJsonFile)) {
  try {
    const raw = fs.readFileSync(appJsonFile, 'utf8')
    const appCfg = JSON.parse(raw)
    if (appCfg && appCfg.app) {
      const prevCode = appCfg.app.version && Number.isFinite(appCfg.app.version.code) ? appCfg.app.version.code : 1
      appCfg.app.version = {
        ...(appCfg.app.version || {}),
        code: prevCode,
        name: version,
      }
      fs.writeFileSync(appJsonFile, JSON.stringify(appCfg, null, 2) + '\n', 'utf8')
    }
  } catch (e) {
    console.warn('Could not update app.json version:', e.message)
  }
}

const content = `// ملف يُولَّد تلقائياً من Git عند كل بناء - لا تعدّله يدوياً
export const BUILD_VERSION = '${version}'
export const BUILD_COMMIT = '${commitHash}'
export const BUILD_TIME = '${buildTime}'
export const COMMIT_TIME = '${commitTime}'
export const COMMIT_COUNT = ${commits}
export const DIRTY_COUNT = ${effectiveDirtyCount}
`

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, content, 'utf8')
console.log(`v${version} (dirty: ${effectiveDirtyCount}${isOnlyDevNameInAppJson ? ', release-name-only' : ''}) · ${commitHash} · build: ${buildTime} · commit: ${commitTime}`)
