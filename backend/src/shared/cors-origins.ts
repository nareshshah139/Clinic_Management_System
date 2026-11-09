/** Browser origins allowed to call the API; password-reset links may only point at these. */
export const ALLOWED_ORIGINS: RegExp[] = [
  /^http:\/\/localhost:(3000|3001|3002)$/,
  /^https:\/\/.*\.railway\.app$/,
  /^https:\/\/.*\.up\.railway\.app$/,
];
