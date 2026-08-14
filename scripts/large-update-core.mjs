import { createHash } from "node:crypto";

export function contentHash(value) {
  if (value === undefined) return undefined;
  return createHash("sha256").update(value).digest("hex");
}

export function classifyVersion(base, local, target) {
  if (local === target) return { kind: "unchanged" };
  if (base === undefined) {
    if (local === undefined) return { kind: "update" };
    if (target === undefined) return { kind: "local-only" };
    return { kind: "conflict" };
  }
  if (target === base) return { kind: local === base ? "unchanged" : "local-only" };
  if (local === base) return { kind: target === undefined ? "delete" : "update" };
  return { kind: "conflict" };
}

export function classifyContent(base, local, target) {
  return classifyVersion(contentHash(base), contentHash(local), contentHash(target));
}

export function dependencyChanges(basePackage, localPackage, targetPackage) {
  const sections = ["dependencies", "devDependencies", "peerDependencies"];
  const changes = [];
  for (const section of sections) {
    const localEntries = localPackage[section] ?? {};
    const baseEntries = basePackage[section] ?? {};
    const targetEntries = targetPackage[section] ?? {};
    for (const name of new Set([
      ...Object.keys(baseEntries),
      ...Object.keys(localEntries),
      ...Object.keys(targetEntries),
    ]).values()) {
      const classification = classifyVersion(baseEntries[name], localEntries[name], targetEntries[name]);
      if (classification.kind === "unchanged" || classification.kind === "local-only") continue;
      changes.push({
        section,
        name,
        kind: classification.kind,
        base: baseEntries[name],
        local: localEntries[name],
        target: targetEntries[name],
      });
    }
  }
  return changes;
}

export function applyDependencyChanges(localPackage, changes) {
  const next = structuredClone(localPackage);
  for (const change of changes) {
    if (change.kind === "conflict") continue;
    const section = next[change.section] ?? {};
    if (change.kind === "delete") delete section[change.name];
    else section[change.name] = change.target;
    next[change.section] = section;
  }
  return next;
}

export function upstreamMetadata({ packageName, version, tarball, mirroredRoots, result, previousVersion }) {
  return {
    schemaVersion: 1,
    package: packageName,
    version,
    tarball,
    mirroredRoots: [...mirroredRoots],
    updatedAt: new Date().toISOString(),
    result,
    ...(previousVersion ? { previousVersion } : {}),
  };
}
