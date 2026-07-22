const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

// Synchronous on purpose: every read-modify-write in this app happens as one
// unbroken synchronous block (see server.js), so there's no async gap where a
// second request could interleave and corrupt a file.
function readCollection(name) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), "utf8"));
  } catch (e) {
    return [];
  }
}

function writeCollection(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

module.exports = { readCollection, writeCollection };
