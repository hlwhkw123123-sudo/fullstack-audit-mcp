export type FindingKind =
  | "confirmed_defect"
  | "likely_bug"
  | "security_risk"
  | "test_failure"
  | "suggestion";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  lineStart?: number;
  lineEnd?: number;
  evidence: string;
  confidence: "high" | "medium" | "low";
  reproduction?: string;
  suggestedFix: string;
}

export interface ProjectFile {
  path: string;
  text: string;
}

export interface ScanResult {
  root: string;
  files: ProjectFile[];
  skipped: {
    excluded: number;
    symlink: number;
    oversized: number;
    binary: number;
    unreadable: number;
    sensitive: number;
  };
  truncated: boolean;
  projectTypes: string[];
}
