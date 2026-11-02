/** Node test-only resolver for this repository's extensionless relative TS imports. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z\d]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context)
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    }
  }

  return nextResolve(specifier, context)
}
