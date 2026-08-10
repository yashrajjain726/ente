// TypeScript does not allow the standard Array.includes to act as a type guard
// that narrows an arbitrary T to one of the known U[]. See:
// https://github.com/microsoft/TypeScript/issues/48247
// https://github.com/microsoft/TypeScript/issues/26255#issuecomment-502899689
export function includes<T, U extends T>(us: readonly U[], t: T): t is U {
    // @ts-expect-error Array.includes cannot narrow an arbitrary T to U.
    return us.includes(t);
}
