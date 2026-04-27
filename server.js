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
DELETE ORDER (NEW)
========================= */
app.get("/admin/delete/:id", async (req, res) => {
 try {
   await Check.findByIdAndDelete(req.params.id);
   res.redirect("/admin");
 } catch (err) {
   res.status(500).send("Delete error");
 }
});

/* =========================
ADMIN PANEL (iOS STYLE + COPY + DELETE)
========================= */
app.get("/admin", async (req, res) => {
 const data = await Check.find().sort({ time: -1 });

 res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Admin Panel</title>

<style>
body{
 margin:0;
 font-family:-apple-system, BlinkMacSystemFont, "Segoe UI";
 background:#f2f2f7;
 color:#000;
}

.container{
 max-width:520px;
 margin:0 auto;
 padding:16px;
}

.title{
 font-size:22px;
 font-weight:700;
 margin-bottom:15px;
}

.card{
 background:#fff;
 border-radius:14px;
 padding:12px;
 margin-bottom:10px;
 border:1px solid #e5e5ea;
}

.row{
 font-size:14px;
 margin:6px 0;
 word-break:break-all;
}

.copy{
 color:#0071e3;
 font-weight:500;
 cursor:pointer;
}

.delete{
 color:#ff3b30;
 font-weight:600;
 text-decoration:none;
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
     <span class="copy" onclick="copyText('${i.deviceId}')">${i.deviceId}</span>
   </div>

   <div class="row">
     <b>Email:</b>
     <span class="copy" onclick="copyText('${i.email || ""}')">${i.email || "-"}</span>
   </div>

   <div class="row"><b>Type:</b> ${i.type}</div>
   <div class="row"><b>Status:</b> ${i.status}</div>
   <div class="row"><b>Paid:</b> ${i.paid ? "YES" : "NO"}</div>

   <div class="row">
     <a class="delete" href="/admin/delete/${i._id}">🗑 Delete</a>
   </div>

 </div>
`).join("")}

</div>

<script>
function copyText(text){
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
START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));