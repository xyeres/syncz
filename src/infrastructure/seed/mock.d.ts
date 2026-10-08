/** Types for the untyped seed data in mock.js (shared with the prototype UI until Step 5). */
export interface MockPerson {
  id: string
  name: string
  role: string
  email: string
  initials: string
  color: string
}
export interface MockVideo {
  id: string
  title: string
  thumbnail: string
  publishedAt: string
  views: number
  /** Dollars per "YYYY-MM" month. */
  revenue: Record<string, number>
}
export interface MockShare {
  personId: string
  bps: number
}
export interface MockSplit {
  id: string
  name: string
  videoIds: string[]
  shares: MockShare[]
}
export interface MockReportSeed {
  period: string
  generatedAt: string
  recalculatedAt?: string
  payments: readonly Record<string, unknown>[]
}

export declare const USER: { name: string; email: string; initials: string }
export declare const CHANNEL: { id: string; name: string; handle: string; subscribers: string; avatar: string }
export declare const ME: MockPerson & { fullName: string }
export declare const COLLABORATORS: readonly MockPerson[]
export declare const VIDEOS: readonly MockVideo[]
export declare const SPLITS: readonly MockSplit[]
export declare const MONTHS: readonly string[]
export declare const REPORT_SEEDS: readonly MockReportSeed[]
