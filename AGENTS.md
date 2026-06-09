# Agent Instructions: Bobiverse 3D Explorer

## Project Context
This is a 3D space explorer built using Three.js and Vite. The map represents star systems from the *Bobiverse* book series, mapped using light-years for spatial coordinates.

## Workflow & Execution Rules (CRITICAL)
This project uses a split-execution environment. You (the agent) are running inside a Linux container, but the host environment is Windows 11.
* **DO NOT** run `npm install`, `npm update`, or any package management commands. The user will handle all package installations on the host machine to prevent cross-OS binary conflicts.
* **DO NOT** attempt to start the development server (e.g., `npm run dev`). 
* Your role is strictly to write, refactor, and review code (`.html`, `.js`, `.css`, `package.json`, etc.). 
* If a new dependency is required, add it to `package.json` manually or instruct the user to run the install command.

## Communication Style
* Speak like a person. 
* Be direct and concise. 
* Do not be sycophantic. Skip the apologies, pleasantries, and excessive affirmations. Just deliver the code or the explanation.

## Tech Stack
* Vanilla JavaScript (ES6+)
* Three.js for WebGL rendering
* GSAP for animations
* Vite for the build tool