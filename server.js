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
   MODEL
========================= */
const CheckSchema = new mongoose.Schema({
  deviceId: String,
  status: String,
  time: String
});

const Check = mongoose.model("Check", CheckSchema);

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("API is working 🚀");
});

/* =========================
   CHECK IMEI
========================= */
app.post("/check", async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.json({ status: "error" });
    }

    let status = "pending";

    const last = deviceId.slice(-1);

    if (last === "0") status = "blocked";
    else if (last === "5") status = "clean";

    const result = {
      deviceId,
      status,
      time: new Date().toISOString()
    };

    if (mongoURL) {
      await Check.create(result);
    }

    res.json(result);

  } catch (err) {
    console.log("CHECK ERROR:", err);
    res.status(500).json({ status: "server_error" });
  }
});

/* =========================
   HISTORY
========================= */
app.get("/history", async (req, res) => {
  try {
    if (!mongoURL) return res.json([]);

    const data = await Check.find().sort({ _id: -1 });
    res.json(data);

  } catch (err) {
    console.log("HISTORY ERROR:", err);
    res.status(500).json([]);
  }
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});