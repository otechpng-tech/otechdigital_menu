# Host Otech Digital Menu Online (Free)

Customers can scan QR codes and track orders **from anywhere** (not only restaurant Wi‑Fi).

Recommended free option: **Render.com** (free web service).

> Free services may **sleep after ~15 minutes** idle and take 30–60 seconds to wake on the first visit. Fine for small restaurants; for 24/7 always-on, use a paid plan (~$7/mo) later.

---

## Option A — Render.com (recommended)

### 1. Create a free account
https://render.com → Sign up (GitHub login is easiest)

### 2. Put this project on GitHub
1. Create a new GitHub repository (can be private).
2. Upload the `otech-digital-menu` folder contents (must include `server.py` and `public/`).

Or from a PC with git:
```bash
cd otech-digital-menu
git init
git add .
git commit -m "Otech Digital Menu"
git branch -M main
git remote add origin https://github.com/YOUR_USER/otech-digital-menu.git
git push -u origin main
```

### 3. Create a Web Service on Render
1. Render Dashboard → **New +** → **Web Service**
2. Connect the GitHub repo
3. Settings:
   - **Name:** otech-digital-menu
   - **Runtime:** Python 3
   - **Build Command:** `echo ok`
   - **Start Command:** `python server.py`
   - **Instance type:** Free
4. **Environment** → Add:
   - `PUBLIC_BASE_URL` = `https://YOUR-SERVICE-NAME.onrender.com`  
     (you will know the exact URL after the first deploy)
5. Click **Create Web Service**

### 4. After deploy
1. Open your URL: `https://otech-digital-menu-xxxx.onrender.com`
2. Login admin / admin123
3. **Settings** → set **Public website URL** to that HTTPS link → Save
4. **QR / Tables** → View QR → Print  
   QR codes now open the online menu for guests anywhere

### 5. Kitchen / staff
Staff open the same HTTPS URL on tablets (Kitchen Display / Admin).

---

## Option B — PythonAnywhere (good SQLite persistence)

1. https://www.pythonanywhere.com → free account  
2. Upload project files (Files tab)  
3. Open a Bash console:
   ```bash
   cd otech-digital-menu
   python server.py
   ```
   Free accounts use a different web-app WSGI flow; for a quick demo you can run the server in a console, or follow PythonAnywhere “Web” app setup with a WSGI wrapper.

For long-term free SQLite storage, PythonAnywhere keeps files on disk better than Render free.

---

## Option C — Keep PC local + free tunnel (quick test)

On the restaurant PC (server already running):

1. Install Cloudflare Tunnel (cloudflared) or use https://ngrok.com  
2. Example ngrok:
   ```bash
   ngrok http 8080
   ```
3. Copy the `https://....ngrok-free.app` URL  
4. Admin Settings → Public website URL → paste → Save  
5. Reprint QR codes  

Good for testing; URL may change on free ngrok unless you reserve one.

---

## After hosting — customer flow

1. Guest scans table QR (any mobile data / any Wi‑Fi)  
2. Menu opens for that table  
3. Places order  
4. Tracks: Pending → Preparing → Ready → Delivered  
5. Kitchen uses the same online site on a tablet  

---

## Important notes

| Topic | Detail |
|-------|--------|
| **Sleep (Render free)** | First open after idle may take ~1 minute |
| **Data on Render free** | SQLite resets if the service is fully rebuilt; export reports often |
| **Admin password** | Change from `admin123` after first login |
| **HTTPS** | Render provides HTTPS automatically — required for reliable phone cameras/QR |
| **Local + Online** | You can still run the Windows app on LAN for kitchen, and host a copy online for guests |

---

Otech Business Systems
