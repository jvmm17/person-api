"use strict";

const http = require("http");
const url = require("url");
const fs = require("fs").promises;
const path = require("path");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "persons.json");

// Helpers
async function readData() {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}
async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function notFound(res) {
  send(res, 404, { error: "Not found" });
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}
function matchRoute(pathname, pattern) {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

// Birthday formatter
function formatBirthday(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long", // October, November, etc.
    day: "numeric",
  });
}

// Server
const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  try {
    // Health check
    if (req.method === "GET" && pathname === "/health") {
      return send(res, 200, { status: "ok" });
    }

    // List persons (optional ?q=search by name)
    if (req.method === "GET" && pathname === "/api/persons") {
      const list = await readData();
      const q = (query.q || "").toLowerCase();
      const filtered = q
        ? list.filter((p) => p.name.toLowerCase().includes(q))
        : list;

      // Format birthdays before sending
      const formatted = filtered.map((p) => ({
        ...p,
        birthday: formatBirthday(p.birthday),
      }));

      return send(res, 200, formatted);
    }

    // Get one person
    let params = matchRoute(pathname, "/api/persons/:id");
    if (req.method === "GET" && params) {
      const list = await readData();
      const item = list.find((p) => p.id === params.id);
      if (!item) return notFound(res);

      // Format birthday before sending
      const formatted = {
        ...item,
        birthday: formatBirthday(item.birthday),
      };
      return send(res, 200, formatted);
    }

    // CREATE (POST)
    if (req.method === "POST" && pathname === "/api/persons") {
      const body = await parseBody(req);

      if (!body.name || !body.age || !body.gender || !body.birthday) {
        return send(res, 400, {
          error: "All fields (name, age, gender, birthday) are required",
        });
      }

      const list = await readData();
      const item = {
        id: "p" + (list.length + 1), // keep incremental (or switch to randomUUID if you want)
        name: body.name,
        age: body.age,
        gender: body.gender,
        birthday: formatBirthday(body.birthday),
      };

      list.push(item);
      await saveData(list);
      return send(res, 201, item);
    }

    // UPDATE (PUT)
    if (req.method === "PUT" && params) {
      const body = await parseBody(req);

      if (!body.name || !body.age || !body.gender || !body.birthday) {
        return send(res, 400, {
          error: "All fields (name, age, gender, birthday) are required",
        });
      }

      const list = await readData();
      const idx = list.findIndex((p) => p.id === params.id);

      if (idx === -1) {
        return send(res, 404, { error: "Person not found" });
      }

      // Keep same ID, update other fields
      list[idx] = {
        id: list[idx].id,
        name: body.name,
        age: body.age,
        gender: body.gender,
        birthday: formatBirthday(body.birthday),
      };

      await saveData(list);
      return send(res, 200, list[idx]);
    }

    // DELETE
    params = matchRoute(pathname, "/api/persons/:id");
    if (req.method === "DELETE" && params) {
      const list = await readData();
      const idx = list.findIndex((p) => p.id === params.id);
      if (idx === -1) return notFound(res);

      const [removed] = list.splice(idx, 1);
      await saveData(list);
      return send(res, 200, removed);
    }

    notFound(res);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Person API listening on http://localhost:${PORT}`);
});
