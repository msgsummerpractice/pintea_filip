import { requestJson } from "../../lib/http";
import type { CaseListRow, DeleteCaseResponse } from "./types";

interface CaseListResponse {
  results: Array<{
    id: string;
    case_date: string;
    flight_number: string;
    flight_date: string | null;
    status: string;
    actions: {
      delete: boolean;
    };
  }>;
}

function mapCaseListRow(row: CaseListResponse["results"][number]): CaseListRow {
  return {
    id: row.id,
    caseDate: row.case_date,
    flightNumber: row.flight_number,
    flightDate: row.flight_date,
    status: row.status,
    actions: {
      delete: row.actions.delete,
    },
  };
}

export async function fetchCaseList(): Promise<CaseListRow[]> {
  const response = await requestJson<CaseListResponse>("/cases/", {
    credentials: "include",
  });
  return response.results.map(mapCaseListRow);
}

export async function deleteCase(caseId: string): Promise<DeleteCaseResponse> {
  return requestJson<DeleteCaseResponse>(`/cases/${encodeURIComponent(caseId)}/`, {
    method: "DELETE",
    credentials: "include",
  });
}