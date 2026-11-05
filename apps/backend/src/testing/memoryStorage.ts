import type { ObjectStorage, StoredObject } from '../infra/objectStorage.ts'

export function memoryStorage(): ObjectStorage & {
  objects: Map<string, StoredObject>
} {
  const objects = new Map<string, StoredObject>()
  return {
    objects,
    put(key, body, contentType) {
      objects.set(key, { body, contentType })
      return Promise.resolve()
    },
    get: key => Promise.resolve(objects.get(key) ?? null),
    remove(key) {
      objects.delete(key)
      return Promise.resolve()
    }
  }
}
