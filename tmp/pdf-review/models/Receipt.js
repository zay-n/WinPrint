"use strict";
/**
 * Receipt.ts — Winsoft Print Station data models
 *
 * Architecture (see ARCHITECTURE.md §3, §7):
 *
 *   Raw CSV row → RawWinsoftRow (every column preserved)
 *                 ↓
 *                 WinsoftMapper
 *                 ↓
 *               Receipt (normalized) + sourceRows (raw)
 *
 * No source column from the Winsoft CSV may be discarded.
 */
Object.defineProperty(exports, "__esModule", { value: true });
