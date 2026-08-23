"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Mail, MessageCircle, Phone, RefreshCcw, Search, Send, Users, X } from "lucide-react";
import type { Employer, ShortlistedAssistant } from "@/lib/employers";
import {
  defaultCustomEmployerMessage,
  employerMessagePresets,
  getEmployerMessage,
  personalizeEmployerMessage,
  type EmployerMessagePreset,
} from "@/lib/employer-messages";

type EmployersResponse = {
  status: number;
  message: string;
  data: Employer[];
  totalCount: number;
  resultCount: number;
};

type ShortlistedAssistantsResponse = {
  status: number;
  message: string;
  data: ShortlistedAssistant[];
};

export function EmployersPanel() {
  const [items, setItems] = useState<Employer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<EmployerMessagePreset>("welcome");
  const [customMessage, setCustomMessage] = useState(defaultCustomEmployerMessage);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [sentMessages, setSentMessages] = useState<Record<number, string>>({});
  const [shortlistModalEmployer, setShortlistModalEmployer] = useState<Employer | null>(null);
  const [shortlistedAssistants, setShortlistedAssistants] = useState<ShortlistedAssistant[]>([]);
  const [shortlistModalLoading, setShortlistModalLoading] = useState(false);
  const [shortlistModalError, setShortlistModalError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    return params.toString();
  }, [query]);

  const loadEmployers = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    const response = await fetch(`/api/admin/employers${queryString ? `?${queryString}` : ""}`, {
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as EmployersResponse | null;

    setIsLoading(false);

    if (!response.ok) {
      setMessage(result?.message ?? "Unable to load employers");
      return;
    }

    setItems(result?.data ?? []);
    setTotalCount(result?.totalCount ?? 0);
    setDrafts((current) => {
      const next = { ...current };
      for (const employer of result?.data ?? []) {
        next[employer.id] ??= personalizeEmployerMessage(getEmployerMessage("welcome"), employer.name);
      }
      return next;
    });
  }, [queryString]);

  useEffect(() => {
    loadEmployers();
  }, [loadEmployers]);

  useEffect(() => {
    try {
      setSentMessages(JSON.parse(localStorage.getItem("superhelper-employer-whatsapp-messages") ?? "{}"));
    } catch {
      setSentMessages({});
    }
  }, []);

  function applyPreset() {
    setDrafts((current) => {
      const next = { ...current };
      for (const employer of items) {
        next[employer.id] = personalizeEmployerMessage(
          getEmployerMessage(selectedPreset, customMessage),
          employer.name,
        );
      }
      return next;
    });
    setMessage(`${employerMessagePresets.find((preset) => preset.value === selectedPreset)?.label} applied.`);
  }

  function rememberSentMessage(employerId: number) {
    const sentMessage = drafts[employerId] ?? "";
    const next = { ...sentMessages, [employerId]: sentMessage };
    setSentMessages(next);
    localStorage.setItem("superhelper-employer-whatsapp-messages", JSON.stringify(next));
  }

  async function openShortlistModal(employer: Employer) {
    setShortlistModalEmployer(employer);
    setShortlistedAssistants([]);
    setShortlistModalError(null);
    setShortlistModalLoading(true);

    const response = await fetch(`/api/admin/employers/${employer.id}/shortlisted-assistants`, {
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as ShortlistedAssistantsResponse | null;

    setShortlistModalLoading(false);

    if (!response.ok) {
      setShortlistModalError(result?.message ?? "Unable to load shortlisted assistants");
      return;
    }

    setShortlistedAssistants(result?.data ?? []);
  }

  function closeShortlistModal() {
    setShortlistModalEmployer(null);
    setShortlistedAssistants([]);
    setShortlistModalError(null);
    setShortlistModalLoading(false);
  }

  return (
    <div className="page-stack employers-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">User management</p>
          <h1>Employers</h1>
        </div>
        <button className="secondary-button inline-button" type="button" onClick={loadEmployers}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </header>

      <section className="metric-grid employers-metrics" aria-label="Employer metrics">
        <div className="metric-card">
          <div className="metric-icon">
            <Users size={20} />
          </div>
          <p className="metric-label">Total employers</p>
          <p className="metric-value">{totalCount}</p>
        </div>
        <div className="metric-card">
          <div className="metric-icon success">
            <Search size={20} />
          </div>
          <p className="metric-label">Visible results</p>
          <p className="metric-value">{items.length}</p>
        </div>
      </section>

      <section className="lead-toolbar employer-toolbar" aria-label="Employer filters">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search name, mobile, email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="message-preset-controls">
          <label className="message-preset-field">
            <span>WhatsApp message preset</span>
            <select value={selectedPreset} onChange={(event) => setSelectedPreset(event.target.value as EmployerMessagePreset)}>
              {employerMessagePresets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          {selectedPreset === "custom" ? (
            <textarea
              aria-label="Custom WhatsApp message"
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
            />
          ) : null}
          <button className="secondary-button inline-button" type="button" onClick={applyPreset} disabled={items.length === 0}>
            <MessageCircle size={17} />
            Apply to visible employers
          </button>
        </div>
      </section>

      {message ? <p className="form-message">{message}</p> : null}

      <section className="lead-table-wrap">
        <table className="lead-table employer-table">
          <thead>
            <tr>
              <th>Employer</th>
              <th>Contact</th>
              <th>Activity</th>
              <th>Message to send</th>
              <th>Last sent message</th>
              <th>Joined</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7}>Loading employers...</td>
              </tr>
            ) : null}
            {!isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={7}>No employers found.</td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="lead-primary">
                    <strong>{item.name || item.email || "Unnamed employer"}</strong>
                    <span>{item.id}</span>
                  </div>
                </td>
                <td>
                  <div className="lead-primary">
                    {item.email ? (
                      <a href={`mailto:${item.email}`}>
                        <Mail size={14} />
                        {item.email}
                      </a>
                    ) : (
                      <span>No email</span>
                    )}
                    {item.mobile ? (
                      <a href={`tel:${item.mobile}`}>
                        <Phone size={14} />
                        {item.mobile}
                      </a>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="lead-secondary">
                    <span>{item.contactCount} contacts</span>
                    <small>
                      {item.shortlistCount > 0 ? (
                        <button
                          className="shortlist-link"
                          type="button"
                          onClick={() => openShortlistModal(item)}
                        >
                          {item.shortlistCount} shortlisted
                        </button>
                      ) : (
                        <span>{item.shortlistCount} shortlisted</span>
                      )}{" "}
                      · {item.reviewCount} reviews · {item.chatCount} chats
                    </small>
                  </div>
                </td>
                <td>
                  <div className="employer-message-editor">
                    <textarea
                      aria-label={`Message for ${item.name || "employer"}`}
                      value={drafts[item.id] ?? ""}
                      onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
                    <a
                      className={`whatsapp-button${item.mobile ? "" : " whatsapp-button--disabled"}`}
                      href={item.mobile ? whatsappUrl(item.mobile, drafts[item.id] ?? "") : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!item.mobile}
                      onClick={!item.mobile ? (event) => event.preventDefault() : () => rememberSentMessage(item.id)}
                    >
                      <Send size={14} /> Send on WhatsApp
                    </a>
                  </div>
                </td>
                <td>
                  <div className="sent-message-preview">
                    {sentMessages[item.id] ? <span>{sentMessages[item.id]}</span> : <small>Not sent yet</small>}
                  </div>
                </td>
                <td>{formatDate(item.created_at)}</td>
                <td>{formatDate(item.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {shortlistModalEmployer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeShortlistModal}>
          <div className="order-modal shortlist-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <div>
                <p className="eyebrow">Shortlisted profiles</p>
                <h2>{shortlistModalEmployer.name || shortlistModalEmployer.email || "Employer"}</h2>
              </div>
              <button className="secondary-button inline-button" type="button" onClick={closeShortlistModal}>
                <X size={17} />
                Close
              </button>
            </header>

            {shortlistModalLoading ? <p>Loading shortlisted profiles...</p> : null}
            {shortlistModalError ? <p className="form-message">{shortlistModalError}</p> : null}
            {!shortlistModalLoading && !shortlistModalError && shortlistedAssistants.length === 0 ? (
              <p>No shortlisted profiles for this employer.</p>
            ) : null}

            {shortlistedAssistants.length > 0 ? (
              <div className="shortlist-grid">
                {shortlistedAssistants.map((assistant) => (
                  <article className="shortlist-card" key={assistant.id}>
                    {assistant.profilePictureUrl ? (
                      <Image
                        className="shortlist-avatar"
                        src={assistant.profilePictureUrl}
                        alt={assistant.name ?? "Assistant profile"}
                        width={56}
                        height={56}
                        unoptimized
                      />
                    ) : (
                      <div className="shortlist-avatar shortlist-avatar--placeholder" aria-hidden="true">
                        {(assistant.name ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="shortlist-card-body">
                      <strong>{assistant.name || "Unnamed assistant"}</strong>
                      <span className={`assistant-status assistant-status--${assistant.status.toLowerCase()}`}>
                        {assistant.status}
                      </span>
                      <div className="shortlist-card-meta">
                        <a href={`tel:${assistant.mobile}`}>
                          <Phone size={13} />
                          {assistant.mobile}
                        </a>
                        {assistant.email ? (
                          <a href={`mailto:${assistant.email}`}>
                            <Mail size={13} />
                            {assistant.email}
                          </a>
                        ) : null}
                        <small>
                          {[assistant.area, assistant.city].filter(Boolean).join(", ") || "Location not set"}
                        </small>
                        <small>
                          {[
                            assistant.gender,
                            assistant.age ? `${assistant.age} yrs` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Details not set"}
                        </small>
                        <small>Shortlisted on {formatDate(assistant.shortlistedAt)}</small>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function whatsappUrl(mobile: string, message: string) {
  return `https://wa.me/${mobile.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
