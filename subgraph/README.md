# Angstrom ToB LP-Payment Subgraph

This subgraph indexes Angstrom bundles directly from `execute(bytes)` call data.

The no-code Goldsky deploy form is not enough for this project. It looks for events, but Angstrom exposes bundle contents in the `execute(bytes)` input, so this subgraph uses a `callHandler`.

## Files

- `subgraph.yaml`: Goldsky/The Graph manifest
- `schema.graphql`: minimal raw entities
- `abis/Angstrom.json`: minimal ABI with `execute(bytes)`
- `src/decoder.ts`: in-repo bundle decoder
- `src/mapping.ts`: entity writes and ToB-only attribution

## Local commands

```bash
cd subgraph
npm install
npm run codegen
npm run build
```

## Deploy

```bash
goldsky subgraph deploy angstrom-tob-mainnet/0.1.0 --path subgraph
```

## Attribution rule

`tobOnlyLpPaymentAsset0` is only set when:

- exactly one ToB order exists for the pair index
- exactly one pool update exists for the pair index
- the directions match
- no user order shares that pair index

Otherwise the row gets a null payment and an `attributionStatus` explaining why.
