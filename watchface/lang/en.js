// English. This is also the fallback: any key missing in another language falls back to this file.
export default {
  code: 'en',
  name: 'English',        // language name in its own language
  rtl: false,             // writing direction: true = right-to-left

  prayers: ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hijriMonths: ['Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'],

  // Data page
  heartRate: 'HEART\nRATE',
  hybrid: 'HYBRID\nCHARGE',
  stand: 'STAND',
  km: 'KM',
  steps: 'STEPS',
  kcal: 'KCAL',
  spo2: 'SPO2',
  pai: 'PAI',
  hrv: 'HRV',
  sleep: 'SLEEP',
  power: 'POWER ',

  // Settings
  language: 'Language: English',
  done: 'Done',
  iqama: 'Iqama',
  reset: 'Reset',
  back: 'Back',
  arrows: 'Arrows: ',
  arrowsNormal: 'Normal',
  arrowsReversed: 'Reversed',
  customLocation: 'Custom Location',
  customShort: 'Custom',
  lat: 'Lat',
  lon: 'Lon',
  iqTitle: 'Adhan to Iqama interval (min)',
  confirm: 'OK?',
  cancel: 'Cancel?',
  settings: 'Settings?',

  // Interface guide (the "Guide?" button sits right above "Settings?")
  help: 'Guide?',
  helpTitles: ['Navigation', 'Data page', 'Prayer times', 'After-adhan counter', 'Logging prayers', 'Dots map', 'Settings'],
  helpBodies: [
    'Tap once to switch between the data page and the prayer times page.\nPress and hold to show the Guide and Settings buttons. They hide after 3 seconds.',
    'Shows the time, Hijri date, heart rate, steps, calories, distance, stand, SPO2, PAI, sleep and battery. Values refresh every few seconds.',
    'The top shows the next prayer with the time left, and it is highlighted in the list. After sunrise a separate counter runs until Dhuhr.',
    'After the adhan a counter appears next to the current prayer and changes color: green within the iqama interval, then yellow, orange and finally red. Set each interval in Settings, then Iqama.',
    'To log a prayer, tap its pill twice. The first tap asks you to confirm. Once logged, a tap toggles between the counter and the logged time. To undo, press and hold the pill, then press and hold again when it asks to cancel.',
    'The colored dots summarize your prayer log: seven days on each side of the clock, five dots per day for the five prayers. Each color reflects how long after the adhan it was logged.',
    'Language, region and city or a custom latitude and longitude, arrow direction, and the iqama interval for each prayer. Tap Done to exit.',
  ],
}