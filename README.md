# Kiln & Loom: Flask e-commerce starter

Frontend: HTML, CSS, vanilla JavaScript. Backend: Python Flask with SQLite.

## Run it

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

Set another currency with `SHOP_CURRENCY=INR python app.py` (Windows PowerShell: `$env:SHOP_CURRENCY="INR"; python app.py`).

## Structure

```
app.py                 Flask app, SQLite setup, JSON API
templates/index.html   Page markup
static/css/style.css   Styles
static/js/app.js       Product grid, cart drawer, checkout
instance/shop.db       Created on first run (products, orders, order_items)
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
