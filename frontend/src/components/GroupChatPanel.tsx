import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Users, X, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  group_id: number;
  user_id: number;
  user_name: string;
  message: string;
  created_at: string;
}

interface GroupChatPanelProps {
  groupId: number;
  groupName: string;
  members: { id: number; name: string; email: string }[];
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// Generate a deterministic color for a user based on their name
const USER_COLORS = [
  '#7c3aed', '#059669', '#dc2626', '#2563eb', '#d97706',
  '#0891b2', '#be185d', '#16a34a', '#9333ea', '#b45309',
];

function getUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwn,
  showAvatar,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  showAvatar: boolean;
}) {
  const color = getUserColor(msg.user_name);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginBottom: showAvatar ? 12 : 3,
      }}
    >
      {/* Avatar */}
      {!isOwn && (
        <div style={{ width: 28, flexShrink: 0 }}>
          {showAvatar ? (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: `${color}22`,
                border: `1.5px solid ${color}55`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color,
              }}
            >
              {getInitials(msg.user_name)}
            </div>
          ) : (
            <div style={{ width: 28 }} />
          )}
        </div>
      )}

      <div style={{ maxWidth: '72%', minWidth: 0 }}>
        {/* Name + time (only for first message in a group) */}
        {showAvatar && !isOwn && (
          <div
            style={{
              fontSize: 10,
              color: '#64748b',
              marginBottom: 2,
              paddingLeft: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontWeight: 700, color }}>{msg.user_name}</span>
            <span>{formatTime(msg.created_at)}</span>
          </div>
        )}

        {/* Bubble */}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: isOwn ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isOwn
              ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
              : 'rgba(255,255,255,0.06)',
            border: isOwn ? 'none' : '1px solid rgba(255,255,255,0.08)',
            color: isOwn ? '#fff' : '#e2e8f0',
            fontSize: 13,
            lineHeight: 1.5,
            wordBreak: 'break-word',
            backdropFilter: 'blur(4px)',
            boxShadow: isOwn ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
          }}
        >
          {msg.message}
        </div>

        {/* Timestamp for own messages */}
        {isOwn && (
          <div style={{ fontSize: 9, color: '#475569', textAlign: 'right', marginTop: 2, paddingRight: 4 }}>
            {formatTime(msg.created_at)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Date separator ─────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '12px 0',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: 10, color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  );
}

function getDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Main Component ─────────────────────────────────────────────────────────────

const WS_BASE = (import.meta.env.VITE_API_URL || '').replace(/^http/, 'ws');

export default function GroupChatPanel({
  groupId,
  groupName,
  members,
  onClose,
}: GroupChatPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── WebSocket setup ──────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const url = `${WS_BASE}/ws/groups/${groupId}/chat?token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3s if component is still mounted
      setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
          setMessages(data.messages || []);
        } else if (data.type === 'message') {
          setMessages((prev) => [...prev, data.message]);
        }
      } catch {
        // ignore malformed frames
      }
    };
  }, [groupId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  // ── Auto-scroll to bottom ────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ message: text }));
    setDraft('');
    inputRef.current?.focus();
  }, [draft]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Group messages with date separators ──────────────────────────────────────

  type Row = { type: 'date'; label: string } | { type: 'msg'; msg: ChatMessage; showAvatar: boolean };
  const rows: Row[] = [];
  let lastDate = '';

  messages.forEach((msg, i) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      rows.push({ type: 'date', label: getDateLabel(msg.created_at) });
    }
    const prevMsg = i > 0 ? messages[i - 1] : null;
    const showAvatar = !prevMsg || prevMsg.user_id !== msg.user_id || new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60000;
    rows.push({ type: 'msg', msg, showAvatar });
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 380,
        height: 560,
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg, #0f172a 0%, #1a1f35 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.15)',
        overflow: 'hidden',
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: '14px 16px',
          background: 'rgba(124,58,237,0.12)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MessageCircle size={18} color="#fff" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {groupName}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: connected ? '#34d399' : '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: connected ? '#34d399' : '#475569',
              }}
            />
            {connected ? `${members.length} members` : 'Connecting…'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowMembers((v) => !v)}
            style={{
              background: showMembers ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${showMembers ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8,
              padding: '5px 8px',
              color: showMembers ? '#a78bfa' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Show members"
          >
            <Users size={13} />
            {members.length}
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Members sidebar (slide-in) ── */}
      {showMembers && (
        <div
          style={{
            position: 'absolute',
            top: 67,
            right: 0,
            width: 200,
            bottom: 0,
            background: 'rgba(15,23,42,0.97)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            zIndex: 10,
            padding: '12px 0',
            overflowY: 'auto',
          }}
        >
          <p style={{ margin: '0 0 10px 14px', fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Members ({members.length})
          </p>
          {members.map((m) => {
            const color = getUserColor(m.name);
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px' }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: `${color}22`,
                    border: `1.5px solid ${color}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    color,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(m.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name} {m.id === user?.id ? '(You)' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Messages area ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={() => setShowMembers(false)}
      >
        {messages.length === 0 && connected && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: 0.5,
            }}
          >
            <MessageCircle size={32} color="#475569" />
            <p style={{ margin: 0, fontSize: 13, color: '#475569', textAlign: 'center' }}>
              No messages yet.<br />Start the conversation!
            </p>
          </div>
        )}

        {rows.map((row, i) =>
          row.type === 'date' ? (
            <DateSeparator key={`date-${i}`} label={row.label} />
          ) : (
            <MessageBubble
              key={row.msg.id}
              msg={row.msg}
              isOwn={row.msg.user_id === user?.id}
              showAvatar={row.showAvatar}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the group… (Enter to send)"
          disabled={!connected}
          rows={1}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '9px 12px',
            color: '#e2e8f0',
            fontSize: 13,
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            maxHeight: 80,
            overflowY: 'auto',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(124,58,237,0.5)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
        />
        <button
          onClick={sendMessage}
          disabled={!draft.trim() || !connected}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            border: 'none',
            background:
              draft.trim() && connected
                ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
                : 'rgba(255,255,255,0.05)',
            color: draft.trim() && connected ? '#fff' : '#374151',
            cursor: draft.trim() && connected ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
            boxShadow: draft.trim() && connected ? '0 2px 8px rgba(124,58,237,0.4)' : 'none',
          }}
        >
          <Send size={15} />
        </button>
      </div>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
