declare global {
    declare var enteRustLog:
        | ((level: string, target: string, message: string) => void)
        | undefined;
}

export {};
