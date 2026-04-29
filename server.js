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
MIDDLEWARE
========================= */
app.use(cors({
  origin: ["http://localhost:3000", "https://imei-info.pages.dev"],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

/* =========================
MONGODB CONNECTION
========================= */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

/* =========================
SCHEMA & MODEL
========================= */
const imeiSchema = new mongoose.Schema({
  imei: { type: String, required: true, unique: true },
  status: { type: String, default: "unpaid" }, // 'paid' or 'unpaid'
  createdAt: { type: Date, default: Date.now }
});

const IMEI = mongoose.model("IMEI", imeiSchema);

/* =========================
ROUTES
========================= */

// 1. Главная страница (твой сайт)
app.get("/", (req, res) => {
  res.send("IMEI Info API is running...");
});

// 2. Создать платеж (Stripe)
app.post("/create-checkout-session", async (req, res) => {
  const { imei } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `IMEI Check: ${imei}` },
          unit_amount: 1000, // $10.00
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}&imei=${imei}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Подтвердить оплату
app.get("/success", async (req, res) => {
  const { session_id, imei } = req.query;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === "paid") {
      await IMEI.findOneAndUpdate(
        { imei: imei },
        { status: "paid" },
        { upsert: true, new: true }
      );
      res.redirect(`${process.env.CLIENT_URL}/admin`);
    } else {
      res.status(400).send("Payment not completed");
    }
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// 4. Админ панель (с новыми вкладками и стилями!)
app.get("/admin", async (req, res) => {
  const allIMEIs = await IMEI.find().sort({ createdAt: -1 });

  const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Админка IMEI</title>
      <style>
        body { font-family: sans-serif; padding: 20px; background: #f4f6f8; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #333; }

        /* Стили для вкладок */
        .tabs { display: flex; justify-content: center; margin-bottom: 20px; gap: 10px; }
        .tab-btn { padding: 10px 20px; border: none; background: #e0e0e0; cursor: pointer; border-radius: 5px; font-size: 16px; transition: 0.3s; }
        .tab-btn.active { background: #007bff; color: white; }

        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }

        /* Цвета статусов */
        .paid-row { background-color: #d4edda; color: #155724; }
        .unpaid-row { background-color: #fff3cd; color: #856404; }

        .hidden { display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📋 Список IMEI</h1>

        <div class="tabs">
          <button class="tab-btn active" onclick="filterTable('all')">Все</button>
          <button class="tab-btn" onclick="filterTable('unpaid')">⏳ Неоплаченные</button>
          <button class="tab-btn" onclick="filterTable('paid')">✅ Оплаченные</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>IMEI</th>
              <th>Статус</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody id="imeiTable">
            ${allIMEIs.map(item => `
              <tr class="${item.status === 'paid' ? 'paid-row' : 'unpaid-row'}" data-status="${item.status}">
                <td>${item.imei}</td>
                <td>${item.status === 'paid' ? 'Оплачено' : 'Не оплачено'}</td>
                <td>${new Date(item.createdAt).toLocaleDateString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <script>
        function filterTable(status) {
          const rows = document.querySelectorAll('#imeiTable tr');
          const buttons = document.querySelectorAll('.tab-btn');

          // Обновляем активную кнопку
          buttons.forEach(btn => btn.classList.remove('active'));
          event.target.classList.add('active');

          rows.forEach(row => {
            if (status === 'all') {
              row.classList.remove('hidden');
            } else {
              if (row.getAttribute('data-status') === status) {
                row.classList.remove('hidden');
              } else {
                row.classList.add('hidden');
              }
            }
          });
        }
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

/* =========================
START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Server listening on port ${PORT}`);
});