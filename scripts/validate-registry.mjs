#!/usr/bin/env node
/**
 * Validates `registry.json` against the ResearchOS Plugin Market schema (SPEC-14).
 *
 * Usage:
 *   node scripts/validate-registry.mjs
 *   node scripts/validate-registry.mjs --verify-downloads
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ALLOWED_PERMISSIONS = new Set([
  'projects.read',
  'projects.write',
  'notes.read',
  'notes.write',
  'literature.read',
  'literature.write',
  'ideas.read',
  'ideas.write',
  'experiments.read',
  'experiments.write',
  'kanban.read',
  'kanban.write',
  'weekly.read',
  'weekly.write',
  'search.read',
  'files.read',
  'network',
  'clipboard',
  'notifications'
])

const PLUGIN_ID_RE = /^[a-z0-9]+([._-][a-z0-9]+)*$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
const SHA256_RE = /^[a-f0-9]{64}$/
const MAX_ZIP_BYTES = 20 * 1024 * 1024

function fail(message) {
  console.error(`[validate-registry] ERROR: ${message}`)
  process.exitCode = 1
}

function assertString(obj, field, ctx, { maxLen = 500, pattern } = {}) {
  const value = obj[field]
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${ctx}: "${field}" must be a non-empty string`)
    return null
  }
  if (value.length > maxLen) {
    fail(`${ctx}: "${field}" exceeds ${maxLen} characters`)
    return null
  }
  if (pattern && !pattern.test(value)) {
    fail(`${ctx}: "${field}" has invalid format (${value})`)
    return null
  }
  return value
}

function assertHttpsUrl(value, field, ctx) {
  let url
  try {
    url = new URL(value)
  } catch {
    fail(`${ctx}: "${field}" is not a valid URL`)
    return false
  }
  if (url.protocol !== 'https:') {
    fail(`${ctx}: "${field}" must use https://`)
    return false
  }
  return true
}

async function verifyDownload(entry, ctx) {
  const response = await fetch(entry.downloadUrl, { redirect: 'follow' })
  if (!response.ok) {
    fail(`${ctx}: failed to download ${entry.downloadUrl} (HTTP ${response.status})`)
    return
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_ZIP_BYTES) {
    fail(`${ctx}: downloaded zip size ${buffer.byteLength} is out of bounds (1..${MAX_ZIP_BYTES})`)
    return
  }
  const digest = createHash('sha256').update(buffer).digest('hex')
  if (digest !== entry.sha256) {
    fail(`${ctx}: sha256 mismatch (expected ${entry.sha256}, got ${digest})`)
  }
}

async function main() {
  const verifyDownloads = process.argv.includes('--verify-downloads')
  const registryPath = resolve(process.cwd(), 'registry.json')

  let data
  try {
    data = JSON.parse(readFileSync(registryPath, 'utf8'))
  } catch (error) {
    fail(`failed to parse registry.json: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail('registry.json root must be a JSON object')
    return
  }
  if (data.schemaVersion !== 1) {
    fail(`"schemaVersion" must be 1, got ${String(data.schemaVersion)}`)
  }
  if (typeof data.updatedAt !== 'string' || Number.isNaN(Date.parse(data.updatedAt))) {
    fail('"updatedAt" must be a valid ISO-8601 timestamp')
  }
  if (!Array.isArray(data.plugins)) {
    fail('"plugins" must be an array')
    return
  }

  const seenIds = new Set()
  for (let i = 0; i < data.plugins.length; i++) {
    const entry = data.plugins[i]
    const ctx = `plugins[${i}]`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail(`${ctx}: must be an object`)
      continue
    }

    const id = assertString(entry, 'id', ctx, { maxLen: 128, pattern: PLUGIN_ID_RE })
    if (id) {
      if (seenIds.has(id)) fail(`${ctx}: duplicate plugin id "${id}"`)
      seenIds.add(id)
    }

    assertString(entry, 'name', ctx, { maxLen: 120 })
    assertString(entry, 'author', ctx, { maxLen: 120 })
    assertString(entry, 'description', ctx, { maxLen: 2000 })
    assertString(entry, 'repo', ctx, { maxLen: 200, pattern: REPO_RE })
    assertString(entry, 'latestVersion', ctx, { maxLen: 64, pattern: SEMVER_RE })

    if (typeof entry.minApiVersion !== 'number' || !Number.isInteger(entry.minApiVersion) || entry.minApiVersion < 1) {
      fail(`${ctx}: "minApiVersion" must be an integer >= 1`)
    }

    const downloadUrl = assertString(entry, 'downloadUrl', ctx, { maxLen: 1024 })
    if (downloadUrl && assertHttpsUrl(downloadUrl, 'downloadUrl', ctx)) {
      if (!downloadUrl.toLowerCase().endsWith('.zip')) {
        fail(`${ctx}: "downloadUrl" must point to a .zip asset`)
      }
    }

    assertString(entry, 'sha256', ctx, { maxLen: 64, pattern: SHA256_RE })

    if (!Array.isArray(entry.permissions)) {
      fail(`${ctx}: "permissions" must be an array`)
    } else {
      for (const perm of entry.permissions) {
        if (typeof perm !== 'string' || !ALLOWED_PERMISSIONS.has(perm)) {
          fail(`${ctx}: unknown permission "${String(perm)}"`)
        }
      }
      if (entry.permissions.includes('network')) {
        if (!Array.isArray(entry.networkDomains) || entry.networkDomains.length === 0) {
          fail(`${ctx}: "networkDomains" must be a non-empty array when "network" permission is declared`)
        }
      }
    }

    if (entry.networkDomains !== undefined) {
      if (!Array.isArray(entry.networkDomains) || entry.networkDomains.some((d) => typeof d !== 'string' || d.trim() === '')) {
        fail(`${ctx}: "networkDomains" must be an array of non-empty hostnames`)
      }
    }

    if (!Array.isArray(entry.tags) || entry.tags.some((t) => typeof t !== 'string' || t.trim() === '')) {
      fail(`${ctx}: "tags" must be an array of non-empty strings`)
    }

    if (entry.readmeUrl !== undefined) {
      const readmeUrl = assertString(entry, 'readmeUrl', ctx, { maxLen: 1024 })
      if (readmeUrl) assertHttpsUrl(readmeUrl, 'readmeUrl', ctx)
    }

    if (typeof entry.verified !== 'boolean') {
      fail(`${ctx}: "verified" must be a boolean`)
    }

    if (typeof entry.updatedAt !== 'string' || Number.isNaN(Date.parse(entry.updatedAt))) {
      fail(`${ctx}: "updatedAt" must be a valid ISO-8601 timestamp`)
    }

    if (verifyDownloads && process.exitCode !== 1 && downloadUrl) {
      await verifyDownload(entry, ctx)
    }
  }

  if (process.exitCode !== 1) {
    console.log(`[validate-registry] OK: ${data.plugins.length} plugin(s) validated.`)
  }
}

main()
