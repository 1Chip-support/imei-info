const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const cookieParser = require("cookie-parser");

const app = express();

/* =========================
MIDDLEWARE
========================= */
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
MONGODB
========================= */
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

/* =========================
MODEL
========================= */
const OrderSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  email: { type: String, default: "" },
  type: { type: String, default: "carrier" },
  status: { type: String, default: "pending" },
  paid: { type: Boolean, default: false },
  time: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", OrderSchema);

/* =========================
CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
  try {
    const { deviceId, email, type } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId missing" });
    }

    await Order.updateOne(
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
            name: `Check (${type || "carrier"})`
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
CHECK
========================= */
app.post("/check", async (req, res) => {
  try {
    const { deviceId } = req.body;

    const order = await Order.findOne({ deviceId });

    if (!order || !order.paid) {
      return res.status(403).json({ status: "payment_required" });
    }

    res.json(order);

  } catch (err) {
    res.status(500).json({ status: "error" });
  }
});

/* =========================
WEBHOOK
========================= */
app.post("/stripe-webhook",
express.raw({ type: "application/json" }),
async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const deviceId = session.metadata?.deviceId;
      const email = session.metadata?.email;
      const type = session.metadata?.type;

      await Order.updateOne(
        { deviceId },
        {
          $set: {
            email,
            type,
            paid: true,
            status: "paid",
            time: new Date()
          }
        },
        { upsert: true }
      );
    }

    res.json({ ok: true });

  } catch (err) {
    res.status(400).send("Webhook error");
  }
});

/* =========================
ADMIN PANEL (WHITE + COPY EMAIL)
========================= */
app.get("/admin", async (req, res) => {
  const data = await Order.find().sort({ time: -1 });

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Admin</title>

<style>
body{
  margin:0;
  font-family:-apple-system, BlinkMacSystemFont, "Segoe UI";
  background:#f2f2f7;
  padding:20px;
}

.card{
  background:#fff;
  border-radius:14px;
  padding:12px;
  margin-bottom:10px;
  border:1px solid #e5e5ea;
}

.email{
  color:#0071e3;
  cursor:pointer;
  font-weight:500;
}

.tag{
  background:#0a84ff;
  color:#fff;
  padding:3px 8px;
  border-radius:6px;
  font-size:12px;
}
</style>
</head>

<body>

<h2>📊 Admin Panel</h2>

${data.map(i => `
  <div class="card">
    <div><b>Device:</b> ${i.deviceId}</div>
    <div><b>Email:</b>
      <span class="email" onclick="copy('${i.email || ""}')">
        ${i.email || "-"}
      </span>
    </div>
    <div><b>Type:</b> <span class="tag">${i.type}</span></div>
    <div><b>Status:</b> ${i.status}</div>
    <div><b>Paid:</b> ${i.paid ? "YES" : "NO"}</div>
  </div>
`).join("")}

<script>
function copy(text){
  navigator.clipboard.writeText(text);
  alert("Copied: " + text);
}
</script>

</body>
</html>
  `);
});

/* =========================
START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));