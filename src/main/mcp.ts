#!/usr/bin/env node
import { AgentApi } from './agentApi'
import { dataDir } from './config'
import { serveMcp } from './mcpServer'

serveMcp(new AgentApi(dataDir()), process.stdin, process.stdout).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exitCode = 1
})
