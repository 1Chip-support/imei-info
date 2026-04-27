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
VALIDATION (FIXED)
========================= */
function isValidDeviceId(deviceId) {
 if (!deviceId) return false;

 deviceId = deviceId.trim();

 const isIMEI = /^\d{15}$/.test(deviceId);

 // SN: 10–12 символов, буквы и цифры (ВАЖНО FIX)
 const isSN = /^[A-Za-z0-9]{10,12}$/.test(deviceId);

 return isIMEI || isSN;
}

/* =========================
WEBHOOK
========================= */
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
 try {
   const event = JSON.parse(req.body.toString());

   if (event.type === "checkout.session.completed") {
     const session = event.data.object;

     const deviceId = session.metadata?.deviceId;
     const email = session.metadata?.email;
     const type = session.metadata?.type;

     if (deviceId) {
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

       console.log("PAYMENT SAVED:", deviceId);
     }
   }

   res.json({ received: true });

 } catch (err) {
   console.log("WEBHOOK ERROR:", err.message);
   res.status(400).send("Webhook error");
 }
});

/* =========================
CREATE PAYMENT
========================= */
app.post("/create-payment", async (req, res) => {
 try {
   const { deviceId, email, type } = req.body;

   if (!isValidDeviceId(deviceId)) {
     return res.status(400).json({ error: "Invalid IMEI / SN (10–12 letters+numbers)" });
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
           name: `IMEI/SN Check (${type || "carrier"})`
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

   if (!isValidDeviceId(deviceId)) {
     return res.status(400).json({ status: "invalid_id" });
   }

   const payment = await Check.findOne({ deviceId });

   if (!payment || payment.paid !== true) {
     return res.status(403).json({ status: "payment_required" });
   }

   res.json(payment);

 } catch (err) {
   res.status(500).json({ status: "server_error" });
 }
});

/* =========================
ADMIN DELETE
========================= */
app.get("/admin/delete/:id", async (req, res) => {
 await Check.findByIdAndDelete(req.params.id);
 res.redirect("/admin");
});

/* =========================
ADMIN PANEL (EMAIL FIX COPY)
========================= */
app.get("/admin", async (req, res) => {

 const data = await Check.find().sort({ time: -1 });

 res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Panel</title>

<style>
body{margin:0;font-family:-apple-system;background:#f2f2f7;}
.container{max-width:520px;margin:auto;padding:16px;}
.card{background:#fff;padding:12px;margin-bottom:10px;border-radius:14px;}
.copy{color:#0071e3;cursor:pointer;}
.delete{color:#ff3b30;text-decoration:none;}
</style>
</head>

<body>

<div class="container">

<h2>📊 Admin Panel</h2>

${data.map(i => `
<div class="card">

 <div><b>ID:</b> <span class="copy" onclick="copyText('${i.deviceId}')">${i.deviceId}</span></div>

 <div>
   <b>Email:</b>
   <span class="copy" onclick="copyText('${String(i.email || "").replace(/'/g,"") }')">
     ${i.email || "-"}
   </span>
 </div>

 <div><b>Type:</b> ${i.type}</div>
 <div><b>Status:</b> ${i.paid ? "PAID" : "PENDING"}</div>

 <a class="delete" href="/admin/delete/${i._id}">Delete</a>

</div>
`).join("")}

</div>

<script>
function copyText(t){
 navigator.clipboard.writeText(t || "");
 alert("Copied: " + t);
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