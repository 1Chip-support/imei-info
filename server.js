const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   MONGODB
========================= */
mongoose.connect("mongodb+srv://andforeyou_db_user:2AUBwGXbVK6qaexa@cluster0.dmetv8x.mongodb.net/imei")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

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
   ROOT (FIX)
========================= */
app.get("/", (req, res) => {
  res.send("API is working 🚀");
});

/* =========================
   CHECK IMEI
========================= */
app.post("/check", async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.json({ status: "error" });
  }

  let status = "pending";

  const last = deviceId.slice(-1);

  if (last === "0") status = "blocked";
  else if (last === "5") status = "clean";
