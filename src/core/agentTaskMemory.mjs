import {agentProjectIdentity, agentProjectRevision} from './agentExpertContext.mjs';

const STATES = new Set(['PENDING', 'APPROVED', 'APPLIED', 'REVOKED']);
const unsafe = text => /(?:Bearer\s+\S+|api[_ -]?key\s*[:=]|sk-[A-Za-z0-9]{12,}|https?:\/\/)/i.test(text);
export function createAgentTaskMemory(project, now = Date.now()) {
  return {version: 1, identity: agentProjectIdentity(project), updatedAt: now, entries: []};
}
export function validateAgentTaskMemory(memory, project, now = Date.now()) {
  if (!memory || memory.version !== 1 || memory.identity !== agentProjectIdentity(project) ||
      !Number.isSafeInteger(memory.updatedAt) || memory.updatedAt > now ||
      now - memory.updatedAt > 30 * 86400000 || !Array.isArray(memory.entries) || memory.entries.length > 32)
    throw new TypeError('INVALID_PROJECT_TASK_MEMORY');
  const ids = new Set();
  for (const e of memory.entries) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id) || e.id.length > 80 ||
        !STATES.has(e.status) || !['TASK', 'DECISION', 'APPLIED_BATCH'].includes(e.kind) ||
        typeof e.text !== 'string' || !e.text.trim() || e.text.length > 300 || unsafe(e.text) ||
        typeof e.revision !== 'string' || !/^[a-f0-9]{16}$/.test(e.revision) ||
        !Array.isArray(e.cueIds) || e.cueIds.length > 30 || e.cueIds.some(id => typeof id !== 'string'))
      throw new TypeError('INVALID_PROJECT_TASK_MEMORY');
    ids.add(e.id);
  }
  return memory;
}
export function recordAgentTaskMemory(memory, project, entry, now = Date.now()) {
  validateAgentTaskMemory(memory, project, now);
  const next = structuredClone(memory);
  const item = {...entry, revision: agentProjectRevision(project), cueIds: entry.cueIds ?? []};
  next.entries = [...next.entries.filter(e => e.id !== entry.id), item].slice(-32);
  next.updatedAt = now;
  return validateAgentTaskMemory(next, project, now);
}
export function agentMemoryContext(memory, project, now = Date.now()) {
  validateAgentTaskMemory(memory, project, now);
  const revision = agentProjectRevision(project), ids = new Set(project.cues.map(c => c.id));
  return {identity: memory.identity, entries: memory.entries.slice(-12).map(e => ({
    ...e, current: e.revision === revision && e.cueIds.every(id => ids.has(id)),
    usableAsFact: e.status === 'APPLIED' && e.revision === revision && e.cueIds.every(id => ids.has(id))}))};
}
export function explicitAgentMemoryInstruction(prompt) {
  const match = /^(?:recuerda(?:\s+que)?|remember(?:\s+that)?)\s+(.{3,300})$/i.exec(prompt.trim());
  if (!match) return null;
  if (unsafe(match[1])) throw new TypeError('UNSAFE_TASK_MEMORY');
  return match[1];
}
export function forgetAllAgentDecisions(prompt) {
  return /^(?:forget all remembered decisions|olvida todas las decisiones recordadas)[.!]?$/i.test(prompt.trim());
}
export function revokeAgentDecisions(memory, project, now = Date.now()) {
  validateAgentTaskMemory(memory, project, now);
  const next = structuredClone(memory);
  next.updatedAt = now;
  next.entries = next.entries.map(e => e.kind === 'DECISION' ? {...e, status: 'REVOKED'} : e);
  return validateAgentTaskMemory(next, project, now);
}
