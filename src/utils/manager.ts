export abstract class SimpleCache<Key, Value> {

  private cache = new Map<Key, Value>()

  protected abstract create (key: Key): Value

  public get (key: Key): Value {
    const cachedValue = this.cache.get(key)
    if (cachedValue == null) {
      const value = this.create(key)
      this.cache.set(key, value)
      return value
    }
    return cachedValue
  }


}
