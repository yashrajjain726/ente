#[flutter_rust_bridge::frb(sync)]
pub fn seal_cast_payload(
    public_key: String,
    collection_id: i64,
    cast_token: String,
    collection_key: String,
) -> Result<String, String> {
    ente_cast::seal_payload(
        &public_key,
        &ente_cast::CastPayload {
            collection_id,
            cast_token,
            collection_key,
        },
    )
    .map_err(|error| error.to_string())
}
