import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import athenaLogo from "./assets/athena_logo_clean_removebg_preview.png";

const SESSIONS_KEY = "athena_workspace_sessions";
const CURRENT_SESSION_KEY = "athena_workspace_current_session";
const LEGACY_MESSAGES_KEY = "athena_messages";
const LEGACY_SESSIONS_KEY = "athena_sessions";
const LEGACY_CURRENT_KEY = "athena_current_session";
const DEFAULT_MODE = "Revision";

function createSession(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: "New Session",
    messages: [],
    uploadedPdf: null,
    responseMode: DEFAULT_MODE,
    createdAt: Date.now(),
    ...overrides
  };
}

function readJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function migrateLegacySessions() {
  const legacyMessages = readJson(LEGACY_MESSAGES_KEY, []);
  const legacySessions = readJson(LEGACY_SESSIONS_KEY, []);
  const legacyCurrentTitle = localStorage.getItem(LEGACY_CURRENT_KEY) || "New Chat";

  if (legacySessions.length === 0 && legacyMessages.length === 0) {
    return [createSession()];
  }

  const migrated = legacySessions.map((session) => createSession({
    id: crypto.randomUUID(),
    title: session.title || "Recovered Session",
    messages: session.title === legacyCurrentTitle ? legacyMessages : [],
    uploadedPdf: null,
    responseMode: DEFAULT_MODE,
    createdAt: session.timestamp || Date.now()
  }));

  if (migrated.length === 0) {
    migrated.push(createSession({
      title: legacyCurrentTitle === "New Chat" ? "New Session" : legacyCurrentTitle,
      messages: legacyMessages
    }));
  }

  return migrated;
}

function initializeSessions() {
  const savedSessions = readJson(SESSIONS_KEY, null);

  if (Array.isArray(savedSessions) && savedSessions.length > 0) {
    return savedSessions.map((session) => ({
      ...createSession(),
      ...session,
      messages: Array.isArray(session.messages) ? session.messages : [],
      uploadedPdf: session.uploadedPdf || null,
      responseMode: session.responseMode || DEFAULT_MODE
    }));
  }

  return migrateLegacySessions();
}

