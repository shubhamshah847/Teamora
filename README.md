# Node + React Starter

A JavaScript full-stack starter with an Express API and a React app powered by Vite.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

1. From the project root, install dependencies with `npm install`.
2. Start both the API and frontend with `npm run dev`.
3. Open the frontend at `http://localhost:5173`. The API listens on `https://teamora-aq9u.onrender.com` and is available to the frontend through Vite's `/api` proxy.

The sample health endpoint is `GET /api/health`.

## Other commands

- `npm run build` builds the frontend for production.
- `npm start` starts the backend API.

The backend port can be changed with the `PORT` environment variable.