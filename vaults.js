const crypto = require("crypto");
const { readCollection, writeCollection } = require("./db");

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createVault(name) {
  const vaults = readCollection("vaults");
  const vault = { id: crypto.randomUUID(), name, state: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  vaults.push(vault);
  writeCollection("vaults", vaults);
  return vault;
}

function getVault(vaultId) {
  return readCollection("vaults").find((v) => v.id === vaultId) || null;
}

function saveVaultState(vaultId, state) {
  const vaults = readCollection("vaults");
  const idx = vaults.findIndex((v) => v.id === vaultId);
  if (idx === -1) return null;
  vaults[idx].state = state;
  vaults[idx].updatedAt = new Date().toISOString();
  writeCollection("vaults", vaults);
  return vaults[idx];
}

function addMembership(vaultId, userId, role) {
  const memberships = readCollection("memberships");
  const exists = memberships.some((m) => m.vaultId === vaultId && m.userId === userId);
  if (!exists) {
    memberships.push({ vaultId, userId, role, joinedAt: new Date().toISOString() });
    writeCollection("memberships", memberships);
  }
}

function getMembership(vaultId, userId) {
  return readCollection("memberships").find((m) => m.vaultId === vaultId && m.userId === userId) || null;
}

function getVaultsForUser(userId) {
  const memberships = readCollection("memberships").filter((m) => m.userId === userId);
  const vaults = readCollection("vaults");
  return memberships
    .map((m) => {
      const vault = vaults.find((v) => v.id === m.vaultId);
      return vault ? { id: vault.id, name: vault.name, role: m.role } : null;
    })
    .filter(Boolean);
}

function createInvite(vaultId, createdByUserId) {
  const invites = readCollection("invites");
  const invite = {
    token: crypto.randomBytes(16).toString("hex"),
    vaultId,
    createdByUserId,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + INVITE_TTL_MS,
  };
  invites.push(invite);
  writeCollection("invites", invites);
  return invite;
}

function getInvite(token) {
  const invite = readCollection("invites").find((i) => i.token === token);
  if (!invite || invite.expiresAt < Date.now()) return null;
  return invite;
}

module.exports = {
  createVault,
  getVault,
  saveVaultState,
  addMembership,
  getMembership,
  getVaultsForUser,
  createInvite,
  getInvite,
};
