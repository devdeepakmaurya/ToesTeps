# ToesTeps: Flask e-commerce starter

Frontend: HTML, CSS, vanilla JavaScript. Backend: Flask with SQLAlchemy, using SQLite locally and PostgreSQL when `DATABASE_URL` is configured.

## Run it

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

Set another currency with `SHOP_CURRENCY=INR python app.py` (Windows PowerShell: `$env:SHOP_CURRENCY="INR"; python app.py`).

## Render PostgreSQL

1. In Render, create a PostgreSQL database in the same region as the web service.
2. Open the database details and copy its **Internal Database URL**.
3. In the web service, open **Environment** and add `DATABASE_URL` with that URL as its value. Do not put database credentials in source code or commit them to GitHub.
4. Deploy the service with build command `pip install -r requirements.txt` and start command `gunicorn app:app`.

On startup, the app creates the tables and seeds the sample products if the products table is empty. Existing SQLite orders and stock are not migrated automatically to PostgreSQL.

## Structure

```
app.py                 Flask app, SQLite/PostgreSQL setup, JSON API
templates/index.html   Page markup
static/css/style.css   Styles
static/js/app.js       Product grid, cart drawer, checkout
instance/shop.db       Local SQLite database, created on first run
```

## API

| Method | Route                | Purpose                                         |
|--------|----------------------|-------------------------------------------------|
| GET    | /api/products        | List products. Params: q, category, sort        |
| GET    | /api/products/<id>   | One product                                     |
| GET    | /api/categories      | Category names                                  |
| POST   | /api/checkout        | Validate cart, save order, reduce stock         |

Checkout recalculates prices from the database, so the browser cannot change what an item costs.

## Next steps

Payments (Stripe or Razorpay), user accounts, an admin page to manage products, product images, and PostgreSQL for production.
