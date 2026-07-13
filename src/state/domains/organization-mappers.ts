import type { Area, Membership, Organization, Profile } from "../../types";

export function mapOrganization(row: any): Organization {
  return { id: row.id, name: row.name, subtitle: row.subtitle ?? undefined, createdBy: row.created_by ?? null, archivedAt: row.archived_at ?? null };
}

export function mapProfile(row: any): Profile {
  return { id: row.id, fullName: row.full_name ?? null, email: row.email ?? null, phone: row.phone ?? null };
}

export function mapMembership(row: any, profiles: Profile[] = []): Membership {
  return { id: row.id, orgId: row.org_id, userId: row.user_id, role: row.role, profile: profiles.find((profile) => profile.id === row.user_id) ?? null };
}

export function mapArea(row: any, memberships: Membership[]): Area {
  const membership = memberships.find((item) => item.id === row.coordinator_id);
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    coordinator: membership?.profile?.fullName ?? "Sem coordenador",
    coordinatorId: row.coordinator_id ?? null,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
  };
}
