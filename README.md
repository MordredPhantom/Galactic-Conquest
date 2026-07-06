<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4636a24e-0493-4f21-9de3-7cfe6fc8c7ff

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. (Optional) Set `VITE_SERVER_URI` in `.env.local` to the game server URI. Examples:
   - `VITE_SERVER_URI=gc-server.example.com`
   - `VITE_SERVER_URI=https://gc-server.example.com`
   - `VITE_SERVER_URI=wss://gc-server.example.com`
   If omitted, the app uses the same host it is served from.
4. Run the app:
   `npm run dev`
