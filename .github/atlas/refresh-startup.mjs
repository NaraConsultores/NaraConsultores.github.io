import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const functions = 'https://qopqfmxfnhkrtzakdwbc.supabase.co/functions/v1/'
const root = resolve(process.argv[2] || 'demo-app-importaciones-cp')
const processor = resolve(root, 'atlas-checkpoint')
const sha256 = value => createHash('sha256').update(value).digest('hex')

async function request(url, options = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(55_000) })
}

async function authorization() {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL)
  url.searchParams.set('audience', 'atlas-demo-shared-checkpoint')
  const response = await request(url, { headers: { Authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } })
  if (!response.ok) throw Error(`GitHub OIDC HTTP ${response.status}`)
  const { value } = await response.json()
  if (typeof value !== 'string' || !value) throw Error('GitHub OIDC returned no token')
  return { Authorization: 'Bearer ' + value }
}

async function main() {
  const { contract, entry } = JSON.parse(await readFile(resolve(processor, 'manifest.json'), 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(contract) || entry !== 'processor.mjs') throw Error('Invalid checkpoint processor manifest')
  const endpoint = `${functions}atlas-startup-refresh?contract=${contract}`
  const view = await request(endpoint, { headers: await authorization() })
  if (!view.ok) throw Error(`Checkpoint status HTTP ${view.status}`)
  const snapshot = await view.json()
  if (!snapshot.actions) {
    console.log(`ATLAS: arranque al día en revisión ${snapshot.checkpoint}.`)
    return
  }

  const remote = await request(`${functions}atlas-demo-web/state?checkpoint=${contract}`, {
    headers: { 'X-ATLAS-Workspace': 'shared', Origin: 'https://demo.naraconsultores.com' },
  })
  if (!remote.ok) throw Error(`ATLAS state HTTP ${remote.status}`)
  const state = await remote.json()
  if (state.checkpoint?.revision !== snapshot.checkpoint || state.checkpoint.contract !== contract ||
      sha256(state.checkpoint.payload) !== snapshot.checkpoint_hash || state.revision < snapshot.target ||
      state.checkpoint.revision + state.actions.length !== state.revision ||
      snapshot.target - snapshot.checkpoint !== snapshot.actions) {
    console.log('ATLAS: cambió el estado de inicio durante la lectura. Se revisará en la siguiente ejecución.')
    return
  }

  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ACTIONS_ID_TOKEN_')))
  execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: processor, env, stdio: 'ignore' })
  const { buildStartupCheckpoint, checkpointAssetBase, checkpointProcessorContract } = await import(pathToFileURL(resolve(processor, entry)).href)
  if (checkpointProcessorContract !== contract) throw Error('Checkpoint processor does not match its manifest')
  const readAsset = async url => {
    if (!url.startsWith(checkpointAssetBase)) throw Error('Resource is outside the ATLAS public package')
    const path = resolve(root, url.slice(checkpointAssetBase.length))
    if (!path.startsWith(root + sep)) throw Error('Resource is outside the ATLAS public package')
    return new Response(await readFile(path))
  }
  const next = await buildStartupCheckpoint({ ...state, revision: snapshot.target,
    actions: state.actions.slice(0, snapshot.actions) }, readAsset)
  if (next.revision !== snapshot.target || next.contract !== contract || !next.payload.startsWith('H4sI'))
    throw Error('Checkpoint result does not match the processed revision')
  const accepted = await request(endpoint, {
    method: 'POST', headers: { ...await authorization(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...snapshot, payload: next.payload }),
  })
  if (accepted.status === 409) {
    console.log('ATLAS: el estado de inicio ya cambió. Se conserva la versión vigente.')
    return
  }
  if (!accepted.ok) throw Error(`Checkpoint installation HTTP ${accepted.status}`)
  const { revision } = await accepted.json()
  if (revision !== next.revision) throw Error('Stored checkpoint revision differs from the result')
  console.log(`ATLAS: estado de arranque actualizado de ${snapshot.checkpoint} a ${revision} (${snapshot.actions} guardados).`)
}

main().catch(error => {
  console.error(`ATLAS: ${error.message}`)
  process.exitCode = 1
})
