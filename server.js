const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");

const app = express();

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
   CREATE REQUEST
========================= */
app.post("/check", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ status: "error", message: "No IMEI" });
    }

    const last = deviceId.slice(-1);

    let status = "pending";

    if (last === "0") status = "blocked";
    else if (last === "5") status = "clean";

    const request = await Check.create({
      deviceId,
      status,
      price: 1.99
    });

    // 💡 ВАЖНО: теперь ВСЕГДА отдаём цену с базы
    res.json({
      id: request._id,
      deviceId: request.deviceId,
      status: request.status,
      price: request.price,
      time: request.time
    });

  } catch (err) {
    console.log("CHECK ERROR:", err);
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
   GET ALL REQUESTS (ADMIN)
========================= */
app.get("/history", async (req, res) => {
  try {
    const data = await Check.find().sort({ _id: -1 });
    res.json(data);
  } catch (err) {
    console.log("HISTORY ERROR:", err);
    res.status(500).json([]);
  }
});

/* =========================
   ANSWER REQUEST (ADMIN)
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
    console.log("ANSWER ERROR:", err);
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