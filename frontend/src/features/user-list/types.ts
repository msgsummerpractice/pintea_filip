export interface UserListRow {
  id: number;
  name: string;
  email: string;
  role: "Passenger" | "Colleague" | "System Admin";
  assignedCaseCount: number;
  actions: {
    edit: boolean;
    delete: boolean;
  };
}