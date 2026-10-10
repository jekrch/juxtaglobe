# JuxtaGlobe 🌍

An interactive dual-globe visualization tool that lets you explore Earth from multiple perspectives simultaneously. Compare modern Earth with its antipodal points, explore prehistoric continental configurations, or set two independent points for comparison.

**[juxtaglobe.com](https://www.juxtaglobe.com)**

## Features

### Core Functionality
- **Dual Globe Display**: View two synchronized 3D globes side by side
- **Three Viewing Modes**:
  - **Antipodal Mode**: See the exact opposite point on Earth from any location
  - **Prehistoric Maps**: Explore Earth's continental configurations from different geological periods
  - **Dual-Point Mode**: Set and control two independent points on Earth
- **Location Detection**: Automatically centers on your approximate location via IP geolocation
- **Interactive Controls**: 
  - Drag to rotate globes
  - Scroll/pinch to zoom
  - Click buttons for quick navigation
  - Synchronized or independent control based on mode

### Advanced Features
- **Lock/Unlock Controls** (Dual-Point Mode): 
  - **Locked**: Both globes move together, maintaining their relative offset
  - **Unlocked**: Control each globe independently (altitude remains synchronized)
- **Map Tiles Toggle**: Enable/disable detailed map overlays on both globes
- **URL State Persistence**: 
  - All view states are saved in the URL
  - Share specific locations and views with others
  - Bookmark favorite locations
  - Supports both primary (lat, lng, alt) and secondary (lat2, lng2, alt2) coordinates
- **Responsive Design**: 
  - Optimized for desktop and mobile devices
  - Automatic layout adjustments for different screen sizes
  - Touch-friendly controls on mobile
- **Google Maps Integration**: Quick links to open any location in Google Maps
- **Attribution System**: Click map attributions to view detailed source information

## Prehistoric Maps Available

- Early Triassic (~240 Ma) - Pangea formation
- Early Jurassic (~200 Ma) - Pangea at its peak
- Middle Jurassic (~165 Ma) - Pangea beginning to break apart
- Early Cretaceous (~120 Ma) - Continental drift in progress

*Maps courtesy of C. R. Scotese, [PALEOMAP PaleoAtlas for GPlates v3](https://doi.org/10.5281/zenodo.5460860) (CC BY 4.0)*

## URL Parameters

JuxtaGlobe supports several URL parameters for sharing and bookmarking views:

- `lat`, `lng`, `alt` - Primary globe coordinates and altitude
- `lat2`, `lng2`, `alt2` - Secondary globe coordinates (dual-point mode only)
- `map=t` - Show map tiles when set to 't'

Example URLs:
- Antipodal view of NYC: `/antipodal?lat=40.7128&lng=-74.0060&alt=2.5`
- Dual points (NYC & Tokyo): `/dual-point?lat=40.9009&lng=-73.3583&lat2=35.8176&lng2=139.8101&alt=0.0181&alt2=0.0181&map=t`
- Prehistoric view with map tiles: `/early-jurassic?lat=41.2575&lng=-73.3982&alt=0.6000&map=t`

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite with Bun runtime
- **3D Rendering**: Three.js via react-globe.gl
- **Styling**: Tailwind CSS 4
- **Routing**: React Router
- **Icons**: Lucide React & React Icons
- **Deployment**: GitHub Pages

## Prerequisites

- [Bun](https://bun.sh/) (latest version)
- Node.js 18+ (for compatibility with some tools)
- Git

## Installation

1. Clone the repository:
```bash
git clone https://github.com/jekrch/juxtaglobe.git
cd juxtaglobe
```

2. Install dependencies:
```bash
bun install
```

## Development

Start the development server:
```bash
bun run dev
```

The app will be available at `http://localhost:5173`

## Build

Create a production build:
```bash
bun run build
```

Preview the production build:
```bash
bun run preview
```

## Deployment

Deploy to GitHub Pages:
```bash
bun run deploy
```

This will build the project and push to the `gh-pages` branch.

## Scripts

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run lint` - Run ESLint
- `bun run lint:fix` - Fix ESLint issues
- `bun run deploy` - Deploy to GitHub Pages


## Acknowledgments

- [Three.js](https://threejs.org/) for 3D rendering
- [react-globe.gl](https://github.com/vasturiano/react-globe.gl) for the globe component
- [C. R. Scotese](http://www.scotese.com/) for prehistoric Earth maps
- [ipapi.co](https://ipapi.co/) for IP geolocation services

## License

This project is licensed under the MIT License - see the LICENSE file for details.