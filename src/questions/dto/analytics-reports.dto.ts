export interface TrendDataPoint {
    date: string;
    uploaded: number;
    approved: number;
}

export interface TrendResponse {
    trends: TrendDataPoint[];
}

export interface CourseAnalyticsResponse {
    course_code: string;
    total_questions: number;
    approved_questions: number;
    by_co: Record<string, number>;
    by_difficulty: Record<string, number>;
    approval_rate: number;
}

export interface FacultyMonthlyStats {
    month: string;
    uploads: number;
    approved: number;
    rejected: number;
}

export interface FacultyDetailsResponse {
    faculty_id: string;
    name: string;
    total_uploads: number;
    lifetime_approval_rate: number;
    monthly_stats: FacultyMonthlyStats[];
}
