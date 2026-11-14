export interface EnteredPrice {
  amount: number;
  currency: string;
}

export interface BuildBudgets {
  budgetUsd?: number;
  budgetEntered?: EnteredPrice;
  budgetHours?: number;
}
