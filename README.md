# EnRoot G3 Maze Game Booth

A basic 3D marble maze game for the browser.

Play by tilting a DualSense controller or use keyboard controls. After 3 successful completions, a code is revealed. Tilt the controller and the board tilts with it, rolling the ball through the maze. Added some haptics for the controller.

## Built with

- [three.js](https://threejs.org) for the 3D graphics
- [Vite](https://vite.dev) for running and building the project
- WebHID, a browser feature that lets web pages talk to game controllers + support rumble

## What you need

- **Chromium Browser** Chrome, Edge, Helium etc support WebHID, which is needed for controller support.
- **A DualSense (PS5) controller** to play by tilting. Wired via usb cable works best, but bluetooth also works.
## How to play

1. Open the game in a chromium browser.
2. Click **Connect Controller** and choose your DualSense from the list.

4. Tilt the controller to roll the ball, and guide it into the hole.

To calibrate the board to neutral position, hold the controller flat and press **✕**.

On a keyboard, use the **arrow keys** to tilt the board.

## Setup Instructions

 [Node.js](https://nodejs.org) installed (version 20 or newer).

1. Download or clone this project, then open a terminal in its folder.
2. Install:

   ```bash
   npm install
   ```

3. Start the game:

   ```bash
   npm run dev
   ```

4. Click or paste the link, usually `http://localhost:5173`. 

Halt with  `Ctrl + C`.

### Making a version to share

To build a copy you can upload to a website:

```bash
npm run build
```

### Potential room for improvements

Not pursued as mvp sufficient

- Better haptics, HD Rumble doesn't feel great
- Mobile support? Would be fun to use your phone as the maze board in the browser. But haptics doesnt work on mobile WebKit
- [Gamepad](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) vibration fallback for non-chromium browsers
