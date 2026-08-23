export type ShortlistedAssistant = {
  id: number;
  name: string | null;
  mobile: string;
  email: string | null;
  city: string | null;
  area: string | null;
  pincode: number | null;
  gender: string | null;
  age: number | null;
  status: string;
  profilePictureUrl: string | null;
  shortlistedAt: string;
};

export type Employer = {
  id: number;
  email: string | null;
  name: string;
  mobile: string;
  created_at: string;
  updated_at: string;
  reviewCount: number;
  shortlistCount: number;
  contactCount: number;
  chatCount: number;
};

export type EmployerRow = {
  id: number;
  email: string | null;
  name: string;
  mobile: string;
  created_at: Date;
  updated_at: Date;
  review_count: bigint | number;
  shortlist_count: bigint | number;
  contact_count: bigint | number;
  chat_count: bigint | number;
};

export function mapEmployerRow(row: EmployerRow): Employer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    mobile: row.mobile,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    reviewCount: Number(row.review_count),
    shortlistCount: Number(row.shortlist_count),
    contactCount: Number(row.contact_count),
    chatCount: Number(row.chat_count),
  };
}
