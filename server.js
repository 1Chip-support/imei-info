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

if (mongoURL) {
  mongoose.connect(mongoURL)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log("MongoDB error:", err));
} else {
  console.log("❌ MONGO_URL missing");
}

/* =========================
   MODEL (ЗАЯВКИ)
========================= */
const CheckSchema = new mongoose.Schema({
  deviceId: String,
  status: { type: String, default: "pending" },
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
   СОЗДАТЬ ЗАЯВКУ
========================= */
app.post("/request", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.json({ status: "error" });
    }

    const request = await Check.create({ deviceId });

    res.json({
      status: "created",
      id: request._id
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
   ПОЛУЧИТЬ ВСЕ ЗАЯВКИ (АДМИН)
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
   ОТВЕТИТЬ НА ЗАЯВКУ (АДМИН)
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