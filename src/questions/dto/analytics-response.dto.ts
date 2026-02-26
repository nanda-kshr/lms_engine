export interface OverviewStats {
    total_questions: number;
    approved_questions: number;
    pending_questions: number;
    rejected_questions: number;
    ai_generated_questions: number;
    approval_rate: number;
}

export interface FacultyStat {
    userId: string;
    name: string;
    uploads: number;
    approved: number;
    rejected: number;
}

export interface ContentHealth {
    by_co: Record<string, number>;
    by_difficulty: Record<string, number>;
}

export interface AnalyticsResponse {
    overview: OverviewStats;
    faculty: FacultyStat[];
    content: ContentHealth;
    active_faculty: number;
}
