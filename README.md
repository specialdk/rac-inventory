# RAC Inventory System

Quarry production and inventory management system for Rirratjingu Mining Pty Ltd.

## Project Overview

- **Purpose**: Track production and sales of rock products, sand, and aggregates at product level
- **Integration**: Connects to RAC XERO MCP via quarterly stocktake reconciliation
- **Technology**: Node.js + Express + PostgreSQL + HTML/CSS/JS

## Setup Instructions

### Step 1: VS Code Setup (CURRENT STEP)

```bash
# Initialize project
npm install

# Create .env file from example
cp .env.example .env
# (Don't edit yet - we'll add Railway database URL later)
```

### Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: RAC Inventory System"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### Step 3: Deploy to Railway

1. Go to Railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your rac-inventory repository
5. Add PostgreSQL database

### Step 4: Configure Environment Variables

In Railway dashboard:

- Add `DATABASE_URL` (automatically added by PostgreSQL)
- Add `NODE_ENV=production`
- Add `PORT=3000` (optional)

### Step 5: Run Database Schema

Connect to Railway PostgreSQL and run `database-schema.sql`

## Project Structure

```
rac-inventory/
├── server/
│   ├── config/
│   │   └── database.js          # PostgreSQL connection
│   ├── routes/                  # API endpoints (to be added)
│   ├── middleware/              # Auth & validation (to be added)
│   └── server.js                # Express app
├── public/
│   ├── css/                     # Stylesheets (to be added)
│   ├── js/                      # Frontend logic (to be added)
│   └── pages/                   # HTML pages (to be added)
├── database-schema.sql          # Database setup script
├── package.json
└── README.md
```

## Database Tables

1. **products** - Product catalog with costs and pricing
2. **locations** - Stockpiles and production areas
3. **current_stock** - Real-time inventory balances
4. **stock_movements** - Transaction log (production, sales, adjustments)
5. **customers** - Customer directory
6. **vehicles** - Fleet management
7. **drivers** - Driver directory
8. **product_cost_history** - Historical cost tracking

## API Endpoints (Coming Next)

- `/api/products` - Product management
- `/api/stock` - Current stock queries
- `/api/movements` - Production & sales entries
- `/api/locations` - Location management
- `/api/customers` - Customer management
- `/api/reports` - Reporting and analytics

## Development

```bash
# Run locally
npm run dev

# Test database connection
curl http://localhost:3000/api/health
```

## Integration with Finance Dashboard

The Finance Dashboard can query inventory data via:

- `/api/finance/inventory-summary` - Aggregate totals for Xero
- `/api/finance/inventory-details` - Product-level detail
- `/api/finance/movements` - Movement history
- `/api/finance/reconciliation` - Quarterly reconciliation data

## License

Proprietary - Rirratjingu Aboriginal Corporation
