import { register } from 'node:module'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const testingDirectory = resolve('scripts/testing')
register('./resolve-typescript-extensions.mjs', pathToFileURL(`${testingDirectory}${sep}`))
