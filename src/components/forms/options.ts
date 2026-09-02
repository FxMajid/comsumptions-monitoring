/**
 * Select choices are built on the server and handed over as plain data. Nothing
 * in a form component imports a query module, so no server-only dependency can
 * leak into the client bundle.
 */
export type Option = { value: string; label: string; disabled?: boolean };
