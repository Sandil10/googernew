# System Overview

## Project

- Name: Googer
- Stack: Next.js, Node.js, PostgreSQL
- Type: Social commerce application with posts, marketplace, ads, wallet, orders, and chat.

## Architecture

- The frontend is built with Next.js App Router.
- The backend is an Express API located in `backend/src`.
- PostgreSQL stores users, posts, products, wallet data, transactions, chats, orders, and ad data.
- Cloudinary and upload middleware support image and media uploads.
- The frontend calls backend endpoints through service modules in `services/`.

## Frontend Layer

- `app/` contains pages, layouts, components, and dashboard routes.
- `app/dashboard/` contains authenticated user workflows.
- `services/` wraps API calls for each domain.
- `CartContext` manages cart state on the frontend.
- Shared modals and UI components live in `app/components/`.

## Backend Layer

- `server.js` configures Express, security middleware, CORS, rate limiting, logging, and JSON parsing.
- API routes are mounted under `/api`.
- Legacy route mounts are also available without the `/api` prefix.
- Controllers handle database operations and business workflows.
- Authentication middleware protects private routes.

## API Domains

- `/api/auth` - Registration, login, profile, password, subscriptions, and user lookups.
- `/api/wallet` - Transfers, payment requests, order payments, and transaction history.
- `/api/ads` - Ad creation, updates, and ad listing.
- `/api/market` - Products, likes, comments, shares, views, and product status.
- `/api/googs` - Social posts, likes, comments, subscriptions, shares, reports, and views.
- `/api/orders` - Order creation, buyer orders, seller orders, status updates, cancellations, and reports.
- `/api/chat` - Conversations, messages, presence, calls, and call signaling.
- `/api/cart` - Cart retrieval, item management, and cart clearing.

## Security

- JWT-based authentication protects private API routes.
- Helmet is used for HTTP security headers.
- Express rate limiting is applied to API requests.
- CORS is configured for development and production origins.
- Password operations use bcrypt.

## Runtime

- Frontend development server runs on port `3000`.
- Backend API runs on port `5000` by default.
- `npm run dev` starts the frontend.
- `npm run dev:all` starts frontend and backend together.
- Cloudflare tunnel scripts are available for public frontend and backend URLs.
