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
app.use(cors());
app.use(cookieParser());

/* =========================
WEBHOOK ROUTE (RAW JSON)
========================= */
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = JSON.parse(req.body.toString());

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const deviceId = session.metadata?.deviceId;
      const email = session.metadata?.email;
      const type = session.metadata?.type;

      if (deviceId) {
        // Исправлено: используем модель IMEI и поле imei
        await IMEI.updateOne(
          { imei: deviceId },
          {
            $set: {
              imei: deviceId,
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
JSON MIDDLEWARE (FOR OTHER ROUTES)
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
MONGODB & SERVER START
========================= */
let IMEI; // Исправлено: объявляем глобальную модель IMEI

async function start() {
  try {
    console.log("🔥 STARTING SERVER...");

    // Исправлено: ищем правильную переменную MONGO_URI
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("MongoDB connected");

    /* =========================
    MODEL
    ========================= */
    const CheckSchema = new mongoose.Schema({
      imei: { type: String, unique: true }, // Исправлено: поле imei вместо deviceId
      email: { type: String, default: "" },
      type: { type: String, default: "carrier" },
      status: { type: String, default: "pending" },
      price: { type: Number, default: 1.99 },
      paid: { type: Boolean, default: false },
      time: { type: Date, default: Date.now }
    });

    IMEI = mongoose.model("IMEI", CheckSchema); // Исправлено: модель IMEI

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
    CREATE PAYMENT
    ========================= */
    app.post("/create-payment", async (req, res) => {
      try {
        const { deviceId, email, type } = req.body;

        if (!isValidDeviceId(deviceId)) {
          return res.status(400).json({ error: "Invalid ID" });
        }

        // Исправлено: используем модель IMEI
        await IMEI.updateOne(
          { imei: deviceId },
          { $set: { email, type } },
          { upsert: true }
        );

        const session = await stripe.checkout.sessions.create({