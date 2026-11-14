export const PHARMACY_SALES_ROLES = ['OWNER', 'ADMIN', 'DOCTOR', 'PHARMACIST'];

export const canSellPharmacy = (role?: string | null) => PHARMACY_SALES_ROLES.includes(role ?? '');
