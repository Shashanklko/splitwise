import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { X, Send, MessageCircle, Calendar } from 'lucide-react';

interface PayerResponse {
  user_id: number;
  amount_paid: string;
  user_name: string;
}

interface SplitResponse {
  user_id: number;
  amount_owed: string;
  split_value: string | null;
  user_name: string;
}

interface Expense {
  id: number;
  group_id: number | null;
  description: string;
  amount: string;
  split_type: string;
  created_at: string;
  payers: PayerResponse[];
  splits: SplitResponse[];
}

interface Comment {
  id: number;
  expense_id: number;
  user_id: number;
  user_name: string;
  message: string;
  created_at: string;
}

interface ExpenseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseId: number | null;
}

const ExpenseDetailsModal: React.FC<ExpenseDetailsModalProps> = ({
  isOpen,
  onClose,
  expenseId,
}) => {
  const { user, token } = useAuth();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch expense static details
  useEffect(() => {
    if (isOpen && expenseId) {
      setLoading(true);
      api.get(`/api/expenses/${expenseId}`)
        .then((res) => {
          setExpense(res.data);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [isOpen, expenseId]);

  // Set up WebSocket connection for comments
  useEffect(() => {
    if (!isOpen || !expenseId || !token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use the proxy configure in Vite, or direct to backend port if host has no proxy
    const host = window.location.host.includes('localhost:') 
      ? 'localhost:8000' 
      : window.location.host;
    
    const wsUrl = `${protocol}//${host}/ws/expenses/${expenseId}/comments?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') {
        setComments(data.comments);
      } else if (data.type === 'comment') {
        setComments((prev) => [...prev, data.comment]);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      setComments([]);
      setWsConnected(false);
    };
  }, [isOpen, expenseId, token]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  if (!isOpen) return null;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ message: message.trim() }));
    setMessage('');
  };

  const formatCurrency = (val: string) => {
    return `₹${parseFloat(val).toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="glass-panel w-full max-w-3xl rounded-3xl p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[85vh]">
        {/* Left Side: Expense Info & Splits */}
        <div className="flex flex-col justify-between overflow-y-auto pr-1">
          {loading || !expense ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
              <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></div>
              <span className="text-xs text-slate-500">Loading details...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <span className="text-[10px] text-slate-500 font-semibold uppercase bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md flex items-center gap-1 w-max">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(expense.created_at).toLocaleDateString(undefined, {
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric'
                  })}
                </span>
                <h2 className="text-xl font-bold text-slate-800 mt-2 leading-tight">
                  {expense.description}
                </h2>
                <div className="text-2xl font-black text-brand-600 mt-1">
                  {formatCurrency(expense.amount)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">
                  Split method: {expense.split_type}
                </div>
              </div>

              {/* Payers Section */}
              <div className="space-y-3">
                <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider">Paid By</h3>
                <div className="space-y-2 bg-slate-100/50 p-3.5 rounded-2xl border border-slate-200/40 max-h-32 overflow-y-auto">
                  {expense.payers.map((p) => (
                    <div key={p.user_id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700 font-medium">{p.user_name}</span>
                      <span className="text-success-600 font-bold">{formatCurrency(p.amount_paid)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Splits / Owed Section */}
              <div className="space-y-3">
                <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider">Split Breakdowns</h3>
                <div className="space-y-2 bg-slate-100/50 p-3.5 rounded-2xl border border-slate-200/40 max-h-48 overflow-y-auto">
                  {expense.splits.map((s) => {
                    const isUserSplit = s.user_id === user?.id;
                    return (
                      <div key={s.user_id} className={`flex justify-between items-center text-xs p-1.5 rounded-lg ${isUserSplit ? 'bg-brand-500/10 border border-brand-500/20' : ''}`}>
                        <div className="flex flex-col">
                          <span className={`font-medium ${isUserSplit ? 'text-brand-700 font-semibold' : 'text-slate-700'}`}>
                            {s.user_name} {isUserSplit ? '(You)' : ''}
                          </span>
                          {s.split_value && (
                            <span className="text-[9px] text-slate-550">
                              Value: {s.split_value}
                              {expense.split_type === 'percentage' ? '%' : expense.split_type === 'shares' ? ' shares' : ''}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-700 font-semibold">{formatCurrency(s.amount_owed)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-slate-200/55 hidden md:block">
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs transition-colors"
            >
              Close Details
            </button>
          </div>
        </div>

        {/* Right Side: Chat Comments Feed */}
        <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-6 max-h-[70vh] md:max-h-none h-[400px] md:h-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-800 font-bold text-sm flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-brand-500" />
              Expense Chat Discussion
            </h3>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-success-500' : 'bg-accent-500 animate-pulse'}`}></span>
              <span className="text-[9px] text-slate-500">{wsConnected ? 'Live' : 'Connecting...'}</span>
            </span>
            <button onClick={onClose} className="md:hidden text-slate-500 p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 min-h-0 bg-slate-100/30 border border-slate-200 p-3 rounded-2xl">
            {comments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
                <MessageCircle className="w-8 h-8 opacity-30 mb-2" />
                <span className="text-xs">No comments yet.</span>
                <span className="text-[10px] mt-1">Leave a note about this expense!</span>
              </div>
            ) : (
              comments.map((comment) => {
                const isCurrentUser = comment.user_id === user?.id;
                return (
                  <div key={comment.id} className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                    <div className="text-[10px] text-slate-500 mb-1 px-1">
                      {comment.user_name}
                    </div>
                    <div className={`px-4 py-2.5 rounded-2xl text-xs max-w-[85%] break-words leading-relaxed ${
                      isCurrentUser 
                        ? 'bg-brand-500 text-white rounded-tr-none' 
                        : 'bg-slate-200/70 border border-slate-200/50 text-slate-700 rounded-tl-none'
                    }`}>
                      {comment.message}
                    </div>
                    <span className="text-[8px] text-slate-500 mt-0.5 px-1">
                      {new Date(comment.created_at).toLocaleTimeString(undefined, {
                        hour: '2-digit', 
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message form */}
          <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0">
            <input
              type="text"
              placeholder={wsConnected ? "Type a comment..." : "Connecting to chat room..."}
              disabled={!wsConnected}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="glass-input flex-1 px-4 py-2.5 rounded-2xl text-xs"
            />
            <button
              type="submit"
              disabled={!wsConnected || !message.trim()}
              className="p-2.5 rounded-2xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ExpenseDetailsModal;
