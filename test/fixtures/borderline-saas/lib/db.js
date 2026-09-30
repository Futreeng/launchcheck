// Tiny JSON-file datastore.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "db.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { users: [], reports: [] };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function all(table) {
  return load()[table];
}

function insert(table, row) {
  const data = load();
  row.id = data[table].length + 1;
  data[table].push(row);
  save(data);
  return row;
}

function update(table, id, patch) {
  const data = load();
  const row = data[table].find((r) => r.id === id);
  Object.assign(row, patch);
  save(data);
  return row;
}

module.exports = { all, insert, update };
