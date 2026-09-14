// Chunked SQL file writer for D1 imports. D1 caps statements at 100 KB, so rows are grouped
// into multi-row INSERTs well under that, and files are split to keep imports manageable.
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { Value } from '../../src/db/rows.ts'

export const lit = (v: Value): string =>
  v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`

const MAX_STMT = 60_000
const MAX_FILE = 90 * 1024 * 1024

export class SqlWriter {
  files: string[] = []
  rows = 0
  private fd = -1
  private size = 0
  private dir: string
  private prefix: string
  private head: string
  private pending: string[] = []
  private pendingLen = 0

  constructor(dir: string, prefix: string, table: string, cols: readonly string[]) {
    mkdirSync(dir, { recursive: true })
    this.dir = dir
    this.prefix = prefix
    this.head = `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n`
  }

  add(row: Value[]) {
    const tuple = `(${row.map(lit).join(', ')})`
    if (this.pendingLen + tuple.length > MAX_STMT) this.flush()
    this.pending.push(tuple)
    this.pendingLen += tuple.length + 2
    this.rows++
  }

  private flush() {
    if (!this.pending.length) return
    const stmt = this.head + this.pending.join(',\n') + ';\n'
    if (this.fd === -1 || this.size + stmt.length > MAX_FILE) {
      if (this.fd !== -1) closeSync(this.fd)
      const file = join(this.dir, `${this.prefix}-${String(this.files.length + 1).padStart(3, '0')}.sql`)
      this.files.push(file)
      this.fd = openSync(file, 'w')
      this.size = 0
    }
    writeSync(this.fd, stmt)
    this.size += stmt.length
    this.pending = []
    this.pendingLen = 0
  }

  close() {
    this.flush()
    if (this.fd !== -1) closeSync(this.fd)
    this.fd = -1
  }
}
