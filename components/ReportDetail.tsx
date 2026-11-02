"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ReportType = "lost" | "found";

type Report = {
  id: number;
  item_name: string;
  description: string;
  location: string;
  image_url: string | null;
  created_at: string | null;
  status?: "available" | "claimed" | "returned";
};

type ReportDetailProps = {
  type: string;
  id: string;
};

function isReportType(value: string): value is ReportType {
  return value === "lost" || value === "found";
}

export default function ReportDetail({ type, id }: ReportDetailProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReport() {
      const reportId = Number(id);

      if (!isReportType(type) || !Number.isInteger(reportId) || reportId < 1) {
        setError("This report link is not valid.");
        setLoading(false);
        return;
      }

      const result =
        type === "lost"
          ? await supabase
              .from("lost_items")
              .select("id, item_name, description, location, image_url, created_at")
              .eq("id", reportId)
              .maybeSingle()
          : await supabase
              .from("found_items")
              .select(
                "id, item_name, description, location, image_url, created_at, status"
              )
              .eq("id", reportId)
              .maybeSingle();
      const data: Report | null = result.data;
      const queryError = result.error;

      if (!active) {
        return;
      }

      if (queryError) {
        console.error("Report detail query failed:", queryError);
        setError("Could not load this report. Please try again.");
      } else if (!data) {
        setError("This report could not be found.");
      } else {
        setReport(data);
      }

      setLoading(false);
    }

    loadReport();

    return () => {
      active = false;
    };
  }, [id, type]);

  return (
    <main className="app-shell">
      <header className="dashboard-header report-detail-header">
        <Link className="brand-lockup" href="/" aria-label="BackToYou home">
          <img src="/backtoyou-logo.png" alt="BackToYou logo" />
          <span>
            <strong>BackToYou</strong>
            <small>Campus recovery network</small>
          </span>
        </Link>
        <nav className="product-nav" aria-label="Primary navigation">
          <Link href="/">Home</Link>
          <Link className="is-active" href="/browse">Browse</Link>
          <Link href="/report-lost">Report Lost</Link>
          <Link href="/report-found">Report Found</Link>
        </nav>
        <Link className="report-detail-back" href="/browse">Back to browse</Link>
      </header>
      {loading && <p>Loading report...</p>}
      {!loading && error && <p role="alert" className="form-error">{error}</p>}
      {!loading && report && (
        <article className="surface-card report-detail-card">
          <p className="eyebrow">{type === "lost" ? "LOST REPORT" : "FOUND REPORT"}</p>
          <h1>{report.item_name}</h1>
          {report.image_url && (
            <img
              src={report.image_url}
              alt={report.item_name}
              className="report-detail-image"
            />
          )}
          <p><strong>Description:</strong> {report.description}</p>
          <p><strong>Location:</strong> {report.location}</p>
          {report.created_at && (
            <p><strong>Reported on:</strong> {new Date(report.created_at).toLocaleString()}</p>
          )}
          {type === "found" && (
            <p>
              <strong>Status:</strong> {(report.status || "available").toUpperCase()}
            </p>
          )}
          {type === "found" && report.status === "available" && (
            <p>
              Potential owners can review this item through their{" "}
              <Link href="/matches">possible matches</Link>.
            </p>
          )}
        </article>
      )}
    </main>
  );
}