function generateSessionTitle(prompt) {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const titleRules = [
    { terms: ["four point", "four probe", "4 point", "4 probe"], title: "Four Point Probe Method" },
    { terms: ["pn junction", "p n junction", "p-n junction"], title: "PN Junction Concepts" },
    { terms: ["semiconductor", "semiconductors"], title: "Semiconductor Formula Revision" },
    { terms: ["band gap", "energy band"], title: "Energy Band Theory" },
    { terms: ["formula", "equation", "derive", "derivation"], title: "Formula Revision" },
    { terms: ["viva", "oral"], title: "Viva Prep" },
    { terms: ["exam", "16 mark", "8 mark", "answer"], title: "Exam Answer Practice" },
    { terms: ["notes", "summarize", "summary"], title: "Study Notes Summary" }
  ];

  const matchedRule = titleRules.find((rule) =>
    rule.terms.some((term) => normalized.includes(term))
  );

  if (matchedRule) return matchedRule.title;

  const stopWords = new Set([
    "athena",
    "please",
    "explain",
    "tell",
    "about",
    "what",
    "why",
    "how",
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "hi",
    "hello",
    "hey"
  ]);

  const words = normalized
    .split(" ")
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 5);

  if (words.length === 0) return "Conversation with Athena";

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M9 4h6m-8 4h10m-8 0v10m6-10v10M8 8l1 12h6l1-12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M7 7l10 10M17 7L7 17"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function App() {
  const [message, setMessage] = useState("");
  const [sessions, setSessions] = useState(initializeSessions);
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    return localStorage.getItem(CURRENT_SESSION_KEY);
  });
  const [loading, setLoading] = useState(false);

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.id === currentSessionId) || sessions[0];
  }, [currentSessionId, sessions]);

  const messages = activeSession?.messages || [];
  const mode = activeSession?.responseMode || DEFAULT_MODE;
  const selectedFile = activeSession?.uploadedPdf?.name || "";

  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSession?.id) {
      localStorage.setItem(CURRENT_SESSION_KEY, activeSession.id);
    }
  }, [activeSession?.id]);

  function updateSession(sessionId, updater) {
    setSessions((previousSessions) =>
      previousSessions.map((session) =>
        session.id === sessionId ? updater(session) : session
      )
    );
  }

  function startNewSession() {
    const nextSession = createSession();

    setSessions((previousSessions) => [nextSession, ...previousSessions]);
    setCurrentSessionId(nextSession.id);
    setMessage("");
    setLoading(false);
  }

  function changeMode(nextMode) {
    if (!activeSession) return;

    updateSession(activeSession.id, (session) => ({
      ...session,
      responseMode: nextMode
    }));
  }

  async function deleteSession(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    const confirmed = window.confirm(`Delete "${session?.title || "this session"}"?`);

    if (!confirmed) return;

    const remainingSessions = sessions.filter((item) => item.id !== sessionId);

    if (remainingSessions.length === 0) {
      const freshSession = createSession();
      setSessions([freshSession]);
      setCurrentSessionId(freshSession.id);
      return;
    }

    setSessions(remainingSessions);

    if (activeSession?.id === sessionId) {
      setCurrentSessionId(remainingSessions[0].id);
    }

    if (session?.uploadedPdf) {
      try {
        await axios.post("http://127.0.0.1:8000/clear-pdf", {
          session_id: sessionId
        });
      } catch (error) {
        console.error(error);
      }
    }
  }

  async function removeCurrentPdf() {
    if (!activeSession) return;

    updateSession(activeSession.id, (session) => ({
      ...session,
      uploadedPdf: null,
      documentContext: null,
      retrievalState: null,
      embeddingCacheKey: null
    }));

    try {
      await axios.post("http://127.0.0.1:8000/clear-pdf", {
        session_id: activeSession.id
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function sendMessage() {
    if (!message.trim() || !activeSession) return;

    const currentMessage = message.trim();
    const userMessage = {
      role: "user",
      content: currentMessage
    };
    const sessionId = activeSession.id;
    const shouldTitleSession = messages.length === 0;
    const responseMode = mode;

    updateSession(sessionId, (session) => ({
      ...session,
      title: shouldTitleSession ? generateSessionTitle(currentMessage) : session.title,
      messages: [...session.messages, userMessage],
      timestamp: Date.now()
    }));

    setMessage("");
    setLoading(true);

    try {
      const res = await axios.post(
        "http://127.0.0.1:8000/chat",
        {
          session_id: sessionId,
          message: `[MODE: ${responseMode}] ${currentMessage}`
        }
      );

      const aiMessage = {
        role: "assistant",
        content: res.data.response
      };

      updateSession(sessionId, (session) => ({
        ...session,
        messages: [...session.messages, aiMessage],
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error(error);

      const errorMessage = {
        role: "assistant",
        content: "Athena encountered an error while generating a response."
      };

      updateSession(sessionId, (session) => ({
        ...session,
        messages: [...session.messages, errorMessage],
        timestamp: Date.now()
      }));
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(event) {
    const file = event.target.files[0];

    if (!file || !activeSession) return;

    const formData = new FormData();

    formData.append("file", file);
    formData.append("session_id", activeSession.id);

    updateSession(activeSession.id, (session) => ({
      ...session,
      uploadedPdf: {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        uploadedAt: Date.now()
      },
      retrievalState: {
        status: "uploaded",
        scope: "session"
      },
      embeddingCacheKey: null
    }));

    try {
      await axios.post(
        "http://127.0.0.1:8000/upload-pdf",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        }
      );
    } catch (error) {
      console.error(error);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="h-screen bg-[#f7f3eb] flex overflow-hidden text-[#2d2923]">
      <aside className="athena-sidebar w-[336px] border-r border-[rgba(184,146,63,0.12)] flex flex-col">
        <div className="px-6 pt-8 pb-7 border-b border-[rgba(184,146,63,0.12)]">
          <div className="flex flex-col items-center text-center">
            <img
              src={athenaLogo}
              alt="Athena"
              className="w-32 h-auto opacity-95"
            />

            <p className="mt-4 max-w-[226px] text-[0.9rem] leading-[1.6] text-[rgba(80,70,50,0.72)]">
              Wisdom-Powered Local Engineering Copilot
            </p>
          </div>
        </div>

        <div className="px-6 py-5 border-b border-[rgba(184,146,63,0.12)]">
          <button
            onClick={startNewSession}
            className="w-full rounded-full bg-[#c6a04a] px-5 py-3 text-sm font-semibold text-[#fffaf2] shadow-[0_4px_14px_rgba(0,0,0,0.045)] transition-all duration-200 hover:bg-[#b8923f] hover:brightness-105 hover:scale-[1.01] active:scale-[0.99]"
          >
            + New Session
          </button>
        </div>

        <div className="px-6 py-5 border-b border-[rgba(184,146,63,0.12)]">
          <p className="text-[11px] font-semibold text-[#8d7a5a] mb-3 uppercase tracking-[0.2em]">
            Current PDF
          </p>

          {selectedFile ? (
            <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(184,146,63,0.12)] bg-[#fffdf8]/78 px-4 py-3 text-sm text-[#3d3832] shadow-[0_4px_14px_rgba(0,0,0,0.03)]">
              <span className="min-w-0 truncate">{selectedFile}</span>
              <button
                onClick={removeCurrentPdf}
                aria-label="Remove current PDF"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#8d7a5a] transition-all duration-200 hover:bg-[#efe3cf] hover:text-[#6f5b31]"
              >
                <CloseIcon />
              </button>
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[rgba(184,146,63,0.18)] bg-[#fffdf8]/45 px-4 py-3 text-sm leading-6 text-[#756a5b]/72">
              No PDF active for this session.
            </div>
          )}
        </div>

        <div className="px-6 py-5 border-b border-[rgba(184,146,63,0.12)]">
          <p className="text-[11px] font-semibold text-[#8d7a5a] mb-3 uppercase tracking-[0.2em]">
            Response Mode
          </p>

          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value)}
            className="w-full bg-[#fffdf8]/84 border border-[rgba(184,146,63,0.16)] rounded-[18px] px-4 py-3 text-[#2d2923] outline-none shadow-[0_4px_14px_rgba(0,0,0,0.025)] transition-all duration-200 focus:border-[#c6a04a] focus:shadow-[0_0_0_4px_rgba(198,160,74,0.12)]"
          >
            <option>Revision</option>
            <option>Exam</option>
            <option>Viva</option>
            <option>Formula Sheet</option>
            <option>Concise</option>
            <option>Detailed</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p className="text-[11px] font-semibold text-[#8d7a5a] mb-4 uppercase tracking-[0.2em]">
            Recent Sessions
          </p>

          <div className="space-y-3.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-3 rounded-[20px] border p-4 text-sm shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fffaf0] ${
                  session.id === activeSession?.id
                    ? "border-[rgba(184,146,63,0.26)] bg-[#fffaf0]"
                    : "border-[rgba(184,146,63,0.12)] bg-[#fffdf8]/78"
                }`}
              >
                <button
                  onClick={() => setCurrentSessionId(session.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-medium text-[#3d3832]">
                    {session.title}
                  </span>
                  {session.uploadedPdf && (
                    <span className="mt-1 block truncate text-xs text-[#756a5b]/72">
                      {session.uploadedPdf.name}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => deleteSession(session.id)}
                  aria-label={`Delete ${session.title}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#8d7a5a] opacity-0 transition-all duration-200 hover:bg-[#efe3cf] hover:text-[#6f5b31] group-hover:opacity-100 focus:opacity-100"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col athena-chat-surface">
        <div className="flex-1 overflow-y-auto px-8 py-10">
          <div className="mx-auto flex max-w-[850px] flex-col gap-7">
            {messages.length === 0 && (
              <div className="text-center mt-28 text-[#756a5b] athena-fade-in">
                <h2 className="font-brand text-5xl font-semibold text-[#a9832f] mb-4">
                  Welcome to Athena
                </h2>

                <p className="text-base leading-7 text-[#756a5b]/82">
                  Begin a session, attach a PDF, and ask with purpose.
                </p>
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={index}
                className={`athena-fade-in max-w-[850px] rounded-[22px] px-6 py-[18px] leading-8 shadow-[0_4px_14px_rgba(0,0,0,0.04)] transition-all duration-200 ${
                  msg.role === "user"
                    ? "ml-auto bg-[#c6a04a] text-[#fffaf2]"
                    : "bg-[#fffdf8] border border-[rgba(184,146,63,0.12)] text-[#2d2923] shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose max-w-none prose-headings:font-brand prose-headings:text-[#a9832f] prose-p:text-[#3d3832] prose-strong:text-[#2d2923] prose-li:text-[#3d3832]">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            ))}

            {loading && (
              <div className="athena-fade-in max-w-[850px] bg-[#fffdf8] border border-[rgba(184,146,63,0.12)] rounded-[28px] px-6 py-[18px] text-[#756a5b] animate-pulse shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
                Athena is analyzing your request...
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[rgba(184,146,63,0.12)] bg-[#eee6d8]/88 px-8 py-6">
          <div className="mx-auto flex max-w-[850px] items-center gap-4">
            <label className="bg-[#c6a04a] hover:bg-[#b38f1f] transition-all duration-200 text-[#fffaf2] px-5 py-3 rounded-full font-semibold cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.05)] whitespace-nowrap hover:scale-[1.02] active:scale-[0.99]">
              Upload

              <input
                type="file"
                accept=".pdf,.ppt,.pptx,.doc,.docx"
                className="hidden"
                onChange={uploadFile}
              />
            </label>

            <textarea
              placeholder="Ask Athena something..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows="1"
              className="flex-1 bg-[#fffdf9] border border-[rgba(184,146,63,0.14)] rounded-[24px] px-6 py-4 outline-none text-[#2d2923] resize-none shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition-all duration-200 placeholder:text-[#9b8f7b] focus:border-[#c6a04a] focus:shadow-[0_0_0_4px_rgba(198,160,74,0.12)]"
            />

            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-[#c6a04a] hover:bg-[#b38f1f] transition-all duration-200 text-[#fffaf2] px-8 py-4 rounded-full font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.05)] disabled:opacity-50 hover:scale-[1.02] active:scale-[0.99]"
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
