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

const version = (commits / 100).toFixed(2)

let commitHash = 'unknown'
try {
  const h = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  if (h) commitHash = h
} catch (e) {
  commitHash = 'unknown'
}

let buildTime = ''
try {
  const iso = execSync('git log -1 --format=%cI', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  const d = iso ? new Date(iso) : new Date()
  const pad = n => String(n).padStart(2, '0')
  buildTime = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
} catch (e) {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  buildTime = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
export const COMMIT_COUNT = ${commits}
`

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, content, 'utf8')
console.log(`v${version} · ${commitHash} · ${buildTime}`)
