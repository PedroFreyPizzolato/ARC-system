function isNonEmptyObj(o) { return o && typeof o === 'object' && Object.keys(o).length > 0; }

function resolveClassData(remote, cached, embedded) {
  if (isNonEmptyObj(remote)) return remote;
  if (isNonEmptyObj(cached)) return cached;
  return embedded;
}

module.exports = { resolveClassData };
