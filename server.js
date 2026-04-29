require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

/* =========================
SAFETY CHECK
========================= */
if (!process.env.STRIPE_SECRET) {
  throw new Error("❌ STRIPE_SECRET is missing in .env file");
}

const stripe = require("stripe")(process.env.STRIPE_SECRET);

/* =========================
WEBHOOK ROUTE (RAW JSON)
========================= */
// Ставим вебхук самым первым, чтобы он точно получал "сырые" данные от Stripe
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const deviceId = session.metadata?.deviceId;
      const email = session.metadata?.email;
      const type = session.metadata?.type;

      if (deviceId) {
        await Check.updateOne(
          { deviceId },
          {
            $set: {
              deviceId,
              email,
              type,
              paid: true,
              status: "paid",
              time: new Date()
            }
          },
          { upsert: true }
        );
        console.log("💰 PAYMENT SAVED:", deviceId);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.log("WEBHOOK ERROR:", err.message);
    res.status(400).send("Webhook error");
  }
});

/* =========================
MIDDLEWARE (JSON & CORS)
========================= */
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
MONGODB & SERVER START
========================= */
let Check;

async function start() {
  try {
    console.log("🔥 STARTING SERVER...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("MongoDB connected");

    /* =========================
    MODEL
    ========================= */
    const CheckSchema = new mongoose.Schema({
      deviceId: { type: String, unique: true },
      email: { type: String, default: "" },
      type: { type: String, default: "carrier" },
      status: { type: String, default: "pending" },
      price: { type: Number, default: 1.99 },
      paid: { type: Boolean, default: false },
      time: { type: Date, default: Date.now }
    });
    Check = mongoose.model("Check", CheckSchema);

    /* =========================
    VALIDATION
    ========================= */
    function isValidDeviceId(deviceId) {
      if (!deviceId) return false;
      deviceId = deviceId.trim();
      return /^\d{15}$/.test(deviceId) || /^[A-Za-z0-9]{10,12}$/.test(deviceId);
    }

    /* =========================
    CREATE PAYMENT (Исправлено!)
    ========================= */
    app.post("/create-payment", async (req, res) => {
      try {
        const { deviceId, email, type } = req.body;
        if (!isValidDeviceId(deviceId)) {
          return res.status(400).json({ error: "Invalid ID" });
        }
        await Check.updateOne({ deviceId }, { $set: { email, type } }, { upsert: true });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: { name: `IMEI Check (${type || "carrier"})` },
              unit_amount: 199
            },
            quantity: 1
          }],
          metadata: { deviceId, email, type },
          // ВАЖНО: Убедись, что в файле .env на сервере Oracle прописаны эти переменные!
          success_url: `${process.env.CLIENT_URL}/?success=true`,
          cancel_url: `${process.env.CLIENT_URL}/?canceled=true`
        });
        res.json({ url: session.url });
      } catch (err) {
        console.error("Payment Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    /* =========================
    ADMIN PANEL (Mobile & Tabs)
    ========================= */
    app.get("/admin", async (req, res) => {
      if (req.query.pass !== process.env.ADMIN_PASSWORD) {
        return res.status(403).send("<h1 style='text-align:center; margin-top:50px;'>🚫 Доступ запрещен! Неверный пароль.</h1>");
      }

      try {
        const data = await Check.find().sort({ time: -1 });

        const rows = data.map(d => `
          <tr class="${d.paid ? 'paid-row' : 'unpaid-row'}">
            <td>
              <div class="copy-wrapper">
                <span class="copy-text">${d.deviceId}</span>
                <button class="copy-btn" onclick="copyToClipboard('${d.deviceId}')">📋</button>
              </div>
            </td>
            <td>
              <div class="copy-wrapper">
                <span class="copy-text">${d.email}</span>
                <button class="copy-btn" onclick="copyToClipboard('${d.email}')">📋</button>
              </div>
            </td>
            <td>${d.type}</td>
            <td>
              <span class="status-badge ${d.paid ? 'badge-paid' : 'badge-unpaid'}">
                ${d.paid ? '✅ Оплачено' : '⏳ Не оплачено'}
              </span>
            </td>
            <td style="font-size: 12px; color: #aaa;">${new Date(d.time).toLocaleString()}</td>
          </tr>
        `).join("");

        res.send(`
          <html>
          <head>
            <title>Admin Panel</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background:#111; color:#fff; margin: 0; padding: 15px; }
              h2 { text-align: center; margin-bottom: 20px; }
              .tabs { display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; }
              .tab-btn { background: #333; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 16px; cursor: pointer; flex: 1; max-width: 150px; }
              .tab-btn.active { background: #007bff; font-weight: bold; }
              .table-container { overflow-x: auto; border-radius: 8px; border: 1px solid #333; }
              table { width: 100%; border-collapse: collapse; min-width: 600px; }
              td, th { border-bottom: 1px solid #333; padding: 12px 8px; text-align: left; }
              th { background:#222; font-size: 14px; }
              .unpaid-row { background: rgba(255, 193, 7, 0.1); }
              .paid-row { background: rgba(40, 167, 69, 0.1); }
              .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
              .badge-paid { background: #28a745; color: white; }
              .badge-unpaid { background: #ffc107; color: #111; }
              .copy-wrapper { display: flex; align-items: center; gap: 8px; }
              .copy-text { font-family: monospace; font-size: 14px; }
              .copy-btn { background: #444; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 14px; }
              .copy-btn:active { background: #007bff; }
              #toast { visibility: hidden; min-width: 250px; background-color: #333; color: #fff; text-align: center; border-radius: 4px; padding: 16px; position: fixed; z-index: 1; left: 50%; bottom: 30px; transform: translateX(-50%); font-size: 16px; border: 1px solid #007bff; }
              #toast.show { visibility: visible; animation: fadein 0.5s, fadeout 0.5s 2.5s; }
              @keyframes fadein { from {bottom: 0; opacity: 0;} to {bottom: 30px; opacity: 1;} }
              @keyframes fadeout { from {bottom: 30px; opacity: 1;} to {bottom: 0; opacity: 0;} }
            </style>
          </head>
          <body>
            <h2>📊 Панель заказов</h2>
            <div class="tabs">
              <button class="tab-btn active" onclick="filterTable('unpaid', this)">⏳ Неоплаченные</button>
              <button class="tab-btn" onclick="filterTable('paid', this)">✅ Оплаченные</button>
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Device ID / IMEI</th>
                    <th>Email</th>
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Время</th>
                  </tr>
                </thead>
                <tbody id="orders-table">
                  ${rows}
                </tbody>
              </table>
            </div>
            <div id="toast">Скопировано в буфер обмена!</div>
            <script>
              function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                  const toast = document.getElementById("toast");
                  toast.className = "show";
                  setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
                });
              }
              function filterTable(status, btn) {
                const rows = document.querySelectorAll('tbody tr');
                const buttons = document.querySelectorAll('.tab-btn');
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                rows.forEach(row => {
                  if (status === 'all') {
                    row.style.display = '';
                  } else if (status === 'paid' && row.classList.contains('paid-row')) {
                    row.style.display = '';
                  } else if (status === 'unpaid' && row.classList.contains('unpaid-row')) {
                    row.style.display = '';
                  } else {
                    row.style.display = 'none';
                  }
                });
              }
            </script>
          </body>
          </html>
        `);
      } catch (err) {
        res.status(500).send(err.message);
      }
    });

    /* =========================
    START SERVER
    ========================= */
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("Start Error:", err);
  }
}

start();