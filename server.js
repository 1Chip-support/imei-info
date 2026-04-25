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
ADMIN AUTH (COOKIE)
========================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "Albatros1985";

/* LOGIN */
app.post("/admin/login", (req, res) => {
  const { user, pass } = req.body;

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    res.cookie("admin", "yes", { httpOnly: true });
    return res.redirect("/admin");
  }

  res.send("❌ Wrong login");
});

/* LOGOUT */
app.get("/admin/logout", (req, res) => {
  res.clearCookie("admin");
  res.redirect("/admin");
});

/* =========================
MONGODB
========================= */
const mongoURL = process.env.MONGO_URL;

mongoose.connect(mongoURL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

/* =========================
MODEL
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
ROOT
========================= */
app.get("/", (req, res) => {
  res.send("API is working 🚀");
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
      success_url: "https://chipper-cobbler-62c70c.netlify.app",
      cancel_url: "https://chipper-cobbler-62c70c.netlify.app"
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

    const payment = await Check.findOne({ deviceId, paid: true });

    if (!payment) {
      return res.status(403).json({ status: "payment_required" });
    }

    res.json({
      deviceId,
      status: payment.status
    });

  } catch (err) {
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
DELETE (ADMIN)
========================= */
app.get("/admin/delete/:id", async (req, res) => {
  if (req.cookies.admin !== "yes") {
    return res.send("❌ Not allowed");
  }

  await Check.findByIdAndDelete(req.params.id);
  res.redirect("/admin");
});

/* =========================
ADMIN PANEL
========================= */
app.get("/admin", async (req, res) => {

  if (req.cookies.admin !== "yes") {
    return res.send(`
      <h2>Admin Login</h2>
      <form method="post" action="/admin/login">
        <input name="user" placeholder="user" />
        <input name="pass" placeholder="pass" type="password" />
        <button type="submit">Login</button>
      </form>
    `);
  }

  // ✅ ТОЛЬКО ОПЛАЧЕННЫЕ
  const data = await Check.find({ paid: true }).sort({ _id: -1 });

  res.send(`
    <html>
    <body style="background:#111;color:#fff;font-family:Arial;padding:20px;">
      <h1>💰 PAID ORDERS</h1>

      <a href="/admin/logout" style="color:red;">Logout</a>

      ${data.map(i => `
        <div style="background:#222;padding:10px;margin:10px;border-radius:8px;">
          <b>IMEI:</b> ${i.deviceId}<br/>
          <b>Status:</b> ${i.status}<br/>
          <b>Paid:</b> ${i.paid}<br/>
          <b>Time:</b> ${i.time}<br/>
          <a href="/admin/delete/${i._id}" style="color:red;">🗑 Delete</a>
        </div>
      `).join("")}

    </body>
    </html>
  `);
});

/* =========================
START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});