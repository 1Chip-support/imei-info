const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// память (история проверок)
const history = [];

// TEST
app.get("/", (req, res) => {
  res.send("API is working 🚀");
});

// CHECK IMEI
app.post("/check", (req, res) => {
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

  history.push(result);

  console.log("CHECK:", result);

  res.json(result);
});

// HISTORY
app.get("/history", (req, res) => {
  res.json(history);
});

// ВАЖНО ДЛЯ DEPLOY
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});