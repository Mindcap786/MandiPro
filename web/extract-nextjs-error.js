const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto('http://localhost:3000/stock/quick-entry');
    await page.waitForTimeout(3000);

    try {
        // The Next.js dev overlay usually has a specific shadow DOM or ID
        // Let's try to extract any text that looks like a runtime error.
        // Easiest is to evaluate all text in the body and look for TypeError, Error, etc.
        // But Next.js error overlay is in a specific element: nextjs-portal
        const frames = page.frames();
        const nextjsPortal = await page.$('nextjs-portal');
        if (nextjsPortal) {
            const shadowRoot = await page.evaluate(el => {
                // Next.js error overlay is in shadow root
                return el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML;
            }, nextjsPortal);
            console.log("NEXT_JS_ERROR_OVERLAY:", shadowRoot);
        } else {
            console.log("No nextjs-portal found.");
        }

    } catch (err) {
        console.log("Error interacting with overlay:", err.message);
    }

    await browser.close();
})();
