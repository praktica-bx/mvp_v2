import puppeteer from 'puppeteer';

const APP_URL = process.env.APP_URL || 'http://localhost:5173/';

const testScript = `(async () => {
  try {
    // Attempt to sign in using Nhost credentials if available; fall back to local auth
    const nh = await import('/src/nhost.js')
    let signedIn = false
    try {
      if (window.__TEST_NHOST_EMAIL && window.__TEST_NHOST_PW) {
        console.log('[TEST] attempting nhost sign in for', window.__TEST_NHOST_EMAIL)
        const res = await nh.signInWithNhost(window.__TEST_NHOST_EMAIL, window.__TEST_NHOST_PW)
        console.log('[TEST] nhost signIn result:', res)
        signedIn = !!(res && res.session)
      }
    } catch (e) {
      console.warn('[TEST] nhost sign in failed:', e)
      signedIn = false
    }

    const localAuth = await import('/src/localAuth.js')
    let current = localAuth.getCurrentUserLocal()
    if (!current && !signedIn) {
      const username = 'puppeteer_sync_' + Date.now()
      const sign = await localAuth.signUpLocal(username, 'testpass123')
      console.log('signUpLocal result:', sign)
      current = localAuth.getCurrentUserLocal()
    } else if (signedIn) {
      console.log('signed in via Nhost session')
    } else {
      console.log('already signed in local:', current)
    }

    let householdId = localStorage.getItem('currentHouseholdId')
    if (!householdId) {
      const hh = await nh.createHousehold('Puppeteer Test Household ' + Date.now())
      console.log('created household:', hh)
      householdId = hh.id
      localStorage.setItem('currentHouseholdId', householdId)
    } else {
      console.log('using householdId:', householdId)
    }

    const db = await import('/src/database.js')
    const createdId = await db.addInventoryItem({
      name: 'Sync test item (puppeteer)',
      category: 'pantry',
      quantity: 1,
      created_at: new Date().toISOString()
    })
    console.log('created local item id:', createdId)

    const pending = await db.getPendingChanges()
    console.log('pending changes count:', (pending && pending.length) || 0)

    const syncRes = await db.syncToCloud()
    console.log('sync result:', syncRes)

    return { current, householdId, createdId, pending, syncRes }
  } catch (err) {
    console.error('test sync failed:', err)
    throw err
  }
})()`;

(async () => {
  // Wait for the dev server to be reachable before launching the browser
  const waitForServer = async (url, attempts = 40, delay = 500) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (res && (res.status === 200 || res.status === 304)) return true
      } catch (e) {
        // ignore
      }
      await new Promise(r => setTimeout(r, delay))
    }
    throw new Error(`Server not responding at ${url}`)
  }

  console.log('waiting for server at', APP_URL)
  await waitForServer(APP_URL)

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  // Inject runtime overrides for Nhost configuration (so we don't need to restart Vite)
  const TEST_NHOST_SUBDOMAIN = process.env.TEST_NHOST_SUBDOMAIN || process.env.VITE_NHOST_SUBDOMAIN || ''
  const TEST_NHOST_REGION = process.env.TEST_NHOST_REGION || process.env.VITE_NHOST_REGION || ''
  const TEST_ENABLE_SYNC = process.env.TEST_ENABLE_SYNC || 'true'
  if (TEST_NHOST_SUBDOMAIN) {
    await page.evaluateOnNewDocument((sub, region, enabled) => {
      window.__VITE_NHOST_SUBDOMAIN = sub
      window.__VITE_NHOST_REGION = region
      window.__VITE_ENABLE_CLOUD_SYNC = enabled
    }, TEST_NHOST_SUBDOMAIN, TEST_NHOST_REGION, TEST_ENABLE_SYNC)
  }

  // Inject test credentials if provided
  const TEST_NHOST_EMAIL = process.env.TEST_NHOST_EMAIL || ''
  const TEST_NHOST_PW = process.env.TEST_NHOST_PW || ''
  if (TEST_NHOST_EMAIL) {
    await page.evaluateOnNewDocument((email, pw) => {
      window.__TEST_NHOST_EMAIL = email
      window.__TEST_NHOST_PW = pw
    }, TEST_NHOST_EMAIL, TEST_NHOST_PW)
  }

  // Capture console messages from the page
  page.on('console', msg => {
    const args = msg.args();
    Promise.all(args.map(a => a.jsonValue().catch(() => a.toString()))).then(values => {
      console.log('[PAGE-LOG]', ...values);
    });
  });

  // Capture request failures for /src/* modules and GraphQL
  page.on('requestfailed', req => {
    console.error('[REQUEST-FAILED]', req.url(), req.failure()?.errorText || '')
  })

  // Intercept network responses for debugging
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/src/localAuth.js') || url.includes('/src/database.js') || url.includes('/graphql')) {
      try {
        const text = await res.text();
        console.log('[RESP]', url, 'status:', res.status(), 'len:', text.length);
      } catch (e) {
        console.log('[RESP]', url, 'status:', res.status(), 'error reading body');
      }
    }
  });

  console.log('opening', APP_URL)
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Run the test script in page context with timeout
  const result = await page.evaluate(new Function('return ' + testScript));
  console.log('EVALUATION RESULT:', result);

  await browser.close();
})();
