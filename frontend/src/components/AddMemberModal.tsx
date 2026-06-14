import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { X, Loader2, UserPlus, Search } from 'lucide-react';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupId: number;
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose, onSuccess, groupId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search users dynamically as user types
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      api.get(`/api/users/search?q=${searchQuery}`)
        .then((res) => setSearchResults(res.data))
        .catch((err) => console.error(err));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleAddUser = async (email: string) => {
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post(`/api/groups/${groupId}/members`, { email });
      setSuccessMsg('User added successfully!');
      setSearchQuery('');
      setSearchResults([]);
      onSuccess();
      // Keep open for a second so they can see success, then close
      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add user to group. Make sure they are registered.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    handleAddUser(searchQuery.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 text-brand-600 p-2.5 rounded-2xl border border-brand-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Add Group Member</h2>
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

        {successMsg && (
          <div className="mb-4 bg-success-500/10 border border-success-500/20 text-success-500 px-4 py-2.5 rounded-2xl text-xs font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmitEmail} className="space-y-4">
          <div>
            <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="member_search">
              Search by Email or Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-450">
                <Search className="w-5 h-5" />
              </span>
              <input
                id="member_search"
                type="text"
                required
                placeholder="Type name or email address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full pl-10 pr-4 py-3 rounded-2xl text-sm"
                autoFocus
              />
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="glass-panel rounded-2xl border border-slate-200 max-h-48 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleAddUser(u.email)}
                  disabled={submitting}
                  className="w-full text-left px-4 py-3 hover:bg-brand-50 flex justify-between items-center transition-colors disabled:opacity-50"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-750 text-sm">{u.name}</span>
                    <span className="text-xs text-slate-500">{u.email}</span>
                  </div>
                  <UserPlus className="w-4 h-4 text-slate-500 hover:text-brand-600" />
                </button>
              ))}
            </div>
          )}

          {/* Fallback button to invite email directly */}
          {searchQuery.includes('@') && searchResults.length === 0 && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Add "{searchQuery}"
            </button>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm border border-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddMemberModal;
