# 🎨 Resource Card Auto-Fill

> Automatically fill Figma resource cards with website metadata, screenshots, and favicons

A powerful Figma plugin + Node.js server combo that transforms URLs into beautiful, data-rich resource cards. Perfect for design systems, mood boards, and website galleries.

![Resource Card Example](https://via.placeholder.com/800x400/2563eb/ffffff?text=Resource+Card+Auto-Fill)

## ✨ Features

- 🚀 **Instant Screenshots** - Turn empty frames into website previews
- 🎯 **Smart Resource Cards** - Auto-populate with titles, descriptions, favicons
- 🖼️ **Dual Image Support** - OG images with screenshot fallbacks
- 🔄 **Batch Processing** - Handle multiple URLs simultaneously  
- 📊 **Real-time Status** - See exactly what's happening
- 🌐 **Reliable Favicons** - Google's service as fallback

## 🚀 Quick Start

### 1. Install & Setup
```bash
# Clone or download this repository
cd resource-card
npm install
```

### 2. Start Development
```bash
npm run dev
```
This starts both the server (localhost:3000) and TypeScript compilation in watch mode.

### 3. Load Figma Plugin
1. Open Figma
2. Go to **Plugins** → **Development** → **Import plugin from manifest**
3. Select `apps/figma-plugin/manifest.json`

## 📖 How to Use

### 🎯 Quick Screenshot Mode
*Perfect for rapid prototyping and mood boards*

1. **Create an empty frame** in Figma
2. **Name it with a URL** (e.g., "https://tailwindcss.com")
3. **Run the plugin** 
4. **Boom!** Your frame is filled with a website screenshot

```
Frame: "https://example.com" (empty)
       ↓ Plugin Magic ↓
Frame: [Screenshot of example.com as background]
```

### 📋 Resource Card Mode
*For detailed, data-rich components*

1. **Create a component** with these exact layer names:
   - `data:title` - Text layer for page title
   - `data:description` - Text layer for page description
   - `data:sourceURL` - Text layer for hostname
   - `data:cover` - Image layer for OG image or screenshot
   - `data:favicon` - Image layer for site favicon

2. **Name your component** with a URL (e.g., "https://github.com")
3. **Run the plugin**
4. **Watch the magic** as everything auto-populates!

```
Before:
├── data:title (empty text)
├── data:description (empty text)
├── data:sourceURL (empty text)
├── data:cover (empty image)
└── data:favicon (empty image)

After:
├── data:title ("GitHub: Let's build from here")
├── data:description ("GitHub is where over 100 million...")
├── data:sourceURL ("github.com")
├── data:cover (GitHub's OG image)
└── data:favicon (GitHub's favicon)
```

### 🎭 Advanced: Mixed Layouts
*Combine different image sources in one component*

Add a `data:screenshot` layer to always get a website screenshot, even when OG images are available:

```
Component with both:
├── data:cover → OG image (if available) or screenshot fallback
├── data:screenshot → Always a website screenshot
└── Other data layers...
```

## 🏗️ Layer Reference

| Layer Name | Type | Purpose | Example |
|------------|------|---------|---------|
| `data:title` | Text | Page title | "Figma - The collaborative..." |
| `data:description` | Text | Meta description | "Figma is the leading collaborative..." |
| `data:sourceURL` | Text | Domain/hostname | "figma.com" |
| `data:cover` | Image | OG image or screenshot | Hero image from site |
| `data:screenshot` | Image | Always screenshot | Full webpage preview |
| `data:favicon` | Image | Site icon | Company logo/favicon |

## 📊 Plugin Interface

The plugin shows real-time status for everything:

```
Resource Card Auto-Fill
[Run Plugin] [Clear Status]

✅ URL Found: https://example.com
✅ Fetching Metadata: Complete  
✅ Title Layer: Set: Example Domain for illustrative...
✅ Description Layer: Set: This domain is for use in...
✅ Source URL Layer: Set: example.com
✅ Cover Layer: Image applied
✅ Favicon Layer: Image applied
✅ All Complete: Processed 1 item
```

## 🔧 Development Commands

```bash
# Start everything in development mode
npm run dev

# Build for production
npm run build

# Start production server only
npm run start

# Lint all code
npm run lint

# Clean all dependencies
npm run clean
```

## 🏗️ Architecture

```
resource-card/
├── apps/
│   ├── figma-plugin/          # Figma plugin (TypeScript)
│   │   ├── code.ts           # Main plugin logic
│   │   ├── ui.html           # Status interface
│   │   └── manifest.json     # Figma plugin config
│   │                         
│   └── server/               # Express server (Node.js)
│       └── index.js          # Metadata & screenshot API
│
├── package.json              # Turborepo configuration
├── turbo.json               # Build pipeline config
└── README.md                # This file
```

## 🚦 How It Works

### 1. Plugin Detection
- Detects if frame is empty → **Quick Screenshot Mode**
- Finds `data:*` layers → **Resource Card Mode**
- Sends layer requirements to server

### 2. Server Processing
- **Puppeteer** navigates to URL and extracts metadata
- **Smart image handling**: OG images first, screenshot fallback
- **Favicon services**: Site favicon → Google service → DuckDuckGo fallback
- **Sharp optimization**: Compress images while maintaining quality

### 3. Back to Figma
- **Text layers** get populated with extracted text
- **Image layers** get filled with processed images
- **Status UI** shows real-time progress

## 🎨 Example Use Cases

### Design Systems
Create component libraries with real website examples:
```
Navigation Components:
├── "https://stripe.com" → Stripe's navigation
├── "https://linear.app" → Linear's navigation  
└── "https://notion.so" → Notion's navigation
```

### Competitor Analysis
Build comparison boards:
```
Landing Page Inspiration:
├── "https://vercel.com"
├── "https://supabase.com"
└── "https://planetscale.com"
```

### Client Presentations
Show real websites in mockups:
```
Portfolio Layout:
├── Client Website 1 (live screenshot)
├── Client Website 2 (live screenshot)
└── Proposed Redesign (mockup)
```

## ⚡ Pro Tips

### Batch Processing
Select multiple frames/components and run once:
```
✅ [1/3] URL Found: https://github.com
✅ [2/3] URL Found: https://figma.com  
✅ [3/3] URL Found: https://vercel.com
```

### Layer Setup Template
Create a master component with all `data:*` layers, then duplicate:
```
Master Resource Card Component
├── data:title
├── data:description
├── data:sourceURL
├── data:cover
└── data:favicon
```

### Mixed Image Sources
Use both cover and screenshot layers for before/after comparisons:
```
Website Analysis Component
├── data:cover → Current OG image
├── data:screenshot → Actual website appearance
└── (Shows if OG image accurately represents site)
```

## 🔧 Troubleshooting

### Plugin Not Working?
1. **Check server**: Visit `http://localhost:3000` - should see "Cannot GET /"
2. **Run dev mode**: `npm run dev` in the root directory
3. **Rebuild plugin**: `npm run build`

### No Images Loading?
1. **Check console**: Look for CORS or network errors
2. **Verify URLs**: Make sure they start with `http://` or `https://`
3. **Try different sites**: Some sites block automated access

### Layer Names Not Working?
1. **Exact naming**: Must be exactly `data:title`, `data:cover`, etc.
2. **Case sensitive**: Lowercase only
3. **Layer type**: Text layers for text, image layers for images

## 🛠️ Built With

- **[Figma Plugin API](https://www.figma.com/plugin-docs/)** - Plugin framework
- **[Puppeteer](https://pptr.dev/)** - Web scraping and screenshots  
- **[Sharp](https://sharp.pixelplumbing.com/)** - Image processing
- **[Express](https://expressjs.com/)** - Server framework
- **[Turborepo](https://turbo.build/)** - Monorepo management

## 📄 License

MIT License - feel free to use this in your own projects!

---

**Made with ❤️ for the Figma community**

*Transform URLs into beautiful resource cards in seconds!*