# LogicSim - Progressive Web App Logic Simulator

LogicSim is a powerful, offline-capable logic circuit simulator built with React, TypeScript, and Vite. It allows you to design, simulate, and pack complex digital logic circuits directly in your browser.

![LogicSim Screenshot](https://via.placeholder.com/800x450?text=LogicSim+Screenshot)

## Features

- **High-Performance Engine**: Custom-built circuit engine optimized for speed and accuracy.
- **PWA Support**: Installable on Desktop and Mobile, works completely offline.
- **Component Library**:
  - Basic Gates: AND, OR, NOT, NAND, XOR, Buffer
  - Input/Output: Switches, Lights, Clock
  - **Custom ICs**: Pack your circuits into reusable Integrated Circuits (ICs).
- **Advanced Simulation**:
  - Stateful simulation (supports latches, flip-flops, registers).
  - Nested IC support (ICs within ICs).
  - Configurable Pin Mapping for ICs.
- **User-Friendly Interface**:
  - Drag-and-drop wire creation with Bezier curves.
  - Multi-selection, Copy/Paste, Undo/Redo.
  - Properties Panel for detailed configuration.
- **Local Storage**: Auto-saves your work and library to IndexedDB.
- **Export/Import**: Backup and share your custom component library.

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB (via `idb`)
- **PWA**: `vite-plugin-pwa`
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/yourusername/logic-sim.git
    cd logic-sim
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

### Building for Production

To create a production build (including PWA assets):

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Deployment

### Cloudflare Pages

This project is configured for deployment on Cloudflare Pages.

1.  Connect your GitHub repository to Cloudflare Pages.
2.  Use the following build settings:
    - **Framework Preset**: Vite
    - **Build Command**: `npm run build`
    - **Output Directory**: `dist`
3.  (Optional) For automated deployments via GitHub Actions, see `.github/workflows/deploy.yml`.

## Usage

1.  **Place Components**: Select a tool from the left toolbar and click on the canvas.
2.  **Connect Wires**: Drag from an output pin (right side of node) to an input pin (left side).
3.  **Simulate**: Click switches to toggle state. The simulation runs in real-time.
4.  **Create IC**:
    - Select a group of nodes (including Inputs/Switches and Outputs/Lights).
    - Right-click and select "Pack into IC".
    - Give it a name. It is now saved in your Library.
5.  **Configure IC**: Select a packed IC to remap its pins in the Properties Panel.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
