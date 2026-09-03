export const readAndFree = <T extends { free: () => void }, U>(
    value: T,
    read: (value: T) => U,
) => {
    try {
        return read(value);
    } finally {
        value.free();
    }
};
