# Otech Digital Menu & Order Management System

Complete QR-code digital menu and order system for **Restaurants** (table service) and **Hotels** (room service).

## Features

- **Offline-first** – Service Worker + local cache. Menu, settings and locations work offline. Orders placed offline are queued and auto-synced when connection returns.
- **Guest Digital Menu** – Scan QR or enter table/room code → browse menu → cart → place order
- **Kitchen Display System (KDS)** – Live orders with status updates (Pending → Preparing → Ready → Delivered)
- **Admin Panel** – Menu management, add tables/rooms, generate QR codes, view stats & orders
- **Advanced Settings** – Business name, address, phone, email, logo upload, theme colours (primary/accent/bg), light/dark mode, currency code & symbol, tax rate, welcome & service messages
- **User Management** – Create, edit, delete users with roles: Admin, Manager, Kitchen, Staff
- **Service Types** – Items can be marked for Restaurant only, Room Service only, or Both
- **Sample Data** – Pre-loaded categories, menu items, 8 tables (T01–T08) and 10 rooms (R101–R110)
- **PWA** – Install on Android (Add to Home Screen) for full-screen app experience
- **One-click Windows launcher** + Desktop shortcut

## Default Logins

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin (full access) |
| manager | manager123 | Manager |
| kitchen | kitchen123 | Kitchen |
| staff | staff123 | Staff |

## Quick Start (Windows) — Full Setup

1. Copy the whole `otech-digital-menu` folder to a permanent place (e.g. `C:\Otech\DigitalMenu`).
2. Open the `windows-launcher` folder.
3. **Double-click `Setup.bat`**
   - Checks for Python 3.8+
   - Downloads and installs Python automatically if missing (internet needed only once)
   - Creates a **Desktop shortcut** named “Otech Digital Menu”
   - Creates a Start Menu shortcut
   - Can start the system for you
4. After setup, always start by double-clicking the **Desktop shortcut**.
5. Browser opens at **http://localhost:8080**. Keep the black window open while using the system.

See `windows-launcher/README_SETUP.txt` for more details.

## Using the System

### For Guests / Customers
1. From the home screen choose **Guest Menu**.
2. Enter table code (e.g. `T01`) or room code (e.g. `R101`), or scan the QR printed for that location.
3. Browse categories, add items to cart, place order.
4. Kitchen receives the order instantly.

### For Kitchen / Staff
1. Choose **Kitchen Display**.
2. See new orders, move them through Preparing → Ready → Done.
3. Screen auto-refreshes every 8 seconds.

### For Admin / Manager
1. Choose **Admin Panel** → login with `admin` / `admin123`.
2. **Stats** – today’s orders & sales.
3. **Menu** – add categories and items (set Restaurant / Room / Both).
4. **QR / Tables** – add more tables or rooms and print the QR codes.
5. **Orders** – view recent orders.

### Generating & Printing QR Codes
In Admin → QR / Tables → click **QR** next to any table or room.  
A QR code appears that guests can scan with their phone camera.  
Print and place on tables or in hotel rooms.

## Android / Mobile Package

This system is a **Progressive Web App (PWA)**.

### Install on Android phone/tablet:
1. Start the server on a PC that is on the same Wi-Fi network (or host it on a public server / VPS).
2. On the Android device open Chrome and go to `http://YOUR-PC-IP:8080` (find PC IP with `ipconfig`).
3. Tap the menu (⋮) → **“Add to Home screen”** or **“Install app”**.
4. The Otech Menu icon appears on the home screen and opens full-screen like a native app.

### Full offline / APK note
A true standalone APK requires Android Studio + Capacitor/Cordova wrapping of this web app.  
The current package is production-ready as a PWA. If you need a signed APK file, the recommended path is:

1. Install Node.js + Android Studio on a development machine.
2. Use Capacitor (`npx cap init`, add Android platform, sync, build).
3. Or contact Otech for a packaged APK build of this exact system.

All features (menu, ordering, kitchen, admin, QR) work fully in the browser / PWA on Android.

## File Structure

```
otech-digital-menu/
├── server.py                 ← Python backend (SQLite + API)
├── data/                     ← Database created automatically
├── public/
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   ├── manifest.json         ← PWA
│   └── img/
├── windows-launcher/
│   ├── Start_Otech_Menu.bat
│   └── Create_Desktop_Shortcut.vbs
└── README.md
```

## Requirements

- **Windows / Linux / Mac**: Python 3.8+ (only standard library used – no pip packages needed)
- Modern browser (Chrome, Edge, Firefox, Safari)
- For multi-device use: devices on same network, or deploy server publicly

## Network Access (phones / other PCs)

1. Find your PC’s local IP (`ipconfig` on Windows → IPv4 Address).
2. On other devices open `http://192.168.x.x:8080`.
3. Make sure Windows Firewall allows Python / port 8080.

## Customization

- Change restaurant name and currency in Admin (or edit `settings` table / defaults in `server.py`).
- Add your own menu items and photos (image URLs supported).
- Create as many tables and rooms as needed.

## Support & Branding

Built for **Otech Business Systems** – custom ERP, hotel, restaurant and hospitality solutions for Papua New Guinea and the region.

---
© Otech – Digital Menu & Order Management


## Same Wi-Fi Network (shared live system)

All devices on the **same Wi-Fi** share one live system:

1. Start the server on one PC (the host) using the Desktop shortcut.
2. The black window shows URLs like:
   - `http://localhost:8080` (this PC)
   - `http://192.168.x.x:8080` (phones, kitchen tablets, other PCs)
3. Guests scan QR codes (generated with the LAN address) or open the IP URL.
4. Kitchen staff open the same IP → **Kitchen Display**.
5. Admin opens the same IP → **Admin Panel**.

Everyone sees the same orders and menu in real time. No cloud required.

**Firewall:** If phones cannot connect, allow port **8080** in Windows Firewall for Python / Private networks.


## Android APK (full package)

A complete **Android Studio project** is included in the `android/` folder.

- Same features as the web app (guest, kitchen, admin)
- Offline-first + same Wi‑Fi team sync with auto server scan
- Open `android/` in Android Studio → Run or **Build → Generate Signed APK**

See **android/BUILD_APK.md** for step-by-step instructions.


## Android APK (Android Studio)

1. Open folder `android/` in **Android Studio**.
2. Wait for Gradle sync.
3. **Build → Build APK(s)** (or Generate Signed APK for release).
4. Install `app-debug.apk` / `app-release.apk` on phones.
5. Start Otech on the PC first; the app auto-finds it on the same Wi‑Fi.

Full steps: **android/BUILD_APK.md**
