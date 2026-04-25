const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET || "");

const app = express();

/* =========================
   RAW BODY (для webhook)
========================= */
app.use("/stripe-webhook", express.raw({ type: "application/json" }));

app.use(cors());
app.use(express.json());

/* =========================
   MONGODB
========================= */
const mongoURL = process.env.MONGO_URL;

if (!mongoURL) {
  console.log("❌ MONGO_URL missing");
} else {
  mongoose.connect(mongoURL)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log("MongoDB error:", err));
}

/* =========================
   MODEL
========================= */
const CheckSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  status: { type: String, default: "pending" },
  price: { type: Number, default: 1.99 },
  answer: { type: String, default: "" },
  paid: { type: Boolean, default: false },
  time: { type: Date, default: Date.now }
});

const Check = mongoose.model("Check", CheckSchema);

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("API is working 🚀");
});

/* =========================
   STRIPE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
  try {
    const { deviceId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "IMEI Check"
          },
          unit_amount: 199
        },
        quantity: 1
      }],
      mode: "payment",

      // передаём deviceId в Stripe
      metadata: {
        deviceId
      },

      success_url: "https://chipper-cobbler-62c70c.netlify.app",
      cancel_url: "https://chipper-cobbler-62c70c.netlify.app"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log("STRIPE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   STRIPE WEBHOOK (PRO LEVEL)
========================= */
app.post("/stripe-webhook", async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const deviceId = session.metadata.deviceId;

      if (deviceId) {
        await Check.create({
          deviceId,
          status: "paid",
          paid: true,
          price: 1.99
        });

        console.log("PAYMENT SAVED:", deviceId);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.log("WEBHOOK ERROR:", err);
    res.status(400).send("Webhook error");
  }
});

/* =========================
   CHECK IMEI (PROTECTED)
========================= */
app.post("/check", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ status: "error" });
    }

    // 🔒 проверяем оплату в базе
    const payment = await Check.findOne({ deviceId, paid: true });

    if (!payment) {
      return res.status(403).json({ status: "payment_required" });
    }

    const last = deviceId.slice(-1);

    let status = "pending";

    if (last === "0") status = "blocked";
    else if (last === "5") status = "clean";

    const request = await Check.create({
      deviceId,
      status,
      price: 1.99,
      paid: true
    });

    res.json({
      id: request._id,
      deviceId,
      status,
      price: request.price,
      time: request.time
    });

  } catch (err) {
    console.log("CHECK ERROR:", err);
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
   HISTORY
========================= */
app.get("/history", async (req, res) => {
  const data = await Check.find().sort({ _id: -1 });
  res.json(data);
});

/* =========================
   ANSWER
========================= */
app.post("/answer", async (req, res) => {
  try {
    const { id, answer } = req.body;

    await Check.findByIdAndUpdate(id, {
      answer,
      status: "done"
    });

    res.json({ ok: true });

  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});