import os
import re
import sqlite3
import uuid

from flask import Flask, g, jsonify, render_template, request

app = Flask(__name__)
os.makedirs(app.instance_path, exist_ok=True)
DB_PATH = os.path.join(app.instance_path, "shop.db")

# Change this to "INR", "EUR", etc. Prices are stored in minor units (cents/paise).
CURRENCY = os.environ.get("SHOP_CURRENCY", "USD")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SEED_PRODUCTS = [
    # name, category, price (minor units), description, colour, shape, stock
    ("Stoneware Bud Vase", "Vases", 2800, "Hand-thrown, matte glaze. Fits a single stem.", "#2D4FD8", "vase", 14),
    ("Tall Floor Vase", "Vases", 8900, "Waist-high vase with a narrow neck and wide base.", "#1B2230", "vase", 5),
    ("Speckle Mug", "Tableware", 1800, "300 ml mug with a thumb-rest handle. Dishwasher safe.", "#D9663F", "mug", 40),
    ("Morning Bowl", "Tableware", 2200, "Deep bowl for cereal, soup or noodles.", "#4F8A6B", "bowl", 32),
    ("Dinner Plate, Set of 2", "Tableware", 4600, "27 cm plates with a raised rim and satin finish.", "#E0B341", "plate", 18),
    ("Salad Bowl, Large", "Tableware", 5400, "Wide serving bowl, 30 cm across.", "#2D4FD8", "bowl", 9),
    ("Striped Cotton Throw", "Textiles", 6900, "Handwoven cotton, 130 x 180 cm. Washes soft.", "#4F8A6B", "textile", 12),
    ("Indigo Table Runner", "Textiles", 3400, "Block-printed linen runner, 40 x 180 cm.", "#1B2230", "textile", 20),
    ("Woven Cushion Cover", "Textiles", 2400, "45 x 45 cm cover with a hidden zip. Insert not included.", "#D9663F", "cushion", 25),
    ("Ochre Cushion Cover", "Textiles", 2400, "Same weave in a warmer tone. 45 x 45 cm.", "#E0B341", "cushion", 0),
]


# --------------------------------------------------------------------------- DB
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price INTEGER NOT NULL,
            description TEXT NOT NULL,
            color TEXT NOT NULL,
            shape TEXT NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            address TEXT NOT NULL,
            total INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL REFERENCES orders(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity INTEGER NOT NULL,
            unit_price INTEGER NOT NULL
        );
        """
    )
    if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO products (name, category, price, description, color, shape, stock) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            SEED_PRODUCTS,
        )
    db.commit()
    db.close()


# ------------------------------------------------------------------------ pages
@app.get("/")
def index():
    return render_template("index.html")


# -------------------------------------------------------------------------- API
@app.get("/api/config")
def config():
    return jsonify(currency=CURRENCY)


@app.get("/api/categories")
def categories():
    rows = get_db().execute("SELECT DISTINCT category FROM products ORDER BY category").fetchall()
    return jsonify([r["category"] for r in rows])


@app.get("/api/products")
def list_products():
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    sort = request.args.get("sort", "featured")

    sql = "SELECT * FROM products WHERE 1=1"
    params = []
    if q:
        sql += " AND (name LIKE ? OR description LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    if category and category != "All":
        sql += " AND category = ?"
        params.append(category)

    order = {
        "price_asc": "price ASC",
        "price_desc": "price DESC",
        "name": "name COLLATE NOCASE ASC",
    }.get(sort, "id ASC")
    sql += f" ORDER BY {order}"  # `order` comes from a fixed dict, never from user input

    rows = get_db().execute(sql, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.get("/api/products/<int:product_id>")
def get_product(product_id):
    row = get_db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        return jsonify(error="Product not found."), 404
    return jsonify(dict(row))


@app.post("/api/checkout")
def checkout():
    data = request.get_json(silent=True) or {}
    customer = data.get("customer") or {}
    items = data.get("items") or []

    name = str(customer.get("name", "")).strip()
    email = str(customer.get("email", "")).strip()
    address = str(customer.get("address", "")).strip()

    if not name:
        return jsonify(error="Enter your name."), 400
    if not EMAIL_RE.match(email):
        return jsonify(error="Enter a valid email address."), 400
    if len(address) < 8:
        return jsonify(error="Enter your full delivery address."), 400
    if not isinstance(items, list) or not items:
        return jsonify(error="Your cart is empty."), 400

    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")
        lines, total = [], 0
        for item in items:
            try:
                pid, qty = int(item["id"]), int(item["qty"])
            except (KeyError, TypeError, ValueError):
                raise ValueError("Your cart has an invalid item.")
            if qty < 1 or qty > 99:
                raise ValueError("Quantities must be between 1 and 99.")

            product = db.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
            if product is None:
                raise ValueError("An item in your cart no longer exists.")
            if product["stock"] < qty:
                raise ValueError(f"Only {product['stock']} left of {product['name']}.")

            # Price always comes from the database, never from the browser.
            total += product["price"] * qty
            lines.append((pid, qty, product["price"]))

        order_id = "ORD-" + uuid.uuid4().hex[:8].upper()
        db.execute(
            "INSERT INTO orders (id, name, email, address, total) VALUES (?, ?, ?, ?, ?)",
            (order_id, name, email, address, total),
        )
        for pid, qty, unit_price in lines:
            db.execute(
                "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
                (order_id, pid, qty, unit_price),
            )
            db.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, pid))
        db.commit()
    except ValueError as exc:
        db.rollback()
        return jsonify(error=str(exc)), 400
    except Exception:
        db.rollback()
        app.logger.exception("Checkout failed")
        return jsonify(error="Something went wrong. Try again in a moment."), 500

    return jsonify(order_id=order_id, total=total), 201


init_db()

if __name__ == "__main__":
    app.run(debug=True)
