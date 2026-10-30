export type MetricAvailability = 'available' | 'unavailable';

export interface MetricValue {
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
  availability: MetricAvailability;
  reason?: string;
  source?: string;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export type AnalyticsPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface AnalyticsResolvedRange {
  preset: AnalyticsPreset;
  from: string;
  to: string;
  timezone: string;
  bucket: 'day' | 'week';
  previousPeriod: {
    from: string;
    to: string;
  };
}

export interface AnalyticsOverview {
  range: AnalyticsResolvedRange;
  metrics: {
    activeUsers: MetricValue;
    newSignups: MetricValue;
    paidMembers: MetricValue;
    premiumConversion: MetricValue;
    churnRate: MetricValue;
    revenue: MetricValue;
  };
  timeseries: {
    activeUsers: TimeSeriesPoint[];
    newSignups: TimeSeriesPoint[];
    revenue: TimeSeriesPoint[];
    churnRate: TimeSeriesPoint[];
  };
  lastUpdated: string;
}
