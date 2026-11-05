#!/usr/bin/env node
import { AgentApi } from './agentApi'
import { runCli } from './agentCli'
import { dataDir } from './config'

runCli(process.argv.slice(2), new AgentApi(dataDir()))
  .then((output) => {
    process.stdout.write(`${output}\n`)
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
