# Project Structure

## Root

- `app/` - Next.js App Router pages, layouts, UI components, and frontend context.
- `backend/` - Node.js Express API server and backend package.
- `services/` - Frontend API service modules for auth, wallet, ads, market, orders, chat, cart, and googs.
- `pages/api/` - Next.js API bridge routes and migration endpoint.
- `public/` - Static assets, uploaded images, icons, and public media.
- `assets/` - Project asset files.
- `utils/` - Shared frontend utility modules.
- `types/` - TypeScript declaration files.
- `scratch/` and `tmp/` - Temporary scripts and development checks.

## Frontend

- `app/page.tsx` - Main public entry page.
- `app/layout.tsx` - Root layout.
- `app/globals.css` - Global styles.
- `app/dashboard/` - Authenticated dashboard area.
- `app/dashboard/profile/` - User profile page.
- `app/dashboard/shop/` - Market and product views.
- `app/dashboard/chats/` - Chat interface.
- `app/dashboard/wallet/` - Wallet, top-up, withdrawal, transactions, and coin pages.
- `app/dashboard/ad-campaign/` - Ad campaign creation and management pages.
- `app/components/` - Shared UI components and modals.
- `app/components/ads/` - Advertisement cards, helpers, and interaction UI.
- `app/components/market/` - Product and promoted market components.
- `app/context/CartContext.tsx` - Cart state provider.

## Backend

- `backend/src/server.js` - Express application setup and route mounting.
- `backend/src/routes/` - API route definitions.
- `backend/src/controllers/` - Request handlers and business logic.
- `backend/src/middleware/auth.js` - Authentication middleware.
- `backend/src/config/database.js` - PostgreSQL database connection.
- `backend/src/config/cloudinary.js` - Cloudinary configuration.
- `backend/src/config/upload.js` - Upload handling configuration.
- `backend/src/config/initDb.js` - Database initialization script.
- `backend/src/utils/` - Backend response and async helpers.

## Configuration

- `package.json` - Root Next.js scripts and dependencies.
- `backend/package.json` - Backend scripts and dependencies.
- `next.config.js` - Next.js configuration.
- `tsconfig.json` - TypeScript configuration.
- `eslint.config.mjs` - ESLint configuration.
- `postcss.config.mjs` - PostCSS configuration.
- `.env.local` - Local environment variables.
