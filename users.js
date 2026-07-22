const crypto = require("crypto");
const { readCollection, writeCollection } = require("./db");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return readCollection("users").find((u) => u.email === normalized) || null;
}

function findUserById(id) {
  return readCollection("users").find((u) => u.id === id) || null;
}

function createUser(email, passwordHash) {
  const users = readCollection("users");
  const user = {
    id: crypto.randomUUID(),
    email: normalizeEmail(email),
    passwordHash,
    activeVaultId: null,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeCollection("users", users);
  return user;
}

function setActiveVault(userId, vaultId) {
  const users = readCollection("users");
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return;
  users[idx].activeVaultId = vaultId;
  writeCollection("users", users);
}

module.exports = { normalizeEmail, findUserByEmail, findUserById, createUser, setActiveVault };
