/**
 * @nebenkosten/schema — Ziel-Datenmodell, Legacy-v3-Schema und
 * Migrationsvertrag (Masterplan 4.2, 5, 9; PR 03).
 *
 * - `primitives`: technische Grundregeln (IDs, ISO-Daten, Centbeträge,
 *   Mengen, Prozentwerte).
 * - `entities`: Zod-Schemas + Typen aller Entitäten (Masterplan 5.1).
 * - `versions/current`: aktuelles Dateiformat (Schema-Version 4).
 * - `versions/v3`: Legacy-Format der Alt-App (Schema-Version 3),
 *   tolerant und verlustfrei (unbekannte Felder bleiben erhalten).
 * - `migrations`: Vertrag `migrateV3ToCurrent` + Migrationsbericht
 *   (Implementierung: PR 04).
 */
export * from './primitives'
export * from './entities'
export * from './versions/current'
export * from './versions/v3'
export * from './migrations'
