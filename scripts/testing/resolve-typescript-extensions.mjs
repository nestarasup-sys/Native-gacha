import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** Node test-only resolver for this repository's extensionless relative TS imports. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z\d]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context)
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    }
  }

  const resolved = await nextResolve(specifier, context)
  if (resolved.url.endsWith('.json')) return { ...resolved, format: 'module' }
  return resolved
}

/** Vite accepts JSON imports without Node's import attribute; emulate that in tests only. */
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    return {
      format: 'module',
      source: `export default ${JSON.stringify(JSON.parse(source))}`,
      shortCircuit: true
    }
  }

  return nextLoad(url, context)
}
