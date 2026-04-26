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

/* JSON must be BEFORE routes except webhook */
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
CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
  try {
    const { deviceId, email, type } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId missing" });
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

    const data = await Check.findOne({ deviceId });

    if (!data || !data.paid) {
      return res.status(403).json({ status: "payment_required" });
    }

    res.json(data);

  } catch (err) {
    res.status(500).json({ status: "server_error" });
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

      await Check.updateOne(
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

    res.json({ received: true });

  } catch (err) {
    console.log("Webhook error:", err.message);
    res.status(400).send("Webhook error");
  }
});

/* =========================
ADMIN PANEL (FIXED UI)
========================= */
app.get("/admin", async (req, res) => {
  const data = await Check.find().sort({ time: -1 });

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
  background:#fff;
  color:#000;
}

.container{
  max-width:500px;
  margin:0 auto;
  padding:20px;
}

.card{
  border-bottom:1px solid #eee;
  padding:12px 0;
}

.title{
  font-size:20px;
  font-weight:600;
  margin-bottom:10px;
}

.row{
  font-size:14px;
  margin:4px 0;
  word-break:break-all;
}

.click{
  color:#0071e3;
  cursor:pointer;
  font-weight:500;
}

.click:active{
  opacity:0.5;
}
</style>
</head>

<body>

<div class="container">

<div class="title">📊 Admin Panel</div>

${data.map(i => `
  <div class="card">

    <div class="row">
      <b>IMEI:</b>
      <span class="click" onclick="copy('${i.deviceId}')">${i.deviceId}</span>
    </div>

    <div class="row">
      <b>Email:</b>
      <span class="click" onclick="copy('${i.email || ""}')">${i.email || "-"}</span>
    </div>

    <div class="row"><b>Type:</b> ${i.type}</div>
    <div class="row"><b>Status:</b> ${i.status}</div>
    <div class="row"><b>Paid:</b> ${i.paid ? "YES" : "NO"}</div>

  </div>
`).join("")}

</div>

<script>
function copy(text){
  if(!text) return;
  navigator.clipboard.writeText(text);
  alert("Copied: " + text);
}
</script>

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