const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();

/* =========================
  WEBHOOK RAW (ВАЖНО)
========================= */
app.post(
"/stripe-webhook",
express.raw({ type: "application/json" }),
async (req, res) => {
try {

const event = JSON.parse(req.body.toString());

console.log("WEBHOOK:", event.type);

if (event.type === "checkout.session.completed") {

const session = event.data.object;
const deviceId = session.metadata?.deviceId;

if (deviceId) {
await Check.updateOne(
{ deviceId },
{
$set: {
paid: true,
status: "paid",
time: new Date()
}
},
{ upsert: true }
);

console.log("PAYMENT OK:", deviceId);
}
}

res.json({ received: true });

} catch (err) {
console.log("WEBHOOK ERROR:", err.message);
res.status(400).send("Webhook error");
}
}
);

/* =========================
  MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());

/* =========================
  MONGODB
========================= */
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log("MongoDB error:", err));

/* =========================
  VALIDATION
========================= */
function isValidDeviceId(deviceId){
const isIMEI = /^\d{15}$/.test(deviceId);
const isSN = /^[A-Za-z0-9]{10,12}$/.test(deviceId);
return isIMEI || isSN;
}

/* =========================
  MODEL (1 DEVICE = 1 RECORD)
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
  CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
try {

const { deviceId } = req.body;

if (!deviceId || !isValidDeviceId(deviceId)) {
return res.status(400).json({ error: "Invalid IMEI / SN" });
}

// создаём или обновляем запись
await Check.updateOne(
{ deviceId },
{ $set: { paid: false, status: "pending" } },
{ upsert: true }
);

const session = await stripe.checkout.sessions.create({
payment_method_types: ["card"],
mode: "payment",
line_items: [{
price_data: {
currency: "usd",
product_data: {
name: "IMEI / SN Check"
},
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
console.log("STRIPE ERROR:", err.message);
res.status(500).json({ error: err.message });
}
});

/* =========================
  CHECK RESULT
========================= */
app.post("/check", async (req, res) => {
try {

const { deviceId } = req.body;

if (!deviceId) {
return res.status(400).json({ status: "error" });
}

const payment = await Check.findOne({ deviceId, paid: true });

if (!payment) {
return res.status(403).json({ status: "payment_required" });
}

res.json(payment);

} catch (err) {
res.status(500).json({ status: "server_error" });
}
});

/* =========================
  HISTORY
========================= */
app.get("/history", async (req, res) => {
const data = await Check.find().sort({ time: -1 });
res.json(data);
});

/* =========================
  START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log("Server running on", PORT);
});