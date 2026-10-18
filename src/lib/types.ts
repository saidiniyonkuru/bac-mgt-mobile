export type Level = 'Beginner' | 'Intermediate' | 'Advanced';
export type LearnerStatus = 'active' | 'abandoned' | 'graduated';

export interface Learner {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  gender?: string;
  residence?: string;
  level: Level;
  enrollment_date: string;
  active: boolean;
  status?: LearnerStatus;
  abandoned_at?: string | null;
  abandoned_reason?: string | null;
  notes?: string | null;
  /** Overrides the default monthly fee. 0 = free / scholarship. */
  monthly_fee?: number | null;
  created_at: string;
  updated_at: string;
}

export const ABSENCE_REASONS = ['Sick', 'School', 'Job', 'Travel', 'Family', 'Other'] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

export interface Attendance {
  id: string;
  learner_id: string;
  date: string;
  present: boolean;
  /** Set on an absence to excuse it (never counts toward warnings). */
  absence_reason?: AbsenceReason | null;
  notes?: string | null;
  created_at: string;
}

export type PaymentStatus = 'Paid' | 'Partial' | 'Unpaid';

/** One learner's bill for one month. Totals are kept in sync by the database. */
export interface Payment {
  id: string;
  learner_id: string;
  /** Legacy column — mirrors amount_paid. */
  amount: number;
  amount_due: number;
  amount_paid: number;
  month: string;
  year: number;
  status: PaymentStatus;
  payment_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A receipt: money actually received toward a bill. */
export interface PaymentTransaction {
  id: string;
  payment_id: string;
  learner_id: string;
  amount: number;
  paid_on: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description?: string | null;
  amount: number;
  payment_method?: string | null;
  vendor?: string | null;
  is_recurring?: boolean;
  recorded_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  club_name: string;
  default_monthly_fee: number;
  absence_warning_weeks: number;
}
