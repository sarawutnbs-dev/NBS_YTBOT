import { chromium, Browser, Page } from "playwright";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Scrape transcript from TubeTranscript website using Playwright
 * @param videoId YouTube video ID
 * @param delayMs Optional delay in milliseconds to wait for content to load (default: 5000)
 * @returns Transcript text or null if failed
 */
export async function scrapeTranscriptFromTubeTranscript(
  videoId: string,
  delayMs: number = 5000
): Promise<string | null> {
  let page: Page | null = null;
  let context: any = null;

  try {
    console.log(`[TubeTranscript] Scraping transcript for ${videoId}...`);

    const browser = await getBrowser();

    // Create a context with custom user agent
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    page = await context.newPage();

    // Navigate to TubeTranscript homepage
    const url = `https://www.tubetranscript.com/`;
    console.log(`[TubeTranscript] Navigating to ${url}`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Fill in the YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[TubeTranscript] Entering YouTube URL: ${youtubeUrl}`);

    // Find and fill the input field
    const inputSelector = 'input[placeholder*="YouTube"], input[type="text"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    await page.fill(inputSelector, youtubeUrl);

    // Click the Generate Transcript button
    console.log(`[TubeTranscript] Clicking Generate Transcript button...`);
    const buttonSelector = 'button:has-text("Generate Transcript")';
    await page.click(buttonSelector);

    // Wait for the transcript to be generated
    console.log(`[TubeTranscript] Waiting for transcript to generate...`);
    await page.waitForTimeout(5000);

    // Wait for the main-transcript-content to appear
    const transcriptSelector = '#main-transcript-content';
    let transcriptText: string | null = null;

    try {
      await page.waitForSelector(transcriptSelector, {
        state: 'visible',
        timeout: delayMs
      });

      // Extract text from the transcript content
      transcriptText = await page.$eval(
        transcriptSelector,
        (element) => element.textContent || ''
      );

      console.log(`[TubeTranscript] Found transcript content`);
    } catch (e) {
      console.log(`[TubeTranscript] Timeout waiting for #main-transcript-content, trying alternative selectors...`);

      // Try alternative selectors
      const alternativeSelectors = [
        '[id*="transcript"]',
        '.transcript-content',
        'pre',
        'textarea[readonly]'
      ];

      for (const selector of alternativeSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text && text.trim().length > 100) {
              console.log(`[TubeTranscript] Found transcript using selector: ${selector}`);
              transcriptText = text;
              break;
            }
          }
        } catch (err) {
          continue;
        }
      }
    }

    if (!transcriptText || transcriptText.trim().length === 0) {
      console.log(`[TubeTranscript] No transcript content found for ${videoId}`);
      return null;
    }

    // Clean up the text
    const cleanedText = transcriptText
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n\s*\n/g, '\n'); // Remove excessive newlines

    console.log(`[TubeTranscript] ✅ Successfully scraped transcript for ${videoId} (${cleanedText.length} chars)`);

    return cleanedText;
  } catch (error) {
    console.error(`[TubeTranscript] ❌ Failed to scrape ${videoId}:`, error instanceof Error ? error.message : error);

    // Take a screenshot for debugging if the page exists
    if (page) {
      try {
        const screenshotPath = `./debug-tubetranscript-${videoId}.png`;
        await page.screenshot({ path: screenshotPath });
        console.log(`[TubeTranscript] Debug screenshot saved to ${screenshotPath}`);
      } catch (screenshotError) {
        // Ignore screenshot errors
      }
    }

    return null;
  } finally {
    if (page) {
      await page.close();
    }
    if (context) {
      await context.close();
    }
  }
}

/**
 * Scrape transcripts for multiple videos sequentially
 * @param videoIds Array of YouTube video IDs
 * @param delayMs Delay between requests to avoid rate limiting
 * @returns Map of videoId -> transcript text
 */
export async function scrapeMultipleTranscripts(
  videoIds: string[],
  delayMs: number = 5000
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const videoId of videoIds) {
    const transcript = await scrapeTranscriptFromTubeTranscript(videoId, delayMs);

    if (transcript) {
      results.set(videoId, transcript);
    }

    // Add delay between requests to be respectful
    if (videoIds.indexOf(videoId) < videoIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Close browser when done
  await closeBrowser();

  return results;
}

// Clean up browser on process exit
process.on('exit', () => {
  if (browser) {
    browser.close().catch(() => {});
  }
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});
