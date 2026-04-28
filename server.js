require('dotenv').config();

const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

/* =========================
SAFETY CHECK
========================= */
if (!process.env.STRIPE_SECRET) {
  throw new Error("❌ STRIPE_SECRET is missing");
}

/* =========================
STRIPE INIT
========================= */
const stripe = require("stripe")(process.env.STRIPE_SECRET);

/* =========================
MIDDLEWARE (IMPORTANT ORDER)
========================= */
app.use(cors());
app.use(cookieParser());

/* =========================
MONGODB CONNECT (SAFE START)
========================= */
async function start() {
  try {
    console.log("🔥 STARTING SERVER...");

    await mongoose.connect(process.env.MONGO_URL);
    console.log("MongoDB connected");

    /* =========================
    BODY PARSER (AFTER CONNECT)
    ========================= */
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

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

    const Check = mongoose.model("Check", CheckSchema);

    /* =========================
    VALIDATION
    ========================= */
    function isValidDeviceId(deviceId) {
      if (!deviceId) return false;
      deviceId = deviceId.trim();

      return /^\d{15}$/.test(deviceId) ||
             /^[A-Za-z0-9]{10,12}$/.test(deviceId);
    }

    /* =========================
    ADMIN PANEL
    ========================= */
    app.get("/admin", async (req, res) => {
      try {
        const data = await Check.find().sort({ time: -1 });

        const rows = data.map(d => `
          <tr>
            <td>${d.deviceId}</td>
            <td>${d.email}</td>
            <td>${d.type}</td>
            <td>${d.status}</td>
            <td>${d.paid}</td>
            <td>${d.time}</td>
          </tr>
        `).join("");

        res.send(`
          <html>
          <head>
            <title>Admin Panel</title>
            <style>
              body { font-family: Arial; background:#111; color:#fff; }
              table { width:100%; border-collapse: collapse; }
              td, th { border:1px solid #444; padding:8px; }
              th { background:#222; }
            </style>
          </head>
          <body>
            <h2>Admin Panel</h2>
            <table>
              <tr>
                <th>Device ID</th>
                <th>Email</th>
                <th>Type</th>
                <th>Status</th>
                <th>Paid</th>
                <th>Time</th>
              </tr>
              ${rows}
            </table>
          </body>
          </html>
        `);

      } catch (err) {
        res.status(500).send(err.message);
      }
    });

    /* =========================
    API
    ========================= */
    app.get("/api/admin", async (req, res) => {
      const data = await Check.find().sort({ time: -1 });
      res.json(data);
    });

    /* =========================
    CREATE PAYMENT
    ========================= */
    app.post("/create-payment", async (req, res) => {
      try {
        const { deviceId, email, type } = req.body;

        if (!isValidDeviceId(deviceId)) {
          return res.status(400).json({ error: "Invalid ID" });
        }

        await Check.updateOne(
          { deviceId },
          { $set: { email, type } },
          { upsert: true }
        );

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `IMEI Check (${type || "carrier"})`
              },
              unit_amount: 199
            },
            quantity: 1
          }],
          metadata: { deviceId, email, type },
          success_url: "https://imei-info.pages.dev",
          cancel_url: "https://imei-info.pages.dev"
        });

        res.json({ url: session.url });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    /* =========================
    START SERVER (FINAL FIX)
    ========================= */
    const PORT = process.env.PORT || 3000;

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log("🔥 SERVER LISTENING ON", PORT);
    });

    server.on("error", (err) => {
      console.log("💥 SERVER ERROR:", err);
    });

  } catch (err) {
    console.log("💥 FATAL ERROR:", err);
  }
}

start();