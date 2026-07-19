export type CurrentAppDataCodecErrorCode =
  | 'invalid_data'
  | 'not_json_safe'
  | 'invalid_json'
  | 'invalid_utf8'
  | 'source_too_large'
  | 'unsupported_schema_version'
  | 'newer_schema_version'
  | 'hash_failed'

const PUBLIC_MESSAGES: Readonly<Record<CurrentAppDataCodecErrorCode, string>> =
  {
    invalid_data: 'The current application data is invalid.',
    not_json_safe: 'The application data cannot be represented safely as JSON.',
    invalid_json: 'The application data file is not valid JSON.',
    invalid_utf8: 'The application data file is not valid UTF-8.',
    source_too_large: 'The application data file exceeds the allowed size.',
    unsupported_schema_version:
      'The application data schema version is unsupported.',
    newer_schema_version:
      'The application data was created by a newer schema version.',
    hash_failed: 'The application data checksum could not be calculated.',
  }

export class CurrentAppDataCodecError extends Error {
  readonly code: CurrentAppDataCodecErrorCode
  readonly schemaVersion?: number

  constructor(
    code: CurrentAppDataCodecErrorCode,
    options: Readonly<{ schemaVersion?: number }> = {},
  ) {
    super(PUBLIC_MESSAGES[code])
    this.name = 'CurrentAppDataCodecError'
    this.code = code
    if (options.schemaVersion !== undefined) {
      this.schemaVersion = options.schemaVersion
    }
  }
}
