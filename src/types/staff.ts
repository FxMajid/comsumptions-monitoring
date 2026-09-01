export const STAFF_ROLES = [
  "ADMIN",
  "CONSUMPTION_MANAGER",
  "WAREHOUSE_OPERATOR",
  "AREA_PIC",
  "PICKUP_OPERATOR",
  "MANAGEMENT",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffProfile = {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
};

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: "Admin",
  CONSUMPTION_MANAGER: "Manajer Konsumsi",
  WAREHOUSE_OPERATOR: "Operator Gudang",
  AREA_PIC: "PIC Area",
  PICKUP_OPERATOR: "Operator Pengambilan",
  MANAGEMENT: "Manajemen",
};
