# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-12-09

### Added

- **PWA Support**: Fully offline-capable Progressive Web App with installation prompt.
- **Circuit Engine**:
  - Standalone, high-performance simulation engine.
  - Stateful simulation for sequential logic (latches, flip-flops).
  - Nested IC support (ICs within ICs).
  - Configurable IO Pin Mapping for ICs via Properties Panel.
- **UI/UX**:
  - Modern, dark-themed UI with Tailwind CSS.
  - Toolbar with basic gates (AND, OR, NOT, NAND, XOR, Buffer) and IO tools.
  - Canvas with pan/zoom and infinite scrolling.
  - Properties Panel for configuring nodes (Label, Color, IO Mapping).
  - Library Drawer for managing custom ICs.
- **Interactions**:
  - Drag-and-drop wire creation with Bezier curves.
  - Multi-selection, Copy, Cut, Paste.
  - Undo/Redo history stack.
  - Switch toggling (click) and dragging (drag).
  - Single-shot tool placement (auto-reset to Select).
- **Storage**:
  - IndexedDB integration for auto-saving circuits and library.
  - Library Export/Import (JSON) for backup and sharing.
- **Documentation**:
  - Comprehensive README.md.
  - MIT License.
  - CI/CD workflow for Cloudflare Pages.

### Fixed

- Fixed switch interaction to distinguish between clicking (toggle) and dragging (move).
- Fixed logic updates occurring while simulation is paused.
- Fixed IC packing to correctly preserve internal state of nested components.
