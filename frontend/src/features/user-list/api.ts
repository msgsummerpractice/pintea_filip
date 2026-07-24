import { requestJson } from "../../lib/http";
import type { UserListRow } from "./types";

interface UserListResponse {
  results: Array<{
    id: number;
    name: string;
    email: string;
    role: UserListRow["role"];
    assigned_case_count: number;
    actions: {
      edit: boolean;
      delete: boolean;
    };
  }>;
}

function mapUserListRow(row: UserListResponse["results"][number]): UserListRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    assignedCaseCount: row.assigned_case_count,
    actions: {
      edit: row.actions.edit,
      delete: row.actions.delete,
    },
  };
}

export async function fetchUserList(): Promise<UserListRow[]> {
  const response = await requestJson<UserListResponse>("/users/", {
    credentials: "include",
  });
  return response.results.map(mapUserListRow);
}