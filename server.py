#!/usr/bin/env python3
"""
Otech Digital Menu & Order Management System
Restaurant Tables + Hotel Room Service
Python + SQLite backend (no external deps beyond stdlib)
"""

import http.server
import socketserver
from socketserver import ThreadingMixIn
import json
import sqlite3
import os
import uuid
import hashlib
import time
import urllib.parse
from datetime import datetime
from pathlib import Path

PORT = int(os.environ.get("PORT", os.environ.get("OTECH_PORT", "8080")))
BASE_DIR = Path(__file__).parent
DATA_DIR = Path(os.environ.get("OTECH_DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "otech_menu.db"
PUBLIC_DIR = BASE_DIR / "public"
# Public internet URL for QR codes (set on free hosts, e.g. https://your-app.onrender.com)
PUBLIC_BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")

DATA_DIR.mkdir(exist_ok=True)

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TEXT
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        service_type TEXT DEFAULT 'both'  -- restaurant, room, both
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        image_url TEXT,
        available INTEGER DEFAULT 1,
        service_type TEXT DEFAULT 'both',
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,  -- T01, R101 etc
        name TEXT,
        type TEXT NOT NULL,  -- table or room
        active INTEGER DEFAULT 1,
        qr_token TEXT UNIQUE
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE,
        location_id INTEGER,
        location_code TEXT,
        location_type TEXT,
        customer_name TEXT,
        status TEXT DEFAULT 'pending',  -- pending, preparing, ready, delivered, completed, cancelled
        notes TEXT,
        total REAL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (location_id) REFERENCES locations(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        menu_item_id INTEGER,
        item_name TEXT,
        quantity INTEGER,
        unit_price REAL,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')
    
    # Default admin: admin / admin123
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        pw = hashlib.sha256("admin123".encode()).hexdigest()
        c.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                  ("admin", pw, "admin", datetime.now().isoformat()))
    
    # Default settings (business, branding, theme, currency)
    defaults = {
        "business_name": "Otech Restaurant & Hotel",
        "restaurant_name": "Otech Restaurant & Hotel",
        "tagline": "Digital Menu & Room Service",
        "address": "Port Moresby, Papua New Guinea",
        "phone": "+675 000 0000",
        "email": "info@otech.pg",
        "currency": "PGK",
        "currency_symbol": "K",
        "tax_rate": "0",
        "tax_label": "GST",
        "welcome_message": "Welcome! Scan the QR code to view our digital menu and place your order.",
        "logo_url": "",
        "logo_base64": "",
        "theme_primary": "#0f766e",
        "theme_accent": "#f59e0b",
        "theme_bg": "#f8fafc",
        "theme_mode": "light",
        "service_note": "Room service available 6:00 AM – 10:00 PM",
        "order_success_msg": "Your order has been received and is being prepared.",
        "show_prices": "1",
        "allow_notes": "1"
    }
    for k, v in defaults.items():
        c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    
    # Sample categories & items if empty
    c.execute("SELECT COUNT(*) FROM categories")
    if c.fetchone()[0] == 0:
        cats = [
            ("Starters", "Appetizers and light bites", 1, "both"),
            ("Main Courses", "Hearty main dishes", 2, "both"),
            ("Drinks", "Hot and cold beverages", 3, "both"),
            ("Desserts", "Sweet endings", 4, "both"),
            ("Room Service Specials", "Available for in-room dining", 5, "room"),
        ]
        for name, desc, order, stype in cats:
            c.execute("INSERT INTO categories (name, description, sort_order, service_type) VALUES (?, ?, ?, ?)",
                      (name, desc, order, stype))
        
        # Sample items
        items = [
            (1, "Garlic Bread", "Toasted with garlic butter", 12.00, "both"),
            (1, "Chicken Wings", "Crispy wings with BBQ sauce", 25.00, "both"),
            (1, "Garden Salad", "Fresh mixed greens", 18.00, "both"),
            (2, "Grilled Fish & Chips", "Local catch with fries", 45.00, "both"),
            (2, "Chicken Stir Fry", "With vegetables and rice", 38.00, "both"),
            (2, "Beef Burger", "With cheese, lettuce & fries", 35.00, "restaurant"),
            (2, "Club Sandwich", "Triple decker with chips", 32.00, "room"),
            (3, "Fresh Coconut Water", "Local young coconut", 8.00, "both"),
            (3, "Soft Drink", "Coke, Sprite, Fanta", 6.00, "both"),
            (3, "Coffee / Tea", "Hot beverage", 7.00, "both"),
            (3, "Fresh Juice", "Orange or pineapple", 10.00, "both"),
            (4, "Chocolate Cake", "Rich slice", 15.00, "both"),
            (4, "Ice Cream", "2 scoops", 12.00, "both"),
            (5, "Midnight Snack Box", "Sandwich, fruit & drink", 40.00, "room"),
            (5, "Breakfast Tray", "Eggs, toast, juice, coffee", 35.00, "room"),
        ]
        for cat_id, name, desc, price, stype in items:
            c.execute("""INSERT INTO menu_items (category_id, name, description, price, available, service_type)
                         VALUES (?, ?, ?, ?, 1, ?)""", (cat_id, name, desc, price, stype))
    
    # Sample locations
    c.execute("SELECT COUNT(*) FROM locations")
    if c.fetchone()[0] == 0:
        for i in range(1, 9):
            code = f"T{i:02d}"
            token = str(uuid.uuid4())[:8]
            c.execute("INSERT INTO locations (code, name, type, qr_token) VALUES (?, ?, 'table', ?)",
                      (code, f"Table {i}", token))
        for i in range(101, 111):
            code = f"R{i}"
            token = str(uuid.uuid4())[:8]
            c.execute("INSERT INTO locations (code, name, type, qr_token) VALUES (?, ?, 'room', ?)",
                      (code, f"Room {i}", token))
    
    conn.commit()
    conn.close()
    print("Database initialized.")

class OtechHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
    
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)
        
        if path.startswith("/api/"):
            self.handle_api_get(path, qs)
        else:
            # Serve static or index
            if path == "/" or path == "":
                self.path = "/index.html"
            super().do_GET()
    
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            data = json.loads(body) if body else {}
        except:
            data = {}
        self.handle_api_post(path, data)
    
    def do_PUT(self):
        self.do_POST()
    
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        self.handle_api_delete(path)
    
    def json_response(self, data, status=200):
        try:
            body = json.dumps(data, default=str).encode("utf-8")
        except Exception as e:
            body = json.dumps({"error": str(e)}).encode("utf-8")
            status = 500
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    
    def handle_api_get(self, path, qs):
        conn = get_db()
        c = conn.cursor()
        
        try:
            if path == "/api/settings":
                c.execute("SELECT key, value FROM settings")
                settings = {row["key"]: row["value"] for row in c.fetchall()}
                self.json_response(settings)
            
            elif path == "/api/users":
                c.execute("SELECT id, username, role, created_at FROM users ORDER BY username")
                rows = [dict(r) for r in c.fetchall()]
                self.json_response(rows)
            
            elif path == "/api/categories":
                service = qs.get("service", ["both"])[0]
                if service == "both":
                    c.execute("SELECT * FROM categories WHERE active=1 ORDER BY sort_order")
                else:
                    c.execute("SELECT * FROM categories WHERE active=1 AND (service_type=? OR service_type='both') ORDER BY sort_order", (service,))
                rows = [dict(r) for r in c.fetchall()]
                self.json_response(rows)
            
            elif path == "/api/menu":
                service = qs.get("service", ["both"])[0]
                cat_id = qs.get("category_id", [None])[0]
                if cat_id:
                    c.execute("""SELECT m.*, c.name as category_name FROM menu_items m
                                 JOIN categories c ON m.category_id = c.id
                                 WHERE m.available=1 AND m.category_id=? AND (m.service_type=? OR m.service_type='both')
                                 ORDER BY m.sort_order""", (cat_id, service))
                else:
                    if service == "both":
                        c.execute("""SELECT m.*, c.name as category_name FROM menu_items m
                                     JOIN categories c ON m.category_id = c.id
                                     WHERE m.available=1 ORDER BY c.sort_order, m.sort_order""")
                    else:
                        c.execute("""SELECT m.*, c.name as category_name FROM menu_items m
                                     JOIN categories c ON m.category_id = c.id
                                     WHERE m.available=1 AND (m.service_type=? OR m.service_type='both')
                                     ORDER BY c.sort_order, m.sort_order""", (service,))
                rows = [dict(r) for r in c.fetchall()]
                self.json_response(rows)
            
            elif path == "/api/ping":
                self.json_response({"ok": True, "service": "otech-digital-menu", "time": datetime.now().isoformat()})
            
            elif path == "/api/network":
                ips = get_lan_ips()
                real = [ip for ip in ips if not str(ip).startswith("(")]
                base = f"http://{real[0]}:{PORT}" if real else f"http://localhost:{PORT}"
                # refresh setting
                try:
                    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ("lan_base_url", base))
                    conn.commit()
                except Exception:
                    pass
                pub = PUBLIC_BASE_URL
                try:
                    c.execute("SELECT value FROM settings WHERE key='public_base_url'")
                    row = c.fetchone()
                    if row and row[0]:
                        pub = row[0]
                except Exception:
                    pass
                self.json_response({
                    "port": PORT,
                    "lan_ips": real,
                    "base_url": pub or base,
                    "lan_base_url": base,
                    "public_base_url": pub or "",
                    "hint": "Set public_base_url for internet QR codes; lan_base_url for same Wi-Fi"
                })
            
            elif path == "/api/locations":
                loc_type = qs.get("type", [None])[0]
                if loc_type:
                    c.execute("SELECT * FROM locations WHERE active=1 AND type=? ORDER BY code", (loc_type,))
                else:
                    c.execute("SELECT * FROM locations WHERE active=1 ORDER BY type, code")
                rows = [dict(r) for r in c.fetchall()]
                self.json_response(rows)
            
            elif path.startswith("/api/location/"):
                token = path.split("/")[-1]
                c.execute("SELECT * FROM locations WHERE qr_token=? AND active=1", (token,))
                row = c.fetchone()
                if row:
                    self.json_response(dict(row))
                else:
                    self.json_response({"error": "Location not found"}, 404)
            
            elif path == "/api/orders":
                status = qs.get("status", [None])[0]
                if status:
                    c.execute("SELECT * FROM orders WHERE status=? ORDER BY created_at DESC", (status,))
                else:
                    c.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100")
                orders = [dict(r) for r in c.fetchall()]
                for o in orders:
                    c.execute("SELECT * FROM order_items WHERE order_id=?", (o["id"],))
                    o["items"] = [dict(i) for i in c.fetchall()]
                self.json_response(orders)
            
            elif path.startswith("/api/order/"):
                oid = path.split("/")[-1]
                c.execute("SELECT * FROM orders WHERE id=? OR order_number=?", (oid, oid))
                row = c.fetchone()
                if row:
                    o = dict(row)
                    c.execute("SELECT * FROM order_items WHERE order_id=?", (o["id"],))
                    o["items"] = [dict(i) for i in c.fetchall()]
                    self.json_response(o)
                else:
                    self.json_response({"error": "Order not found"}, 404)
            
            elif path == "/api/admin/stats":
                c.execute("SELECT COUNT(*) as cnt FROM orders WHERE date(created_at)=date('now')")
                today_orders = c.fetchone()["cnt"]
                c.execute("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE date(created_at)=date('now') AND status != 'cancelled'")
                today_sales = c.fetchone()["s"]
                c.execute("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('pending','preparing','ready')")
                active = c.fetchone()["cnt"]
                c.execute("SELECT COUNT(*) as cnt FROM menu_items WHERE available=1")
                items = c.fetchone()["cnt"]
                self.json_response({
                    "today_orders": today_orders,
                    "today_sales": today_sales,
                    "active_orders": active,
                    "menu_items": items
                })
            
            elif path == "/api/admin/financial":
                # Full financial report
                c.execute("""SELECT date(created_at) as day, COUNT(*) as orders,
                             COALESCE(SUM(total),0) as sales
                             FROM orders WHERE status != 'cancelled'
                             GROUP BY date(created_at) ORDER BY day DESC LIMIT 30""")
                daily = [dict(r) for r in c.fetchall()]
                c.execute("""SELECT oi.item_name, SUM(oi.quantity) as qty, SUM(oi.quantity*oi.unit_price) as revenue
                             FROM order_items oi JOIN orders o ON oi.order_id=o.id
                             WHERE o.status != 'cancelled'
                             GROUP BY oi.item_name ORDER BY revenue DESC LIMIT 20""")
                top_items = [dict(r) for r in c.fetchall()]
                c.execute("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status != 'cancelled'")
                all_time = c.fetchone()["s"]
                c.execute("SELECT COUNT(*) as c FROM orders WHERE status != 'cancelled'")
                all_orders = c.fetchone()["c"]
                c.execute("""SELECT status, COUNT(*) as c FROM orders GROUP BY status""")
                by_status = {r["status"]: r["c"] for r in c.fetchall()}
                self.json_response({
                    "daily": daily,
                    "top_items": top_items,
                    "all_time_sales": all_time,
                    "all_time_orders": all_orders,
                    "by_status": by_status
                })
            
            elif path == "/api/menu/all-admin":
                # All menu items including unavailable for admin
                c.execute("""SELECT m.*, c.name as category_name FROM menu_items m
                             LEFT JOIN categories c ON m.category_id = c.id
                             ORDER BY c.sort_order, m.sort_order, m.name""")
                rows = [dict(r) for r in c.fetchall()]
                self.json_response(rows)
            
            else:
                self.json_response({"error": "Not found"}, 404)
        except Exception as e:
            self.json_response({"error": str(e)}, 500)
        finally:
            conn.close()
    
    def handle_api_post(self, path, data):
        conn = get_db()
        c = conn.cursor()
        
        try:
            if path == "/api/login":
                username = data.get("username", "")
                password = data.get("password", "")
                pw_hash = hashlib.sha256(password.encode()).hexdigest()
                c.execute("SELECT id, username, role FROM users WHERE username=? AND password_hash=?", (username, pw_hash))
                user = c.fetchone()
                if user:
                    token = str(uuid.uuid4())
                    self.json_response({"success": True, "token": token, "user": dict(user)})
                else:
                    self.json_response({"success": False, "error": "Invalid credentials"}, 401)
            
            elif path == "/api/order":
                # Place order
                location_code = data.get("location_code", "")
                location_type = data.get("location_type", "table")
                customer_name = data.get("customer_name", "Guest")
                notes = data.get("notes", "")
                items = data.get("items", [])
                
                if not items:
                    self.json_response({"error": "No items"}, 400)
                    return
                
                c.execute("SELECT id FROM locations WHERE code=?", (location_code,))
                loc = c.fetchone()
                loc_id = loc["id"] if loc else None
                
                order_number = f"ORD-{int(time.time()) % 100000:05d}"
                now = datetime.now().isoformat()
                total = sum(i.get("quantity", 1) * i.get("unit_price", 0) for i in items)
                
                c.execute("""INSERT INTO orders (order_number, location_id, location_code, location_type,
                             customer_name, status, notes, total, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)""",
                          (order_number, loc_id, location_code, location_type, customer_name, notes, total, now, now))
                order_id = c.lastrowid
                
                for it in items:
                    c.execute("""INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, notes)
                                 VALUES (?, ?, ?, ?, ?, ?)""",
                              (order_id, it.get("menu_item_id"), it.get("item_name"), it.get("quantity", 1),
                               it.get("unit_price"), it.get("notes", "")))
                
                conn.commit()
                self.json_response({"success": True, "order_number": order_number, "order_id": order_id, "total": total})
            
            elif path == "/api/order/status":
                order_id = data.get("order_id")
                status = data.get("status")
                now = datetime.now().isoformat()
                c.execute("UPDATE orders SET status=?, updated_at=? WHERE id=?", (status, now, order_id))
                conn.commit()
                self.json_response({"success": True})
            
            elif path == "/api/category":
                name = data.get("name")
                desc = data.get("description", "")
                stype = data.get("service_type", "both")
                c.execute("INSERT INTO categories (name, description, service_type) VALUES (?, ?, ?)", (name, desc, stype))
                conn.commit()
                self.json_response({"success": True, "id": c.lastrowid})
            
            elif path == "/api/menu-item":
                c.execute("""INSERT INTO menu_items (category_id, name, description, price, image_url, available, service_type)
                             VALUES (?, ?, ?, ?, ?, ?, ?)""",
                          (data.get("category_id"), data.get("name"), data.get("description", ""),
                           data.get("price", 0), data.get("image_url", ""), data.get("available", 1),
                           data.get("service_type", "both")))
                conn.commit()
                self.json_response({"success": True, "id": c.lastrowid})
            
            elif path.startswith("/api/menu-item/") and path.count("/") == 3:
                # Update menu item including image
                mid = path.split("/")[-1]
                fields = []
                vals = []
                for key in ("category_id", "name", "description", "price", "image_url", "available", "service_type"):
                    if key in data:
                        fields.append(f"{key}=?")
                        vals.append(data[key])
                if fields:
                    vals.append(mid)
                    c.execute(f"UPDATE menu_items SET {', '.join(fields)} WHERE id=?", vals)
                    conn.commit()
                self.json_response({"success": True})
            
            elif path == "/api/location":
                code = data.get("code")
                name = data.get("name", code)
                loc_type = data.get("type", "table")
                token = str(uuid.uuid4())[:8]
                c.execute("INSERT INTO locations (code, name, type, qr_token) VALUES (?, ?, ?, ?)",
                          (code, name, loc_type, token))
                conn.commit()
                self.json_response({"success": True, "id": c.lastrowid, "qr_token": token})
            
            elif path.startswith("/api/location/") and path.count("/") == 3:
                # Update location by id: /api/location/12
                lid = path.split("/")[-1]
                if not lid.isdigit():
                    self.json_response({"error": "Invalid location id"}, 400)
                    return
                fields, vals = [], []
                for key in ("code", "name", "type", "active"):
                    if key in data and data[key] is not None:
                        fields.append(f"{key}=?")
                        vals.append(data[key])
                if data.get("regen_qr"):
                    new_token = str(uuid.uuid4())[:8]
                    fields.append("qr_token=?")
                    vals.append(new_token)
                if fields:
                    vals.append(lid)
                    c.execute(f"UPDATE locations SET {', '.join(fields)} WHERE id=?", vals)
                    conn.commit()
                c.execute("SELECT * FROM locations WHERE id=?", (lid,))
                row = c.fetchone()
                self.json_response({"success": True, "location": dict(row) if row else None})
            
            elif path == "/api/settings":
                for k, v in data.items():
                    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
                conn.commit()
                self.json_response({"success": True})
            
            elif path == "/api/users":
                # Create user
                username = (data.get("username") or "").strip()
                password = data.get("password") or ""
                role = data.get("role") or "staff"
                if not username or not password:
                    self.json_response({"error": "Username and password required"}, 400)
                    return
                if role not in ("admin", "manager", "kitchen", "staff"):
                    role = "staff"
                pw_hash = hashlib.sha256(password.encode()).hexdigest()
                try:
                    c.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                              (username, pw_hash, role, datetime.now().isoformat()))
                    conn.commit()
                    self.json_response({"success": True, "id": c.lastrowid})
                except sqlite3.IntegrityError:
                    self.json_response({"error": "Username already exists"}, 400)
            
            elif path.startswith("/api/users/") and path.count("/") == 3:
                # Update user  /api/users/ID
                uid = path.split("/")[-1]
                username = (data.get("username") or "").strip()
                password = data.get("password")  # optional
                role = data.get("role")
                if username:
                    c.execute("UPDATE users SET username=? WHERE id=?", (username, uid))
                if role and role in ("admin", "manager", "kitchen", "staff"):
                    c.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
                if password:
                    pw_hash = hashlib.sha256(password.encode()).hexdigest()
                    c.execute("UPDATE users SET password_hash=? WHERE id=?", (pw_hash, uid))
                conn.commit()
                self.json_response({"success": True})
            
            else:
                self.json_response({"error": "Not found"}, 404)
        except Exception as e:
            self.json_response({"error": str(e)}, 500)
        finally:
            conn.close()
    
    def handle_api_delete(self, path):
        conn = get_db()
        c = conn.cursor()
        try:
            if path.startswith("/api/menu-item/"):
                mid = path.split("/")[-1]
                c.execute("DELETE FROM menu_items WHERE id=?", (mid,))
                conn.commit()
                self.json_response({"success": True})
            elif path.startswith("/api/category/"):
                cid = path.split("/")[-1]
                c.execute("DELETE FROM categories WHERE id=?", (cid,))
                conn.commit()
                self.json_response({"success": True})
            elif path.startswith("/api/location/"):
                lid = path.split("/")[-1]
                c.execute("DELETE FROM locations WHERE id=?", (lid,))
                conn.commit()
                self.json_response({"success": True})
            elif path.startswith("/api/users/"):
                uid = path.split("/")[-1]
                # Prevent deleting last admin
                c.execute("SELECT role FROM users WHERE id=?", (uid,))
                row = c.fetchone()
                if row and row["role"] == "admin":
                    c.execute("SELECT COUNT(*) as cnt FROM users WHERE role='admin'")
                    if c.fetchone()["cnt"] <= 1:
                        self.json_response({"error": "Cannot delete the last admin user"}, 400)
                        return
                c.execute("DELETE FROM users WHERE id=?", (uid,))
                conn.commit()
                self.json_response({"success": True})
            else:
                self.json_response({"error": "Not found"}, 404)
        except Exception as e:
            self.json_response({"error": str(e)}, 500)
        finally:
            conn.close()
    
    def log_message(self, format, *args):
        client = self.client_address[0] if self.client_address else "?"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {client} {args[0]}")

