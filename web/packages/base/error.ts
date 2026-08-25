export const namedError = (
    name: string,
    message: string,
    options?: ErrorOptions,
) => {
    const error = new Error(message, options);
    error.name = name;
    return error;
};

export const isNamedError = (error: unknown, name: string) =>
    error instanceof Error && error.name == name;
