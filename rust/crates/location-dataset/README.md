# ente-location-dataset

Host-side generator for the city asset consumed by `ente-location`.

```sh
cargo run --release -p ente-location-dataset -- \
  build --output /tmp/ente-location
```

The command downloads and caches its sources, writes `cities.bin`, and prints
its size and SHA-256 hash.

## Source

City data is derived from [GeoNames](https://www.geonames.org/) `cities5000`
and `countryInfo`, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Ente filters and
converts the data, which is provided without warranty.
