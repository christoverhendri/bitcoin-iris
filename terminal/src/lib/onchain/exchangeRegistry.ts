/**
 * Curated registry of known Bitcoin exchange addresses.
 *
 * This is the foundation of the flow intelligence: every reserve figure, every
 * hot/cold split and every classified transfer is derived from these addresses.
 * A wrong label here produces a wrong signal downstream, so the list is
 * deliberately small and every entry was verified against Blockstream Esplora
 * before being added — candidates that returned an empty balance, a malformed
 * address, or activity inconsistent with their claimed owner were dropped.
 *
 * `balanceAtVerifyBtc` is a snapshot recorded at verification time. It is NOT
 * used at runtime (live balances are fetched); it exists so a future audit can
 * spot an address that has silently gone dark or been re-purposed.
 *
 * Re-verify with `npm run verify:registry`.
 */

export type WalletKind = 'hot' | 'cold' | 'deposit';

export interface ExchangeAddress {
  address: string;
  exchange: string;
  kind: WalletKind;
  label: string;
  /** Balance observed when this entry was verified. Drift is expected. */
  balanceAtVerifyBtc: number;
  verifiedAt: string;
}

const VERIFIED_AT = '2026-09-03';

export const EXCHANGE_ADDRESSES: ExchangeAddress[] = [
  // --- Binance -------------------------------------------------------------
  {
    address: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',
    exchange: 'Binance',
    kind: 'cold',
    label: 'Binance cold 1',
    balanceAtVerifyBtc: 248597.59,
    verifiedAt: VERIFIED_AT,
  },
  {
    address: '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6',
    exchange: 'Binance',
    kind: 'cold',
    label: 'Binance cold 2',
    balanceAtVerifyBtc: 214225.46,
    verifiedAt: VERIFIED_AT,
  },
  {
    address: 'bc1qd4ysezhmypwty5dnw7c8nqy5h5nxg0xqsvaefd0qn5kq32vwnwqqgv4rzr',
    exchange: 'Binance',
    kind: 'cold',
    label: 'Binance cold 3',
    balanceAtVerifyBtc: 91850.12,
    verifiedAt: VERIFIED_AT,
  },
  {
    address: '3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb',
    exchange: 'Binance',
    kind: 'cold',
    label: 'Binance cold 4',
    balanceAtVerifyBtc: 68200.01,
    verifiedAt: VERIFIED_AT,
  },
  {
    address: 'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h',
    exchange: 'Binance',
    kind: 'hot',
    label: 'Binance hot 1',
    balanceAtVerifyBtc: 15443.93,
    verifiedAt: VERIFIED_AT,
  },
  {
    // Near-zero balance but ~1.2M transactions — a live routing address. Kept
    // for flow detection, not for reserve size.
    address: '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s',
    exchange: 'Binance',
    kind: 'hot',
    label: 'Binance hot 2 (router)',
    balanceAtVerifyBtc: 0.09,
    verifiedAt: VERIFIED_AT,
  },

  // --- Robinhood -----------------------------------------------------------
  {
    address: 'bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2',
    exchange: 'Robinhood',
    kind: 'cold',
    label: 'Robinhood cold',
    balanceAtVerifyBtc: 140849.99,
    verifiedAt: VERIFIED_AT,
  },

  // --- Bitfinex ------------------------------------------------------------
  {
    address: 'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97',
    exchange: 'Bitfinex',
    kind: 'cold',
    label: 'Bitfinex cold',
    balanceAtVerifyBtc: 130010.08,
    verifiedAt: VERIFIED_AT,
  },
  {
    address: '3JZq4atUahhuA9rLhXLMhhTo133J9rF97j',
    exchange: 'Bitfinex',
    kind: 'hot',
    label: 'Bitfinex hot',
    balanceAtVerifyBtc: 15495.54,
    verifiedAt: VERIFIED_AT,
  },

  // --- Coinbase ------------------------------------------------------------
  {
    address: 'bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0eh5tx44reyn2k7sfc27a4',
    exchange: 'Coinbase',
    kind: 'cold',
    label: 'Coinbase cold',
    balanceAtVerifyBtc: 96932.41,
    verifiedAt: VERIFIED_AT,
  },
  {
    address: '3FupZp77ySr7jwoLYEJ9mwzJpvoNBXsBnE',
    exchange: 'Coinbase',
    kind: 'deposit',
    label: 'Coinbase deposit',
    balanceAtVerifyBtc: 175.51,
    verifiedAt: VERIFIED_AT,
  },

  // --- OKX -----------------------------------------------------------------
  {
    address: 'bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6',
    exchange: 'OKX',
    kind: 'cold',
    label: 'OKX cold',
    balanceAtVerifyBtc: 69370.18,
    verifiedAt: VERIFIED_AT,
  },

  // --- Bitstamp ------------------------------------------------------------
  {
    address: '1Ay8vMC7R1UbyCCZRVULMV7iQpHSAbguJP',
    exchange: 'Bitstamp',
    kind: 'cold',
    label: 'Bitstamp cold',
    balanceAtVerifyBtc: 73906.01,
    verifiedAt: VERIFIED_AT,
  },

  // --- Bybit ---------------------------------------------------------------
  {
    address: 'bc1q7t9fxfaakmtk8pj7tdxjvwsng6y9x76czuaf5h',
    exchange: 'Bybit',
    kind: 'hot',
    label: 'Bybit hot',
    balanceAtVerifyBtc: 6276.0,
    verifiedAt: VERIFIED_AT,
  },

  // --- Kraken --------------------------------------------------------------
  {
    // Low balance, ~32k transactions — a sweep/routing address. Flow signal only.
    address: 'bc1qxhmdufsvnuaaaer4ynz88fspdsxq2h9e9cetdj',
    exchange: 'Kraken',
    kind: 'hot',
    label: 'Kraken hot (sweep)',
    balanceAtVerifyBtc: 0.14,
    verifiedAt: VERIFIED_AT,
  },
];

/** Fast lookup: address -> registry entry. */
export const ADDRESS_INDEX = new Map(EXCHANGE_ADDRESSES.map((a) => [a.address, a]));

export const TRACKED_ADDRESS_COUNT = EXCHANGE_ADDRESSES.length;

export const TRACKED_EXCHANGES = [...new Set(EXCHANGE_ADDRESSES.map((a) => a.exchange))].sort();

/**
 * The honesty note every panel built on this registry must display.
 *
 * Exchanges hold roughly 2-3M BTC in total across thousands of addresses. This
 * registry sees a curated fraction of that. Never render these figures as
 * "total BTC on exchanges".
 */
export const TRACKED_SUBSET_NOTE = `TRACKED SUBSET · ${TRACKED_ADDRESS_COUNT} ADDRESSES · ${TRACKED_EXCHANGES.length} EXCHANGES`;

/** Is this address one we track? Used by the transfer classifier. */
export const lookupAddress = (address: string): ExchangeAddress | undefined =>
  ADDRESS_INDEX.get(address);
