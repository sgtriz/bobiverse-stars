# Bobiverse Stars Explorer

A 3D interactive star map for the Bobiverse book series by Dennis E. Taylor. Explore star systems, track exploration routes, and discover the universe through the eyes of the Bobs.

## Features

- **3D Star Map**: Navigate a Three.js rendered universe with star positions
- **System Details**: Click any star to view system information, planets, and lore
- **Exploration Routes**: Visualize Bob exploration paths with animated trails
- **Timeline Slider**: Filter systems and routes by discovery year
- **Search**: Find systems, planets, or Bobs instantly
- **Help Modal**: Built-in controls reference with sci-fi HUD aesthetics

## Technologies

- **Three.js** - 3D rendering engine
- **Vite** - Build tool and dev server
- **GSAP** - Animations
- **Vanilla JavaScript** - No framework dependencies

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- npm

### Installation

```bash
# Install dependencies (run on host machine, not in container)
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## Controls

| Input | Action |
|-------|--------|
| Left Click + Drag | Orbit / Rotate Map |
| Right Click + Drag | Pan Map |
| Scroll Wheel | Zoom In/Out |
| Click Star | Open System Telemetry |

> **Tip**: Click the "?" button (bottom-left) to view controls anytime

## Project Structure

```
bobiverse-stars/
├── index.html             # Main HTML entry point
├── package.json           # Dependencies and scripts
├── vite.config.js         # Vite configuration
├── src/
│   ├── main.js            # Three.js scene, interaction logic
│   ├── style.css          # Styles with sci-fi HUD theme
│   └── data/
│       ├── systems.json   # Star system data
│       ├── planets.json   # Planet data
│       └── routes.json    # Exploration routes
└── README.md              # This file
```

## Data Sources

Star positions and basic data derived from:
- Star, Planet, Route & Bob data sourced from the Bobiverse Fandom Wiki under CC BY-SA.
- Astronomical databases (for real star coordinates)

## Acknowledgments

- Dennis E. Taylor for the Bobiverse series
- Three.js community for the 3D rendering engine
- NASA / ESA for astronomical data references

## License

MIT License - feel free to fork and modify for your own projects.

---

**Note**: This is a fan project and is not affiliated with Dennis E. Taylor or his publishers.
