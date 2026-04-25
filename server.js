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
  deviceId: String,
  status: { type: String, default: "pending" },
  answer: { type: String, default: "" },
  price: { type: Number, default: 1.99 },   // 💰 ДОБАВИЛ ЦЕНУ
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
app.post("/request", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.json({ status: "error" });
    }

    const request = await Check.create({
      deviceId,
      status: "pending"
    });

    res.json({
      status: "created",
      id: request._id,
      price: 1.99   // 💰 ВОЗВРАЩАЕМ ЦЕНУ НА FRONTEND
    });

  } catch (err) {
    console.log("REQUEST ERROR:", err);
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
   ADMIN: GET REQUESTS
========================= */
app.get("/requests", async (req, res) => {
  try {
    const data = await Check.find().sort({ _id: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json([]);
  }
});

/* =========================
   ADMIN: ANSWER
========================= */
app.post("/answer", async (req, res) => {
  try {
    const { id, answer } = req.body;

    await Check.findByIdAndUpdate(id, {
      status: "done",
      answer
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