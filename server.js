const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET || "");
const cookieParser = require("cookie-parser");

const app = express();

/* =========================
MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* =========================
MONGODB
========================= */
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

/* =========================
MODEL (СНАЧАЛА!)
========================= */
const CheckSchema = new mongoose.Schema({
  deviceId: String,
  status: String,
  price: Number,
  paid: Boolean,
  time: Date
});

const Check = mongoose.model("Check", CheckSchema);

/* =========================
STRIPE WEBHOOK
========================= */
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const deviceId = session.metadata?.deviceId;

      if (deviceId) {
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
      }
    }

    res.json({ received: true });

  } catch (err) {
    console.log(err);
    res.status(400).send("Webhook error");
  }
});

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
CHECK
========================= */
app.post("/check", async (req, res) => {
  const { deviceId } = req.body;

  const payment = await Check.findOne({ deviceId, paid: true });

  if (!payment) {
    return res.status(403).json({ status: "payment_required" });
  }

  res.json(payment);
});

/* =========================
ADMIN
========================= */
app.get("/admin", async (req, res) => {
  const data = await Check.find().sort({ _id: -1 });

  res.send(`
    <h1>PAID ORDERS</h1>
    ${data.map(i => `
      <div>
        ${i.deviceId} | ${i.status} | ${i.paid}
      </div>
    `).join("")}
  `);
});

/* =========================
START
========================= */
app.listen(3000, () => console.log("RUNNING"));
