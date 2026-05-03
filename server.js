require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Pool } = require("pg");

const app = express();

/* =========================
  ENV CHECK (CRITICAL)
========================= */
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.error("❌ Missing STRIPE_WEBHOOK_SECRET");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL");
  process.exit(1);
}

/* =========================
  DB
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* =========================
  STRIPE WEBHOOK (MUST BE FIRST)
========================= */
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("❌ WEBHOOK ERROR:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const deviceId = session.metadata?.deviceId;
        const email = session.metadata?.email;
        const type = session.metadata?.type;

        if (deviceId) {
          await pool.query(
            `UPDATE checks
             SET paid = true,
                 status = 'paid',
                 email = $2,
                 type = $3,
                 time = NOW()
             WHERE deviceid = $1`,
            [deviceId, email, type]
          );

          console.log("💰 PAYMENT SAVED:", deviceId);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.log("❌ HANDLER ERROR:", err.message);
      res.status(500).send("Handler error");
    }
  }
);

/* =========================
  MIDDLEWARE (AFTER WEBHOOK)
========================= */
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
  VALIDATION
========================= */
function isValidDeviceId(deviceId) {
  if (!deviceId) return false;
  deviceId = deviceId.trim();

  return /^\d{15}$/.test(deviceId) || /^[A-Za-z0-9]{10,12}$/.test(deviceId);
}

/* =========================
  CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
  try {
    const { deviceId, email, type } = req.body;

    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: "Invalid IMEI / SN" });
    }

    await pool.query(
      `INSERT INTO checks (deviceid, email, type, status, price, paid)
       VALUES ($1, $2, $3, 'pending', 1.99, false)
       ON CONFLICT (deviceid)
       DO UPDATE SET email=$2, type=$3`,
      [deviceId, email, type]
    );

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `IMEI/SN Check (${type || "carrier"})`,
            },
            unit_amount: 199,
          },
          quantity: 1,
        },
      ],
      metadata: { deviceId, email, type },
      success_url: "https://imei-info.pages.dev",
      cancel_url: "https://imei-info.pages.dev",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log("CREATE PAYMENT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
  CHECK PAYMENT
========================= */
app.post("/check", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ status: "invalid_id" });
    }

    const result = await pool.query(
      "SELECT * FROM checks WHERE deviceid = $1",
      [deviceId]
    );

    const payment = result.rows[0];

    if (!payment || payment.paid !== true) {
      return res.status(403).json({ status: "payment_required" });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
  ADMIN
========================= */
app.get("/admin", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM checks ORDER BY time DESC"
  );

  res.json(result.rows);
});

/* =========================
  START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));