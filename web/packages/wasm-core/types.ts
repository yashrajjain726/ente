const sized = (bytes: Uint8Array, length: number, name: string): Uint8Array => {
    if (bytes.length !== length) {
        throw new Error(
            `${name} must be ${length} bytes, but got ${bytes.length}`,
        );
    }
    return bytes;
};

export class Key {
    private constructor(private readonly _bytes: Uint8Array) {}

    static fromBytes(bytes: Uint8Array): Key {
        return new Key(sized(bytes, 32, "Key"));
    }

    get bytes(): Uint8Array {
        return this._bytes;
    }
}

export class Nonce {
    private constructor(private readonly _bytes: Uint8Array) {}

    static fromBytes(bytes: Uint8Array): Nonce {
        return new Nonce(sized(bytes, 24, "Nonce"));
    }

    get bytes(): Uint8Array {
        return this._bytes;
    }
}

export class Salt {
    private constructor(private readonly _bytes: Uint8Array) {}

    static fromBytes(bytes: Uint8Array): Salt {
        return new Salt(sized(bytes, 16, "Salt"));
    }

    get bytes(): Uint8Array {
        return this._bytes;
    }
}

export class Header {
    private constructor(private readonly _bytes: Uint8Array) {}

    static fromBytes(bytes: Uint8Array): Header {
        return new Header(sized(bytes, 24, "Header"));
    }

    get bytes(): Uint8Array {
        return this._bytes;
    }
}

export class PublicKey {
    private constructor(private readonly _bytes: Uint8Array) {}

    static fromBytes(bytes: Uint8Array): PublicKey {
        return new PublicKey(sized(bytes, 32, "PublicKey"));
    }

    get bytes(): Uint8Array {
        return this._bytes;
    }
}

export class SecretKey {
    private constructor(private readonly _bytes: Uint8Array) {}

    static fromBytes(bytes: Uint8Array): SecretKey {
        return new SecretKey(sized(bytes, 32, "SecretKey"));
    }

    get bytes(): Uint8Array {
        return this._bytes;
    }
}
