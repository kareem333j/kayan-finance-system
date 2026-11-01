import type { Inputs, Calculation } from '../domain/payroll';
export type DailyKind='absence'|'doubleAbsence'|'delay'|'deduction'|'incentive'|'living'|'transport'|'other'|'advance'|'assignment';
export type DailyRecord={id:string;requestId:string;employeeId:string;date:string;kind:DailyKind;quantity:string;note:string;version:number;voided:boolean;createdAt:string};
export type DailyTotals=Record<DailyKind,string>;
export const dailyLabels:Record<DailyKind,string>={absence:'غياب بالأيام',doubleAbsence:'غياب بخصم يومين',delay:'خصم بالساعات',deduction:'خصم بمبلغ',incentive:'حافز',living:'أيام إعاشة',transport:'مواصلات',other:'استحقاق آخر',advance:'سلفة مخصومة',assignment:'تكليف بمبلغ'};

export const employeeCompanies = ['الشروق','المهندس للمقاولات والتوريدات العامة','الإدارة'] as const;
export type Employee = {
  employerCompany?: '' | typeof employeeCompanies[number];
  deletedAt?:string; id: string; code: string; name: string; job: string; costCenter: string;
  startDate: string; endDate: string; paymentMethod: string; bankNote: string;
  graduation: string; phone: string; nationalId: string; address: string;
  basic: string; active: boolean; notes: string; version: number;
  birthDate?:string; gender?:string; maritalStatus?:string; nationality?:string;
  email?:string; emergencyName?:string; emergencyPhone?:string; department?:string;
  contractType?:string; contractEnd?:string; qualification?:string; insuranceNumber?:string;
  bankName?:string; accountNumber?:string; accountHolder?:string; walletNumber?:string; instapayAddress?:string;
};
export type Entry = {
  id: string; employeeId: string; snapshot: Employee; inputs: Inputs;
  result: Calculation | null; error?: string; checked: boolean; version: number; paid: boolean;
  daily?:DailyTotals; effectiveInputs?:Inputs; accrued?:Calculation|null; accruedError?:string; eligibleDays?:number;
};
export type Period = {
  id: string; month: string; status: 'draft' | 'approved'; createdAt: string;
  approvedAt: string | null; entries: Entry[]; policy: Settings | null;
  asOf?:string; view?:'monthly'|'accrued';
};
export interface CustomField {
  id: string;
  name: string;
  type: 'earning' | 'deduction';
  formula: string;
  mode?:'formula'|'fixed'|'manual'; value?:string;
}

export type FormulaSettings = {
  livingDayRate: number;         // Default 75
  fellowshipRate: number;        // Default 0.01 (1%)
  fellowshipMin: number;         // Default 50
  daysInMonth: number;           // Default 30
  workingHours: number;          // Default 8
  delayByHours: boolean;         // Default true: hours × basic/30, false: days × basic/30
  customFields: CustomField[];   // Fully dynamic fields with formulas
  expressions?:Record<string,string>; constants?:Record<string,string>;
  revision?:number; monthlyAccrual?:'onDate'|'prorated';
};
export type Settings = {
  company: string;
  penaltiesEnabled: boolean;
  roundingAccepted: boolean;
  formulas: FormulaSettings;
};
export type State = {
  employees: Employee[];
  periods: Omit<Period, 'entries'>[];
  settings: Settings;
  audit: { id: number; at: string; action: string; detail: string }[];
  dataPath: string;
};
export type ImportRow = {
  row: number; name: string; code: string; job: string; costCenter: string;
  startDate: string; bankNote: string; graduation: string;
  warnings: string[]; suggested: boolean; duplicate: boolean;
  employee?: Partial<Employee>; matchId?: string; matchVersion?: number;
};
export type ImportPreview = { token: string; filename: string; rows: ImportRow[] };

// Columns user can toggle on/off for the register export
export type RegisterColumn = 'code' | 'name' | 'job' | 'costCenter' | 'paymentMethod' |
  'basic' | 'assignment' | 'overtime' | 'incentive' | 'living' | 'transport' | 'other' |
  'advance' | 'absence' | 'doubleAbsence' | 'delay' | 'fellowship' | 'penalties' | 'timePenalty' |
  'gross' | 'deductions' | 'net' | 'signature' | string;

export type MonthlyReportSection = 'overview' | 'quality' | 'centers' | 'payment' | 'components' | 'daily' | 'employees';
export type MonthlyReportColumn = 'code' | 'name' | 'employerCompany' | 'job' | 'department' | 'costCenter' |
  'paymentMethod' | 'basic' | 'gross' | 'deductions' | 'net' | 'checked' | 'paid';

export type ExportOptions = {
  periodId: string;
  entryIds: string[];
  template: 'slip' | 'compact' | 'register' | 'monthly';
  paper: 'A4' | 'A5';
  hideZeros: boolean;
  monochrome: boolean;
  explanations: boolean;
  // register columns to include
  registerColumns?: RegisterColumn[];
  // slip fields to include
  slipFields?: string[];
  reportSections?: MonthlyReportSection[];
  reportColumns?: MonthlyReportColumn[];
  asOf?:string; view?:'monthly'|'accrued';
};
export type Api = { 
  call: (method: string, payload?: unknown) => Promise<any>;
  onAppEvent: (channel: string, cb: (data: any) => void) => () => void;
  installUpdate: () => void;
  updateActivity: (busy:boolean) => void;
  checkUpdate: () => Promise<unknown>;
};
declare global { interface Window { payroll: Api } }
