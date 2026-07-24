export interface CaseListRow {
  id: string;
  caseDate: string;
  flightNumber: string;
  flightDate: string | null;
  status: string;
  actions: {
    delete: boolean;
  };
}

export interface DeleteCaseResponse {
  id: string;
  message: string;
}