def get_lan_ips():
    """Return list of LAN IPv4 addresses for same-WiFi access."""
    import socket
    ips = []
    try:
        # Connect trick to find primary outbound IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        try:
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
        except Exception:
            pass
        finally:
            s.close()
    except Exception:
        pass
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips or ["(check ipconfig)"]

def main():
    init_db()
    os.chdir(PUBLIC_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    class ThreadedServer(ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True

    with ThreadedServer(("0.0.0.0", PORT), OtechHandler) as httpd:
        lan_ips = get_lan_ips()
        print("=" * 60)
        print("  OTECH DIGITAL MENU & ORDER MANAGEMENT SYSTEM")
        print("=" * 60)
        print(f"  This PC:     http://localhost:{PORT}")
        print()
        print("  SAME Wi-Fi NETWORK (phones, kitchen tablets, other PCs):")
        for ip in lan_ips:
            print(f"    http://{ip}:{PORT}")
        print()
        print("  Guests scan QR or open the URL above on same Wi-Fi.")
        print("  Kitchen & Admin use the same URL — all share live data.")
        print()
        print(f"  Admin login: admin / admin123")
        print("  Press Ctrl+C to stop")
        print("=" * 60)
        # Save base URL hints for QR generation
        try:
            conn = get_db()
            if lan_ips and not str(lan_ips[0]).startswith("("):
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                             ("lan_base_url", f"http://{lan_ips[0]}:{PORT}"))
            if PUBLIC_BASE_URL:
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                             ("public_base_url", PUBLIC_BASE_URL))
                print(f"  PUBLIC URL:  {PUBLIC_BASE_URL}")
                print("  Use this URL for QR codes so guests can order from anywhere.")
            conn.commit()
            conn.close()
        except Exception:
            pass
        print(f"  Listening on 0.0.0.0:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    main()
