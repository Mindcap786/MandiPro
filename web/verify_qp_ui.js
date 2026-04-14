const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set viewport to a desktop size
    await page.setViewport({ width: 1440, height: 900 });

    try {
        console.log("Navigating to quick entry...");
        await page.goto('http://localhost:3000/stock/quick-entry', { waitUntil: 'networkidle2' });

        // Wait for page to load and potentially redirect if auth is needed
        await new Promise(r => setTimeout(r, 2000));

        // If on login page, fill it
        if (page.url().includes('login')) {
            console.log("Logging in...");
            await page.type('input[type="tel"]', '9999999999');
            await page.click('button[type="submit"]');
            await new Promise(r => setTimeout(r, 1000));
            await page.type('input[type="text"]', '123456');
            await page.click('button[type="submit"]');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            await page.goto('http://localhost:3000/stock/quick-entry', { waitUntil: 'networkidle2', timeout: 30000 });
        }

        console.log("Clicking Add Line Item...");
        await page.waitForSelector('button:has-text("ADD LINE ITEM")');
        await page.click('button:has-text("ADD LINE ITEM")');

        // Wait for row to appear
        await new Promise(r => setTimeout(r, 1000));

        console.log("Filling inputs...");
        // Select Unit
        await page.click('button[role="combobox"]');
        await new Promise(r => setTimeout(r, 500));
        await page.click('div[role="option"]:has-text("Carton")');

        // The inputs might be identified by name attribute or label
        // Since we know the structure, let's use name attributes
        await page.type('input[name="rows.0.qty"]', '123456');
        await page.type('input[name="rows.0.rate"]', '543210');
        await page.type('input[name="rows.0.commission"]', '10.5');

        console.log("Switching to Farmer Deductions tab...");
        await page.click('button[role="tab"]:has-text("FARMER DEDUCTIONS")');
        await new Promise(r => setTimeout(r, 1000));

        console.log("Filling deduction inputs...");
        await page.type('input[name="rows.0.less_percent"]', '99.9');
        await page.type('input[name="rows.0.less_units"]', '123456');

        console.log("Taking screenshot...");
        await page.screenshot({ path: '/Users/shauddin/.gemini/antigravity/brain/426a998a-52e1-466e-8646-72fa07c05ffd/quick_purchase_6digit_test.png', fullPage: true });
        console.log("Screenshot saved!");

    } catch (e) {
        console.error("Error during puppeteer execution:", e);
        await page.screenshot({ path: '/Users/shauddin/.gemini/antigravity/brain/426a998a-52e1-466e-8646-72fa07c05ffd/quick_purchase_error.png', fullPage: true });
    } finally {
        await browser.close();
    }
})();
