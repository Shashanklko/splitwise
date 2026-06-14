import React, { useState } from 'react';
import api from '../utils/api';
import { X, Loader2, Users } from 'lucide-react';

interface AddGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddGroupModal: React.FC<AddGroupModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/groups', { name: groupName });
      setGroupName('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create group. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Modal Content */}
      <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 text-brand-600 p-2.5 rounded-2xl border border-brand-500/20">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Create New Group</h2>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="groupName">
              Group Name
            </label>
            <input
              id="groupName"
              type="text"
              required
              placeholder="e.g. Apartment roommates, Europe Trip"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="glass-input w-full px-4 py-3 rounded-2xl text-sm"
              autoFocus
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
              disabled={submitting || !groupName.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 hover:cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Group'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddGroupModal;
