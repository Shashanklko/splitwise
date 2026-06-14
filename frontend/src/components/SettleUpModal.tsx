import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { X, Loader2, ArrowRight, UserCheck, Search } from 'lucide-react';

interface Member {
  id: number;
  name: string;
  email: string;
}

interface Group {
  id: number;
  name: string;
}

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledGroupId?: number;
  prefilledMembers?: Member[];
}

const SettleUpModal: React.FC<SettleUpModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  prefilledGroupId,
  prefilledMembers,
}) => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    prefilledGroupId ? prefilledGroupId.toString() : 'standalone'
  );
  
  const [groupMembers, setGroupMembers] = useState<Member[]>(prefilledMembers || []);
  const [payerId, setPayerId] = useState<string>('');
  const [payeeId, setPayeeId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  
  // Standalone mode states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selectedStandaloneFriend, setSelectedStandaloneFriend] = useState<Member | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch groups on mount if not in a prefilled group context
  useEffect(() => {
    if (isOpen && !prefilledGroupId) {
      api.get('/api/groups')
        .then((res) => setGroups(res.data))
        .catch((err) => console.error(err));
    }
  }, [isOpen, prefilledGroupId]);

  // Handle group change: fetch members of selected group
  useEffect(() => {
    if (!isOpen) return;
    
    if (selectedGroupId === 'standalone') {
      setGroupMembers([]);
      setPayerId(user?.id.toString() || '');
      setPayeeId('');
      setSelectedStandaloneFriend(null);
    } else {
      const gid = parseInt(selectedGroupId);
      if (prefilledGroupId === gid && prefilledMembers) {
        setGroupMembers(prefilledMembers);
        // Default to logged-in user paying the creator or vice versa
        setPayerId(user?.id.toString() || '');
        const other = prefilledMembers.find((m) => m.id !== user?.id);
        setPayeeId(other ? other.id.toString() : '');
      } else {
        // Fetch group details
        api.get(`/api/groups/${gid}`)
          .then((res) => {
            const members: Member[] = res.data.members;
            setGroupMembers(members);
            setPayerId(user?.id.toString() || '');
            const other = members.find((m) => m.id !== user?.id);
            setPayeeId(other ? other.id.toString() : '');
          })
          .catch((err) => console.error(err));
      }
    }
  }, [selectedGroupId, isOpen]);

  // Search users for standalone settlement
  useEffect(() => {
    if (selectedGroupId === 'standalone' && searchQuery.trim().length >= 2) {
      api.get(`/api/users/search?q=${searchQuery}`)
        .then((res) => setSearchResults(res.data))
        .catch((err) => console.error(err));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, selectedGroupId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const finalAmount = parseFloat(amount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    let finalPayerId = parseInt(payerId);
    let finalPayeeId = parseInt(payeeId);

    if (selectedGroupId === 'standalone') {
      finalPayerId = user?.id || 0;
      if (!selectedStandaloneFriend) {
        setError('Please select a recipient.');
        return;
      }
      finalPayeeId = selectedStandaloneFriend.id;
    }

    if (!finalPayerId || !finalPayeeId) {
      setError('Payer and Recipient must be specified.');
      return;
    }

    if (finalPayerId === finalPayeeId) {
      setError('Payer and Recipient cannot be the same user.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/settlements', {
        group_id: selectedGroupId === 'standalone' ? null : parseInt(selectedGroupId),
        payer_id: finalPayerId,
        payee_id: finalPayeeId,
        amount: finalAmount
      });
      onSuccess();
      onClose();
      // Reset values
      setAmount('');
      setSearchQuery('');
      setSelectedStandaloneFriend(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to record settlement. Please verify balances.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="glass-panel w-full max-w-lg rounded-3xl p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-success-500/10 text-success-600 p-2.5 rounded-2xl border border-success-500/20">
              <UserCheck className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Settle Up / Record Payment</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-750 p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-accent-600/10 border border-accent-500/20 text-accent-500 px-4 py-2.5 rounded-2xl text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Group Selection */}
          {!prefilledGroupId && (
            <div>
              <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="group_select">
                Settlement Context
              </label>
              <select
                id="group_select"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
              >
                <option value="standalone">Standalone (Direct peer settlement)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id.toString()}>
                    Group: {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Group Settlement: Show Payer & Recipient Selection */}
          {selectedGroupId !== 'standalone' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="payer">
                  Who Paid?
                </label>
                <select
                  id="payer"
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
                >
                  <option value="">Select payer</option>
                  {groupMembers.map((m) => (
                    <option key={m.id} value={m.id.toString()}>
                      {m.name} {m.id === user?.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="payee">
                  Who Received?
                </label>
                <select
                  id="payee"
                  value={payeeId}
                  onChange={(e) => setPayeeId(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
                >
                  <option value="">Select recipient</option>
                  {groupMembers.map((m) => (
                    <option key={m.id} value={m.id.toString()}>
                      {m.name} {m.id === user?.id ? '(You)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* Standalone Settlement: Search & Select Recipient */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-100/50 border border-slate-200/60 flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-500">Payer: </span>
                  <span className="font-semibold text-slate-700">You ({user?.name})</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="text-slate-500">Recipient: </span>
                  <span className="font-semibold text-brand-600">
                    {selectedStandaloneFriend ? selectedStandaloneFriend.name : 'Not selected'}
                  </span>
                </div>
              </div>

              {!selectedStandaloneFriend ? (
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-2">
                    Search Recipient by Email or Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-450">
                      <Search className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      placeholder="Type at least 2 characters to search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm"
                    />
                  </div>
                  
                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="mt-2 glass-panel rounded-2xl border border-slate-200 max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {searchResults.map((friend) => (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() => {
                            setSelectedStandaloneFriend(friend);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-brand-550/5 flex flex-col transition-colors"
                        >
                          <span className="font-semibold text-slate-750 text-sm">{friend.name}</span>
                          <span className="text-xs text-slate-500">{friend.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedStandaloneFriend(null)}
                  className="text-xs text-accent-500 hover:text-accent-600 font-bold transition-colors"
                >
                  Change recipient
                </button>
              )}
            </div>
          )}

          {/* Amount input */}
          <div>
            <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="amount">
              Amount (₹)
            </label>
            <input
              id="amount"
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm border border-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !amount}
              className="flex-1 py-3 px-4 rounded-2xl bg-success-500 hover:bg-success-600 active:bg-success-700 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-success-500/20 flex items-center justify-center gap-2 hover:cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Record Settlement'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettleUpModal;
