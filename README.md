# mmd-viewer

IMPORTANT: This project is in development.

## Description

An AI MMD motion generation website aimed at automatically generating motions from user input, reducing the workload of motion tracing or keyframing.

The app uses Gemini 2.5 Flash for motion generation and Three.js for rendering MMD/PMX models in the browser.

## Prerequisites

- Node.js 20 or newer
- npm
- A Gemini API key

## Install Dependencies

From the project root, install the required libraries:

```bash
npm install
```

This installs the React, Vite, Three.js, MMD, AI, and TypeScript dependencies listed in `package.json`.

## Environment Variables

Create a `.env` file in the project root:

```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

Optional, only if OpenAI-backed features are used:

```bash
VITE_OPENAI_API_KEY=your_openai_api_key_here
```

## Run the Development Server

```bash
npm run dev
```

Then open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

The MMD viewer page is available at:

```text
http://localhost:5173/MMD
```

## Build

To type-check and build the project:

```bash
npm run build
```

## Preview Production Build

After building:

```bash
npm run preview
```
