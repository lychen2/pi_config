export const TOOL_RAILS_PROTOTYPE_PATCH_REGISTRY = Symbol.for("pi.toolRails.prototype-patch-registry");

type PrototypeMethodName = "render" | "invalidate" | "updateContent";
type PrototypeMethod = (this: unknown, ...args: unknown[]) => unknown;
export type PatchInvocation = {
  predecessor: PrototypeMethod;
  receiver: unknown;
  args: unknown[];
};
export type PatchBehavior = (invocation: PatchInvocation) => unknown;
type Registration = { token: symbol; behavior?: PatchBehavior };
type PatchRecord = {
  method: PrototypeMethodName;
  predecessor: PrototypeMethod;
  wrapper: PrototypeMethod;
  registration?: Registration;
};
type PatchRegistry = Map<string, PatchRecord>;
type PatchTarget = Record<PropertyKey, unknown>;

function registryFor(target: PatchTarget): PatchRegistry {
  const existing = target[TOOL_RAILS_PROTOTYPE_PATCH_REGISTRY];
  if (existing instanceof Map) return existing as PatchRegistry;
  const registry: PatchRegistry = new Map();
  Object.defineProperty(target, TOOL_RAILS_PROTOTYPE_PATCH_REGISTRY, {
    value: registry,
    configurable: true,
  });
  return registry;
}

function createCleanup(
  target: PatchTarget,
  method: PrototypeMethodName,
  adapter: string,
  registry: PatchRegistry,
  record: PatchRecord,
  token: symbol,
): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    if (record.registration?.token !== token) return;
    record.registration.behavior = undefined;
    record.registration = undefined;

    const current = registry.get(adapter);
    if (current !== record) return;
    if (target[method] === record.wrapper) target[method] = record.predecessor;
    registry.delete(adapter);
    if (registry.size === 0) delete target[TOOL_RAILS_PROTOTYPE_PATCH_REGISTRY];
  };
}

/**
 * Registry-backed prototype middleware copied from zentui's patch adapter.
 * Multiple hot-reload registrations replace behavior without stacking wrappers.
 */
export function installPrototypePatch(
  targetValue: object,
  method: PrototypeMethodName,
  adapter: string,
  behavior: PatchBehavior,
): () => void {
  const target = targetValue as PatchTarget;
  const registry = registryFor(target);
  let record = registry.get(adapter);

  if (!(record && record.method === method && target[method] === record.wrapper)) {
    const predecessor = target[method];
    if (typeof predecessor !== "function") {
      throw new TypeError(`Cannot patch ${method}: predecessor is not a function`);
    }
    const nextRecord: PatchRecord = {
      method,
      predecessor: predecessor as PrototypeMethod,
      wrapper: () => undefined,
    };
    const wrapper: PrototypeMethod = function toolRailsPrototypeWrapper(
      this: unknown,
      ...args: unknown[]
    ): unknown {
      const activeBehavior = nextRecord.registration?.behavior;
      return activeBehavior
        ? activeBehavior({ predecessor: nextRecord.predecessor, receiver: this, args })
        : Reflect.apply(nextRecord.predecessor, this, args);
    };
    nextRecord.wrapper = wrapper;
    record = nextRecord;
    registry.set(adapter, record);
    target[method] = wrapper;
  }

  const token = Symbol(adapter);
  record.registration = { token, behavior };
  return createCleanup(target, method, adapter, registry, record, token);
}
