/**
 * Read one namespace's live section. `undefined` when the settings service is
 * absent or the namespace is not an active entry (owning plugin not
 * installed / not composed).
 */
export function readSection(ctx, ns) {
    const settings = ctx.get('settings');
    if (settings === undefined)
        return undefined;
    if (typeof settings.describe === 'function') {
        const found = settings.describe().find((descriptor) => descriptor.ns === ns);
        if (found === undefined)
            return undefined;
        return { value: found.value, revision: found.revision };
    }
    if (typeof settings.get === 'function') {
        const value = settings.get(ns);
        return value === undefined ? undefined : { value: value, revision: 0 };
    }
    return undefined;
}
/** Pick one namespace out of a `describe()` pass (undefined when absent). */
export function readSectionOf(descriptors, ns) {
    const found = descriptors?.find((descriptor) => descriptor.ns === ns);
    if (found === undefined)
        return undefined;
    return { value: found.value, revision: found.revision };
}
