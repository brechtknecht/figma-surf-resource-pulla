import express from "express";
import puppeteer from "puppeteer";
import cors from "cors";
import sharp from "sharp"; // Make sure to install sharp via npm

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post("/capture", async (req, res) => {
  const { url, width, height } = req.body;

  const viewportWidth = Math.floor(Number(width));
  const viewportHeight = Math.floor(Number(height));

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 2,
    });

    await page.goto(url, { waitUntil: "networkidle2" });

    const cookieButtonSelector = 'yt-spec-touch-feedback-shape__fill';

    const buttonExists = await page.$(cookieButtonSelector);
    if (buttonExists) {
      await page.click(cookieButtonSelector);

      await setTimeout(10000);
    }

    const buffer = await page.screenshot({ fullPage: false, type: "png" });

    await browser.close();

    // Use Sharp to compress the image
    const optimizedBuffer = await sharp(buffer)
      .resize(Math.floor(viewportWidth * 1), Math.floor(viewportHeight * 1))
      .png({ quality: 100 })
      .toBuffer();

    res.json({
      success: true,
      imageUrl: `data:image/png;base64,${optimizedBuffer.toString("base64")}`,
    });
  } catch (error) {
    console.error("Screenshot error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/metadata", async (req, res) => {
  const { url, width, height } = req.body;

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: "networkidle2" });

    const metadata = await page.evaluate(() => {
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta ? meta.getAttribute('content') : null;
      };

      // Debug: log all meta tags
      const allMetas = Array.from(document.querySelectorAll('meta')).map(meta => ({
        name: meta.getAttribute('name'),
        property: meta.getAttribute('property'),
        content: meta.getAttribute('content')
      }));
      console.log('All meta tags found:', allMetas.filter(m => m.property?.includes('og:') || m.name?.includes('twitter:')));

      const ogImageDebug = {
        'og:image': getMetaContent('og:image'),
        'og:image:url': getMetaContent('og:image:url'),
        'twitter:image': getMetaContent('twitter:image'),
        'twitter:image:src': getMetaContent('twitter:image:src')
      };
      console.log('OG Image debug:', ogImageDebug);

      return {
        title: document.title || getMetaContent('og:title') || getMetaContent('twitter:title'),
        description: getMetaContent('description') || getMetaContent('og:description') || getMetaContent('twitter:description'),
        ogImage: (() => {
          // Try multiple og:image sources
          const imageSelectors = [
            'og:image',
            'og:image:url', 
            'twitter:image',
            'twitter:image:src'
          ];
          
          for (const selector of imageSelectors) {
            const image = getMetaContent(selector);
            console.log(`Checking ${selector}:`, image);
            if (image) {
              try {
                const absoluteUrl = new URL(image, window.location.href).href;
                console.log(`Found image URL: ${absoluteUrl}`);
                return absoluteUrl;
              } catch (e) {
                console.log(`Invalid URL for ${selector}:`, image, e.message);
                continue;
              }
            }
          }
          console.log('No og:image found');
          return null;
        })(),
        favicon: (() => {
          // Try multiple favicon selectors
          const selectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]', 
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]'
          ];
          
          for (const selector of selectors) {
            const favicon = document.querySelector(selector);
            if (favicon && favicon.href) {
              try {
                return new URL(favicon.href, window.location.href).href;
              } catch (e) {
                continue;
              }
            }
          }
          
          // Fallback to /favicon.ico
          try {
            return new URL('/favicon.ico', window.location.href).href;
          } catch (e) {
            return null;
          }
        })(),
        hostname: window.location.hostname
      };
    });

    console.log('Extracted metadata:', {
      title: metadata.title,
      description: metadata.description?.substring(0, 50) + '...',
      ogImage: metadata.ogImage,
      favicon: metadata.favicon,
      hostname: metadata.hostname
    });

    // Fetch images server-side to avoid CORS
    let coverImageBase64 = null;
    let faviconImageBase64 = null;

    // PRIORITY: Try to fetch og:image first with proper headers
    if (metadata.ogImage) {
      console.log('=== ATTEMPTING OG:IMAGE FETCH ===');
      try {
        console.log('Fetching og:image from:', metadata.ogImage);
        
        // Add timeout and better error handling
        const controller = new AbortController();
        const timeoutId = global.setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        const ogResponse = await fetch(metadata.ogImage, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ResourceCardBot/1.0)',
            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Referer': url
          },
          signal: controller.signal
        });
        
        global.clearTimeout(timeoutId);
        console.log('OG image response status:', ogResponse.status);
        console.log('OG image response headers:', Object.fromEntries(ogResponse.headers.entries()));
        
        if (ogResponse.ok) {
          const contentType = ogResponse.headers.get('content-type');
          console.log('OG image content-type:', contentType);
          
          if (contentType && contentType.startsWith('image/')) {
            const ogBuffer = await ogResponse.arrayBuffer();
            console.log('OG image buffer size:', ogBuffer.byteLength);
            
            if (ogBuffer.byteLength > 0) {
              // Preserve full image, only optimize quality - let Figma handle cropping
              console.log('Processing full og:image without cropping');
              
              const optimizedBuffer = await sharp(Buffer.from(ogBuffer))
                .jpeg({ quality: 85 }) // Slightly lower quality to reduce file size
                .toBuffer();
              coverImageBase64 = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
              console.log('=== OG IMAGE SUCCESS (FULL IMAGE) ===');
            } else {
              console.log('OG image buffer is empty');
            }
          } else {
            console.log('OG image response is not an image, content-type:', contentType);
          }
        } else {
          console.log('OG image fetch failed with status:', ogResponse.status, ogResponse.statusText);
        }
      } catch (e) {
        console.log('Failed to fetch og:image:', e.message);
        if (e.name === 'AbortError') {
          console.log('OG image fetch timed out');
        }
      }
    }

    // FALLBACK: If no og:image, take screenshot
    if (!coverImageBase64) {
      console.log('=== NO OG:IMAGE - TAKING SCREENSHOT FALLBACK ===');
      
      // Use standard desktop viewport for screenshots (not frame dimensions)
      const screenshotWidth = 1920;
      const screenshotHeight = 1080;
      
      console.log('Setting viewport for screenshot:', screenshotWidth, 'x', screenshotHeight);
      
      await page.setViewport({
        width: screenshotWidth,
        height: screenshotHeight,
        deviceScaleFactor: 1, // Use 1x scale for better performance and coverage
      });

      // Wait a bit more for page to adjust to new viewport
      await new Promise(resolve => global.setTimeout(resolve, 2000));

      const buffer = await page.screenshot({ fullPage: false, type: "png" });
      
      // Only optimize quality, keep full screenshot - let Figma handle scaling
      const optimizedBuffer = await sharp(buffer)
        .jpeg({ quality: 85 })
        .toBuffer();
      coverImageBase64 = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
      console.log('=== SCREENSHOT SUCCESS (FULL PAGE) ===');
    } else {
      console.log('=== USING OG:IMAGE - SKIPPING SCREENSHOT ===');
    }

    // Fetch favicon with fallbacks
    const faviconUrls = [
      metadata.favicon,
      `https://www.google.com/s2/favicons?domain=${metadata.hostname}&sz=64`,
      `https://icons.duckduckgo.com/ip3/${metadata.hostname}.ico`
    ].filter(Boolean);

    for (const faviconUrl of faviconUrls) {
      try {
        console.log('Fetching favicon from:', faviconUrl);
        const faviconResponse = await fetch(faviconUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ResourceCardBot/1.0)'
          }
        });
        console.log('Favicon response status:', faviconResponse.status);
        
        if (faviconResponse.ok) {
          const faviconBuffer = await faviconResponse.arrayBuffer();
          console.log('Favicon buffer size:', faviconBuffer.byteLength);
          
          if (faviconBuffer.byteLength > 0) {
            const optimizedFavicon = await sharp(Buffer.from(faviconBuffer))
              .resize(64, 64, { fit: 'cover' })
              .png()
              .toBuffer();
            faviconImageBase64 = `data:image/png;base64,${optimizedFavicon.toString('base64')}`;
            console.log('Favicon processed successfully from:', faviconUrl);
            break;
          }
        }
      } catch (e) {
        console.log('Failed to fetch favicon from', faviconUrl, ':', e.message);
        continue;
      }
    }

    if (!faviconImageBase64) {
      console.log('All favicon sources failed');
    }

    await browser.close();

    res.json({
      success: true,
      metadata,
      coverImage: coverImageBase64,
      faviconImage: faviconImageBase64
    });
  } catch (error) {
    console.error("Metadata error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
