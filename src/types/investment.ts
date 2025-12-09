/**
 * Investment Types
 * Based on the investments and commitments table schemas
 */

export interface Investment {
  id: number;
  name: string;
  investment_group: string | null;
  investment_type: InvestmentType | null;
  initial_commitment: number | null;
  committed_currency: string | null;
  commitment_date: string | null; // ISO 8601
  status: InvestmentStatus;
  created_at: string;
  updated_at: string;
}

export type InvestmentType =
  | 'PE' // Private Equity
  | 'VC' // Venture Capital
  | 'Real Estate'
  | 'Public Equity'
  | 'Hedge Fund'
  | 'Credit'
  | 'Infrastructure'
  | 'Other';

export type InvestmentStatus =
  | 'active'
  | 'fully_called'
  | 'exited'
  | 'written_off';

export interface Commitment {
  id: number;
  investment_id: number;
  commitment_amount: number;
  currency: string;
  commitment_date: string; // ISO 8601
  called_to_date: number; // Calculated from transactions
  remaining: number | null; // commitment_amount - called_to_date
  phase: CommitmentPhase | null;
  manual_phase: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CommitmentPhase =
  | 'building_up' // Still actively calling capital
  | 'stable' // Occasional calls, mostly dormant
  | 'drawing_down'; // Distributions exceeding calls

export interface CreateInvestmentInput {
  name: string;
  investment_group?: string;
  investment_type?: InvestmentType;
  initial_commitment?: number;
  committed_currency?: string;
  commitment_date?: string;
  status?: InvestmentStatus;
}

export interface UpdateInvestmentInput {
  id: number;
  name?: string;
  investment_group?: string;
  investment_type?: InvestmentType;
  initial_commitment?: number;
  committed_currency?: string;
  commitment_date?: string;
  status?: InvestmentStatus;
}

export interface CreateCommitmentInput {
  investment_id: number;
  commitment_amount: number;
  currency: string;
  commitment_date: string;
  notes?: string;
}

export interface UpdateCommitmentInput {
  id: number;
  commitment_amount?: number;
  currency?: string;
  commitment_date?: string;
  phase?: CommitmentPhase;
  manual_phase?: boolean;
  notes?: string;
}

export interface InvestmentWithCommitments extends Investment {
  commitments: Commitment[];
}
