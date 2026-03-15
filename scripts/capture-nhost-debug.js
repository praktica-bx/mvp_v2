import puppeteer from 'puppeteer'

const main = async () => {
  const url = process.argv[2] || 'http://localhost:5174/'
  console.log('Opening', url)
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()

  page.on('console', msg => {
    const args = msg.args()
    Promise.all(args.map(a => a.jsonValue())).then(vals => {
      console.log('[PAGE]', msg.type(), ...vals)
    }).catch(() => {
      console.log('[PAGE]', msg.type(), msg.text())
    })
  })

  page.on('pageerror', err => console.error('[PAGE ERROR]', err))

  await page.goto(url, { waitUntil: 'networkidle2' })
  // keep open briefly to capture logs
  await new Promise(r => setTimeout(r, 3000))
  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
