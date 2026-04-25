const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET || "");
const cookieParser = require("cookie-parser");

const app = express();

/* =========================
MIDDLEWARE (JSON AFTER WEBHOOK)
========================= */
app.use(cors());
app.use(cookieParser());

/* =========================
MONGODB
========================= */
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

/* =========================
MODEL (ВАЖНО: СРАЗУ)
========================= */
const CheckSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  status: { type: String, default: "pending" },
  price: { type: Number, default: 1.99 },
  paid: { type: Boolean, default: false },
  time: { type: Date, default: Date.now }
});

const Check = mongoose.model("Check", CheckSchema);

/* =========================
WEBHOOK (ПЕРВЫЙ)
========================= */
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    console.log("🔥 WEBHOOK:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const deviceId = session.metadata?.deviceId;

      if (!deviceId) return res.json({ ok: true });

      await Check.updateOne(
        { deviceId },
        {
          $set: {
            deviceId,
            paid: true,
            status: "paid",
            price: 1.99,
            time: new Date()
          }
        },
        { upsert: true }
      );

      console.log("💰 PAYMENT SAVED");
    }

    res.json({ received: true });

  } catch (err) {
    console.log("WEBHOOK ERROR:", err.message);
    res.status(400).send("Webhook error");
  }
});

/* =========================
JSON PARSER (ПОСЛЕ WEBHOOK)
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
  try {
    const { deviceId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "IMEI Check" },
          unit_amount: 199
        },
        quantity: 1
      }],
      metadata: { deviceId },
      success_url: "https://imei-info.pages.dev",
      cancel_url: "https://imei-info.pages.dev"
    });

    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
CHECK IMEI
========================= */
app.post("/check", async (req, res) => {
  try {
    const { deviceId } = req.body;

    const payment = await Check.findOne({ deviceId });

    if (!payment || !payment.paid) {
      return res.status(403).json({ status: "payment_required" });
    }

    res.json(payment);

  } catch (err) {
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
ADMIN PANEL
========================= */
app.get("/admin", async (req, res) => {
  const data = await Check.find().sort({ _id: -1 });

  res.send(`
    <html>
    <body style="font-family:Arial;background:#111;color:#fff;padding:20px;">
      <h1>📊 ADMIN PANEL</h1>
      <hr/>

      ${data.length === 0 ? "<p>No data yet</p>" : ""}

      ${data.map(i => `
        <div style="background:#222;padding:10px;margin:10px;border-radius:8px;">
          <b>IMEI:</b> ${i.deviceId}<br/>
          <b>Status:</b> ${i.status}<br/>
          <b>Paid:</b> ${i.paid ? "YES" : "NO"}<br/>
          <b>Time:</b> ${new Date(i.time).toLocaleString()}<br/>
          <a href="/admin/delete/${i._id}" style="color:red;">🗑 DELETE</a>
        </div>
      `).join("")}

    </body>
    </html>
  `);
});

/* =========================
DELETE
========================= */
app.get("/admin/delete/:id", async (req, res) => {
  await Check.findByIdAndDelete(req.params.id);
  res.redirect("/admin");
});

/* =========================
START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));