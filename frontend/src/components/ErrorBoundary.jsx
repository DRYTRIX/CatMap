import { Component } from "react";
import i18n from "../i18n";
import { submitIssueReport } from "../api";

const MAX_CRASH_MESSAGE = 1800;

function buildCrashMessage(error) {
  const name = error?.name || "Error";
  const message = error?.message || String(error) || "Unknown error";
  const stack = typeof error?.stack === "string" ? error.stack : "";
  const parts = [`Crash report: ${name}: ${message}`];
  if (stack) {
    parts.push("", stack);
  }
  const text = parts.join("\n");
  if (text.length <= MAX_CRASH_MESSAGE) return text;
  return text.slice(0, MAX_CRASH_MESSAGE - 1) + "…";
}

/**
 * Catches render errors and shows a friendly reload screen instead of a white page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reportStatus: "idle" };
  }

  static getDerivedStateFromError(error) {
    return { error, reportStatus: "idle" };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info);
  }

  handleReport = async () => {
    if (this.state.reportStatus === "sending" || this.state.reportStatus === "sent") {
      return;
    }
    this.setState({ reportStatus: "sending" });
    try {
      await submitIssueReport("bug", buildCrashMessage(this.state.error));
      this.setState({ reportStatus: "sent" });
    } catch (err) {
      console.error("Failed to send crash report:", err);
      this.setState({ reportStatus: "failed" });
    }
  };

  render() {
    if (this.state.error) {
      const { reportStatus } = this.state;
      let reportLabel = i18n.t("errorBoundary.report");
      if (reportStatus === "sending") {
        reportLabel = i18n.t("errorBoundary.reporting");
      } else if (reportStatus === "sent") {
        reportLabel = i18n.t("errorBoundary.reported");
      } else if (reportStatus === "failed") {
        reportLabel = i18n.t("errorBoundary.reportFailed");
      }

      return (
        <div className="error-boundary">
          <h1>{i18n.t("errorBoundary.title")}</h1>
          <p>{i18n.t("errorBoundary.message")}</p>
          <div className="error-boundary-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={this.handleReport}
              disabled={reportStatus === "sending" || reportStatus === "sent"}
            >
              {reportLabel}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              {i18n.t("common.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
