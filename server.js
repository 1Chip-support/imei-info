const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is working 🚀");
});

app.post("/check", (req, res) => {
  const { deviceId } = req.body;

  res.json({
    id: Date.now().toString(),
    deviceId: deviceId,
    status: "pending"
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});