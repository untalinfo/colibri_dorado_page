// Spec config refs: one place for every limit so handlers, formatters and tests agree.
export const MSG_LIMIT = 4096; // Telegram text message limit
export const CHUNK_SIZE = 4000; // chunks stay safely under MSG_LIMIT
export const CAPTION_LIMIT = 1024;
export const LIST_CAP = 20;
export const FIELD_TRUNC = 60; // max length of any customer-provided field in output
export const REASON_MAX = 200;
export const DELTA_MAX = 10000;
export const PRICE_MIN = 1000; // COP; used by /precio and change_lot from S4
export const PRICE_MAX = 1000000;
export const SUMMARY_WINDOW = 7; // days
export const LOT_CODE_RE = /^[a-z0-9]{2,8}$/;
