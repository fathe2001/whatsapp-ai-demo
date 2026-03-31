require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ✅ Simple JSON database (later replace with Supabase)
const DB_FILE = "./data.json";

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      clients: [
        {
          id: "clinic",
          name: "عيادة النور",
          phone: "04-3750228",
          whatsapp: "972524505228",
          doctorNumber: "972522411740",
          active: true,
          morning: "٨:٠٠ - ١١:٠٠",
          evening: "١٦:٠٠ - ١٩:٠٠",
          friday: "١٤:٠٠ - ١٧:٠٠",
          saturday: "١٠:٠٠ - ١٣:٠٠",
          extra: "فحوصات الدم: الأحد-الخميس من ٩:٠٠ حتى ١٢:٠٠ مع موعد مسبق",
          language: "عربي + عبري",
        },
      ],
      requests: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Dashboard homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Get all clients
app.get("/api/clients", (req, res) => {
  const db = readDB();
  res.json(db.clients);
});

// Get client by id
app.get("/api/clients/:id", (req, res) => {
  const db = readDB();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
});

// Update client info
app.put("/api/clients/:id", (req, res) => {
  const db = readDB();
  const idx = db.clients.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Client not found" });
  db.clients[idx] = { ...db.clients[idx], ...req.body };
  writeDB(db);
  res.json({ success: true, client: db.clients[idx] });
});

// Toggle client bot on/off
app.patch("/api/clients/:id/toggle", (req, res) => {
  const db = readDB();
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });
  client.active = !client.active;
  writeDB(db);
  res.json({ success: true, active: client.active });
});

// Add new client
app.post("/api/clients", (req, res) => {
  const db = readDB();
  const newClient = {
    id: Date.now().toString(),
    active: true,
    ...req.body,
  };
  db.clients.push(newClient);
  writeDB(db);
  res.json({ success: true, client: newClient });
});

// Get all requests (with optional client filter)
app.get("/api/requests", (req, res) => {
  const db = readDB();
  let requests = db.requests;
  if (req.query.clientId) {
    requests = requests.filter((r) => r.clientId === req.query.clientId);
  }
  if (req.query.status) {
    requests = requests.filter((r) => r.status === req.query.status);
  }
  // Return newest first
  res.json(requests.reverse());
});

// Add new request (called from index.js bot)
app.post("/api/requests", (req, res) => {
  const db = readDB();
  const newRequest = {
    id: Date.now().toString(),
    status: "new",
    createdAt: new Date().toISOString(),
    ...req.body,
  };
  db.requests.push(newRequest);
  writeDB(db);
  res.json({ success: true, request: newRequest });
});

// Update request status
app.patch("/api/requests/:id", (req, res) => {
  const db = readDB();
  const req2 = db.requests.find((r) => r.id === req.params.id);
  if (!req2) return res.status(404).json({ error: "Request not found" });
  Object.assign(req2, req.body);
  writeDB(db);
  res.json({ success: true });
});

// Delete request
app.delete("/api/requests/:id", (req, res) => {
  const db = readDB();
  db.requests = db.requests.filter((r) => r.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// Stats
app.get("/api/stats", (req, res) => {
  const db = readDB();
  const today = new Date().toDateString();
  const todayRequests = db.requests.filter(
    (r) => new Date(r.createdAt).toDateString() === today
  );
  res.json({
    totalClients: db.clients.length,
    activeClients: db.clients.filter((c) => c.active).length,
    todayRequests: todayRequests.length,
    totalRequests: db.requests.length,
    pendingRequests: db.requests.filter((r) => r.status !== "done").length,
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Start server
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.listen(PORT, () => {
  console.log(`✅ Dashboard running at: http://localhost:${PORT}`);
  console.log(`📊 Open your browser and go to http://localhost:${PORT}`);
});
