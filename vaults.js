"use strict";

const crypto = require("crypto");
const { getDb, hashToken } = require("./db");
const users = require("./users");

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STATE_BYTES = 512 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function parseVault(row) {
  if (!row) return null;
  let state = {};
  try {
    state = JSON.parse(row.state_json || "{}");
  } catch (e) {
    state = {};
  }
  let updatedByEmail = null;
  if (row.updated_by) {
    const editor = users.findUserById(row.updated_by);
    updatedByEmail = editor ? editor.email : null;
  }
  return {
    id: row.id,
    name: row.name,
    state,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    updatedByEmail,
    createdAt: row.created_at,
  };
}

function createVault(name) {
  const vault = {
    id: crypto.randomUUID(),
    name: name || "My Vegas Trip",
    createdAt: nowIso(),
  };
  getDb()
    .prepare(
      `INSERT INTO vaults (id, name, state_json, version, updated_at, updated_by, created_at)
       VALUES (?, ?, '{}', 1, ?, NULL, ?)`
    )
    .run(vault.id, vault.name, vault.createdAt, vault.createdAt);
  return getVault(vault.id);
}

function getVault(vaultId) {
  return parseVault(getDb().prepare("SELECT * FROM vaults WHERE id = ?").get(vaultId));
}

function validateState(state) {
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return "Missing trip data.";
  }
  let raw;
  try {
    raw = JSON.stringify(state);
  } catch (e) {
    return "Trip data could not be saved.";
  }
  if (raw.length > MAX_STATE_BYTES) return "That trip is too large to save.";
  return null;
}

