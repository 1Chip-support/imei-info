const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
FAKE DATA (без Mongo)
========================= */
let data = [
  {
    deviceId: "123456789012345",
    email: "test@gmail.com",
    type: "carrier",
    status: "paid",
    paid: true,
    time: new Date()
  },
  {
    deviceId: "987654321098765",
    email: "test2@gmail.com",
    type: "carrier",
    status: "pending",
    paid: false,
    time: new Date()
  }
];

/* =========================
ADMIN PANEL
========================= */
app.get("/admin", (req, res) => {
  const rows = data.map(d => `
    <tr>
      <td>${d.deviceId}</td>
      <td>${d.email}</td>
      <td>${d.type}</td>
      <td>${d.status}</td>
      <td>${d.paid}</td>
      <td>${d.time}</td>
    </tr>
  `).join("");

  res.send(`
    <html>
    <head>
      <title>Admin Panel</title>
      <style>
        body { font-family: Arial; background:#111; color:#fff; }
        table { width:100%; border-collapse: collapse; }
        td, th { border:1px solid #444; padding:8px; }
        th { background:#222; }
      </style>
    </head>
    <body>
      <h2>Admin Panel (TEST MODE)</h2>
      <table>
        <tr>
          <th>Device ID</th>
          <th>Email</th>
          <th>Type</th>
          <th>Status</th>
          <th>Paid</th>
          <th>Time</th>
        </tr>
        ${rows}
      </table>
    </body>
    </html>
  `);
});

/* =========================
TEST API
========================= */
app.get("/", (req, res) => {
  res.send("SERVER WORKING 🚀");
});

/* =========================
START
========================= */
const PORT = 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🔥 SERVER RUNNING ON", PORT);
});