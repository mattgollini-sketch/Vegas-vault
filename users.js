"use strict";

const crypto = require("crypto");
const { getDb } = require("./db");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    activeVaultId: row.active_vault_id,
    createdAt: row.created_at,
  };
}

function findUserByEmail(email) {
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email));
  return rowToUser(row);
}

function findUserById(id) {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
  return rowToUser(row);
}

function createUser(email, passwordHash) {
  const user = {
    id: crypto.randomUUID(),
    email: normalizeEmail(email),
    passwordHash,
    activeVaultId: null,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, active_vault_id, created_at) VALUES (?, ?, ?, NULL, ?)`
    )
    .run(user.id, user.email, user.passwordHash, user.createdAt);
  return user;
}

function setActiveVault(userId, vaultId) {
  getDb().prepare("UPDATE users SET active_vault_id = ? WHERE id = ?").run(vaultId, userId);
}

function setPasswordHash(userId, passwordHash) {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

module.exports = {
  normalizeEmail,
  findUserByEmail,
  findUserById,
  createUser,
  setActiveVault,
  setPasswordHash,
};