function saveVaultState(vaultId, state, baseVersion, userId) {
  const problem = validateState(state);
  if (problem) return { error: "invalid", message: problem };

  const run = getDb().transaction(() => {
    const row = getDb().prepare("SELECT * FROM vaults WHERE id = ?").get(vaultId);
    if (!row) return { error: "missing" };
    if (Number(baseVersion) !== row.version) {
      return { error: "conflict", vault: parseVault(row) };
    }
    const updatedAt = nowIso();
    const version = row.version + 1;
    getDb()
      .prepare("UPDATE vaults SET state_json = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .run(JSON.stringify(state), version, updatedAt, userId, vaultId);
    return { ok: true, version, updatedAt };
  });
  return run();
}

function addMembership(vaultId, userId, role) {
  const existing = getMembership(vaultId, userId);
  if (existing) return existing;
  const joinedAt = nowIso();
  getDb()
    .prepare("INSERT INTO memberships (vault_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)")
    .run(vaultId, userId, role, joinedAt);
  return { vaultId, userId, role, joinedAt };
}

function getMembership(vaultId, userId) {
  const row = getDb()
    .prepare("SELECT vault_id, user_id, role, joined_at FROM memberships WHERE vault_id = ? AND user_id = ?")
    .get(vaultId, userId);
  if (!row) return null;
  return { vaultId: row.vault_id, userId: row.user_id, role: row.role, joinedAt: row.joined_at };
}

function getVaultsForUser(userId) {
  const rows = getDb()
    .prepare(
      `SELECT v.id, v.name, m.role
       FROM memberships m
       JOIN vaults v ON v.id = m.vault_id
       WHERE m.user_id = ?
       ORDER BY m.joined_at ASC`
    )
    .all(userId);
  return rows.map((row) => ({ id: row.id, name: row.name, role: row.role }));
}

function listMembers(vaultId) {
  return getDb()
    .prepare(
      `SELECT u.id AS user_id, u.email, m.role, m.joined_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.vault_id = ?
       ORDER BY m.joined_at ASC`
    )
    .all(vaultId)
    .map((row) => ({
      userId: row.user_id,
      email: row.email,
      role: row.role,
      joinedAt: row.joined_at,
    }));
}

function countOwners(vaultId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS n FROM memberships WHERE vault_id = ? AND role = 'owner'")
    .get(vaultId).n;
}

function countMembers(vaultId) {
  return getDb().prepare("SELECT COUNT(*) AS n FROM memberships WHERE vault_id = ?").get(vaultId).n;
}

function pointActiveVaultElsewhere(userId, vaultId) {
  const user = users.findUserById(userId);
  if (!user || user.activeVaultId !== vaultId) return;
  const remaining = getVaultsForUser(userId);
  users.setActiveVault(userId, remaining.length ? remaining[0].id : null);
}

function removeMember(vaultId, userId) {
  const run = getDb().transaction(() => {
    const membership = getMembership(vaultId, userId);
    if (!membership) return { error: "missing" };
    if (membership.role === "owner" && countOwners(vaultId) <= 1) {
      return { error: "last-owner" };
    }
    getDb().prepare("DELETE FROM memberships WHERE vault_id = ? AND user_id = ?").run(vaultId, userId);
    pointActiveVaultElsewhere(userId, vaultId);
    return { ok: true };
  });
  return run();
}

function setMemberRole(vaultId, userId, role) {
  if (role !== "owner" && role !== "member") return { error: "invalid" };
  const run = getDb().transaction(() => {
    const membership = getMembership(vaultId, userId);
    if (!membership) return { error: "missing" };
    if (membership.role === "owner" && role !== "owner" && countOwners(vaultId) <= 1) {
      return { error: "last-owner" };
    }
    getDb().prepare("UPDATE memberships SET role = ? WHERE vault_id = ? AND user_id = ?").run(role, vaultId, userId);
    return { ok: true };
  });
  return run();
}

function leaveVault(vaultId, userId) {
  const run = getDb().transaction(() => {
    const membership = getMembership(vaultId, userId);
    if (!membership) return { error: "missing" };
    const owners = countOwners(vaultId);
    const members = countMembers(vaultId);
    if (membership.role === "owner" && owners <= 1 && members > 1) {
      return { error: "last-owner" };
    }
    getDb().prepare("DELETE FROM memberships WHERE vault_id = ? AND user_id = ?").run(vaultId, userId);
    pointActiveVaultElsewhere(userId, vaultId);
    return { ok: true };
  });
  return run();
}

function createInvite(vaultId, createdByUserId) {
  const token = crypto.randomBytes(24).toString("hex");
  const invite = {
    id: crypto.randomUUID(),
    token,
    vaultId,
    createdByUserId,
    createdAt: nowIso(),
    expiresAt: Date.now() + INVITE_TTL_MS,
  };
  getDb()
    .prepare(
      `INSERT INTO invites (id, token_hash, token_hint, vault_id, created_by, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(invite.id, hashToken(token), token.slice(-4), vaultId, createdByUserId, invite.createdAt, invite.expiresAt);
  return invite;
}

function listInvites(vaultId) {
  return getDb()
    .prepare(
      `SELECT id, token_hint, created_at, expires_at, used_at, revoked_at
       FROM invites WHERE vault_id = ? ORDER BY created_at DESC`
    )
    .all(vaultId)
    .map((row) => ({
      id: row.id,
      hint: row.token_hint,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
      active: !row.used_at && !row.revoked_at && row.expires_at >= Date.now(),
    }));
}

function revokeInvite(vaultId, inviteId) {
  const result = getDb()
    .prepare(
      `UPDATE invites SET revoked_at = ? WHERE id = ? AND vault_id = ? AND revoked_at IS NULL AND used_at IS NULL`
    )
    .run(nowIso(), inviteId, vaultId);
  return result.changes > 0;
}

function getInvite(token) {
  if (!token) return null;
  const row = getDb().prepare("SELECT * FROM invites WHERE token_hash = ?").get(hashToken(token));
  if (!row) return null;
  if (row.revoked_at || row.used_at || row.expires_at < Date.now()) return null;
  return {
    id: row.id,
    vaultId: row.vault_id,
    createdByUserId: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function acceptInvite(token, userId) {
  const run = getDb().transaction(() => {
    const row = getDb().prepare("SELECT * FROM invites WHERE token_hash = ?").get(hashToken(token));
    if (!row || row.revoked_at || row.used_at || row.expires_at < Date.now()) return { error: "invalid" };
    const vault = getVault(row.vault_id);
    if (!vault) return { error: "invalid" };
    addMembership(row.vault_id, userId, "member");
    getDb()
      .prepare("UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?")
      .run(nowIso(), userId, row.id);
    return { ok: true, vaultId: row.vault_id };
  });
  return run();
}

module.exports = {
  INVITE_TTL_MS,
  MAX_STATE_BYTES,
  createVault,
  getVault,
  validateState,
  saveVaultState,
  addMembership,
  getMembership,
  getVaultsForUser,
  listMembers,
  removeMember,
  setMemberRole,
  leaveVault,
  createInvite,
  listInvites,
  revokeInvite,
  getInvite,
  acceptInvite,
};
