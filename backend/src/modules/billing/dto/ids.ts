/** Either a UUID (v1-5) or a CUID (cxxxxxxxxxxxxxxxxxxxxxxxx): clinic records use CUID ids. */
export const UUID_OR_CUID_REGEX = /(^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$)|(^c[0-9a-z]{24}$)/i;
