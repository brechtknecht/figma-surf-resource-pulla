# Resource Card Auto-Fill

A Turborepo monorepo containing a Figma plugin and Node.js server for automatically filling resource card components with website metadata.

## What it does

1. **Figma Plugin** - Auto-fills resource card components in Figma
2. **Node.js Server** - Fetches website metadata, og:images, favicons, and screenshots

## Quick Start

### Install dependencies
```bash
npm install
```

### Development (runs both apps)
```bash
npm run dev
```

### Build everything
```bash
npm run build
```

## Apps

### 🎨 Figma Plugin (`apps/figma-plugin`)
- Auto-fills components with layers named: `data:title`, `data:description`, `data:sourceURL`, `data:cover`, `data:favicon`
- Real-time status UI showing progress
- Supports multi-selection batch processing
- Prioritizes og:images over screenshots

### 🚀 Server (`apps/server`)
- Express server running on http://localhost:3000
- Fetches metadata using Puppeteer
- Google favicon service fallback
- High-quality image processing with Sharp

## Usage

1. **Start development**: `npm run dev`
2. **In Figma**: Load the plugin from `apps/figma-plugin/manifest.json`
3. **Create resource card** with layers: `data:title`, `data:description`, `data:sourceURL`, `data:cover`, `data:favicon`
4. **Set component name** to a URL (e.g., "https://example.com")
5. **Run plugin** to auto-fill with website data

## Layer Naming Convention

Your Figma components should have layers named exactly:
- `data:title` - Text layer for page title
- `data:description` - Text layer for page description  
- `data:sourceURL` - Text layer for hostname
- `data:cover` - Image layer for og:image or screenshot fallback (with FILL scale mode)
- `data:screenshot` - Image layer that always gets a screenshot (with FILL scale mode)
- `data:favicon` - Image layer for site favicon

## Commands

- `npm run dev` - Start both server and plugin build in watch mode
- `npm run build` - Build both apps for production
- `npm run start` - Start production server
- `npm run lint` - Lint all code
- `npm run clean` - Clean all node_modules

## Architecture

```
resource-card/
├── apps/
│   ├── figma-plugin/     # Figma plugin (TypeScript)
│   └── server/           # Express server (Node.js)
├── package.json          # Root package with Turborepo
└── turbo.json           # Turborepo configuration
```